// POST /api/admin/products/preorder/bulk - the "Add products to pre-order"
// dialog's review step, which adds several products to pre-order in one
// transaction (all or nothing).
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const jwt = require('jsonwebtoken')
const { createTestSessionId } = require('./helpers/session')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4030'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4030'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

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
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Server did not start in time')
}

let api
let pool
let JWT_SECRET
const testUserIds = []
const createdProductIds = []
const createdPreorderIds = []

const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion, sessionId: roleTokenInfo[role].sessionId },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const ownerHeaders = () => ({ Authorization: `Bearer ${tokenFor('owner')}` })
const staffHeaders = () => ({ Authorization: `Bearer ${tokenFor('staff')}` })

const createTestUser = async (roleName) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `preorder-bulk-test-${roleName}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
  roleTokenInfo[roleName].sessionId = await createTestSessionId(pool, result.rows[0].id)
}

const createProduct = async ({ price = 800, preorderEnabled = false } = {}) => {
  const result = await pool.query(
    `INSERT INTO products (name, price, preorder_enabled, stock_quantity, is_active)
     VALUES ($1, $2, $3, 0, TRUE) RETURNING *`,
    [`Preorder Bulk Test Product ${Math.random().toString(16).slice(2)}`, price, preorderEnabled]
  )
  createdProductIds.push(result.rows[0].id)
  return result.rows[0]
}

// A wig-style product: options_have_own_prices on, two lengths priced well
// above the base price, so the deposit basis must come from the cheapest
// ACTIVE option, never the flat product.price.
const createWigProduct = async () => {
  const product = await createProduct({ price: 150 })
  await pool.query('UPDATE products SET option_label = $1, options_have_own_prices = TRUE WHERE id = $2', ['Length', product.id])
  await pool.query(
    `INSERT INTO product_options (product_id, name, price, is_active, position) VALUES
      ($1, '10 inch', 2750, TRUE, 1),
      ($1, '14 inch', 3200, TRUE, 2),
      ($1, '18 inch', 4000, FALSE, 3)`,
    [product.id]
  )
  return product
}

const createPreorderDirect = async (product, status = 'deposit_paid') => {
  const token = `preorder-bulk-token-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO preorders (
       product_id, quantity, customer_name, customer_phone, customer_email, fulfilment_method,
       price_at_order, deposit_amount, delivery_fee, amount_paid, status, public_token
     ) VALUES ($1, 1, 'Bulk Preorder Test', '0820000000', 'bulk-preorder-test@example.com', 'pickup', $2, 300, 0, 0, $3, $4)
     RETURNING *`,
    [product.id, product.price, status, token]
  )
  createdPreorderIds.push(result.rows[0].id)
  return result.rows[0]
}

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET
  await createTestUser('owner')
  await createTestUser('staff')
})

// ── Bulk add ──────────────────────────────────────────────────────────────

test('bulk add puts every item on pre-order in one call, each with its own deposit/date', async () => {
  const a = await createProduct({ price: 500 })
  const b = await createProduct({ price: 1000 })
  const res = await request('POST', '/api/admin/products/preorder/bulk', {
    items: [
      { productId: a.id, deposit: 100, expectedDate: '2026-12-01' },
      { productId: b.id, deposit: 300, expectedDate: '2026-12-15' },
    ],
  }, ownerHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.products.length, 2)

  const rows = (await pool.query('SELECT id, preorder_enabled, preorder_deposit, preorder_expected_date FROM products WHERE id = ANY($1) ORDER BY id', [[a.id, b.id]])).rows
  const rowA = rows.find(r => r.id === a.id)
  const rowB = rows.find(r => r.id === b.id)
  assert.strictEqual(rowA.preorder_enabled, true)
  assert.strictEqual(parseFloat(rowA.preorder_deposit), 100)
  assert.strictEqual(String(rowA.preorder_expected_date).slice(0, 10), '2026-12-01')
  assert.strictEqual(parseFloat(rowB.preorder_deposit), 300)
})

test('staff cannot bulk add', async () => {
  const a = await createProduct()
  const res = await request('POST', '/api/admin/products/preorder/bulk', {
    items: [{ productId: a.id, deposit: 100 }],
  }, staffHeaders())
  assert.strictEqual(res.status, 403)
})

test('bulk add is all-or-nothing: one invalid item rolls back the whole batch', async () => {
  const good = await createProduct({ price: 500 })
  const bad = await createProduct({ price: 300 })
  const res = await request('POST', '/api/admin/products/preorder/bulk', {
    items: [
      { productId: good.id, deposit: 100 },
      { productId: bad.id, deposit: 9999 }, // way above its own price
    ],
  }, ownerHeaders())
  assert.strictEqual(res.status, 400)
  assert.ok(res.data.errors[bad.id] || res.data.errors[String(bad.id)])

  const goodRow = (await pool.query('SELECT preorder_enabled FROM products WHERE id = $1', [good.id])).rows[0]
  assert.strictEqual(goodRow.preorder_enabled, false, 'the otherwise-valid item must NOT have been saved either')
})

test('bulk add rejects a product already on pre-order, even mixed in with valid ones (eligibility is enforced server-side too)', async () => {
  const alreadyOn = await createProduct({ price: 500, preorderEnabled: true })
  const eligible = await createProduct({ price: 500 })
  const res = await request('POST', '/api/admin/products/preorder/bulk', {
    items: [
      { productId: alreadyOn.id, deposit: 100 },
      { productId: eligible.id, deposit: 100 },
    ],
  }, ownerHeaders())
  assert.strictEqual(res.status, 400)
  const key = alreadyOn.id in res.data.errors ? alreadyOn.id : String(alreadyOn.id)
  assert.match(res.data.errors[key], /already on pre-order/i)

  // GET /api/admin/products is what the dialog's step 1 uses to decide
  // which rows are "eligible" (not already on pre-order, greyed out
  // otherwise) - confirm it reports the flag the dialog relies on.
  const list = await request('GET', '/api/admin/products', undefined, ownerHeaders())
  assert.strictEqual(list.data.find(p => p.id === alreadyOn.id).preorderEnabled, true)
  assert.strictEqual(list.data.find(p => p.id === eligible.id).preorderEnabled, false)
})

// ── Deposit validation ──────────────────────────────────────────────────────

test('a deposit of 0 is rejected', async () => {
  const product = await createProduct({ price: 500 })
  const res = await request('POST', '/api/admin/products/preorder/bulk', {
    items: [{ productId: product.id, deposit: 0 }],
  }, ownerHeaders())
  assert.strictEqual(res.status, 400)
})

test('a deposit above the product\'s price is rejected', async () => {
  const product = await createProduct({ price: 500 })
  const res = await request('POST', '/api/admin/products/preorder/bulk', {
    items: [{ productId: product.id, deposit: 600 }],
  }, ownerHeaders())
  assert.strictEqual(res.status, 400)
})

test('a wig-style product (options_have_own_prices) is checked against the cheapest ACTIVE option, not the base price or an inactive cheaper one', async () => {
  const wig = await createWigProduct()

  // Below the base price (150) is still way below the cheapest active
  // option (2750) - must be accepted, proving the base price isn't the
  // basis being used.
  const tooLowForBaseButFine = await request('POST', '/api/admin/products/preorder/bulk', {
    items: [{ productId: wig.id, deposit: 1000 }],
  }, ownerHeaders())
  assert.strictEqual(tooLowForBaseButFine.status, 200)

  await pool.query('UPDATE products SET preorder_enabled = FALSE WHERE id = $1', [wig.id])

  // Above the cheapest ACTIVE option (2750) must be rejected, even though
  // it's below the inactive 18 inch option's 4000 - an inactive option
  // must never make the deposit basis more lenient.
  const tooHigh = await request('POST', '/api/admin/products/preorder/bulk', {
    items: [{ productId: wig.id, deposit: 3000 }],
  }, ownerHeaders())
  assert.strictEqual(tooHigh.status, 400)
})

// ── Remove keeps existing customer pre-orders ───────────────────────────────

test('removing a product from pre-order (PATCH preorderEnabled: false) leaves its existing customer pre-orders completely untouched', async () => {
  const product = await createProduct({ price: 500, preorderEnabled: true })
  await pool.query('UPDATE products SET preorder_deposit = 100 WHERE id = $1', [product.id])
  const existing = await createPreorderDirect(product, 'deposit_paid')

  const res = await request('PATCH', `/api/admin/products/${product.id}`, { preorderEnabled: false }, ownerHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.preorderEnabled, false)

  const preorderRow = (await pool.query('SELECT status, amount_paid FROM preorders WHERE id = $1', [existing.id])).rows[0]
  assert.strictEqual(preorderRow.status, 'deposit_paid')
  assert.strictEqual(parseFloat(preorderRow.amount_paid), 0)
})

after(async () => {
  await pool.query('DELETE FROM notifications WHERE preorder_id = ANY($1)', [createdPreorderIds])
  await pool.query('DELETE FROM preorders WHERE id = ANY($1)', [createdPreorderIds])
  await pool.query('DELETE FROM product_options WHERE product_id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
