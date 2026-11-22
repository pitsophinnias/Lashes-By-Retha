// Part A follow-up: every endpoint that returns an order/pre-order/
// enrolment's own customer contact details (serializePreorder is the only
// one that still does, at GET /api/admin/preorders - owner/sysadmin only)
// must require authentication as owner/staff/sysadmin, and every public,
// token-based "look up my own order" endpoint must never include another
// customer's phone or email - or indeed any phone/email at all, since the
// customer who holds the token already knows their own.
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const jwt = require('jsonwebtoken')
const { createTestSessionId } = require('./helpers/session')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4028'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4028'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

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
let JWT_SECRET
const testUserIds = []
const createdProductIds = []
const createdOrderIds = []
const createdPreorderIds = []
const createdStudentIds = []

const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion, sessionId: roleTokenInfo[role].sessionId },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const ownerHeaders = () => ({ Authorization: `Bearer ${tokenFor('owner')}` })
const staffHeaders = () => ({ Authorization: `Bearer ${tokenFor('staff')}` })

const createTestUser = async (roleName) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `privacy-test-${roleName}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
  roleTokenInfo[roleName].sessionId = await createTestSessionId(pool, result.rows[0].id)
}

const CUSTOMER_PHONE = '+27826855399'
const CUSTOMER_EMAIL = 'privacy-test-customer@example.com'

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET
  await createTestUser('owner')
  await createTestUser('staff')
})

// ── GET /api/admin/preorders: the only place serializePreorder is used ────

test('GET /api/admin/preorders requires authentication as owner or sysadmin - staff and anonymous are refused', async () => {
  const anon = await request('GET', '/api/admin/preorders')
  assert.strictEqual(anon.status, 401)
  const staffAttempt = await request('GET', '/api/admin/preorders', undefined, staffHeaders())
  assert.strictEqual(staffAttempt.status, 403)
})

// ── Public, token-based "my own order/pre-order/enrolment" endpoints ──────

test('GET /api/orders/by-token/:token never includes a phone number or email', async () => {
  const token = `privacy-order-${Math.random().toString(16).slice(2)}`
  const order = (await pool.query(
    `INSERT INTO orders (customer_name, customer_phone, customer_email, total, fulfilment_method, payment_method, payment_status, public_token)
     VALUES ('Privacy Test Customer', $1, $2, 150, 'pickup', 'ozow', 'unpaid', $3) RETURNING *`,
    [CUSTOMER_PHONE, CUSTOMER_EMAIL, token]
  )).rows[0]
  createdOrderIds.push(order.id)

  const res = await request('GET', `/api/orders/by-token/${token}`)
  assert.strictEqual(res.status, 200)
  const raw = JSON.stringify(res.data)
  assert.ok(!raw.includes(CUSTOMER_PHONE), 'response must not include the customer phone number')
  assert.ok(!raw.includes(CUSTOMER_EMAIL), 'response must not include the customer email')
  assert.strictEqual(res.data.customerPhone, undefined)
  assert.strictEqual(res.data.customerEmail, undefined)
  assert.strictEqual(res.data.customerName, undefined)
})

test('GET /api/preorders/by-token/:token never includes a phone number or email', async () => {
  const product = (await pool.query(
    `INSERT INTO products (name, price, preorder_enabled, preorder_deposit, stock_quantity) VALUES ($1, 300, TRUE, 100, 0) RETURNING *`,
    [`Privacy Test Product ${Math.random().toString(16).slice(2)}`]
  )).rows[0]
  createdProductIds.push(product.id)
  const token = `privacy-preorder-${Math.random().toString(16).slice(2)}`
  const preorder = (await pool.query(
    `INSERT INTO preorders (
       product_id, quantity, customer_name, customer_phone, customer_email, fulfilment_method,
       price_at_order, deposit_amount, delivery_fee, status, public_token
     ) VALUES ($1, 1, 'Privacy Test Customer', $2, $3, 'pickup', 300, 100, 0, 'awaiting_deposit', $4)
     RETURNING *`,
    [product.id, CUSTOMER_PHONE, CUSTOMER_EMAIL, token]
  )).rows[0]
  createdPreorderIds.push(preorder.id)

  const res = await request('GET', `/api/preorders/by-token/${token}`)
  assert.strictEqual(res.status, 200)
  const raw = JSON.stringify(res.data)
  assert.ok(!raw.includes(CUSTOMER_PHONE), 'response must not include the customer phone number')
  assert.ok(!raw.includes(CUSTOMER_EMAIL), 'response must not include the customer email')
  assert.strictEqual(res.data.customerPhone, undefined)
  assert.strictEqual(res.data.customerEmail, undefined)
  assert.strictEqual(res.data.customerName, undefined)
})

test('GET /api/enrolments/by-token/:token never includes a phone number or email', async () => {
  const token = `privacy-enrolment-${Math.random().toString(16).slice(2)}`
  const student = (await pool.query(
    `INSERT INTO students (class_id, name, whatsapp, email, payment_status, status, amount_paid, public_token, source)
     VALUES (1, 'Privacy Test Customer', $1, $2, 'unpaid', 'awaiting_payment', 0, $3, 'website') RETURNING *`,
    [CUSTOMER_PHONE, CUSTOMER_EMAIL, token]
  )).rows[0]
  createdStudentIds.push(student.id)

  const res = await request('GET', `/api/enrolments/by-token/${token}`)
  assert.strictEqual(res.status, 200)
  const raw = JSON.stringify(res.data)
  assert.ok(!raw.includes(CUSTOMER_PHONE), 'response must not include the student whatsapp number')
  assert.ok(!raw.includes(CUSTOMER_EMAIL), 'response must not include the student email')
  assert.strictEqual(res.data.whatsapp, undefined)
  assert.strictEqual(res.data.email, undefined)
  assert.strictEqual(res.data.name, undefined)
})

after(async () => {
  await pool.query('DELETE FROM students WHERE id = ANY($1)', [createdStudentIds])
  await pool.query('DELETE FROM preorders WHERE id = ANY($1)', [createdPreorderIds])
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM orders WHERE id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [testUserIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  // A grace period before tearing anything down - the enrolments by-token
  // route above fires several extra sequential queries after the main one
  // (ozow/payflex latest-attempt checks), and closing the server or pool
  // while Windows' libuv is still settling one of those handles has been
  // observed to crash the process with a native assertion (not a real
  // test failure - every assertion above it already passed).
  await new Promise((resolve) => setTimeout(resolve, 500))
  await new Promise((resolve) => api.getServer().close(resolve))
  await new Promise((resolve) => setTimeout(resolve, 500))
  await pool.end()
})
