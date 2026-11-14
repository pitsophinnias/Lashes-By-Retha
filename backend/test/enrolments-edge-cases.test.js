const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')

// node --test runs each test file in its own process, so these env vars
// (and the fetch stub below) never leak into other test files.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4013'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4013'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'
// Both providers are configured here (unlike enrolments-routes.test.js,
// which leaves Ozow unconfigured) so the orphan-cleanup fix can be
// exercised through either provider's failure path.
process.env.OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || 'TESTSITE'
process.env.OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || 'test-private-key'
process.env.OZOW_API_KEY = process.env.OZOW_API_KEY || 'test-api-key'
process.env.OZOW_IS_TEST = 'true'
process.env.PAYFLEX_CLIENT_ID = process.env.PAYFLEX_CLIENT_ID || 'test-client-id'
process.env.PAYFLEX_CLIENT_SECRET = process.env.PAYFLEX_CLIENT_SECRET || 'test-client-secret'
process.env.PAYFLEX_API_URL = process.env.PAYFLEX_API_URL || 'https://api.example.com'
process.env.PAYFLEX_AUTH_URL = process.env.PAYFLEX_AUTH_URL || 'https://auth.example.com/auth/merchant'
process.env.PAYFLEX_AUDIENCE = process.env.PAYFLEX_AUDIENCE || 'https://audience.example.com'

const realFetch = global.fetch
global.fetch = async (url, options = {}) => {
  const urlStr = String(url)
  if (urlStr === process.env.PAYFLEX_AUTH_URL) {
    return { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) }
  }
  if (urlStr.endsWith('/configuration')) {
    // Wide enough that every seeded course price clears the range check,
    // so the simulated failure below is what's actually being tested.
    return { ok: true, json: async () => ({ minimumAmount: 0, maximumAmount: 999999 }) }
  }
  if (urlStr.endsWith('/order')) {
    // Simulates Payflex being unreachable when placing an order.
    return { ok: false, status: 500, text: async () => 'Simulated Payflex outage for test' }
  }
  return realFetch(url, options)
}

const PORT = Number(process.env.PORT)

// Uses node:http directly (not the built-in fetch/undici) - avoids a
// Windows-specific libuv assertion crash seen when undici's connection pool
// and node-postgres's sockets close around the same time in this process.
const request = (method, pathAndQuery, body) => new Promise((resolve, reject) => {
  const payload = body ? JSON.stringify(body) : null
  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: pathAndQuery,
    method,
    headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
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

// A Tuesday at least two weeks out, so it's always both future and a valid
// training day regardless of when the suite runs.
const futureTuesday = () => {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  while (date.getDay() !== 2) date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

let api
let pool

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
})

// ── Fix 1: latest-provider detection on GET /api/enrolments/by-token ───────

test('GET /api/enrolments/by-token reports the provider that is actually latest, not whichever was checked second', async () => {
  const studentResult = await pool.query(
    `INSERT INTO students (class_id, name, whatsapp, email, preferred_start_date, payment_status, status, public_token, source, amount_paid)
     VALUES (1, 'Latest Provider Test', '0821112222', 'latest-provider-test@example.com', CURRENT_DATE + 14, 'unpaid', 'awaiting_payment', $1, 'website', 0)
     RETURNING *`,
    [`latest-provider-${Date.now()}`]
  )
  const student = studentResult.rows[0]
  try {
    // Both older than 24h, so the route's own auto-reconcile never kicks in
    // and tries to contact either provider - only the latest-provider
    // comparison itself is under test here. Payflex is the older attempt;
    // Ozow is the later one, so a correct implementation must report Ozow.
    await pool.query(
      `INSERT INTO payflex_payments (student_id, merchant_reference, payflex_order_id, amount, status, purpose, created_at)
       VALUES ($1, $2, $3, '500.00', 'started', 'deposit', NOW() - INTERVAL '2 days')`,
      [student.id, `HBH-${student.id}-older`, `pf-${student.id}-older`]
    )
    await pool.query(
      `INSERT INTO ozow_payments (student_id, transaction_reference, amount, status, is_test, purpose, created_at)
       VALUES ($1, $2, '500.00', 'pending', true, 'deposit', NOW() - INTERVAL '1 day')`,
      [student.id, `HBH-${student.id}-newer`]
    )

    const res = await request('GET', `/api/enrolments/by-token/${student.public_token}`)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.data.latestProvider, 'ozow', 'the genuinely more recent attempt (Ozow) must win, not Payflex by default')
    assert.strictEqual(res.data.latestStatus, 'pending')
  } finally {
    await pool.query('DELETE FROM ozow_payments WHERE student_id = $1', [student.id])
    await pool.query('DELETE FROM payflex_payments WHERE student_id = $1', [student.id])
    await pool.query('DELETE FROM students WHERE id = $1', [student.id])
  }
})

// ── Fix 2: overpayment-in-progress guard on pay-balance ────────────────────

const createStudentWithBalance = async (amountPaid) => {
  const result = await pool.query(
    `INSERT INTO students (class_id, name, whatsapp, email, preferred_start_date, payment_status, status, public_token, source, amount_paid)
     VALUES (1, 'Balance Guard Test', '0823334444', 'balance-guard-test@example.com', CURRENT_DATE + 14, 'partial', 'active', $1, 'website', $2)
     RETURNING *`,
    [`balance-guard-${Date.now()}-${Math.random().toString(16).slice(2)}`, amountPaid]
  )
  return result.rows[0]
}

test('POST /api/enrolments/:token/pay-balance refuses a second attempt while one is already in progress, even on a different provider', async () => {
  const student = await createStudentWithBalance('2000.00') // course 1 is R2500, so balance is R500
  try {
    await pool.query(
      `INSERT INTO payflex_payments (student_id, merchant_reference, payflex_order_id, amount, status, purpose, created_at)
       VALUES ($1, $2, $3, '500.00', 'started', 'balance', NOW())`,
      [student.id, `HBH-${student.id}-inprogress`, `pf-${student.id}-inprogress`]
    )

    const res = await request('POST', `/api/enrolments/${student.public_token}/pay-balance`, { provider: 'ozow' })
    assert.strictEqual(res.status, 409)
    assert.match(res.data.error, /already have a payment in progress/i)
  } finally {
    await pool.query('DELETE FROM ozow_payments WHERE student_id = $1', [student.id])
    await pool.query('DELETE FROM payflex_payments WHERE student_id = $1', [student.id])
    await pool.query('DELETE FROM students WHERE id = $1', [student.id])
  }
})

test('POST /api/enrolments/:token/pay-balance proceeds once the previous attempt is more than 30 minutes old', async () => {
  const student = await createStudentWithBalance('2000.00')
  try {
    await pool.query(
      `INSERT INTO payflex_payments (student_id, merchant_reference, payflex_order_id, amount, status, purpose, created_at)
       VALUES ($1, $2, $3, '500.00', 'started', 'balance', NOW() - INTERVAL '31 minutes')`,
      [student.id, `HBH-${student.id}-stale`, `pf-${student.id}-stale`]
    )

    const res = await request('POST', `/api/enrolments/${student.public_token}/pay-balance`, { provider: 'ozow' })
    assert.strictEqual(res.status, 200, 'a stale attempt older than 30 minutes must not block a new one')

    const { rows } = await pool.query(
      `SELECT * FROM ozow_payments WHERE student_id = $1 AND status = 'started' ORDER BY created_at DESC LIMIT 1`,
      [student.id]
    )
    assert.strictEqual(rows.length, 1, 'a new Ozow attempt must have been started')
  } finally {
    await pool.query('DELETE FROM ozow_payments WHERE student_id = $1', [student.id])
    await pool.query('DELETE FROM payflex_payments WHERE student_id = $1', [student.id])
    await pool.query('DELETE FROM students WHERE id = $1', [student.id])
  }
})

// ── Fix 3: orphaned student row cleanup on POST /api/enrolments ────────────

test('POST /api/enrolments deletes the orphaned student row when starting the Payflex payment fails', async () => {
  const email = `orphan-payflex-${Date.now()}@example.com`
  const res = await request('POST', '/api/enrolments', {
    courseId: 1,
    name: 'Orphan Cleanup Test',
    phone: '0821234567',
    email,
    preferredStartDate: futureTuesday(),
    paymentOption: 'full_payflex',
  })
  assert.strictEqual(res.status, 500)

  const { rows } = await pool.query('SELECT * FROM students WHERE email = $1', [email])
  assert.strictEqual(rows.length, 0, 'a student with no payment attempt must not be left behind')
})

test('POST /api/enrolments deletes the orphaned student row when building the Ozow fields fails', async () => {
  const ozow = require('../ozow')
  const originalBuildOzowFields = ozow.buildOzowFields
  ozow.buildOzowFields = () => { throw new Error('Simulated Ozow field-building failure') }

  try {
    const email = `orphan-ozow-${Date.now()}@example.com`
    const res = await request('POST', '/api/enrolments', {
      courseId: 1,
      name: 'Orphan Cleanup Test',
      phone: '0821234567',
      email,
      preferredStartDate: futureTuesday(),
      paymentOption: 'deposit_ozow',
    })
    assert.strictEqual(res.status, 500)

    const { rows } = await pool.query('SELECT * FROM students WHERE email = $1', [email])
    assert.strictEqual(rows.length, 0, 'a student with no payment attempt must not be left behind')
  } finally {
    ozow.buildOzowFields = originalBuildOzowFields
  }
})

after(async () => {
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
  global.fetch = realFetch
})
