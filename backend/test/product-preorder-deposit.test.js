const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const jwt = require('jsonwebtoken')
const { createTestSessionId } = require('./helpers/session')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4021'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4021'
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

let api
let pool
let JWT_SECRET
const testUserIds = []
const createdProductIds = []

// authenticate loads the user fresh from the database on every request, so
// a test token needs a real user row behind it - see auth.js.
const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion, sessionId: roleTokenInfo[role].sessionId },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const ownerHeaders = () => ({ Authorization: `Bearer ${tokenFor('owner')}` })

const createTestUser = async (roleName) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `product-deposit-test-${roleName}-${Date.now()}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
  roleTokenInfo[roleName].sessionId = await createTestSessionId(pool, result.rows[0].id)
}

const createProduct = async (body) => {
  const res = await request('POST', '/api/admin/products', body, ownerHeaders())
  if (res.status === 201) createdProductIds.push(res.data.id)
  return res
}

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET
  await createTestUser('owner')
})

test('a R300 product with pre-order off saves fine, even though the R500 default deposit exceeds its price', async () => {
  const res = await createProduct({ name: 'Foundation', price: 300 })
  assert.strictEqual(res.status, 201)
  assert.strictEqual(res.data.preorderEnabled, false)
})

test('a R300 product with pre-order on and a R500 deposit is rejected with the deposit message', async () => {
  const res = await createProduct({ name: 'Foundation Preorder', price: 300, preorderEnabled: true, preorderDeposit: 500 })
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /less than the price/i)
})

test('a R300 product with pre-order on and a R150 deposit saves', async () => {
  const res = await createProduct({ name: 'Foundation Preorder Valid', price: 300, preorderEnabled: true, preorderDeposit: 150 })
  assert.strictEqual(res.status, 201)
  assert.strictEqual(res.data.preorderEnabled, true)
  assert.strictEqual(res.data.preorderDeposit, 150)
})

test('switching pre-order on for a cheap product with no deposit given suggests one instead of failing', async () => {
  const res = await createProduct({ name: 'Foundation Preorder Suggested', price: 300, preorderEnabled: true })
  assert.strictEqual(res.status, 201)
  assert.strictEqual(res.data.preorderEnabled, true)
  assert.strictEqual(res.data.preorderDeposit, 150) // half of 300, rounded
})

test('PATCH only checks the deposit while pre-order is on, and suggests one when turning it on for a product still carrying a stale deposit', async () => {
  // Simulates a product that predates this fix - its deposit is still the
  // flat R500 default, which is more than its own price.
  const inserted = await pool.query(
    `INSERT INTO products (name, price, preorder_enabled, preorder_deposit, stock_quantity) VALUES ('Old Lipstick', 90, FALSE, 500, 0) RETURNING *`
  )
  const product = inserted.rows[0]
  createdProductIds.push(product.id)

  const offEdit = await request('PATCH', `/api/admin/products/${product.id}`, { price: 90 }, ownerHeaders())
  assert.strictEqual(offEdit.status, 200, 'editing with pre-order off must never check the deposit, even though the stored 500 exceeds the price')

  const onEdit = await request('PATCH', `/api/admin/products/${product.id}`, { preorderEnabled: true }, ownerHeaders())
  assert.strictEqual(onEdit.status, 200)
  assert.strictEqual(onEdit.data.preorderDeposit, 45) // half of 90, rounded - the stale 500 no longer fits

  const badDeposit = await request('PATCH', `/api/admin/products/${product.id}`, { preorderDeposit: 90 }, ownerHeaders())
  assert.strictEqual(badDeposit.status, 400)
  assert.match(badDeposit.data.error, /less than the price/i)
})

after(async () => {
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
