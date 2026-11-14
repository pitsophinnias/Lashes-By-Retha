const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const jwt = require('jsonwebtoken')

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

const tokenFor = (role) => jwt.sign({ id: 999, username: 'route-test', role }, JWT_SECRET, { expiresIn: '1h' })

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET

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
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
