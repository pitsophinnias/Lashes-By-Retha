const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')
const { createTestSessionId } = require('./helpers/session')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4023'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4023'
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
    return { ok: true, json: async () => [] }
  }
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

const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion, sessionId: roleTokenInfo[role].sessionId },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const sysadminHeaders = () => ({ Authorization: `Bearer ${tokenFor('sysadmin')}` })

const createProduct = async ({ optionLabel = null, price = 150, stockQuantity = 10 } = {}) => {
  const result = await pool.query(
    `INSERT INTO products (name, price, option_label, stock_quantity) VALUES ($1, $2, $3, $4) RETURNING *`,
    [`Sale Test Product ${randRef('p')}`, price, optionLabel, stockQuantity]
  )
  createdProductIds.push(result.rows[0].id)
  return result.rows[0]
}

const createOption = async (product, { name, stockQuantity = 10 } = {}) => {
  const result = await pool.query(
    `INSERT INTO product_options (product_id, name, stock_quantity, position)
     VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position), 0) + 1 FROM product_options WHERE product_id = $1))
     RETURNING *`,
    [product.id, name, stockQuantity]
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
})

test('PATCH .../sale rejects a sale price that is not a real discount', async () => {
  const product = await createProduct({ price: 100 })
  const tooHigh = await request('PATCH', `/api/admin/products/${product.id}/sale`, { onSale: true, salePrice: 150 }, sysadminHeaders())
  assert.strictEqual(tooHigh.status, 400)

  const zero = await request('PATCH', `/api/admin/products/${product.id}/sale`, { onSale: true, salePrice: 0 }, sysadminHeaders())
  assert.strictEqual(zero.status, 400)

  const missing = await request('PATCH', `/api/admin/products/${product.id}/sale`, { onSale: true }, sysadminHeaders())
  assert.strictEqual(missing.status, 400)
})

test('PATCH .../sale puts a product with no options on sale, and End Sale clears onSale but keeps salePrice', async () => {
  const product = await createProduct({ price: 100 })
  const onRes = await request('PATCH', `/api/admin/products/${product.id}/sale`, { onSale: true, salePrice: 75 }, sysadminHeaders())
  assert.strictEqual(onRes.status, 200)

  const row = (await pool.query('SELECT * FROM products WHERE id = $1', [product.id])).rows[0]
  assert.strictEqual(row.on_sale, true)
  assert.strictEqual(parseFloat(row.sale_price), 75)

  const list = await request('GET', '/api/products')
  const listed = list.data.find(p => p.id === product.id)
  assert.strictEqual(listed.price, 75)
  assert.strictEqual(listed.originalPrice, 100)
  assert.strictEqual(listed.onSale, true)
  assert.strictEqual(listed.saveAmount, 25)

  const endRes = await request('POST', `/api/admin/products/${product.id}/sale/end`, {}, sysadminHeaders())
  assert.strictEqual(endRes.status, 200)
  const afterEnd = (await pool.query('SELECT * FROM products WHERE id = $1', [product.id])).rows[0]
  assert.strictEqual(afterEnd.on_sale, false)
  assert.strictEqual(parseFloat(afterEnd.sale_price), 75, 'sale price must be kept so the sale can be re-enabled without retyping it')
})

test('PATCH .../sale puts only some custom options on sale - partial sale shows a "from" price', async () => {
  const product = await createProduct({ optionLabel: 'Shade', price: 150 })
  const onSaleOption = await createOption(product, { name: 'Cashew' })
  const fullPriceOption = await createOption(product, { name: 'Mocha' })

  const res = await request('PATCH', `/api/admin/products/${product.id}/sale`, {
    options: [{ id: onSaleOption.id, onSale: true, salePrice: 99 }],
  }, sysadminHeaders())
  assert.strictEqual(res.status, 200)

  const list = await request('GET', '/api/products')
  const listed = list.data.find(p => p.id === product.id)
  const saleOpt = listed.customOptions.find(o => o.id === onSaleOption.id)
  const fullOpt = listed.customOptions.find(o => o.id === fullPriceOption.id)
  assert.strictEqual(saleOpt.onSale, true)
  assert.strictEqual(saleOpt.price, 99)
  assert.strictEqual(fullOpt.onSale, false)
  assert.strictEqual(fullOpt.price, 150)
  // The product-level "from" price is the cheapest currently buyable option.
  assert.strictEqual(listed.price, 99)
  assert.strictEqual(listed.onSale, true)
})

test('PATCH .../sale rejects an option id that does not belong to the product', async () => {
  const product = await createProduct({ optionLabel: 'Shade', price: 150 })
  const otherProduct = await createProduct({ optionLabel: 'Shade', price: 150 })
  const foreignOption = await createOption(otherProduct, { name: 'Not Mine' })

  const res = await request('PATCH', `/api/admin/products/${product.id}/sale`, {
    options: [{ id: foreignOption.id, onSale: true, salePrice: 50 }],
  }, sysadminHeaders())
  assert.strictEqual(res.status, 400)
})

test('an order for a product on sale is charged and snapshotted at the sale price', async () => {
  const product = await createProduct({ price: 150 })
  await request('PATCH', `/api/admin/products/${product.id}/sale`, { onSale: true, salePrice: 123.7 }, sysadminHeaders())

  const orderRes = await request('POST', '/api/orders', {
    customerName: 'Sale Price Customer',
    customerPhone: '0821234567',
    items: [{ id: product.id, qty: 2, name: product.name, price: 150 }],
    fulfilmentMethod: 'pickup',
    paymentMethod: 'ozow',
  })
  assert.strictEqual(orderRes.status, 201)
  createdOrderIds.push(orderRes.data.orderId)

  const itemRow = (await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderRes.data.orderId])).rows[0]
  assert.strictEqual(parseFloat(itemRow.price), 123.7, 'must charge the sale price, not the browser-sent one')
  assert.strictEqual(parseFloat(itemRow.original_price), 150)
  assert.strictEqual(parseFloat(itemRow.discount_amount), 26.3)

  const orderRow = (await pool.query('SELECT * FROM orders WHERE id = $1', [orderRes.data.orderId])).rows[0]
  assert.strictEqual(parseFloat(orderRow.subtotal), 247.4, 'order subtotal must use the sale price * qty')
})

after(async () => {
  await pool.query('DELETE FROM order_items WHERE order_id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM notifications WHERE order_id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM orders WHERE id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM product_options WHERE product_id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
  global.fetch = realFetch
})
