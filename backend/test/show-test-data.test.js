const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')

// node --test runs each test file in its own process, so running the real
// app here never collides with a manually-run dev server on port 3002, and
// these env vars never leak into other test files.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4020'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4020'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

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

let api
let pool
let JWT_SECRET
const testUserIds = []
const createdOrderIds = []
const createdStudentIds = []
const createdProductIds = []
const createdPreorderIds = []

// authenticate loads the user fresh from the database on every request, so
// each role needs a real user row behind it - see auth.js.
const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const sysadminHeaders = () => ({ Authorization: `Bearer ${tokenFor('sysadmin')}` })
const ownerHeaders = () => ({ Authorization: `Bearer ${tokenFor('owner')}` })
const staffHeaders = () => ({ Authorization: `Bearer ${tokenFor('staff')}` })

const createTestUser = async (roleName) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `show-test-data-test-${roleName}-${Date.now()}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
}

const createOrder = async ({ isTest = false } = {}) => {
  const token = randRef('order-token')
  const result = await pool.query(
    `INSERT INTO orders (customer_name, customer_phone, total, payment_method, payment_status, public_token, is_test)
     VALUES ('Show Test Data Test', '0821234567', 250.00, 'ozow', 'unpaid', $1, $2) RETURNING *`,
    [token, isTest]
  )
  createdOrderIds.push(result.rows[0].id)
  return result.rows[0]
}

const createStudent = async ({ isTest = false } = {}) => {
  const token = randRef('student-token')
  const result = await pool.query(
    `INSERT INTO students (class_id, name, whatsapp, payment_status, status, public_token, is_test)
     VALUES (1, 'Show Test Data Student', '0821234567', 'unpaid', 'active', $1, $2) RETURNING *`,
    [token, isTest]
  )
  createdStudentIds.push(result.rows[0].id)
  return result.rows[0]
}

const createProduct = async () => {
  const result = await pool.query(
    `INSERT INTO products (name, price, stock_quantity) VALUES ('Show Test Data Product', 1000, 0) RETURNING *`
  )
  createdProductIds.push(result.rows[0].id)
  return result.rows[0]
}

const createPreorder = async (product, { isTest = false } = {}) => {
  const token = randRef('preorder-token')
  const result = await pool.query(
    `INSERT INTO preorders (
       product_id, quantity, customer_name, customer_phone, customer_email, fulfilment_method,
       price_at_order, deposit_amount, delivery_fee, status, public_token, is_test
     ) VALUES ($1, 1, 'Show Test Data Preorder', '0821234567', 'show-test-data@example.com', 'pickup', $2, 100, 0, 'awaiting_deposit', $3, $4)
     RETURNING *`,
    [product.id, product.price, token, isTest]
  )
  createdPreorderIds.push(result.rows[0].id)
  return result.rows[0]
}

const setShowTestData = (enabled) => request('PUT', '/api/admin/system/show-test-data', { enabled }, sysadminHeaders())

const currentMonthKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

let originalShowTestData

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET

  const sysadminRow = (await pool.query(
    `SELECT u.id, u.username, u.token_version FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'sysadmin' LIMIT 1`
  )).rows[0]
  roleTokenInfo.sysadmin = { id: sysadminRow.id, username: sysadminRow.username, tokenVersion: sysadminRow.token_version }
  await createTestUser('owner')
  await createTestUser('staff')

  const settingsRes = await request('GET', '/api/admin/system/settings', undefined, sysadminHeaders())
  originalShowTestData = settingsRes.data.showTestData
})

test('only sysadmin can change the show-test-data switch', async () => {
  const unauth = await request('PUT', '/api/admin/system/show-test-data', { enabled: true })
  assert.strictEqual(unauth.status, 401)
  const asOwner = await request('PUT', '/api/admin/system/show-test-data', { enabled: true }, ownerHeaders())
  assert.strictEqual(asOwner.status, 403)
  const asStaff = await request('PUT', '/api/admin/system/show-test-data', { enabled: true }, staffHeaders())
  assert.strictEqual(asStaff.status, 403)
  const asSysadmin = await setShowTestData(false)
  assert.strictEqual(asSysadmin.status, 200)
})

test('rejects a non-boolean enabled value', async () => {
  const res = await request('PUT', '/api/admin/system/show-test-data', { enabled: 'yes' }, sysadminHeaders())
  assert.strictEqual(res.status, 400)
})

test('GET /api/system/status reports the current showTestData value, publicly', async () => {
  await setShowTestData(true)
  const res = await request('GET', '/api/system/status')
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.showTestData.enabled, true)
  await setShowTestData(false)
})

test('off hides test orders, pre-orders, students and notifications from owner and staff, exactly as before', async () => {
  await setShowTestData(false)
  const order = await createOrder({ isTest: true })
  const student = await createStudent({ isTest: true })
  const product = await createProduct()
  const preorder = await createPreorder(product, { isTest: true })
  const marker = randRef('notif-marker')
  await pool.query(
    `INSERT INTO notifications (type, title, message, order_id) VALUES ('order', 'Test notif', $1, $2)`,
    [marker, order.id]
  )

  for (const headers of [ownerHeaders(), staffHeaders()]) {
    const ordersRes = await request('GET', '/api/orders', undefined, headers)
    assert.ok(!ordersRes.data.some(o => o.id === order.id))

    const notifRes = await request('GET', '/api/notifications', undefined, headers)
    assert.ok(!notifRes.data.some(n => n.message === marker))

    const unreadRes = await request('GET', '/api/notifications/unread-count', undefined, headers)
    assert.strictEqual(typeof unreadRes.data.count, 'number')
  }

  const studentsRes = await request('GET', '/api/classes/1/students', undefined, ownerHeaders())
  assert.ok(!studentsRes.data.some(s => s.id === student.id))

  const preordersRes = await request('GET', '/api/admin/preorders', undefined, ownerHeaders())
  const group = preordersRes.data.products.find(p => p.productId === product.id)
  assert.ok(!group || !group.preorders.some(p => p.id === preorder.id))
})

test('on shows test orders, pre-orders, students and notifications to owner and staff too', async () => {
  await setShowTestData(true)
  const order = await createOrder({ isTest: true })
  const student = await createStudent({ isTest: true })
  const product = await createProduct()
  const preorder = await createPreorder(product, { isTest: true })
  const marker = randRef('notif-marker')
  await pool.query(
    `INSERT INTO notifications (type, title, message, order_id) VALUES ('order', 'Test notif', $1, $2)`,
    [marker, order.id]
  )

  for (const headers of [ownerHeaders(), staffHeaders()]) {
    const ordersRes = await request('GET', '/api/orders', undefined, headers)
    assert.ok(ordersRes.data.some(o => o.id === order.id))

    const notifRes = await request('GET', '/api/notifications', undefined, headers)
    assert.ok(notifRes.data.some(n => n.message === marker))
  }

  const studentsRes = await request('GET', '/api/classes/1/students', undefined, ownerHeaders())
  assert.ok(studentsRes.data.some(s => s.id === student.id))

  const preordersRes = await request('GET', '/api/admin/preorders', undefined, ownerHeaders())
  const group = preordersRes.data.products.find(p => p.productId === product.id)
  assert.ok(group && group.preorders.some(p => p.id === preorder.id))

  await setShowTestData(false)
})

test('the calendar includes a test student and a test order only when the switch is on', async () => {
  await setShowTestData(false)
  const month = currentMonthKey()
  const student = await createStudent({ isTest: true })
  await pool.query(`UPDATE students SET preferred_start_date = CURRENT_DATE WHERE id = $1`, [student.id])
  const order = await createOrder({ isTest: true })

  const offRes = await request('GET', `/api/dashboard/calendar?month=${month}`, undefined, ownerHeaders())
  assert.ok(!offRes.data.students.some(s => s.id === student.id))
  assert.ok(!offRes.data.orders.some(o => o.id === order.id))

  await setShowTestData(true)
  const onRes = await request('GET', `/api/dashboard/calendar?month=${month}`, undefined, ownerHeaders())
  assert.ok(onRes.data.students.some(s => s.id === student.id))
  assert.ok(onRes.data.orders.some(o => o.id === order.id))

  await setShowTestData(false)
})

after(async () => {
  if (originalShowTestData) await setShowTestData(originalShowTestData.enabled)
  await pool.query('DELETE FROM notifications WHERE order_id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM preorders WHERE id = ANY($1)', [createdPreorderIds])
  await pool.query('DELETE FROM orders WHERE id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM students WHERE id = ANY($1)', [createdStudentIds])
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
