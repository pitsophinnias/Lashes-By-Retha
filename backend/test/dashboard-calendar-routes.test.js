const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const jwt = require('jsonwebtoken')
const { createTestSessionId } = require('./helpers/session')

// node --test runs each test file in its own process, so running the real
// app here never collides with a manually-run dev server on port 3002, and
// these env vars never leak into other test files.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4012'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4012'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

const PORT = Number(process.env.PORT)

// Uses node:http directly (not the built-in fetch/undici) - avoids a
// Windows-specific libuv assertion crash seen when undici's connection pool
// and node-postgres's sockets close around the same time in this process.
const request = (method, pathAndQuery, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: 'localhost', port: PORT, path: pathAndQuery, method, headers }, (res) => {
    let raw = ''
    res.on('data', (chunk) => { raw += chunk })
    res.on('end', () => {
      let data = null
      try { data = raw ? JSON.parse(raw) : null } catch {}
      resolve({ status: res.statusCode, data })
    })
  })
  req.on('error', reject)
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

let api
let pool
let JWT_SECRET
let studentId
let orderId
let testUserIds = []

// authenticate now loads the user fresh from the database on every request
// (id, is_active, token_version, and the role itself) instead of trusting
// the token's own claims - so a test token needs a real user row behind it,
// not just an id of 999, and must carry that row's current token_version.
const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion, sessionId: roleTokenInfo[role].sessionId },
  JWT_SECRET,
  { expiresIn: '1h' }
)

const createTestUser = async (roleName) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `route-test-${roleName}-${Date.now()}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
  roleTokenInfo[roleName].sessionId = await createTestSessionId(pool, result.rows[0].id)
}

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET

  await createTestUser('owner')
  await createTestUser('staff')

  // class_id 1 is the R2500 course seeded by db.js's createTables - a known
  // price makes the balance assertion below exact rather than approximate.
  const studentResult = await pool.query(
    `INSERT INTO students (class_id, name, whatsapp, status, preferred_start_date, amount_paid)
     VALUES (1, 'Calendar Route Test Student', '0821234567', 'active', '2031-06-15', 500)
     RETURNING id`
  )
  studentId = studentResult.rows[0].id

  const orderResult = await pool.query(
    `INSERT INTO orders (customer_name, customer_phone, total, status, payment_status, created_at)
     VALUES ('Calendar Route Test Order', '0821234567', 250, 'pending', 'paid', '2031-06-20')
     RETURNING id`
  )
  orderId = orderResult.rows[0].id
})

test('GET /api/dashboard/calendar requires authentication', async () => {
  const res = await request('GET', '/api/dashboard/calendar?month=2031-06')
  assert.strictEqual(res.status, 401)
})

test('GET /api/dashboard/calendar rejects a malformed month', async () => {
  const res = await request('GET', '/api/dashboard/calendar?month=2031-6', {
    Authorization: `Bearer ${tokenFor('owner')}`,
  })
  assert.strictEqual(res.status, 400)
})

test('GET /api/dashboard/calendar returns the student and order for the requested month, with a balance for an owner', async () => {
  const res = await request('GET', '/api/dashboard/calendar?month=2031-06', {
    Authorization: `Bearer ${tokenFor('owner')}`,
  })
  assert.strictEqual(res.status, 200)

  const student = res.data.students.find(s => s.id === studentId)
  assert.ok(student)
  assert.strictEqual(student.hasBalance, true)
  assert.strictEqual(student.balance, 2000)

  const order = res.data.orders.find(o => o.id === orderId)
  assert.ok(order)
  assert.strictEqual(order.needsConfirmation, true)
})

test('GET /api/dashboard/calendar hides the balance figure from staff but keeps hasBalance', async () => {
  const res = await request('GET', '/api/dashboard/calendar?month=2031-06', {
    Authorization: `Bearer ${tokenFor('staff')}`,
  })
  assert.strictEqual(res.status, 200)

  const student = res.data.students.find(s => s.id === studentId)
  assert.ok(student)
  assert.strictEqual(student.hasBalance, true)
  assert.strictEqual(student.balance, null)
})

test('GET /api/dashboard/calendar excludes a student and order outside the requested month', async () => {
  const res = await request('GET', '/api/dashboard/calendar?month=2031-07', {
    Authorization: `Bearer ${tokenFor('owner')}`,
  })
  assert.strictEqual(res.status, 200)
  assert.ok(!res.data.students.some(s => s.id === studentId))
  assert.ok(!res.data.orders.some(o => o.id === orderId))
})

after(async () => {
  await pool.query('DELETE FROM students WHERE id = $1', [studentId])
  await pool.query('DELETE FROM orders WHERE id = $1', [orderId])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
