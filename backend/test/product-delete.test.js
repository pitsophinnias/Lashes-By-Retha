const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')
const { createTestSessionId } = require('./helpers/session')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4024'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4024'
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

const createProduct = async ({ price = 150, stockQuantity = 10 } = {}) => {
  const result = await pool.query(
    `INSERT INTO products (name, price, stock_quantity) VALUES ($1, $2, $3) RETURNING *`,
    [`Delete Test Product ${randRef('p')}`, price, stockQuantity]
  )
  createdProductIds.push(result.rows[0].id)
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

test('a product with no history is hard deleted - the row is gone', async () => {
  const product = await createProduct()
  const res = await request('DELETE', `/api/admin/products/${product.id}`, undefined, sysadminHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.mode, 'hard')

  const row = (await pool.query('SELECT * FROM products WHERE id = $1', [product.id])).rows[0]
  assert.strictEqual(row, undefined)
  createdProductIds.splice(createdProductIds.indexOf(product.id), 1)
})

test('a product with a stock movement (but no orders) is soft deleted, not hard deleted', async () => {
  const product = await createProduct()
  await pool.query(
    `INSERT INTO stock_movements (product_id, change, reason) VALUES ($1, 5, 'restock')`,
    [product.id]
  )

  const res = await request('DELETE', `/api/admin/products/${product.id}`, undefined, sysadminHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.mode, 'soft')

  const row = (await pool.query('SELECT * FROM products WHERE id = $1', [product.id])).rows[0]
  assert.ok(row, 'the row must still exist so old stock history keeps a product to point at')
  assert.ok(row.deleted_at)
  assert.strictEqual(row.is_active, false)
})

test('a soft-deleted product is excluded from the public and admin product lists', async () => {
  const product = await createProduct()
  await pool.query(
    `INSERT INTO stock_movements (product_id, change, reason) VALUES ($1, 5, 'restock')`,
    [product.id]
  )
  await request('DELETE', `/api/admin/products/${product.id}`, undefined, sysadminHeaders())

  const publicList = await request('GET', '/api/products')
  assert.ok(!publicList.data.some(p => p.id === product.id))

  const adminList = await request('GET', '/api/admin/products', undefined, sysadminHeaders())
  assert.ok(!adminList.data.some(p => p.id === product.id))
})

test('checkout is blocked with a gentle message for a deleted product', async () => {
  const product = await createProduct()
  await pool.query(
    `INSERT INTO stock_movements (product_id, change, reason) VALUES ($1, 5, 'restock')`,
    [product.id]
  )
  await request('DELETE', `/api/admin/products/${product.id}`, undefined, sysadminHeaders())

  const orderRes = await request('POST', '/api/orders', {
    customerName: 'Deleted Product Customer',
    customerPhone: '0821234567',
    items: [{ id: product.id, qty: 1, name: product.name, price: product.price }],
    fulfilmentMethod: 'pickup',
    paymentMethod: 'ozow',
  })
  assert.strictEqual(orderRes.status, 400)
  assert.match(orderRes.data.error, /no longer available/i)
})

test('a product with an order is soft deleted, and its order keeps showing the product name and price', async () => {
  const product = await createProduct({ price: 88 })
  const orderRes = await request('POST', '/api/orders', {
    customerName: 'History Keeper',
    customerPhone: '0821234567',
    items: [{ id: product.id, qty: 1, name: product.name, price: 88 }],
    fulfilmentMethod: 'pickup',
    paymentMethod: 'ozow',
  })
  assert.strictEqual(orderRes.status, 201)
  createdOrderIds.push(orderRes.data.orderId)

  const deleteRes = await request('DELETE', `/api/admin/products/${product.id}`, undefined, sysadminHeaders())
  assert.strictEqual(deleteRes.status, 200)
  assert.strictEqual(deleteRes.data.mode, 'soft')

  const listRes = await request('GET', '/api/orders', undefined, sysadminHeaders())
  const order = listRes.data.find(o => o.id === orderRes.data.orderId)
  assert.ok(order)
  assert.strictEqual(order.items[0].name, product.name)
  assert.strictEqual(order.items[0].price, 88)
})

test('deleting an already-deleted product returns 404', async () => {
  const product = await createProduct()
  const first = await request('DELETE', `/api/admin/products/${product.id}`, undefined, sysadminHeaders())
  assert.strictEqual(first.status, 200)
  createdProductIds.splice(createdProductIds.indexOf(product.id), 1)

  const second = await request('DELETE', `/api/admin/products/${product.id}`, undefined, sysadminHeaders())
  assert.strictEqual(second.status, 404)
})

after(async () => {
  await pool.query('DELETE FROM order_items WHERE order_id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM notifications WHERE order_id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM orders WHERE id = ANY($1)', [createdOrderIds])
  await pool.query('DELETE FROM stock_movements WHERE product_id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
  global.fetch = realFetch
})
