const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const bcrypt = require('bcrypt')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4032'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4032'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'
process.env.OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || 'TSTSITE1'
process.env.OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || 'test-private-key'
process.env.OZOW_API_KEY = process.env.OZOW_API_KEY || 'test-api-key'
process.env.OZOW_API_BASE = process.env.OZOW_API_BASE || 'https://live.example.com'
process.env.OZOW_TEST_API_BASE = process.env.OZOW_TEST_API_BASE || 'https://staging.example.com'

// Tight, test-only thresholds - read once by src/security/rateLimits.js at
// require time below, so they must be set before ../index is required.
// RATE_LIMIT_GENERAL_MAX is deliberately left high - it's a blanket
// app.use() over every route (including /api/orders and /api/auth/login
// below), so a tight value here would trip before the limiter actually
// being tested in each case did.
process.env.RATE_LIMIT_GENERAL_MAX = '10000'
process.env.RATE_LIMIT_GENERAL_WINDOW_MS = '60000'
process.env.RATE_LIMIT_ORDER_PHONE_MAX = '3'
process.env.RATE_LIMIT_ORDER_IP_MAX = '100'
process.env.RATE_LIMIT_LOGIN_USERNAME_MAX = '3'
// Generous on purpose - the username/reset test below also hits this same
// IP-keyed limiter a handful of times first (shared in-memory state across
// every test in this file), so the per-IP test just drives it to its limit
// from wherever it already is rather than assuming it starts at zero.
process.env.RATE_LIMIT_LOGIN_IP_MAX = '50'

const PORT = Number(process.env.PORT)

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

const waitForServer = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await request('GET', '/api/health')
      if (res.status === 200) return
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Server did not start in time')
}

let api
let pool
const testUserIds = []

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
})

after(async () => {
  await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [testUserIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})

// A minimal /api/orders body - enough to pass through both rate limiters
// (which run before any field validation) and fail with an ordinary 400
// once it reaches the route handler, rather than a 429. That 400-vs-429
// distinction is all these tests need to tell "let through" from "blocked".
const orderBodyFor = (phone) => ({ customerPhone: phone })

test('the same phone number is rate limited after RATE_LIMIT_ORDER_PHONE_MAX requests, regardless of formatting', async () => {
  const phoneFormats = ['0821234501', '0821234501', '+27821234501'] // all the same SA number
  for (const phone of phoneFormats) {
    const res = await request('POST', '/api/orders', orderBodyFor(phone))
    assert.notStrictEqual(res.status, 429, `expected request ${phone} to be let through`)
  }
  const blocked = await request('POST', '/api/orders', orderBodyFor('0821234501'))
  assert.strictEqual(blocked.status, 429)
  assert.match(blocked.data.error, /receiving a lot of requests/i)
  assert.notStrictEqual(blocked.data.error, undefined)
})

test('many different phone numbers from the same IP are never blocked by the per-phone limiter', async () => {
  // 8 distinct numbers x 2 requests each = 16 requests from one IP (this
  // test's own loopback connection) - each number stays under its own
  // per-phone ceiling of 3, and the total stays under the per-IP ceiling
  // of 100, so none of these should ever see a 429.
  for (let i = 0; i < 8; i++) {
    const phone = `08212345${10 + i}`
    for (let j = 0; j < 2; j++) {
      const res = await request('POST', '/api/orders', orderBodyFor(phone))
      assert.notStrictEqual(res.status, 429, `phone ${phone} attempt ${j + 1} should not be rate limited`)
    }
  }
})

test('Ozow and Payflex payment callbacks are never rate limited', async () => {
  // No limiter is attached to either route at all (see index.js) - fire
  // well more times than any of this file's limiters would ever allow and
  // confirm neither callback route returns 429.
  for (let i = 0; i < 10; i++) {
    const ozowRes = await request('POST', '/api/payments/ozow/notify', { SiteCode: 'wrong', TransactionReference: `t-${i}` })
    assert.notStrictEqual(ozowRes.status, 429)
    const payflexRes = await request('POST', '/api/payments/payflex/callback', { orderId: `o-${i}` })
    assert.notStrictEqual(payflexRes.status, 429)
  }
})

test('admin login: successful logins are never counted, and a success resets the username counter', async () => {
  const username = `ratelimit-test-${crypto.randomBytes(4).toString('hex')}`
  const hash = await bcrypt.hash('a-strong-test-password', 4)
  const roleRow = (await pool.query(`SELECT id FROM roles WHERE name = 'owner'`)).rows[0]
  const userResult = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, $2, $3, TRUE, FALSE) RETURNING id`,
    [username, hash, roleRow.id]
  )
  testUserIds.push(userResult.rows[0].id)

  // 2 failures (under the limit of 3)...
  for (let i = 0; i < 2; i++) {
    const res = await request('POST', '/api/auth/login', { username, password: 'wrong' })
    assert.strictEqual(res.status, 401)
  }
  // ...then a success, which must not itself be blocked and must reset
  // the counter rather than just "not count towards" it.
  const success = await request('POST', '/api/auth/login', { username, password: 'a-strong-test-password' })
  assert.strictEqual(success.status, 200)

  // If the counter had NOT been reset, this 3rd failure after the success
  // would be the 5th attempt against a limit of 3 and would 429 here.
  for (let i = 0; i < 3; i++) {
    const res = await request('POST', '/api/auth/login', { username, password: 'wrong' })
    assert.strictEqual(res.status, 401, `post-reset failure ${i + 1} should not be rate limited yet`)
  }
  const nowBlocked = await request('POST', '/api/auth/login', { username, password: 'wrong' })
  assert.strictEqual(nowBlocked.status, 429)
})

test('admin login: the per-IP limiter trips independently of any one username', async () => {
  // Distinct, nonexistent usernames each time - the per-username limiter
  // (keyed by username) never accumulates past 1 for any single one of
  // these, so only the per-IP limiter can ever trip here. It's driven to
  // its limit from whatever count it's already at (the previous test in
  // this file also hits it) rather than assuming a fresh start, so this
  // just confirms a ceiling exists and isn't reached instantly.
  let allowed = 0
  let blockedStatus = null
  for (let i = 0; i < 60 && blockedStatus === null; i++) {
    const res = await request('POST', '/api/auth/login', { username: `no-such-user-${i}-${crypto.randomBytes(3).toString('hex')}`, password: 'wrong' })
    if (res.status === 429) blockedStatus = res.status
    else { assert.strictEqual(res.status, 401); allowed++ }
  }
  assert.strictEqual(blockedStatus, 429, 'expected the per-IP login limiter to eventually trip')
  assert.ok(allowed >= 2, 'expected at least a couple of requests through before the IP limiter tripped')
})
