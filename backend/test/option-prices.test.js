// Per-option pricing (options_have_own_prices) - e.g. a wig costing more
// at 14 inches than 10. The pricing-helper tests cover getEffectivePrice/
// getLowestEffectivePrice directly; this file covers the routes around
// it: turning the flag on/off, validating an option's own price, and
// order/pre-order creation snapshotting the chosen option's price.
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')
const { createTestSessionId } = require('./helpers/session')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4029'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4029'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'
process.env.OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || 'TSTSITE1'
process.env.OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || 'test-private-key'
process.env.OZOW_API_KEY = process.env.OZOW_API_KEY || 'test-api-key'
process.env.OZOW_API_BASE = process.env.OZOW_API_BASE || 'https://live.example.com'
process.env.OZOW_TEST_API_BASE = process.env.OZOW_TEST_API_BASE || 'https://staging.example.com'

const realFetch = global.fetch
global.fetch = async (url, options = {}) => {
  const urlStr = String(url)
  if (urlStr.includes('/GetTransactionByReference')) return { ok: true, json: async () => [] }
  return realFetch(urlStr, options)
}

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
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('Server did not start in time')
}

const randRef = (prefix) => `${prefix}-${crypto.randomBytes(4).toString('hex')}`

let api
let pool
let JWT_SECRET
const testUserIds = []
const createdProductIds = []
const createdOrderIds = []
const createdPreorderIds = []

const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion, sessionId: roleTokenInfo[role].sessionId },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const sysadminHeaders = () => ({ Authorization: `Bearer ${tokenFor('sysadmin')}` })
const staffHeaders = () => ({ Authorization: `Bearer ${tokenFor('staff')}` })

const createTestUser = async (roleName) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `option-price-test-${roleName}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
  roleTokenInfo[roleName].sessionId = await createTestSessionId(pool, result.rows[0].id)
}

const createProduct = async ({ price = 150, optionsHaveOwnPrices = false } = {}) => {
  const result = await pool.query(
    `INSERT INTO products (name, price, option_label, options_have_own_prices, stock_quantity)
     VALUES ($1, $2, 'Length', $3, 0) RETURNING *`,
    [`Wig Test Product ${randRef('p')}`, price, optionsHaveOwnPrices]
  )
  createdProductIds.push(result.rows[0].id)
  return result.rows[0]
}

const createOption = async (product, { name, price = null, stockQuantity = 10 } = {}) => {
  const result = await pool.query(
    `INSERT INTO product_options (product_id, name, price, stock_quantity, position)
     VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(position), 0) + 1 FROM product_options WHERE product_id = $1))
     RETURNING *`,
    [product.id, name, price, stockQuantity]
  )
  return result.rows[0]
}

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET
  const sysadminRow = (await pool.query(
    `SELECT u.id, u.username, u.token_version FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'sysadmin' LIMIT 1`
  )).rows[0]
  roleTokenInfo.sysadmin = { id: sysadminRow.id, username: sysadminRow.username, tokenVersion: sysadminRow.token_version }
  roleTokenInfo.sysadmin.sessionId = await createTestSessionId(pool, sysadminRow.id)
  await createTestUser('staff')
})

// ── Turning the flag on/off ────────────────────────────────────────────────

test('turning options_have_own_prices on pre-fills any option still missing a price with the product price', async () => {
  const product = await createProduct({ price: 300 })
  const withPrice = await createOption(product, { name: '10 inch', price: 250 })
  const withoutPrice = await createOption(product, { name: '14 inch' })

  const res = await request('PATCH', `/api/admin/products/${product.id}`, { optionsHaveOwnPrices: true }, sysadminHeaders())
  assert.strictEqual(res.status, 200)

  const rows = (await pool.query('SELECT id, price FROM product_options WHERE product_id = $1', [product.id])).rows
  const withPriceRow = rows.find(r => r.id === withPrice.id)
  const withoutPriceRow = rows.find(r => r.id === withoutPrice.id)
  assert.strictEqual(parseFloat(withPriceRow.price), 250, 'an option that already had a price must keep it')
  assert.strictEqual(parseFloat(withoutPriceRow.price), 300, 'an option with no price must be pre-filled with the product price')
})

test('turning options_have_own_prices off keeps the stored option prices for switching back on', async () => {
  const product = await createProduct({ price: 300, optionsHaveOwnPrices: true })
  const option = await createOption(product, { name: '10 inch', price: 275 })

  const off = await request('PATCH', `/api/admin/products/${product.id}`, { optionsHaveOwnPrices: false }, sysadminHeaders())
  assert.strictEqual(off.status, 200)
  assert.strictEqual(off.data.optionsHaveOwnPrices, false)

  const row = (await pool.query('SELECT price FROM product_options WHERE id = $1', [option.id])).rows[0]
  assert.strictEqual(parseFloat(row.price), 275, 'the stored price must survive turning the flag off')

  const list = await request('GET', '/api/products')
  const listed = list.data.find(p => p.id === product.id)
  assert.strictEqual(listed.price, 300, 'while off, the option price must be ignored in favour of the product price')
})

// ── Validation ──────────────────────────────────────────────────────────────

test('adding an option with no price while the flag is on defaults it to the product price, not an error', async () => {
  const product = await createProduct({ price: 400, optionsHaveOwnPrices: true })
  const res = await request('POST', `/api/admin/products/${product.id}/options`, { name: '18 inch' }, sysadminHeaders())
  assert.strictEqual(res.status, 201)
  assert.strictEqual(res.data.price, 400)
})

test('adding an option with price 0 while the flag is on is rejected', async () => {
  const product = await createProduct({ price: 400, optionsHaveOwnPrices: true })
  const res = await request('POST', `/api/admin/products/${product.id}/options`, { name: '18 inch', price: 0 }, sysadminHeaders())
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /price greater than R0/)
})

test('setting an active option\'s price to blank while the flag is on is rejected, staff cannot even try', async () => {
  const product = await createProduct({ price: 400, optionsHaveOwnPrices: true })
  const option = await createOption(product, { name: '10 inch', price: 350 })

  const staffAttempt = await request('PATCH', `/api/admin/products/${product.id}/options/${option.id}`, { price: 0 }, staffHeaders())
  assert.strictEqual(staffAttempt.status, 403)

  const bad = await request('PATCH', `/api/admin/products/${product.id}/options/${option.id}`, { price: 0 }, sysadminHeaders())
  assert.strictEqual(bad.status, 400)

  const ok = await request('PATCH', `/api/admin/products/${product.id}/options/${option.id}`, { price: 500 }, sysadminHeaders())
  assert.strictEqual(ok.status, 200)
  assert.strictEqual(ok.data.price, 500)
})

test('deactivating an option with no price while the flag is on is allowed - the rule only applies to ACTIVE options', async () => {
  const product = await createProduct({ price: 400, optionsHaveOwnPrices: true })
  const option = await createOption(product, { name: '10 inch', price: 350 })
  const res = await request('PATCH', `/api/admin/products/${product.id}/options/${option.id}`, { isActive: false, price: '' }, sysadminHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.isActive, false)
})

test('reactivating an option with no price while the flag is on is rejected', async () => {
  const product = await createProduct({ price: 400, optionsHaveOwnPrices: true })
  const option = await createOption(product, { name: '10 inch', price: null })
  await pool.query('UPDATE product_options SET is_active = FALSE WHERE id = $1', [option.id])
  const res = await request('PATCH', `/api/admin/products/${product.id}/options/${option.id}`, { isActive: true }, sysadminHeaders())
  assert.strictEqual(res.status, 400)
})

test('a sale on an option is validated against that option\'s own price, not the product\'s', async () => {
  const product = await createProduct({ price: 150, optionsHaveOwnPrices: true })
  const option = await createOption(product, { name: '14 inch', price: 3200 })

  const tooHigh = await request('PATCH', `/api/admin/products/${product.id}/sale`, {
    options: [{ id: option.id, onSale: true, salePrice: 3500 }],
  }, sysadminHeaders())
  assert.strictEqual(tooHigh.status, 400, 'R3500 is below the product price (150) but above the OPTION price (3200) - must still be rejected')

  const ok = await request('PATCH', `/api/admin/products/${product.id}/sale`, {
    options: [{ id: option.id, onSale: true, salePrice: 2900 }],
  }, sysadminHeaders())
  assert.strictEqual(ok.status, 200)

  const list = await request('GET', '/api/products')
  const listedOption = list.data.find(p => p.id === product.id).customOptions.find(o => o.id === option.id)
  assert.strictEqual(listedOption.price, 2900)
  assert.strictEqual(listedOption.originalPrice, 3200)
  assert.strictEqual(listedOption.saveAmount, 300)
})

// ── Order/pre-order creation snapshots the option's own price ─────────────

test('an order snapshots the CHOSEN option\'s own price, and a cart with two lengths totals correctly', async () => {
  const product = await createProduct({ price: 150, optionsHaveOwnPrices: true })
  const shortOption = await createOption(product, { name: '10 inch', price: 2750 })
  const longOption = await createOption(product, { name: '14 inch', price: 3200 })

  const orderRes = await request('POST', '/api/orders', {
    customerName: 'Wig Buyer', customerPhone: '0821234567',
    items: [
      { id: product.id, qty: 1, productOptionId: shortOption.id, name: product.name },
      { id: product.id, qty: 2, productOptionId: longOption.id, name: product.name },
    ],
    fulfilmentMethod: 'pickup', paymentMethod: 'ozow',
  })
  assert.strictEqual(orderRes.status, 201)
  createdOrderIds.push(orderRes.data.orderId)

  const items = (await pool.query(
    'SELECT * FROM order_items WHERE order_id = $1 ORDER BY product_option_id', [orderRes.data.orderId]
  )).rows
  const shortItem = items.find(i => i.product_option_id === shortOption.id)
  const longItem = items.find(i => i.product_option_id === longOption.id)
  assert.strictEqual(parseFloat(shortItem.price), 2750)
  assert.strictEqual(parseFloat(shortItem.original_price), 2750)
  assert.strictEqual(parseFloat(longItem.price), 3200)

  const orderRow = (await pool.query('SELECT * FROM orders WHERE id = $1', [orderRes.data.orderId])).rows[0]
  assert.strictEqual(parseFloat(orderRow.subtotal), 2750 * 1 + 3200 * 2, 'subtotal must use each line\'s own option price, not the product price')
})

test('a pre-order snapshots the chosen option\'s own price', async () => {
  const product = await createProduct({ price: 150, optionsHaveOwnPrices: true })
  await pool.query('UPDATE products SET preorder_enabled = TRUE, preorder_deposit = 500 WHERE id = $1', [product.id])
  const option = await createOption(product, { name: '18 inch', price: 3600 })

  const res = await request('POST', '/api/preorders', {
    productId: product.id, quantity: 1, productOptionId: option.id,
    name: 'Wig Preorder Buyer', phone: '0821234567', email: 'wig@example.com',
    fulfilmentMethod: 'pickup', acceptedTerms: true,
  })
  assert.strictEqual(res.status, 201)

  const row = (await pool.query('SELECT * FROM preorders WHERE public_token = $1', [res.data.preorderToken])).rows[0]
  createdPreorderIds.push(row.id)
  assert.strictEqual(parseFloat(row.price_at_order), 3600, 'must snapshot the option\'s own price, not the product\'s R150')
  assert.strictEqual(parseFloat(row.original_price_at_order), 3600)
  // The deposit is a flat amount stored on the product, independent of
  // which option was chosen - see the README/summary for why this is
  // correct as-is rather than something to "fix" here.
  assert.strictEqual(parseFloat(row.deposit_amount), 500)
})

after(async () => {
  await pool.query('DELETE FROM order_items WHERE order_id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM notifications WHERE order_id = ANY($1) OR preorder_id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM orders WHERE id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM ozow_payments WHERE preorder_id = ANY($1)', [createdPreorderIds])
  await pool.query('DELETE FROM notifications WHERE preorder_id = ANY($1)', [createdPreorderIds])
  await pool.query('DELETE FROM preorders WHERE id = ANY($1)', [createdPreorderIds])
  await pool.query('DELETE FROM product_options WHERE product_id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [testUserIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
  global.fetch = realFetch
})
