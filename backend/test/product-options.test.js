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
process.env.PORT = '4022'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4022'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'
process.env.OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || 'TSTSITE1'
process.env.OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || 'test-private-key'
process.env.OZOW_API_KEY = process.env.OZOW_API_KEY || 'test-api-key'
process.env.OZOW_API_BASE = process.env.OZOW_API_BASE || 'https://live.example.com'
process.env.OZOW_TEST_API_BASE = process.env.OZOW_TEST_API_BASE || 'https://staging.example.com'

const realFetch = global.fetch
global.fetch = async (url, options = {}) => {
  const urlStr = String(url)
  if (urlStr.includes('/GetTransactionByReference')) {
    return { ok: true, json: async () => [] } // no match - reconcile leaves state as-is
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
const testUserIds = []
const createdProductIds = []
const createdOrderIds = []

const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const sysadminHeaders = () => ({ Authorization: `Bearer ${tokenFor('sysadmin')}` })
const ownerHeaders = () => ({ Authorization: `Bearer ${tokenFor('owner')}` })

const createTestUser = async (roleName) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `product-options-test-${roleName}-${Date.now()}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
}

const createProduct = async ({ optionLabel = null, price = 300, stockQuantity = 0 } = {}) => {
  const result = await pool.query(
    `INSERT INTO products (name, price, option_label, stock_quantity) VALUES ($1, $2, $3, $4) RETURNING *`,
    [`Option Test Product ${randRef('p')}`, price, optionLabel, stockQuantity]
  )
  createdProductIds.push(result.rows[0].id)
  return result.rows[0]
}

const createOption = async (product, { name, stockQuantity = 10, isActive = true, swatchHex = null } = {}) => {
  const result = await pool.query(
    `INSERT INTO product_options (product_id, name, stock_quantity, is_active, swatch_hex, position)
     VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(position), 0) + 1 FROM product_options WHERE product_id = $1))
     RETURNING *`,
    [product.id, name, stockQuantity, isActive, swatchHex]
  )
  return result.rows[0]
}

const validOrderBody = (product, option, overrides = {}) => ({
  customerName: 'Option Test Customer',
  customerPhone: '0821234567',
  items: [{ id: product.id, productOptionId: option ? option.id : undefined, qty: 1, name: product.name, price: product.price }],
  fulfilmentMethod: 'pickup',
  paymentMethod: 'ozow',
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
})

// ── Admin: setting up options ────────────────────────────────────────────────

test('adding an option before the product has an option label is rejected', async () => {
  const product = await createProduct()
  const res = await request('POST', `/api/admin/products/${product.id}/options`, { name: 'Cashew' }, sysadminHeaders())
  assert.strictEqual(res.status, 400)
})

test('setting an option label is rejected for a product that already has lash length/curl options', async () => {
  // Product id 1 is seeded with lash variants - see db.js.
  const res = await request('PATCH', '/api/admin/products/1', { optionLabel: 'Shade' }, sysadminHeaders())
  assert.strictEqual(res.status, 400)
})

test('adding options works once the label is set, and duplicate names are rejected case-insensitively', async () => {
  const product = await createProduct()
  const labelRes = await request('PATCH', `/api/admin/products/${product.id}`, { optionLabel: 'Shade' }, sysadminHeaders())
  assert.strictEqual(labelRes.status, 200)
  assert.strictEqual(labelRes.data.optionLabel, 'Shade')

  const addRes = await request('POST', `/api/admin/products/${product.id}/options`, { name: 'Cashew', stockQuantity: 5 }, sysadminHeaders())
  assert.strictEqual(addRes.status, 201)

  const dupRes = await request('POST', `/api/admin/products/${product.id}/options`, { name: 'cashew' }, sysadminHeaders())
  assert.strictEqual(dupRes.status, 400)
})

test('bulk add skips duplicates against existing options and within the same paste', async () => {
  const product = await createProduct()
  await request('PATCH', `/api/admin/products/${product.id}`, { optionLabel: 'Shade' }, sysadminHeaders())
  await createOption(product, { name: 'Cashew' })

  const res = await request('POST', `/api/admin/products/${product.id}/options/bulk`, {
    names: ['Cashew', 'Mocha', 'MOCHA', 'Vanilla', ''],
    startStock: 8,
  }, sysadminHeaders())
  assert.strictEqual(res.status, 201)
  assert.deepStrictEqual(res.data.created.map(o => o.name).sort(), ['Mocha', 'Vanilla'])
  assert.ok(res.data.skipped.includes('Cashew'))
  assert.ok(res.data.skipped.includes('MOCHA'))
  const mocha = res.data.created.find(o => o.name === 'Mocha')
  assert.strictEqual(mocha.stockQuantity, 8)
})

test('an option can be reordered up and down, and rejects moving past either end', async () => {
  const product = await createProduct()
  await request('PATCH', `/api/admin/products/${product.id}`, { optionLabel: 'Shade' }, sysadminHeaders())
  const a = await createOption(product, { name: 'Apple Pie' })
  const b = await createOption(product, { name: 'Blossom' })

  const moveUp = await request('PATCH', `/api/admin/products/${product.id}/options/${b.id}/move`, { direction: 'up' }, sysadminHeaders())
  assert.strictEqual(moveUp.status, 200)
  const afterUp = moveUp.data
  const aAfter = afterUp.find(o => o.id === a.id)
  const bAfter = afterUp.find(o => o.id === b.id)
  assert.ok(bAfter.position < aAfter.position)

  let guard = 0, res
  do {
    res = await request('PATCH', `/api/admin/products/${product.id}/options/${b.id}/move`, { direction: 'up' }, sysadminHeaders())
    guard++
  } while (res.status === 200 && guard < 10)
  assert.strictEqual(res.status, 400)
})

test('deactivating an option hides it from the public products endpoint', async () => {
  const product = await createProduct()
  await request('PATCH', `/api/admin/products/${product.id}`, { optionLabel: 'Shade' }, sysadminHeaders())
  const option = await createOption(product, { name: 'Mocha' })

  const before = await request('GET', '/api/products')
  const beforeRow = before.data.find(p => p.id === product.id)
  assert.ok(beforeRow.customOptions.some(o => o.id === option.id))

  const off = await request('PATCH', `/api/admin/products/${product.id}/options/${option.id}`, { isActive: false }, sysadminHeaders())
  assert.strictEqual(off.status, 200)

  const after = await request('GET', '/api/products')
  const afterRow = after.data.find(p => p.id === product.id)
  assert.ok(!afterRow.customOptions.some(o => o.id === option.id))
})

test('GET /api/products (public) returns optionLabel, hasCustomOptions and the option names/stock for a product with custom options', async () => {
  const product = await createProduct()
  await request('PATCH', `/api/admin/products/${product.id}`, { optionLabel: 'Shade' }, sysadminHeaders())
  const cashew = await createOption(product, { name: 'Cashew', stockQuantity: 12 })
  const mocha = await createOption(product, { name: 'Mocha', stockQuantity: 0 })

  const res = await request('GET', '/api/products')
  assert.strictEqual(res.status, 200)
  const row = res.data.find(p => p.id === product.id)
  assert.ok(row, 'product should be in the public list')
  assert.strictEqual(row.optionLabel, 'Shade')
  assert.strictEqual(row.hasCustomOptions, true)
  assert.strictEqual(row.customOptions.length, 2)

  const cashewRow = row.customOptions.find(o => o.id === cashew.id)
  const mochaRow = row.customOptions.find(o => o.id === mocha.id)
  assert.strictEqual(cashewRow.name, 'Cashew')
  assert.strictEqual(cashewRow.stockQuantity, 12)
  assert.strictEqual(mochaRow.name, 'Mocha')
  assert.strictEqual(mochaRow.stockQuantity, 0)
})

// ── Orders ────────────────────────────────────────────────────────────────────

test('POST /api/orders requires a valid, active option for a product with custom options', async () => {
  const product = await createProduct()
  await request('PATCH', `/api/admin/products/${product.id}`, { optionLabel: 'Shade' }, sysadminHeaders())
  const inactive = await createOption(product, { name: 'Discontinued', isActive: false })

  const missing = await request('POST', '/api/orders', validOrderBody(product, null))
  assert.strictEqual(missing.status, 400)
  assert.match(missing.data.error, /choose a shade/i)

  const inactiveRes = await request('POST', '/api/orders', validOrderBody(product, inactive))
  assert.strictEqual(inactiveRes.status, 400)
})

test('POST /api/orders rejects an option without enough stock', async () => {
  const product = await createProduct()
  await request('PATCH', `/api/admin/products/${product.id}`, { optionLabel: 'Shade' }, sysadminHeaders())
  const option = await createOption(product, { name: 'Low Stock', stockQuantity: 1 })

  const res = await request('POST', '/api/orders', validOrderBody(product, option, {
    items: [{ id: product.id, productOptionId: option.id, qty: 2, name: product.name, price: product.price }],
  }))
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /only 1 left/i)
})

test('POST /api/orders accepts a valid option and snapshots its name', async () => {
  const product = await createProduct()
  await request('PATCH', `/api/admin/products/${product.id}`, { optionLabel: 'Shade' }, sysadminHeaders())
  const option = await createOption(product, { name: 'Chocolate Pie', stockQuantity: 10 })

  const res = await request('POST', '/api/orders', validOrderBody(product, option))
  assert.strictEqual(res.status, 201)
  createdOrderIds.push(res.data.orderId)

  const listRes = await request('GET', '/api/orders', undefined, sysadminHeaders())
  const order = listRes.data.find(o => o.id === res.data.orderId)
  assert.ok(order)
  assert.strictEqual(order.items[0].optionName, 'Chocolate Pie')
  assert.strictEqual(order.items[0].productOptionId, option.id)
})

test('confirming an order deducts stock from the chosen option (not the product) and records the movement', async () => {
  const product = await createProduct()
  await request('PATCH', `/api/admin/products/${product.id}`, { optionLabel: 'Shade' }, sysadminHeaders())
  const option = await createOption(product, { name: 'Vanilla Bean', stockQuantity: 10 })

  const createRes = await request('POST', '/api/orders', validOrderBody(product, option, {
    items: [{ id: product.id, productOptionId: option.id, qty: 3, name: product.name, price: product.price }],
  }))
  assert.strictEqual(createRes.status, 201)
  createdOrderIds.push(createRes.data.orderId)

  const confirmRes = await request('PATCH', `/api/orders/${createRes.data.orderId}/confirm`, {}, sysadminHeaders())
  assert.strictEqual(confirmRes.status, 200)

  const optionRow = (await pool.query('SELECT * FROM product_options WHERE id = $1', [option.id])).rows[0]
  assert.strictEqual(optionRow.stock_quantity, 7)

  const productRow = (await pool.query('SELECT stock_quantity FROM products WHERE id = $1', [product.id])).rows[0]
  assert.strictEqual(productRow.stock_quantity, 0, 'the product\'s own stock column is never touched for custom options')

  const movement = (await pool.query(
    'SELECT * FROM stock_movements WHERE order_id = $1 AND product_option_id = $2', [createRes.data.orderId, option.id]
  )).rows[0]
  assert.ok(movement)
  assert.strictEqual(movement.change, -3)
})

test('test-data clean-up restores the option\'s stock for a deleted confirmed test order', async () => {
  const product = await createProduct()
  await request('PATCH', `/api/admin/products/${product.id}`, { optionLabel: 'Shade' }, sysadminHeaders())
  const option = await createOption(product, { name: 'Rose Gold', stockQuantity: 10 })

  const createRes = await request('POST', '/api/orders', validOrderBody(product, option, {
    items: [{ id: product.id, productOptionId: option.id, qty: 4, name: product.name, price: product.price }],
  }))
  assert.strictEqual(createRes.status, 201)
  const orderId = createRes.data.orderId

  await pool.query('UPDATE orders SET is_test = TRUE WHERE id = $1', [orderId])
  const confirmRes = await request('PATCH', `/api/orders/${orderId}/confirm`, {}, sysadminHeaders())
  assert.strictEqual(confirmRes.status, 200)

  const afterConfirm = (await pool.query('SELECT stock_quantity FROM product_options WHERE id = $1', [option.id])).rows[0]
  assert.strictEqual(afterConfirm.stock_quantity, 6)

  const deleteRes = await request('POST', '/api/admin/test-data/delete', { orderIds: [orderId] }, sysadminHeaders())
  assert.strictEqual(deleteRes.status, 200)

  const afterDelete = (await pool.query('SELECT stock_quantity FROM product_options WHERE id = $1', [option.id])).rows[0]
  assert.strictEqual(afterDelete.stock_quantity, 10, 'the option\'s stock must be fully restored after the test order is deleted')
})

// ── Lash variants stay unaffected ────────────────────────────────────────────

test('lash length/curl variants still work exactly as before - unrelated to custom options', async () => {
  const variantRow = (await pool.query(
    `SELECT * FROM product_variants WHERE product_id = 1 AND is_active = TRUE ORDER BY stock_quantity DESC LIMIT 1`
  )).rows[0]
  assert.ok(variantRow, 'expected product id 1 to still have at least one active lash variant')
  const beforeStock = variantRow.stock_quantity
  assert.ok(beforeStock > 0)

  const res = await request('POST', '/api/orders', {
    customerName: 'Lash Variant Regression Test',
    customerPhone: '0821234567',
    items: [{ id: 1, variantId: variantRow.id, qty: 1, name: 'Classic Lash Trays', price: 130 }],
    fulfilmentMethod: 'pickup',
    paymentMethod: 'ozow',
  })
  assert.strictEqual(res.status, 201)
  createdOrderIds.push(res.data.orderId)

  const confirmRes = await request('PATCH', `/api/orders/${res.data.orderId}/confirm`, {}, sysadminHeaders())
  assert.strictEqual(confirmRes.status, 200)

  const afterRow = (await pool.query('SELECT stock_quantity FROM product_variants WHERE id = $1', [variantRow.id])).rows[0]
  assert.strictEqual(afterRow.stock_quantity, beforeStock - 1)
})

after(async () => {
  // The test-data clean-up test leaves a stock_movements row with order_id
  // NULL (its order was just deleted) but product_id still set - caught
  // here too, or the FK from stock_movements to product_options would
  // block deleting the option below.
  await pool.query('DELETE FROM stock_movements WHERE order_id = ANY($1) OR product_id = ANY($2)', [createdOrderIds, createdProductIds])
  await pool.query('DELETE FROM notifications WHERE order_id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM order_items WHERE order_id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM orders WHERE id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM product_options WHERE product_id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  await pool.query('UPDATE products SET option_label = NULL WHERE id = 1')
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
  global.fetch = realFetch
})
