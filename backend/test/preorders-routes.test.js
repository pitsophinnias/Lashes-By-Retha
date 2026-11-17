const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const jwt = require('jsonwebtoken')

// node --test runs each test file in its own process, so running the real
// app here never collides with a manually-run dev server on port 3002, and
// these env vars (and the fetch stub below) never leak into other test files.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4019'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4019'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'
// Both providers "configured" (fake credentials) so the "Payflex rejected
// even though it's enabled" tests mean something - every real network call
// either provider would make is stubbed below.
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

let api
let pool
let JWT_SECRET
const testUserIds = []
const createdProductIds = []
const createdPreorderIds = []
const createdOrderIds = []

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
  const username = `preorders-route-test-${roleName}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
}

const createProduct = async (overrides = {}) => {
  const result = await pool.query(
    `INSERT INTO products (name, price, preorder_enabled, preorder_deposit, stock_quantity, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING *`,
    [
      overrides.name || `Preorder Route Test Product ${Math.random().toString(16).slice(2)}`,
      overrides.price !== undefined ? overrides.price : 2000,
      overrides.preorderEnabled !== undefined ? overrides.preorderEnabled : true,
      overrides.deposit !== undefined ? overrides.deposit : 500,
      overrides.stockQuantity !== undefined ? overrides.stockQuantity : 0,
    ]
  )
  createdProductIds.push(result.rows[0].id)
  return result.rows[0]
}

// Inserts a pre-order directly in whatever state a test needs, bypassing the
// payment flow entirely - preorder-payments.test.js already covers how a
// pre-order actually gets from one status to the next.
const createPreorderDirect = async (product, overrides = {}) => {
  const token = `preorder-route-token-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO preorders (
       product_id, quantity, customer_name, customer_phone, customer_email, fulfilment_method,
       price_at_order, deposit_amount, delivery_fee, amount_paid, status, public_token, promised_by_date
     ) VALUES ($1, 1, 'Preorder Direct Test', '0820000000', 'preorder-direct-test@example.com', 'pickup', $2, $3, 0, $4, $5, $6, $7)
     RETURNING *`,
    [
      product.id, product.price, product.preorder_deposit,
      overrides.amountPaid !== undefined ? overrides.amountPaid : 0,
      overrides.status || 'awaiting_deposit',
      token,
      overrides.promisedByDate || null,
    ]
  )
  createdPreorderIds.push(result.rows[0].id)
  return result.rows[0]
}

const validPreorderBody = (product, overrides = {}) => ({
  productId: product.id,
  name: 'Preorder Route Test',
  phone: '0821234567',
  email: 'preorder-route-test@example.com',
  fulfilmentMethod: 'pickup',
  acceptedTerms: true,
  ...overrides,
})

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
})

// ── Product flags ────────────────────────────────────────────────────────────

test('GET /api/products exposes preorderEnabled/preorderDeposit for a pre-order product', async () => {
  const product = await createProduct({ preorderEnabled: true, deposit: 300, price: 1500 })
  const res = await request('GET', '/api/products')
  const row = res.data.find(p => p.id === product.id)
  assert.ok(row)
  assert.strictEqual(row.preorderEnabled, true)
  assert.strictEqual(row.preorderDeposit, 300)
})

test('GET /api/payments/options reports whether Ozow is available, for the pre-order button', async () => {
  const res = await request('GET', '/api/payments/options')
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.ozow, true)
})

// ── Creating a pre-order ─────────────────────────────────────────────────────

test('POST /api/preorders rejects Payflex even though it is enabled and configured - pre-orders are Ozow only', async () => {
  const product = await createProduct()
  const res = await request('POST', '/api/preorders', validPreorderBody(product, { provider: 'payflex' }))
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /Ozow/i)
})

test('POST /api/preorders requires acceptedTerms', async () => {
  const product = await createProduct()
  const res = await request('POST', '/api/preorders', validPreorderBody(product, { acceptedTerms: false }))
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /accept/i)
})

test('POST /api/preorders rejects a product that is not pre-order enabled', async () => {
  const product = await createProduct({ preorderEnabled: false })
  const res = await request('POST', '/api/preorders', validPreorderBody(product))
  assert.strictEqual(res.status, 400)
})

test('POST /api/preorders starts an Ozow deposit for exactly the product\'s own deposit amount, never trusting an amount from the browser', async () => {
  const product = await createProduct({ deposit: 444, price: 3000 })
  const res = await request('POST', '/api/preorders', validPreorderBody(product, { depositAmount: 1, deposit: 1, price: 1 }))
  assert.strictEqual(res.status, 201)
  assert.strictEqual(res.data.fields.Amount, '444.00')

  const preorder = (await pool.query('SELECT * FROM preorders WHERE public_token = $1', [res.data.preorderToken])).rows[0]
  assert.strictEqual(parseFloat(preorder.deposit_amount), 444)
  assert.strictEqual(parseFloat(preorder.price_at_order), 3000)
  createdPreorderIds.push(preorder.id)
})

test('maintenance mode blocks new pre-orders, pay-balance and retry', async () => {
  const headers = sysadminHeaders()
  const product = await createProduct()
  const on = await request('PUT', '/api/admin/system/maintenance', { enabled: true, message: 'Down for testing.' }, headers)
  assert.strictEqual(on.status, 200)

  try {
    const blocked = [
      await request('POST', '/api/preorders', validPreorderBody(product)),
      await request('POST', '/api/preorders/any-token/pay-balance', {}),
      await request('POST', '/api/preorders/any-token/retry', {}),
    ]
    for (const res of blocked) assert.strictEqual(res.status, 503)
  } finally {
    await request('PUT', '/api/admin/system/maintenance', { enabled: false, message: 'Down for testing.' }, headers)
  }
})

test('turning the Ozow switch off blocks a new pre-order', async () => {
  const headers = sysadminHeaders()
  const product = await createProduct()
  await request('PUT', '/api/admin/system/payments', { ozowEnabled: false, payflexEnabled: true }, headers)

  try {
    const res = await request('POST', '/api/preorders', validPreorderBody(product))
    assert.strictEqual(res.status, 503)
  } finally {
    await request('PUT', '/api/admin/system/payments', { ozowEnabled: true, payflexEnabled: true }, headers)
  }
})

// ── Lead time setting ────────────────────────────────────────────────────────

test('GET /api/preorder-settings is public and returns the lead time', async () => {
  const res = await request('GET', '/api/preorder-settings')
  assert.strictEqual(res.status, 200)
  assert.strictEqual(typeof res.data.minDays, 'number')
  assert.strictEqual(typeof res.data.maxDays, 'number')
})

test('PUT /api/admin/system/preorders validates the lead time range and min <= max, and allows owner as well as sysadmin but not staff', async () => {
  const headers = sysadminHeaders()
  assert.strictEqual((await request('PUT', '/api/admin/system/preorders', { minDays: 0, maxDays: 21 }, headers)).status, 400)
  assert.strictEqual((await request('PUT', '/api/admin/system/preorders', { minDays: 14, maxDays: 121 }, headers)).status, 400)
  assert.strictEqual((await request('PUT', '/api/admin/system/preorders', { minDays: 25, maxDays: 20 }, headers)).status, 400)

  const ownerRes = await request('PUT', '/api/admin/system/preorders', { minDays: 10, maxDays: 25 }, ownerHeaders())
  assert.strictEqual(ownerRes.status, 200)
  assert.deepStrictEqual(ownerRes.data, { minDays: 10, maxDays: 25 })

  const staffRes = await request('PUT', '/api/admin/system/preorders', { minDays: 10, maxDays: 25 }, staffHeaders())
  assert.strictEqual(staffRes.status, 403)

  await request('PUT', '/api/admin/system/preorders', { minDays: 14, maxDays: 21 }, headers) // restore default
})

// ── Balance ──────────────────────────────────────────────────────────────────

test('pay-balance is blocked before the item has arrived, and allowed once it has', async () => {
  const product = await createProduct({ price: 2000, deposit: 500 })
  const preorder = await createPreorderDirect(product, { status: 'deposit_paid', amountPaid: 500 })

  const blocked = await request('POST', `/api/preorders/${preorder.public_token}/pay-balance`, {})
  assert.strictEqual(blocked.status, 400)

  await pool.query(`UPDATE preorders SET status = 'arrived', arrived_at = NOW() WHERE id = $1`, [preorder.id])
  const allowed = await request('POST', `/api/preorders/${preorder.public_token}/pay-balance`, {})
  assert.strictEqual(allowed.status, 200)
  assert.strictEqual(allowed.data.fields.Amount, '1500.00')
})

// ── Admin: dispatch/collect ──────────────────────────────────────────────────

test('dispatch and collect are only allowed once a pre-order is paid in full', async () => {
  const headers = sysadminHeaders()
  const product = await createProduct()
  const preorder = await createPreorderDirect(product, { status: 'arrived' })

  assert.strictEqual((await request('PATCH', `/api/admin/preorders/${preorder.id}/dispatch`, {}, headers)).status, 400)
  assert.strictEqual((await request('PATCH', `/api/admin/preorders/${preorder.id}/collect`, {}, headers)).status, 400)

  await pool.query(`UPDATE preorders SET status = 'paid_in_full' WHERE id = $1`, [preorder.id])
  const dispatchRes = await request('PATCH', `/api/admin/preorders/${preorder.id}/dispatch`, { courierTracking: 'ABC123' }, headers)
  assert.strictEqual(dispatchRes.status, 200)

  const row = (await pool.query('SELECT * FROM preorders WHERE id = $1', [preorder.id])).rows[0]
  assert.strictEqual(row.status, 'dispatched')
  assert.strictEqual(row.courier_tracking, 'ABC123')
})

// ── Admin: refund flag ───────────────────────────────────────────────────────

test('the refund flag appears once past promised_by_date while not dispatched or collected, and disappears once dispatched', async () => {
  const headers = sysadminHeaders()
  const product = await createProduct()
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const preorder = await createPreorderDirect(product, { status: 'arrived', promisedByDate: past })

  const list = await request('GET', '/api/admin/preorders', undefined, headers)
  assert.strictEqual(list.status, 200)
  const group = list.data.products.find(p => p.productId === product.id)
  const row = group.preorders.find(p => p.id === preorder.id)
  assert.strictEqual(row.refundable, true)
  assert.ok(list.data.refundableCount >= 1)

  await pool.query(`UPDATE preorders SET status = 'paid_in_full' WHERE id = $1`, [preorder.id])
  const dispatchRes = await request('PATCH', `/api/admin/preorders/${preorder.id}/dispatch`, {}, headers)
  assert.strictEqual(dispatchRes.status, 200)

  const listAfter = await request('GET', '/api/admin/preorders', undefined, headers)
  const groupAfter = listAfter.data.products.find(p => p.productId === product.id)
  const rowAfter = groupAfter.preorders.find(p => p.id === preorder.id)
  assert.strictEqual(rowAfter.refundable, false, 'a dispatched pre-order must never be shown as refundable, however overdue')
})

test('cancel and refund are rejected once a pre-order has been dispatched or collected', async () => {
  const headers = sysadminHeaders()
  const product = await createProduct()
  const preorder = await createPreorderDirect(product, { status: 'dispatched' })

  assert.strictEqual((await request('PATCH', `/api/admin/preorders/${preorder.id}/cancel`, {}, headers)).status, 400)
  assert.strictEqual((await request('PATCH', `/api/admin/preorders/${preorder.id}/refund`, {}, headers)).status, 400)
})

// ── Stock ────────────────────────────────────────────────────────────────────

test('an order created from a pre-order skips stock deduction when confirmed', async () => {
  const headers = sysadminHeaders()
  const product = await createProduct({ price: 1000, stockQuantity: 0 })
  const preorder = await createPreorderDirect(product, { status: 'paid_in_full', amountPaid: 1000 })

  const orderToken = `preorder-stock-token-${Math.random().toString(16).slice(2)}`
  const orderResult = await pool.query(
    `INSERT INTO orders (customer_name, customer_phone, total, fulfilment_method, subtotal, delivery_fee, payment_method, payment_status, paid_at, public_token)
     VALUES ('Preorder Stock Test', '0820000000', 1000, 'pickup', 1000, 0, 'ozow', 'paid', NOW(), $1) RETURNING *`,
    [orderToken]
  )
  const order = orderResult.rows[0]
  createdOrderIds.push(order.id)
  await pool.query('UPDATE preorders SET order_id = $1 WHERE id = $2', [order.id, preorder.id])
  await pool.query(
    `INSERT INTO order_items (order_id, product_id, product_name, qty, price) VALUES ($1, $2, $3, 1, 1000)`,
    [order.id, product.id, product.name]
  )

  const confirmRes = await request('PATCH', `/api/orders/${order.id}/confirm`, {}, headers)
  assert.strictEqual(confirmRes.status, 200)

  const productRow = (await pool.query('SELECT stock_quantity FROM products WHERE id = $1', [product.id])).rows[0]
  assert.strictEqual(productRow.stock_quantity, 0, 'a pre-order-derived order must never deduct stock, even starting from 0')
  const movements = await pool.query('SELECT COUNT(*) FROM stock_movements WHERE order_id = $1', [order.id])
  assert.strictEqual(parseInt(movements.rows[0].count), 0)

  const orderRow = (await pool.query('SELECT status FROM orders WHERE id = $1', [order.id])).rows[0]
  assert.strictEqual(orderRow.status, 'confirmed')
})

after(async () => {
  // Some of the routes under test (POST /api/preorders, the order confirm
  // route) call the real addNotification - those rows have no ON DELETE on
  // notifications.order_id/preorder_id, so they must go before the
  // order/preorder rows they point to.
  await pool.query('DELETE FROM notifications WHERE order_id = ANY($1) OR preorder_id = ANY($2)', [createdOrderIds, createdPreorderIds])
  await pool.query('DELETE FROM ozow_payments WHERE preorder_id = ANY($1)', [createdPreorderIds])
  await pool.query('DELETE FROM preorders WHERE id = ANY($1)', [createdPreorderIds])
  await pool.query('DELETE FROM order_items WHERE order_id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM orders WHERE id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  // The owner-access test above writes an audit log row as the owner test
  // user - that row has no ON DELETE on its user_id, so it must go first.
  await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [testUserIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
  global.fetch = realFetch
})
