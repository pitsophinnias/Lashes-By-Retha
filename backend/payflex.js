const crypto = require('crypto')
const { pool } = require('./db')
const { applyOrderOutcome, applyStudentOutcome } = require('./paymentOutcomes')

const PAYFLEX_CLIENT_ID = process.env.PAYFLEX_CLIENT_ID || ''
const PAYFLEX_CLIENT_SECRET = process.env.PAYFLEX_CLIENT_SECRET || ''
const PAYFLEX_API_URL = (process.env.PAYFLEX_API_URL || 'https://api.uat.payflex.co.za').replace(/\/+$/, '')
const PAYFLEX_AUTH_URL = process.env.PAYFLEX_AUTH_URL || 'https://auth-uat.payflex.co.za/auth/merchant'
const PAYFLEX_AUDIENCE = process.env.PAYFLEX_AUDIENCE || 'https://auth-dev.payflex.co.za'
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || '').replace(/\/+$/, '')
const CUSTOMER_SITE_URL = (process.env.CUSTOMER_SITE_URL || '').replace(/\/+$/, '')

const isPayflexConfigured = !!(
  PAYFLEX_CLIENT_ID && PAYFLEX_CLIENT_SECRET && PAYFLEX_API_URL && PAYFLEX_AUTH_URL && PAYFLEX_AUDIENCE &&
  PUBLIC_API_URL && CUSTOMER_SITE_URL
)

console.log(`Payflex payments: ${isPayflexConfigured ? `enabled (api: ${PAYFLEX_API_URL})` : 'disabled'}`)

// Allows index.js to hand us the admin notification helper without payflex.js
// having to import it (which would create a require cycle).
let notifyAdmin = async () => {}
const setNotifier = (fn) => { notifyAdmin = fn }

const generateMerchantReference = (referenceId) => `HBH-${referenceId}-${crypto.randomBytes(3).toString('hex')}`

// ── OAuth2 client-credentials token, cached in memory ────────────────────────
// Refreshed a minute before it actually expires, so a slow request never
// gets caught using an already-dead token.
let cachedToken = null // { accessToken, expiresAt }

async function getAccessToken() {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt - 60000 > now) return cachedToken.accessToken

  const res = await fetch(PAYFLEX_AUTH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: PAYFLEX_CLIENT_ID,
      client_secret: PAYFLEX_CLIENT_SECRET,
      audience: PAYFLEX_AUDIENCE,
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) {
    let bodyText = ''
    try { bodyText = (await res.text()).slice(0, 300) } catch {}
    throw new Error(`Payflex auth failed with status ${res.status}: ${bodyText}`)
  }
  const data = await res.json()
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 0) * 1000,
  }
  return cachedToken.accessToken
}

// ── Configuration (min/max order amount), cached for an hour ─────────────────
let cachedConfig = null // { minimumAmount, maximumAmount, fetchedAt }
const CONFIG_CACHE_MS = 60 * 60 * 1000

async function getConfiguration() {
  const now = Date.now()
  if (cachedConfig && now - cachedConfig.fetchedAt < CONFIG_CACHE_MS) return cachedConfig

  const token = await getAccessToken()
  const res = await fetch(`${PAYFLEX_API_URL}/configuration`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    let bodyText = ''
    try { bodyText = (await res.text()).slice(0, 300) } catch {}
    console.error(`Payflex configuration API returned ${res.status} - body: ${bodyText}`)
    return cachedConfig // serve a stale cache rather than nothing, if we have one
  }
  const data = await res.json()
  cachedConfig = { minimumAmount: data.minimumAmount, maximumAmount: data.maximumAmount, fetchedAt: now }
  return cachedConfig
}

// Shared with the /start route: true when amount fits Payflex's configured
// min/max (inclusive), or when no configuration could be fetched - a
// transient Payflex outage shouldn't be the thing that blocks checkout here,
// the create-order call itself is still the final word.
function isAmountWithinRange(amount, config) {
  if (!config) return true
  return amount >= config.minimumAmount && amount <= config.maximumAmount
}

// Builds the Place Order request and sends it. Every attempt gets its own
// merchant reference, so a customer can retry after cancelling.
async function createPayflexOrder(params) {
  const token = await getAccessToken()
  const body = {
    amount: Number(Number(params.amount).toFixed(2)),
    consumer: {
      phoneNumber: params.customerPhone || undefined,
      givenNames: params.customerName || undefined,
      surname: '',
      email: params.email || undefined,
    },
    description: params.description || `Hair By Her order #${params.orderId}`,
    items: (params.items || []).map(i => ({
      description: i.name,
      name: i.name,
      sku: i.sku != null ? String(i.sku) : undefined,
      quantity: i.quantity,
      price: Number(Number(i.price).toFixed(2)),
    })),
    merchant: {
      redirectConfirmUrl: `${PUBLIC_API_URL}/api/payments/payflex/return/confirm`,
      redirectCancelUrl: `${PUBLIC_API_URL}/api/payments/payflex/return/cancel`,
      statusCallbackUrl: `${PUBLIC_API_URL}/api/payments/payflex/callback`,
    },
    merchantReference: params.merchantReference,
    taxAmount: 0,
    shippingAmount: Number(Number(params.shippingAmount || 0).toFixed(2)),
  }

  const res = await fetch(`${PAYFLEX_API_URL}/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let bodyText = ''
    try { bodyText = (await res.text()).slice(0, 300) } catch {}
    throw new Error(`Payflex create order failed with status ${res.status}: ${bodyText}`)
  }
  const data = await res.json()
  return {
    token: data.token,
    expiryDateTime: data.expiryDateTime,
    redirectUrl: data.redirectUrl,
    payflexOrderId: data.orderId,
  }
}

async function getPayflexOrder(payflexOrderId) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const token = await getAccessToken()
    const res = await fetch(`${PAYFLEX_API_URL}/order/${encodeURIComponent(payflexOrderId)}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    if (!res.ok) {
      let bodyText = ''
      try { bodyText = (await res.text()).slice(0, 300) } catch {}
      console.error(`Payflex get order API returned ${res.status} - body: ${bodyText}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.error('Payflex get order call failed:', err.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Payflex's documented orderStatus values are Created, Initiated, Approved,
// Declined and Abandoned - there is no Cancelled or Pending status.
function mapPayflexStatus(orderStatus) {
  if (orderStatus === 'Approved') return 'paid'
  if (orderStatus === 'Declined') return 'failed'
  if (orderStatus === 'Abandoned') return 'cancelled'
  if (orderStatus === 'Created' || orderStatus === 'Initiated') return 'pending'
  return 'pending'
}

// The only place that can mark an order paid. Always re-fetches the order
// from Payflex's GET /order/{orderId} - the browser redirect and the
// statusCallbackUrl body are never trusted on their own, only used to find
// which payment attempt to re-check. Idempotent - a duplicate call changes
// nothing once an order is already paid.
async function reconcilePayflexPayment(identifier) {
  if (!isPayflexConfigured || !identifier) return
  try {
    const paymentResult = await pool.query(
      'SELECT * FROM payflex_payments WHERE merchant_reference = $1 OR payflex_order_id = $1',
      [identifier]
    )
    const payment = paymentResult.rows[0]
    if (!payment || !payment.payflex_order_id) return

    const remoteOrder = await getPayflexOrder(payment.payflex_order_id)
    if (!remoteOrder) return // API call failed; leave state as-is

    const orderStatus = remoteOrder.orderStatus
    const amountMatches = Math.abs(parseFloat(remoteOrder.amount) - parseFloat(payment.amount)) < 0.005
    const isPaid = orderStatus === 'Approved' && amountMatches
    // An "Approved" status that fails the amount check is a mismatch, not a
    // payment - mapPayflexStatus('Approved') is only ever reached here when
    // isPaid is true, so it's never relied on to produce 'paid'.
    const newStatus = isPaid ? 'paid' : (orderStatus === 'Approved' ? 'failed' : mapPayflexStatus(orderStatus))

    const client = await pool.connect()
    let paidOrder = null
    let paidStudent = null
    try {
      await client.query('BEGIN')

      await client.query(
        'UPDATE payflex_payments SET status = $1, raw_status = $2, updated_at = NOW() WHERE id = $3',
        [newStatus, JSON.stringify(remoteOrder), payment.id]
      )

      if (payment.order_id) {
        paidOrder = await applyOrderOutcome(client, 'payflex_payments', payment, isPaid, newStatus)
      } else if (payment.student_id && isPaid && payment.status !== 'paid') {
        // payment.status !== 'paid' guards against crediting the same
        // attempt twice if Payflex's callback is ever delivered more than
        // once for an attempt we already marked paid.
        paidStudent = await applyStudentOutcome(client, payment)
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    if (paidOrder) {
      await notifyAdmin('order', 'Payflex payment received',
        `Order #${paidOrder.id} for ${paidOrder.customer_name} has been paid via Payflex (R${parseFloat(paidOrder.total).toFixed(2)}).`)
    }
    if (paidStudent) {
      const startDate = paidStudent.preferred_start_date
        ? new Date(paidStudent.preferred_start_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'not set'
      await notifyAdmin('section', 'New training payment',
        `New training payment: ${paidStudent.name} paid R${parseFloat(payment.amount).toFixed(2)} (${payment.purpose}) for ${paidStudent.course ? paidStudent.course.name : 'their course'}. Preferred start: ${startDate}.`)
    }
  } catch (err) {
    console.error('reconcilePayflexPayment failed:', err.message)
  }
}

module.exports = {
  PAYFLEX_API_URL,
  PUBLIC_API_URL,
  CUSTOMER_SITE_URL,
  isPayflexConfigured,
  generateMerchantReference,
  getAccessToken,
  getConfiguration,
  createPayflexOrder,
  getPayflexOrder,
  mapPayflexStatus,
  isAmountWithinRange,
  reconcilePayflexPayment,
  setNotifier,
}
