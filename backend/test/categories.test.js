const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const jwt = require('jsonwebtoken')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4018'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4018'
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
const createdCategoryIds = []

// authenticate loads the user fresh from the database on every request, so
// a test token needs a real user row behind it - see auth.js.
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
  const username = `categories-test-${roleName}-${randRef()}${randRef()}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
}

const randRef = () => Math.random().toString(16).slice(2, 8)
const createCategory = async (name) => {
  name = `${name} ${randRef()}`
  const res = await request('POST', '/api/categories', { name }, sysadminHeaders())
  assert.strictEqual(res.status, 201)
  createdCategoryIds.push(res.data.id)
  return res.data
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
  await createTestUser('owner')
})

test('GET /api/categories returns position and imageUrl, ordered by position', async () => {
  const a = await createCategory(`Zebra`)
  const b = await createCategory(`Apple`)

  const res = await request('GET', '/api/categories')
  assert.strictEqual(res.status, 200)
  const aRow = res.data.find(c => c.id === a.id)
  const bRow = res.data.find(c => c.id === b.id)
  assert.ok(aRow)
  assert.ok(bRow)
  assert.strictEqual(aRow.imageUrl, null)
  // New categories append to the end - b was created after a, so its
  // position must be strictly greater, regardless of alphabetical name.
  assert.ok(bRow.position > aRow.position)
  const aIndex = res.data.findIndex(c => c.id === a.id)
  const bIndex = res.data.findIndex(c => c.id === b.id)
  assert.ok(aIndex < bIndex)
})

test('a new category is created with position = current max + 1', async () => {
  const before = await request('GET', '/api/categories')
  const maxPosition = Math.max(0, ...before.data.map(c => c.position || 0))
  const created = await createCategory(`New Section`)
  assert.strictEqual(created.position, maxPosition + 1)
})

test('PATCH /api/categories/:id/move swaps with the neighbour above/below, and rejects at the edges', async () => {
  const a = await createCategory(`Move A`)
  const b = await createCategory(`Move B`)
  // b was created after a, so b.position > a.position (adjacent, since
  // nothing else was created in between).

  const moveUp = await request('PATCH', `/api/categories/${b.id}/move`, { direction: 'up' }, sysadminHeaders())
  assert.strictEqual(moveUp.status, 200)
  const afterUp = moveUp.data
  const aAfter = afterUp.find(c => c.id === a.id)
  const bAfter = afterUp.find(c => c.id === b.id)
  assert.ok(bAfter.position < aAfter.position, 'b should now be positioned before a')

  // b is now first among this pair - moving it up again eventually hits
  // the very top of the whole list and must be rejected, not silently a
  // no-op or a 500.
  let guard = 0
  let res
  do {
    res = await request('PATCH', `/api/categories/${b.id}/move`, { direction: 'up' }, sysadminHeaders())
    guard++
  } while (res.status === 200 && guard < 50)
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /top/i)
})

test('PATCH /api/categories/:id/move rejects an invalid direction and requires sysadmin/owner', async () => {
  const a = await createCategory(`Direction Test`)
  const badDirection = await request('PATCH', `/api/categories/${a.id}/move`, { direction: 'sideways' }, sysadminHeaders())
  assert.strictEqual(badDirection.status, 400)

  const unauthenticated = await request('PATCH', `/api/categories/${a.id}/move`, { direction: 'up' })
  assert.strictEqual(unauthenticated.status, 401)
})

test('owner can also reorder and create categories (sysadmin is not required)', async () => {
  const a = await createCategory(`Owner Test A`)
  const res = await request('POST', '/api/categories', { name: `Owner Test B ${randRef()}` }, ownerHeaders())
  assert.strictEqual(res.status, 201)
  createdCategoryIds.push(res.data.id)

  const move = await request('PATCH', `/api/categories/${a.id}/move`, { direction: 'down' }, ownerHeaders())
  assert.strictEqual(move.status, 200)
})

test('DELETE /api/categories/:id/image clears a category with no image without error, and requires sysadmin/owner', async () => {
  const a = await createCategory(`Image Test`)

  const unauthenticated = await request('DELETE', `/api/categories/${a.id}/image`)
  assert.strictEqual(unauthenticated.status, 401)

  const res = await request('DELETE', `/api/categories/${a.id}/image`, undefined, sysadminHeaders())
  assert.strictEqual(res.status, 200)

  const row = (await pool.query('SELECT image_url, image_public_id FROM categories WHERE id = $1', [a.id])).rows[0]
  assert.strictEqual(row.image_url, null)
  assert.strictEqual(row.image_public_id, null)
})

test('DELETE /api/categories/:id/image 404s for a category that does not exist', async () => {
  const res = await request('DELETE', '/api/categories/999999/image', undefined, sysadminHeaders())
  assert.strictEqual(res.status, 404)
})

after(async () => {
  await pool.query('DELETE FROM product_categories WHERE category_id = ANY($1)', [createdCategoryIds])
  await pool.query('DELETE FROM categories WHERE id = ANY($1)', [createdCategoryIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
