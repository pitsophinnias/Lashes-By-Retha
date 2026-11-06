const crypto = require('crypto')
const { pool } = require('./db')

const OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || ''
const OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || ''
const OZOW_API_KEY = process.env.OZOW_API_KEY || ''
// Defaults to test mode unless explicitly turned off, so a missing env var
// can never send a site live by accident.
const OZOW_IS_TEST = process.env.OZOW_IS_TEST !== 'false'
const OZOW_API_BASE = process.env.OZOW_API_BASE || 'https://api.ozow.com'
// Test (IsTest=true) transactions are only queryable on Ozow's staging API,
// not the live one - a live test payment otherwise 404s on GetTransactionByReference forever.
const OZOW_TEST_API_BASE = process.env.OZOW_TEST_API_BASE || 'https://stagingapi.ozow.com'
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

// Ozow's status API's field casing isn't confirmed to match its request/
// notify docs (PascalCase) - looks up a key regardless of case so either
// works.
function pick(obj, key) {
  if (obj == null) return undefined
  if (obj[key] !== undefined) return obj[key]
  const lowerKey = key.toLowerCase()
  const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowerKey)
  return foundKey !== undefined ? obj[foundKey] : undefined
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

// Logs only the key names of the first live response, once per process, so
// we can confirm the actual field casing without ever logging values.
let loggedStatusResponseKeys = false

async function fetchOzowStatus(transactionReference, isTest) {
  const base = isTest ? OZOW_TEST_API_BASE : OZOW_API_BASE
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const url = `${base}/GetTransactionByReference?siteCode=${encodeURIComponent(OZOW_SITE_CODE)}&transactionReference=${encodeURIComponent(transactionReference)}`
    const res = await fetch(url, {
      headers: { ApiKey: OZOW_API_KEY, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) {
      let bodyText = ''
      try { bodyText = (await res.text()).slice(0, 300) } catch {}
      console.error(`Ozow status API returned ${res.status} from ${base} - body: ${bodyText}`)
      return null
    }
    const data = await res.json()
    if (!Array.isArray(data)) return null
    if (!loggedStatusResponseKeys && data.length > 0) {
      loggedStatusResponseKeys = true
      console.log('Ozow status API response keys:', Object.keys(data[0]))
    }
    return data
  } catch (err) {
    console.error('Ozow status API call failed:', err.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// The only place that can mark an order paid. Prefers Ozow's status API;
// falls back to a verifiedNotification (the notify route's body, only ever
// passed there after its SiteCode and hash have both already been checked)
// when the status API has no match for this transaction - a verified
// notification is proof on its own. The browser redirect alone is never
// trusted either way. Idempotent - a duplicate call changes nothing once an
// order is already paid.
async function reconcileOzowPayment(transactionReference, verifiedNotification = null) {
  if (!isOzowConfigured || !transactionReference) return
  try {
    const paymentResult = await pool.query(
      'SELECT * FROM ozow_payments WHERE transaction_reference = $1', [transactionReference]
    )
    const payment = paymentResult.rows[0]
    if (!payment) return

    const transactions = await fetchOzowStatus(transactionReference, payment.is_test)
    const match = transactions
      ? transactions.find(t => pick(t, 'TransactionReference') === transactionReference)
      : null

    const source = match || verifiedNotification
    if (!source) return // no status API match and no verified notification; leave state as-is

    const matchTransactionId = pick(source, 'TransactionId')
    const matchSiteCode = pick(source, 'SiteCode')
    const matchAmount = pick(source, 'Amount')
    const matchStatus = pick(source, 'Status')
    const matchStatusMessage = pick(source, 'StatusMessage')

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [payment.order_id])
      const order = orderResult.rows[0]
      if (!order) { await client.query('ROLLBACK'); return }

      // Already paid - a second notification or status check must change nothing.
      if (order.payment_status === 'paid') { await client.query('ROLLBACK'); return }

      const siteMatches = String(matchSiteCode) === String(OZOW_SITE_CODE)
      const amountMatches = Math.abs(parseFloat(matchAmount) - parseFloat(payment.amount)) < 0.005
      const isPaid = matchStatus === 'Complete' && siteMatches && amountMatches
      // A "Complete" status that fails the site/amount check is a mismatch,
      // not a payment - mapOzowStatus('Complete') is only ever reached here
      // when isPaid is true, so it's never relied on to produce 'paid'.
      const newStatus = isPaid ? 'paid' : (matchStatus === 'Complete' ? 'failed' : mapOzowStatus(matchStatus))

      // The status API has no IsTest field - is_test was already set when
      // this payment attempt was created, so it's left untouched here.
      await client.query(
        `UPDATE ozow_payments SET status = $1, status_message = $2, ozow_transaction_id = $3, updated_at = NOW()
         WHERE id = $4`,
        [newStatus, matchStatusMessage || null, matchTransactionId || null, payment.id]
      )

      // Only the latest attempt may move the order's overall payment_status -
      // a stale result from an older attempt (e.g. a late "Cancelled" after
      // the customer already succeeded on a retry) must not overwrite it.
      // A paid result always wins and is never downgraded, regardless of
      // which attempt it came from.
      const latestAttemptResult = await client.query(
        'SELECT id FROM ozow_payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
        [order.id]
      )
      const isLatestAttempt = latestAttemptResult.rows[0]?.id === payment.id

      if (isPaid) {
        await client.query(`UPDATE orders SET payment_status = 'paid', paid_at = NOW() WHERE id = $1`, [order.id])
      } else if (isLatestAttempt) {
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
