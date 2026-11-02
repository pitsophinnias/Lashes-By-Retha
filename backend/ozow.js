const crypto = require('crypto')
const { pool } = require('./db')

const OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || ''
const OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || ''
const OZOW_API_KEY = process.env.OZOW_API_KEY || ''
// Defaults to test mode unless explicitly turned off, so a missing env var
// can never send a site live by accident.
const OZOW_IS_TEST = process.env.OZOW_IS_TEST !== 'false'
const OZOW_API_BASE = process.env.OZOW_API_BASE || 'https://api.ozow.com'
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || '').replace(/\/+$/, '')
const CUSTOMER_SITE_URL = (process.env.CUSTOMER_SITE_URL || '').replace(/\/+$/, '')

const isOzowConfigured = !!(OZOW_SITE_CODE && OZOW_PRIVATE_KEY && OZOW_API_KEY && PUBLIC_API_URL && CUSTOMER_SITE_URL)

console.log(`Ozow payments: ${isOzowConfigured ? `enabled (test mode: ${OZOW_IS_TEST})` : 'disabled'}`)

const sha512 = (s) => crypto.createHash('sha512').update(s, 'utf8').digest('hex')

const REQUEST_ORDER = [
  'SiteCode', 'CountryCode', 'CurrencyCode', 'Amount', 'TransactionReference',
  'BankReference', 'Optional1', 'CancelUrl', 'ErrorUrl', 'SuccessUrl', 'NotifyUrl', 'IsTest',
]

// Ozow's rule: concatenate the fields we send, in their documented order,
// append the private key, lowercase the whole string, SHA512 hex.
function requestHash(fields, privateKey) {
  const joined = REQUEST_ORDER.map(k => fields[k] ?? '').join('') + privateKey
  return sha512(joined.toLowerCase())
}

const RESPONSE_ORDER = [
  'SiteCode', 'TransactionId', 'TransactionReference', 'Amount', 'Status',
  'Optional1', 'Optional2', 'Optional3', 'Optional4', 'Optional5', 'CurrencyCode', 'IsTest', 'StatusMessage',
]

function responseHash(fields, privateKey) {
  const joined = RESPONSE_ORDER.map(k => fields[k] ?? '').join('') + privateKey
  return sha512(joined.toLowerCase())
}

// Ozow's hash sometimes drops a leading zero, so both sides are stripped of
// leading zeros (keeping at least one digit) before comparing.
const stripLeadingZeros = (s) => s.replace(/^0+(?=.)/, '')

function verifyResponseHash(fields, privateKey) {
  const received = String(fields.Hash || fields.HashCheck || '').toLowerCase()
  if (!received) return false
  const computed = responseHash(fields, privateKey)
  const a = stripLeadingZeros(received)
  const b = stripLeadingZeros(computed)
  const maxLen = Math.max(a.length, b.length)
  const bufA = Buffer.from(a.padStart(maxLen, '0'))
  const bufB = Buffer.from(b.padStart(maxLen, '0'))
  try {
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

const generateTransactionReference = (orderId) => `HBH-${orderId}-${crypto.randomBytes(3).toString('hex')}`

// Builds the fields + HashCheck for a single Ozow payment attempt. Every
// attempt gets its own transaction reference, so a customer can retry after
// cancelling.
function buildOzowFields(orderId, amount) {
  const transactionReference = generateTransactionReference(orderId)
  const amountStr = Number(amount).toFixed(2)
  const fields = {
    SiteCode: OZOW_SITE_CODE,
    CountryCode: 'ZA',
    CurrencyCode: 'ZAR',
    Amount: amountStr,
    TransactionReference: transactionReference,
    BankReference: `HBH Order ${orderId}`.slice(0, 20),
    Optional1: String(orderId),
    CancelUrl: `${PUBLIC_API_URL}/api/payments/ozow/return/cancel`,
    ErrorUrl: `${PUBLIC_API_URL}/api/payments/ozow/return/error`,
    SuccessUrl: `${PUBLIC_API_URL}/api/payments/ozow/return/success`,
    NotifyUrl: `${PUBLIC_API_URL}/api/payments/ozow/notify`,
    IsTest: OZOW_IS_TEST ? 'true' : 'false',
  }
  fields.HashCheck = requestHash(fields, OZOW_PRIVATE_KEY)
  return { transactionReference, amountStr, fields }
}

function mapOzowStatus(status) {
  if (status === 'Complete') return 'paid'
  if (status === 'Cancelled' || status === 'Abandoned') return 'cancelled'
  if (status === 'Error') return 'failed'
  if (status === 'Pending' || status === 'PendingInvestigation') return 'pending'
  return 'pending'
}

// Allows index.js to hand us the admin notification helper without ozow.js
// having to import it (which would create a require cycle).
let notifyAdmin = async () => {}
const setNotifier = (fn) => { notifyAdmin = fn }

async function fetchOzowStatus(transactionReference) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const url = `${OZOW_API_BASE}/GetTransactionByReference?siteCode=${encodeURIComponent(OZOW_SITE_CODE)}&transactionReference=${encodeURIComponent(transactionReference)}`
    const res = await fetch(url, {
      headers: { ApiKey: OZOW_API_KEY, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) {
      console.error('Ozow status API returned', res.status)
      return null
    }
    const data = await res.json()
    return Array.isArray(data) ? data : null
  } catch (err) {
    console.error('Ozow status API call failed:', err.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// The only place that can mark an order paid. Checks Ozow's status API
// (never trusts the browser redirect or an unverified notification alone),
// and is idempotent - a duplicate call changes nothing once an order is
// already paid.
async function reconcileOzowPayment(transactionReference) {
  if (!isOzowConfigured || !transactionReference) return
  try {
    const paymentResult = await pool.query(
      'SELECT * FROM ozow_payments WHERE transaction_reference = $1', [transactionReference]
    )
    const payment = paymentResult.rows[0]
    if (!payment) return

    const transactions = await fetchOzowStatus(transactionReference)
    if (!transactions) return // API call failed; leave state as-is
    const match = transactions.find(t => t.TransactionReference === transactionReference)
    if (!match) return

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [payment.order_id])
      const order = orderResult.rows[0]
      if (!order) { await client.query('ROLLBACK'); return }

      // Already paid - a second notification or status check must change nothing.
      if (order.payment_status === 'paid') { await client.query('ROLLBACK'); return }

      const siteMatches = String(match.SiteCode) === String(OZOW_SITE_CODE)
      const amountMatches = Math.abs(parseFloat(match.Amount) - parseFloat(payment.amount)) < 0.005
      const isPaid = match.Status === 'Complete' && siteMatches && amountMatches
      const newStatus = isPaid ? 'paid' : mapOzowStatus(match.Status)

      await client.query(
        `UPDATE ozow_payments SET status = $1, status_message = $2, ozow_transaction_id = $3, is_test = $4, updated_at = NOW()
         WHERE id = $5`,
        [newStatus, match.StatusMessage || null, match.TransactionId || null, String(match.IsTest) === 'true', payment.id]
      )

      if (isPaid) {
        await client.query(`UPDATE orders SET payment_status = 'paid', paid_at = NOW() WHERE id = $1`, [order.id])
      } else {
        await client.query('UPDATE orders SET payment_status = $1 WHERE id = $2', [newStatus, order.id])
      }
      await client.query('COMMIT')

      if (isPaid) {
        await notifyAdmin('order', 'Ozow payment received',
          `Order #${order.id} for ${order.customer_name} has been paid via Ozow (R${parseFloat(order.total).toFixed(2)}). Ready to confirm and pack.`)
      }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('reconcileOzowPayment failed:', err.message)
  }
}

module.exports = {
  OZOW_SITE_CODE,
  OZOW_PRIVATE_KEY,
  OZOW_IS_TEST,
  PUBLIC_API_URL,
  CUSTOMER_SITE_URL,
  isOzowConfigured,
  requestHash,
  verifyResponseHash,
  buildOzowFields,
  generateTransactionReference,
  reconcileOzowPayment,
  setNotifier,
}
