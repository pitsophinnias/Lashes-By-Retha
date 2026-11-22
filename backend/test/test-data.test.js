const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')
const { createTestSessionId } = require('./helpers/session')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4015'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4015'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'
process.env.OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || 'TSTSITE1'
process.env.OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || 'test-private-key'
process.env.OZOW_API_KEY = process.env.OZOW_API_KEY || 'test-api-key'
process.env.OZOW_API_BASE = process.env.OZOW_API_BASE || 'https://live.example.com'
process.env.OZOW_TEST_API_BASE = process.env.OZOW_TEST_API_BASE || 'https://staging.example.com'
// A UAT/sandbox URL - PAYFLEX_IS_TEST derives from this, which is exactly
// the signal the auto-marking logic is supposed to key off.
process.env.PAYFLEX_CLIENT_ID = process.env.PAYFLEX_CLIENT_ID || 'test-client-id'
process.env.PAYFLEX_CLIENT_SECRET = process.env.PAYFLEX_CLIENT_SECRET || 'test-client-secret'
process.env.PAYFLEX_API_URL = process.env.PAYFLEX_API_URL || 'https://api.uat.example.com'
process.env.PAYFLEX_AUTH_URL = process.env.PAYFLEX_AUTH_URL || 'https://auth-uat.example.com/auth/merchant'
process.env.PAYFLEX_AUDIENCE = process.env.PAYFLEX_AUDIENCE || 'https://audience.example.com'

const realFetch = global.fetch
global.fetch = async (url, options = {}) => {
  const urlStr = String(url)
  if (urlStr.includes('/GetTransactionByReference')) {
    return { ok: true, json: async () => [] }
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
let sysadminUserId
const testUserIds = []

// authenticate now loads the user fresh from the database on every request
// (id, is_active, token_version, and the role itself) instead of trusting
// the token's own claims - so "owner" needs a real owner user row behind
// it, not the sysadmin's id wearing a fake role claim (which would now
// resolve to the sysadmin's real role and defeat the point of these tests).
const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion, sessionId: roleTokenInfo[role].sessionId },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const sysadminHeaders = () => ({ Authorization: `Bearer ${tokenFor('sysadmin')}` })
const ownerHeaders = () => ({ Authorization: `Bearer ${tokenFor('owner')}` })

const createTestUser = async (roleName) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `test-data-test-${roleName}-${Date.now()}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
  roleTokenInfo[roleName].sessionId = await createTestSessionId(pool, result.rows[0].id)
}

const createdOrderIds = []
const createdStudentIds = []
const createdProductIds = []

const createOrder = async ({ paymentMethod = 'ozow', isTest = false, status = 'pending' } = {}) => {
  const token = randRef('order-token')
  const result = await pool.query(
    `INSERT INTO orders (customer_name, customer_phone, total, payment_method, payment_status, public_token, is_test, status)
     VALUES ('Test Data Test', '0821234567', 250.00, $1, 'unpaid', $2, $3, $4) RETURNING *`,
    [paymentMethod, token, isTest, status]
  )
  createdOrderIds.push(result.rows[0].id)
  return result.rows[0]
}

const createStudent = async ({ isTest = false } = {}) => {
  const token = randRef('student-token')
  const result = await pool.query(
    `INSERT INTO students (class_id, name, whatsapp, payment_status, status, public_token, is_test)
     VALUES (1, 'Test Data Student', '0821234567', 'unpaid', 'awaiting_payment', $1, $2) RETURNING *`,
    [token, isTest]
  )
  createdStudentIds.push(result.rows[0].id)
  return result.rows[0]
}

const createProduct = async (stockQuantity) => {
  const result = await pool.query(
    `INSERT INTO products (name, stock_quantity, low_stock_threshold) VALUES ('Test Data Product', $1, 3) RETURNING *`,
    [stockQuantity]
  )
  createdProductIds.push(result.rows[0].id)
  return result.rows[0]
}

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET
  const userRow = await pool.query(
    `SELECT u.id, u.username, u.token_version FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'sysadmin' LIMIT 1`
  )
  sysadminUserId = userRow.rows[0].id
  roleTokenInfo.sysadmin = { id: userRow.rows[0].id, username: userRow.rows[0].username, tokenVersion: userRow.rows[0].token_version }
  roleTokenInfo.sysadmin.sessionId = await createTestSessionId(pool, userRow.rows[0].id)
  await createTestUser('owner')
})

// ── Auto-marking ─────────────────────────────────────────────────────────────

test('starting an Ozow (test mode) payment marks the order as test data', async () => {
  const order = await createOrder({ paymentMethod: 'ozow' })
  assert.strictEqual(order.is_test, false)

  const res = await request('POST', '/api/payments/ozow/start', { orderToken: order.public_token })
  assert.strictEqual(res.status, 200)

  const { rows } = await pool.query('SELECT is_test FROM orders WHERE id = $1', [order.id])
  assert.strictEqual(rows[0].is_test, true)
})

test('starting a Payflex payment while PAYFLEX_API_URL is UAT marks the order as test data', async () => {
  const order = await createOrder({ paymentMethod: 'payflex' })
  const res = await request('POST', '/api/payments/payflex/start', { orderToken: order.public_token })
  assert.strictEqual(res.status, 200)

  const { rows } = await pool.query('SELECT is_test FROM orders WHERE id = $1', [order.id])
  assert.strictEqual(rows[0].is_test, true)
})

test('enrolling and paying via Ozow marks the student as test data', async () => {
  const res = await request('POST', '/api/enrolments', {
    courseId: 1, name: 'Marking Test Student', phone: '0821234567', email: 'marking-test@example.com',
    preferredStartDate: futureTuesday(), paymentOption: 'deposit_ozow',
  })
  assert.strictEqual(res.status, 201)
  const { rows } = await pool.query('SELECT id, is_test FROM students WHERE public_token = $1', [res.data.enrolmentToken])
  createdStudentIds.push(rows[0].id)
  assert.strictEqual(rows[0].is_test, true)
})

function futureTuesday() {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  while (date.getDay() !== 2) date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

test('a sysadmin can mark and unmark an order by hand', async () => {
  const order = await createOrder()
  const headers = sysadminHeaders()

  const mark = await request('PATCH', `/api/admin/orders/${order.id}/test-flag`, { isTest: true }, headers)
  assert.strictEqual(mark.status, 200)
  let row = (await pool.query('SELECT is_test FROM orders WHERE id = $1', [order.id])).rows[0]
  assert.strictEqual(row.is_test, true)

  const unmark = await request('PATCH', `/api/admin/orders/${order.id}/test-flag`, { isTest: false }, headers)
  assert.strictEqual(unmark.status, 200)
  row = (await pool.query('SELECT is_test FROM orders WHERE id = $1', [order.id])).rows[0]
  assert.strictEqual(row.is_test, false)
})

// ── Hidden from owner, visible to sysadmin with the toggle ───────────────────

test('GET /api/orders hides test orders from an owner, and from a sysadmin without the toggle', async () => {
  const realOrder = await createOrder({ isTest: false })
  const testOrder = await createOrder({ isTest: true })

  const asOwner = await request('GET', '/api/orders', undefined, ownerHeaders())
  assert.ok(asOwner.data.some(o => o.id === realOrder.id))
  assert.ok(!asOwner.data.some(o => o.id === testOrder.id))

  const asSysadminDefault = await request('GET', '/api/orders', undefined, sysadminHeaders())
  assert.ok(!asSysadminDefault.data.some(o => o.id === testOrder.id))

  const asSysadminWithToggle = await request('GET', '/api/orders?includeTest=true', undefined, sysadminHeaders())
  assert.ok(asSysadminWithToggle.data.some(o => o.id === testOrder.id))
  assert.strictEqual(asSysadminWithToggle.data.find(o => o.id === testOrder.id).isTest, true)

  // An owner can never see test data even if they pass the toggle themselves.
  const ownerWithToggle = await request('GET', '/api/orders?includeTest=true', undefined, ownerHeaders())
  assert.ok(!ownerWithToggle.data.some(o => o.id === testOrder.id))
})

test('GET /api/classes/:classId/students hides test students from an owner, visible to sysadmin with the toggle', async () => {
  const realStudent = await createStudent({ isTest: false })
  const testStudent = await createStudent({ isTest: true })

  const asOwner = await request('GET', '/api/classes/1/students', undefined, ownerHeaders())
  assert.ok(asOwner.data.some(s => s.id === realStudent.id))
  assert.ok(!asOwner.data.some(s => s.id === testStudent.id))

  const asSysadminWithToggle = await request('GET', '/api/classes/1/students?includeTest=true', undefined, sysadminHeaders())
  assert.ok(asSysadminWithToggle.data.some(s => s.id === testStudent.id))
})

test('GET /api/dashboard/calendar excludes test orders and students for an owner, includes them for sysadmin with the toggle', async () => {
  const month = '2031-06'
  const start = new Date(2031, 5, 15)
  const realStudent = await createStudent({ isTest: false })
  await pool.query(
    `UPDATE students SET status = 'active', preferred_start_date = $1 WHERE id = $2`, [start, realStudent.id]
  )
  const testStudent = await createStudent({ isTest: true })
  await pool.query(
    `UPDATE students SET status = 'active', preferred_start_date = $1 WHERE id = $2`, [start, testStudent.id]
  )
  const realOrder = await createOrder({ isTest: false })
  await pool.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [start, realOrder.id])
  const testOrder = await createOrder({ isTest: true })
  await pool.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [start, testOrder.id])

  const asOwner = await request('GET', `/api/dashboard/calendar?month=${month}`, undefined, ownerHeaders())
  assert.ok(asOwner.data.students.some(s => s.id === realStudent.id))
  assert.ok(!asOwner.data.students.some(s => s.id === testStudent.id))
  assert.ok(asOwner.data.orders.some(o => o.id === realOrder.id))
  assert.ok(!asOwner.data.orders.some(o => o.id === testOrder.id))

  const asSysadminWithToggle = await request('GET', `/api/dashboard/calendar?month=${month}&includeTest=true`, undefined, sysadminHeaders())
  assert.ok(asSysadminWithToggle.data.students.some(s => s.id === testStudent.id))
  assert.ok(asSysadminWithToggle.data.orders.some(o => o.id === testOrder.id))
})

test('notifications tied to a test order are hidden from an owner, visible to sysadmin with the toggle', async () => {
  const testOrder = await createOrder({ isTest: true })
  const marker = randRef('notif-marker')
  await pool.query(
    `INSERT INTO notifications (type, title, message, order_id) VALUES ('order', 'Test notif', $1, $2)`,
    [marker, testOrder.id]
  )

  const asOwner = await request('GET', '/api/notifications', undefined, ownerHeaders())
  assert.ok(!asOwner.data.some(n => n.message === marker))

  const asSysadminWithToggle = await request('GET', '/api/notifications?includeTest=true', undefined, sysadminHeaders())
  assert.ok(asSysadminWithToggle.data.some(n => n.message === marker))
})

// ── 403s ──────────────────────────────────────────────────────────────────────

test('owner gets 403 on every test-data-only route', async () => {
  const headers = ownerHeaders()
  const order = await createOrder()
  const checks = [
    await request('GET', '/api/admin/test-data', undefined, headers),
    await request('POST', '/api/admin/test-data/delete', { all: true }, headers),
    await request('PATCH', `/api/admin/orders/${order.id}/test-flag`, { isTest: true }, headers),
    await request('PATCH', `/api/admin/students/1/test-flag`, { isTest: true }, headers),
  ]
  for (const res of checks) assert.strictEqual(res.status, 403)
})

// ── Deletion ──────────────────────────────────────────────────────────────────

test('deleting a confirmed test order restores stock (product and variant), removes related rows, and never touches real data', async () => {
  const product = await createProduct(10)
  const variantResult = await pool.query(
    `INSERT INTO product_variants (product_id, length_mm, curl, stock_quantity) VALUES ($1, 12, 'D', 5) RETURNING *`,
    [product.id]
  )
  const variant = variantResult.rows[0]

  const testOrder = await createOrder({ isTest: true, status: 'confirmed' })
  await pool.query(
    `INSERT INTO order_items (order_id, product_id, product_name, qty, price) VALUES ($1, $2, 'Test Data Product', 3, 50)`,
    [testOrder.id, product.id]
  )
  await pool.query(
    `INSERT INTO order_items (order_id, product_id, product_name, qty, price, variant_id, length_mm, curl)
     VALUES ($1, $2, 'Test Data Product 12mm D', 2, 60, $3, 12, 'D')`,
    [testOrder.id, product.id, variant.id]
  )
  // Simulate the deduction that happened when this test order was confirmed.
  await pool.query('UPDATE products SET stock_quantity = stock_quantity - 3 WHERE id = $1', [product.id])
  await pool.query('UPDATE product_variants SET stock_quantity = stock_quantity - 2 WHERE id = $1', [variant.id])

  const ozowPaymentRef = randRef('HBH')
  await pool.query(
    `INSERT INTO ozow_payments (order_id, transaction_reference, amount, status, is_test) VALUES ($1, $2, '250.00', 'paid', TRUE)`,
    [testOrder.id, ozowPaymentRef]
  )
  const notifMarker = randRef('notif-marker')
  await pool.query(
    `INSERT INTO notifications (type, title, message, order_id) VALUES ('order', 'x', $1, $2)`,
    [notifMarker, testOrder.id]
  )

  // A real order and student, untouched throughout, and deliberately included
  // in the delete request to prove non-test ids are never acted on.
  const realOrder = await createOrder({ isTest: false })
  const realStudent = await createStudent({ isTest: false })

  const res = await request('POST', '/api/admin/test-data/delete',
    { orderIds: [testOrder.id, realOrder.id], studentIds: [realStudent.id] }, sysadminHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.ordersDeleted, 1)
  assert.strictEqual(res.data.studentsDeleted, 0)
  assert.strictEqual(res.data.stockRestoredMovements, 2)
  assert.strictEqual(res.data.stockRestoredUnits, 5)

  const orderRow = await pool.query('SELECT 1 FROM orders WHERE id = $1', [testOrder.id])
  assert.strictEqual(orderRow.rows.length, 0)
  const itemsRow = await pool.query('SELECT 1 FROM order_items WHERE order_id = $1', [testOrder.id])
  assert.strictEqual(itemsRow.rows.length, 0)
  const paymentRow = await pool.query('SELECT 1 FROM ozow_payments WHERE transaction_reference = $1', [ozowPaymentRef])
  assert.strictEqual(paymentRow.rows.length, 0)
  const notifRow = await pool.query('SELECT 1 FROM notifications WHERE message = $1', [notifMarker])
  assert.strictEqual(notifRow.rows.length, 0)

  const productRow = (await pool.query('SELECT stock_quantity FROM products WHERE id = $1', [product.id])).rows[0]
  assert.strictEqual(productRow.stock_quantity, 10)
  const variantRow = (await pool.query('SELECT stock_quantity FROM product_variants WHERE id = $1', [variant.id])).rows[0]
  assert.strictEqual(variantRow.stock_quantity, 5)

  // order_id is deliberately left NULL on these rows (the order no longer
  // exists) - the deleted order's id is recorded in note instead.
  const movements = (await pool.query(
    `SELECT * FROM stock_movements WHERE product_id = $1 AND reason = 'test_cleanup'`, [product.id]
  )).rows
  assert.strictEqual(movements.length, 2)
  assert.ok(movements.every(m => m.order_id === null && m.note.includes(`#${testOrder.id}`)))
  assert.ok(movements.some(m => m.variant_id === null && m.change === 3))
  assert.ok(movements.some(m => m.variant_id === variant.id && m.change === 2))

  // The real order and student passed in the same request are untouched.
  const realOrderRow = await pool.query('SELECT 1 FROM orders WHERE id = $1', [realOrder.id])
  assert.strictEqual(realOrderRow.rows.length, 1)
  const realStudentRow = await pool.query('SELECT 1 FROM students WHERE id = $1', [realStudent.id])
  assert.strictEqual(realStudentRow.rows.length, 1)
})

test('"delete all" removes every current test order and student, and nothing else', async () => {
  const testOrder1 = await createOrder({ isTest: true })
  const testOrder2 = await createOrder({ isTest: true })
  const testStudent = await createStudent({ isTest: true })
  const realOrder = await createOrder({ isTest: false })

  // "all: true" deletes every is_test row in the database, including any
  // this file's earlier tests already left behind (each test file gets a
  // clean slate - see test/setup.mjs - but tests within this file still
  // share it with each other) - so the only safe expectation is "exactly
  // however many are_test rows exist right now", not a fixed number.
  const [pendingOrders, pendingStudents] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM orders WHERE is_test = TRUE'),
    pool.query('SELECT COUNT(*) FROM students WHERE is_test = TRUE'),
  ])

  const res = await request('POST', '/api/admin/test-data/delete', { all: true }, sysadminHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.ordersDeleted, parseInt(pendingOrders.rows[0].count))
  assert.strictEqual(res.data.studentsDeleted, parseInt(pendingStudents.rows[0].count))

  const [remainingOrders, remainingStudents] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM orders WHERE is_test = TRUE'),
    pool.query('SELECT COUNT(*) FROM students WHERE is_test = TRUE'),
  ])
  assert.strictEqual(parseInt(remainingOrders.rows[0].count), 0)
  assert.strictEqual(parseInt(remainingStudents.rows[0].count), 0)

  for (const id of [testOrder1.id, testOrder2.id]) {
    assert.strictEqual((await pool.query('SELECT 1 FROM orders WHERE id = $1', [id])).rows.length, 0)
  }
  assert.strictEqual((await pool.query('SELECT 1 FROM students WHERE id = $1', [testStudent.id])).rows.length, 0)
  assert.strictEqual((await pool.query('SELECT 1 FROM orders WHERE id = $1', [realOrder.id])).rows.length, 1)
})

test('POST /api/admin/test-data/delete rejects an empty request', async () => {
  const res = await request('POST', '/api/admin/test-data/delete', {}, sysadminHeaders())
  assert.strictEqual(res.status, 400)
})

test('GET /api/admin/test-data lists test orders and students with totals', async () => {
  const testOrder = await createOrder({ isTest: true })
  const testStudent = await createStudent({ isTest: true })

  const res = await request('GET', '/api/admin/test-data', undefined, sysadminHeaders())
  assert.strictEqual(res.status, 200)
  assert.ok(res.data.orders.some(o => o.id === testOrder.id))
  assert.ok(res.data.students.some(s => s.id === testStudent.id))
  assert.ok(res.data.totals.orderCount >= 1)
  assert.ok(res.data.totals.studentCount >= 1)
})

after(async () => {
  await pool.query('DELETE FROM ozow_payments WHERE order_id = ANY($1) OR student_id = ANY($2)', [createdOrderIds, createdStudentIds])
  await pool.query('DELETE FROM payflex_payments WHERE order_id = ANY($1) OR student_id = ANY($2)', [createdOrderIds, createdStudentIds])
  await pool.query('DELETE FROM notifications WHERE order_id = ANY($1) OR student_id = ANY($2)', [createdOrderIds, createdStudentIds])
  await pool.query('DELETE FROM order_items WHERE order_id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM stock_movements WHERE order_id = ANY($1) OR product_id = ANY($2)', [createdOrderIds, createdProductIds])
  await pool.query('DELETE FROM product_variants WHERE product_id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM orders WHERE id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM students WHERE id = ANY($1)', [createdStudentIds])
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])

  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
