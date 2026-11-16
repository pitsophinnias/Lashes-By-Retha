const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')

// node --test runs each test file in its own process, so running the real
// app here never collides with a manually-run dev server on port 3002, and
// these env vars (and the fetch stub below) never leak into other test files.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4013'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4013'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'
// Both providers are "configured" (fake credentials) so the payment-switch
// tests can tell "hidden by the switch" apart from "hidden because it was
// never configured" - every real network call either provider would make is
// stubbed below.
process.env.OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || 'TSTSITE1'
process.env.OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || 'test-private-key'
process.env.OZOW_API_KEY = process.env.OZOW_API_KEY || 'test-api-key'
process.env.OZOW_API_BASE = process.env.OZOW_API_BASE || 'https://live.example.com'
process.env.OZOW_TEST_API_BASE = process.env.OZOW_TEST_API_BASE || 'https://staging.example.com'
process.env.PAYFLEX_CLIENT_ID = process.env.PAYFLEX_CLIENT_ID || 'test-client-id'
process.env.PAYFLEX_CLIENT_SECRET = process.env.PAYFLEX_CLIENT_SECRET || 'test-client-secret'
process.env.PAYFLEX_API_URL = process.env.PAYFLEX_API_URL || 'https://api.uat.example.com'
process.env.PAYFLEX_AUTH_URL = process.env.PAYFLEX_AUTH_URL || 'https://auth-uat.example.com/auth/merchant'
process.env.PAYFLEX_AUDIENCE = process.env.PAYFLEX_AUDIENCE || 'https://audience.example.com'

const realFetch = global.fetch
global.fetch = async (url, options = {}) => {
  const urlStr = String(url)
  if (urlStr.includes('/GetTransactionByReference')) {
    return { ok: true, json: async () => [] } // no match - reconcile leaves state as-is
  }
  if (urlStr === process.env.PAYFLEX_AUTH_URL) {
    return { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) }
  }
  if (urlStr.endsWith('/configuration')) {
    return { ok: true, json: async () => ({ minimumAmount: 1, maximumAmount: 100000 }) }
  }
  if (/\/order\/[^/]+$/.test(urlStr)) {
    return { ok: false, status: 404, text: async () => 'not found' }
  }
  if (urlStr.endsWith('/order')) {
    return { ok: true, json: async () => ({ token: 'tok', redirectUrl: 'https://example.com/pay', orderId: 'pf-order-id' }) }
  }
  return realFetch(urlStr, options)
}

const PORT = Number(process.env.PORT)

// Uses node:http directly (not the built-in fetch/undici) - avoids a
// Windows-specific libuv assertion crash seen when undici's connection pool
// and node-postgres's sockets close around the same time in this process.
const request = (method, pathAndQuery, body, headers = {}) => new Promise((resolve, reject) => {
  const payload = body !== undefined ? JSON.stringify(body) : null
  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: pathAndQuery,
    method,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...headers,
    },
  }, (res) => {
    let raw = ''
    res.on('data', (chunk) => { raw += chunk })
    res.on('end', () => {
      let data = null
      try { data = raw ? JSON.parse(raw) : null } catch {}
      resolve({ status: res.statusCode, data })
    })
  })
  req.on('error', reject)
  if (payload) req.write(payload)
  req.end()
})

// The Ozow notify route parses a urlencoded body (like Ozow itself sends),
// not JSON - a form-encoded POST is needed to actually reach its SiteCode/
// hash checks rather than always seeing an empty body.
const requestForm = (pathAndQuery, fields) => new Promise((resolve, reject) => {
  const payload = new URLSearchParams(fields).toString()
  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: pathAndQuery,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(payload) },
  }, (res) => {
    let raw = ''
    res.on('data', (chunk) => { raw += chunk })
    res.on('end', () => {
      let data = null
      try { data = raw ? JSON.parse(raw) : null } catch {}
      resolve({ status: res.statusCode, data })
    })
  })
  req.on('error', reject)
  req.write(payload)
  req.end()
})

const waitForServer = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await request('GET', '/api/health')
      if (res.status === 200) return
    } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('Server did not start in time')
}

const randRef = (prefix) => `${prefix}-${crypto.randomBytes(4).toString('hex')}`

// Every order/student this file creates is tracked here and deleted in
// after() - their ozow/payflex payment rows first (no ON DELETE CASCADE on
// order_id/student_id), then the order/student itself.
const createdOrderIds = []
const createdStudentIds = []

let api
let pool
let JWT_SECRET
let sysadminUserId
const tokenFor = (role, id = 999) => jwt.sign({ id, username: 'system-controls-test', role }, JWT_SECRET, { expiresIn: '1h' })
// Routes under test write audit logs and system_settings.updated_by, both of
// which have a foreign key on users(id) - a non-sysadmin role never reaches
// those writes (rejected by role first), but the sysadmin token needs a real
// user id, fetched in before().
const sysadminHeaders = () => ({ Authorization: `Bearer ${tokenFor('sysadmin', sysadminUserId)}` })

const createOrder = async (paymentMethod) => {
  const token = randRef('order-token')
  const result = await pool.query(
    `INSERT INTO orders (customer_name, customer_phone, total, payment_method, payment_status, public_token)
     VALUES ('System Controls Test', '0821234567', 250.00, $1, 'unpaid', $2) RETURNING *`,
    [paymentMethod, token]
  )
  createdOrderIds.push(result.rows[0].id)
  return result.rows[0]
}

const createStudent = async (name) => {
  const token = randRef('student-token')
  const result = await pool.query(
    `INSERT INTO students (class_id, name, whatsapp, payment_status, status, public_token)
     VALUES (1, $1, '0821234567', 'unpaid', 'awaiting_payment', $2) RETURNING *`,
    [name, token]
  )
  createdStudentIds.push(result.rows[0].id)
  return result.rows[0]
}

const createOzowPayment = async ({ orderId, studentId, status, createdAt, purpose }) => {
  const result = await pool.query(
    `INSERT INTO ozow_payments (order_id, student_id, transaction_reference, amount, status, is_test, purpose, created_at)
     VALUES ($1, $2, $3, '100.00', $4, TRUE, $5, COALESCE($6, NOW())) RETURNING *`,
    [orderId || null, studentId || null, randRef('HBH'), status || 'started', purpose || 'order', createdAt || null]
  )
  return result.rows[0]
}

const createPayflexPayment = async ({ orderId, studentId, status, purpose }) => {
  const result = await pool.query(
    `INSERT INTO payflex_payments (order_id, student_id, merchant_reference, amount, status, purpose)
     VALUES ($1, $2, $3, '100.00', $4, $5) RETURNING *`,
    [orderId || null, studentId || null, randRef('HBH'), status || 'started', purpose || 'order']
  )
  return result.rows[0]
}

// Every test that flips maintenance or the payment switches restores them
// before finishing, so tests never depend on run order - but before() still
// captures the original values as a last-resort restore in after().
let originalMaintenance
let originalPayments

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET
  const userRow = await pool.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'sysadmin' LIMIT 1`
  )
  sysadminUserId = userRow.rows[0].id

  const settingsRes = await request('GET', '/api/admin/system/settings', undefined, sysadminHeaders())
  originalMaintenance = settingsRes.data.maintenance
  originalPayments = { ozowEnabled: settingsRes.data.payments.ozow.enabled, payflexEnabled: settingsRes.data.payments.payflex.enabled }
})

// ── Non-sysadmin access ──────────────────────────────────────────────────────

test('new admin routes require authentication', async () => {
  const res = await request('GET', '/api/admin/payments')
  assert.strictEqual(res.status, 401)
})

test('owner and staff get 403 on every new system-controls/payments-monitor route', async () => {
  for (const role of ['owner', 'staff']) {
    const headers = { Authorization: `Bearer ${tokenFor(role)}` }
    const checks = [
      await request('GET', '/api/admin/system/settings', undefined, headers),
      await request('PUT', '/api/admin/system/maintenance', { enabled: false, message: 'x' }, headers),
      await request('PUT', '/api/admin/system/payments', { ozowEnabled: true, payflexEnabled: true }, headers),
      await request('GET', '/api/admin/payments', undefined, headers),
      await request('POST', '/api/admin/payments/ozow/1/recheck', undefined, headers),
      await request('GET', '/api/admin/payment-events', undefined, headers),
    ]
    for (const res of checks) assert.strictEqual(res.status, 403, `role ${role} should get 403`)
  }
})

// ── Maintenance mode ─────────────────────────────────────────────────────────

test('maintenance message is validated: required, plain text, max 200 characters', async () => {
  const headers = sysadminHeaders()
  assert.strictEqual((await request('PUT', '/api/admin/system/maintenance', { enabled: true, message: '' }, headers)).status, 400)
  assert.strictEqual((await request('PUT', '/api/admin/system/maintenance', { enabled: true, message: '<b>hi</b>' }, headers)).status, 400)
  assert.strictEqual((await request('PUT', '/api/admin/system/maintenance', { enabled: true, message: 'x'.repeat(201) }, headers)).status, 400)
  assert.strictEqual((await request('PUT', '/api/admin/system/maintenance', { message: 'ok' }, headers)).status, 400) // enabled missing
})

test('maintenance mode blocks new orders, enrolments, payment starts, pay-balance and retry with 503 and the configured message', async () => {
  const headers = sysadminHeaders()
  const message = 'We are down for maintenance right now.'
  const on = await request('PUT', '/api/admin/system/maintenance', { enabled: true, message }, headers)
  assert.strictEqual(on.status, 200)

  const statusRes = await request('GET', '/api/system/status')
  assert.strictEqual(statusRes.data.maintenance.enabled, true)
  assert.strictEqual(statusRes.data.maintenance.message, message)

  const blocked = [
    await request('POST', '/api/orders', {}),
    await request('POST', '/api/enrolments', {}),
    await request('POST', '/api/payments/ozow/start', {}),
    await request('POST', '/api/payments/payflex/start', {}),
    await request('POST', '/api/enrolments/any-token/pay-balance', { provider: 'ozow' }),
    await request('POST', '/api/enrolments/any-token/retry', {}),
  ]
  for (const res of blocked) {
    assert.strictEqual(res.status, 503)
    assert.strictEqual(res.data.error, message)
  }

  await request('PUT', '/api/admin/system/maintenance', { enabled: false, message }, headers)
})

test('maintenance mode never blocks health, admin routes, or payment return/notify/callback routes', async () => {
  const headers = sysadminHeaders()
  await request('PUT', '/api/admin/system/maintenance', { enabled: true, message: 'down' }, headers)

  assert.strictEqual((await request('GET', '/api/health')).status, 200)
  assert.strictEqual((await request('GET', '/api/admin/system/settings', undefined, headers)).status, 200)

  // Ozow/Payflex return routes always redirect (303), maintenance or not.
  const ozowReturn = await request('GET', '/api/payments/ozow/return/success')
  assert.strictEqual(ozowReturn.status, 303)
  const payflexReturn = await request('GET', '/api/payments/payflex/return/confirm')
  assert.strictEqual(payflexReturn.status, 303)

  // A malformed Ozow notify still gets its normal 400 (hash check), not the
  // maintenance 503 - proof the route was never gated on maintenance at all.
  const notify = await requestForm('/api/payments/ozow/notify',
    { SiteCode: process.env.OZOW_SITE_CODE, TransactionReference: 'none', Status: 'Complete', Hash: 'bad' })
  assert.strictEqual(notify.status, 400)
  assert.notStrictEqual(notify.data.error, 'down')

  const callback = await request('POST', '/api/payments/payflex/callback', { merchantReference: 'none' })
  assert.strictEqual(callback.status, 200)

  await request('PUT', '/api/admin/system/maintenance', { enabled: false, message: 'down' }, headers)
})

// ── Payment switches ─────────────────────────────────────────────────────────

test('turning a configured provider\'s switch off hides it from options and blocks starting a payment with it', async () => {
  const headers = sysadminHeaders()
  await request('PUT', '/api/admin/system/payments', { ozowEnabled: false, payflexEnabled: true }, headers)

  const options = await request('GET', '/api/payments/options')
  assert.strictEqual(options.data.ozow, false)
  assert.strictEqual(options.data.payflex.enabled, true)

  const order = await createOrder('ozow')
  const start = await request('POST', '/api/payments/ozow/start', { orderToken: order.public_token })
  assert.strictEqual(start.status, 503)
  assert.match(start.data.error, /not available right now/i)

  const switchRes = await request('PATCH', `/api/orders/${order.public_token}/switch-provider`, { provider: 'ozow' })
  assert.strictEqual(switchRes.status, 503)

  await request('PUT', '/api/admin/system/payments', { ozowEnabled: true, payflexEnabled: true }, headers)

  const optionsAfter = await request('GET', '/api/payments/options')
  assert.strictEqual(optionsAfter.data.ozow, true)
})

test('turning Payflex off blocks retrying a training payment with it', async () => {
  const headers = sysadminHeaders()
  const student = await createStudent('Retry Test Student')
  await createPayflexPayment({ studentId: student.id, status: 'cancelled', purpose: 'full' })

  await request('PUT', '/api/admin/system/payments', { ozowEnabled: true, payflexEnabled: false }, headers)
  const retry = await request('POST', `/api/enrolments/${student.public_token}/retry`, {})
  assert.strictEqual(retry.status, 503)
  assert.match(retry.data.error, /not available right now/i)

  await request('PUT', '/api/admin/system/payments', { ozowEnabled: true, payflexEnabled: true }, headers)
})

// ── Payments monitor ──────────────────────────────────────────────────────────

test('GET /api/admin/payments flags attempts started/pending for over an hour as stuck, and counts them', async () => {
  const headers = sysadminHeaders()
  const order = await createOrder('ozow')
  const stuckPayment = await createOzowPayment({
    orderId: order.id, status: 'started', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  })
  const freshPayment = await createOzowPayment({ orderId: order.id, status: 'started' })

  const res = await request('GET', '/api/admin/payments', undefined, headers)
  assert.strictEqual(res.status, 200)
  assert.ok(res.data.summary.stuckCount >= 1)

  const stuckRow = res.data.payments.find(p => p.id === stuckPayment.id && p.provider === 'ozow')
  const freshRow = res.data.payments.find(p => p.id === freshPayment.id && p.provider === 'ozow')
  assert.ok(stuckRow)
  assert.strictEqual(stuckRow.stuck, true)
  assert.ok(freshRow)
  assert.strictEqual(freshRow.stuck, false)
})

test('payments monitor shows a plain order number for an order payment and a masked name for a training payment', async () => {
  const headers = sysadminHeaders()
  const order = await createOrder('payflex')
  const orderPayment = await createPayflexPayment({ orderId: order.id, status: 'started' })

  const student = await createStudent('Thabo Mokoena')
  const studentPayment = await createPayflexPayment({ studentId: student.id, status: 'started', purpose: 'deposit' })

  const res = await request('GET', '/api/admin/payments', undefined, headers)
  const orderRow = res.data.payments.find(p => p.id === orderPayment.id && p.provider === 'payflex')
  const studentRow = res.data.payments.find(p => p.id === studentPayment.id && p.provider === 'payflex')
  assert.strictEqual(orderRow.identifier, `Order #${order.id}`)
  assert.strictEqual(studentRow.identifier, 'Thabo M.')
})

test('recheck re-runs the real reconcile function and 404s for an unknown payment', async () => {
  const headers = sysadminHeaders()
  const order = await createOrder('ozow')
  const payment = await createOzowPayment({ orderId: order.id, status: 'started' })

  const res = await request('POST', `/api/admin/payments/ozow/${payment.id}/recheck`, undefined, headers)
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.id, payment.id)
  assert.strictEqual(res.data.provider, 'ozow')

  const missing = await request('POST', '/api/admin/payments/ozow/999999/recheck', undefined, headers)
  assert.strictEqual(missing.status, 404)

  const badProvider = await request('POST', '/api/admin/payments/eft/1/recheck', undefined, headers)
  assert.strictEqual(badProvider.status, 400)
})

test('a rejected Ozow notification is logged and listed under payment events, never a valid one', async () => {
  const headers = sysadminHeaders()
  const reference = randRef('rejected')
  const rejected = await requestForm('/api/payments/ozow/notify',
    { SiteCode: process.env.OZOW_SITE_CODE, TransactionReference: reference, Status: 'Complete', Hash: 'not-a-real-hash' })
  assert.strictEqual(rejected.status, 400)

  const events = await request('GET', '/api/admin/payment-events', undefined, headers)
  assert.strictEqual(events.status, 200)
  const logged = events.data.find(e => e.reference === reference)
  assert.ok(logged)
  assert.strictEqual(logged.reason, 'hash_mismatch')
})

after(async () => {
  if (originalMaintenance) {
    await request('PUT', '/api/admin/system/maintenance', originalMaintenance, sysadminHeaders())
  }
  if (originalPayments) {
    await request('PUT', '/api/admin/system/payments', originalPayments, sysadminHeaders())
  }

  await pool.query('DELETE FROM ozow_payments WHERE order_id = ANY($1) OR student_id = ANY($2)', [createdOrderIds, createdStudentIds])
  await pool.query('DELETE FROM payflex_payments WHERE order_id = ANY($1) OR student_id = ANY($2)', [createdOrderIds, createdStudentIds])
  await pool.query('DELETE FROM orders WHERE id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM students WHERE id = ANY($1)', [createdStudentIds])
  await pool.query(
    `DELETE FROM payment_events WHERE reason IN ('site_code_mismatch', 'hash_mismatch') AND (reference LIKE 'rejected-%' OR reference = 'none')`
  )

  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
