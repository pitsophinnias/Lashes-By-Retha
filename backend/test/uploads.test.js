const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const http = require('node:http')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')
const { createTestSessionId } = require('./helpers/session')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4031'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4031'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

// Isolated upload dir for this file only - set before ../index (which
// requires ../src/storage/local) is ever required, since UPLOAD_DIR is
// resolved once at require time.
const TEST_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hbh-upload-test-'))
process.env.UPLOAD_DIR = TEST_UPLOAD_DIR

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

// Builds a minimal multipart/form-data body carrying one file field
// ("image", matching what both frontends send) plus whatever extra form
// fields are given.
const uploadRequest = (method, pathAndQuery, { filename, contentType, bytes, fields = {}, headers = {} }) => new Promise((resolve, reject) => {
  const boundary = `testboundary${crypto.randomBytes(8).toString('hex')}`
  const head = []
  for (const [key, value] of Object.entries(fields)) {
    head.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`)
  }
  head.push(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`)
  const headBuffer = Buffer.from(head.join(''), 'utf8')
  const tailBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  const bodyBuffer = Buffer.concat([headBuffer, bytes, tailBuffer])

  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: pathAndQuery,
    method,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': bodyBuffer.length,
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
  req.write(bodyBuffer)
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
const createdCategoryIds = []

const randRef = () => crypto.randomBytes(4).toString('hex')

const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion, sessionId: roleTokenInfo[role].sessionId },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const sysadminHeaders = () => ({ Authorization: `Bearer ${tokenFor('sysadmin')}` })
const staffHeaders = () => ({ Authorization: `Bearer ${tokenFor('staff')}` })

const createProduct = async () => {
  const result = await pool.query(
    `INSERT INTO products (name, price, stock_quantity) VALUES ($1, 100, 5) RETURNING *`,
    [`Upload Test Product ${randRef()}`]
  )
  createdProductIds.push(result.rows[0].id)
  return result.rows[0]
}

const createCategory = async () => {
  const result = await pool.query(
    `INSERT INTO categories (name) VALUES ($1) RETURNING *`,
    [`Upload Test Category ${randRef()}`]
  )
  createdCategoryIds.push(result.rows[0].id)
  return result.rows[0]
}

// Not a real JPEG/MP4 - the upload routes only check the declared
// extension and mimetype, never the file's actual bytes, so arbitrary
// content is fine for exercising that logic.
const FAKE_IMAGE_BYTES = Buffer.from('fake-image-bytes')
const FAKE_VIDEO_BYTES = Buffer.from('fake-video-bytes')

const uploadDirFor = (url) => path.join(TEST_UPLOAD_DIR, url.replace('/uploads/', ''))

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

  const staffRoleRow = (await pool.query(`SELECT id FROM roles WHERE name = 'staff'`)).rows[0]
  const staffResult = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [`upload-test-staff-${randRef()}`, staffRoleRow.id]
  )
  testUserIds.push(staffResult.rows[0].id)
  roleTokenInfo.staff = { id: staffResult.rows[0].id, username: staffResult.rows[0].username, tokenVersion: staffResult.rows[0].token_version }
  roleTokenInfo.staff.sessionId = await createTestSessionId(pool, staffResult.rows[0].id)
})

after(async () => {
  await pool.query('DELETE FROM media WHERE item_id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM categories WHERE id = ANY($1)', [createdCategoryIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
  fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true })
})

// ── Allowed uploads ──────────────────────────────────────────────────────────

test('uploading a jpg for a product stores it under /uploads/images and records it in media', async () => {
  const product = await createProduct()
  const res = await uploadRequest('POST', `/api/upload/products/${product.id}`, {
    filename: 'photo.jpg', contentType: 'image/jpeg', bytes: FAKE_IMAGE_BYTES, headers: sysadminHeaders(),
  })
  assert.strictEqual(res.status, 200)
  assert.ok(res.data.url.startsWith('/uploads/images/'))
  assert.ok(fs.existsSync(uploadDirFor(res.data.url)))

  const row = (await pool.query('SELECT url, resource_type FROM media WHERE type = $1 AND item_id = $2', ['products', product.id])).rows[0]
  assert.strictEqual(row.url, res.data.url)
  assert.strictEqual(row.resource_type, 'image')
})

test('uploading an mp4 for a gallery entry stores it under /uploads/videos', async () => {
  const res = await uploadRequest('POST', '/api/upload/gallery', {
    filename: 'clip.mp4', contentType: 'video/mp4', bytes: FAKE_VIDEO_BYTES, headers: sysadminHeaders(),
  })
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.type, 'video')
  assert.ok(res.data.url.startsWith('/uploads/videos/'))
  assert.ok(fs.existsSync(uploadDirFor(res.data.url)))

  await pool.query('DELETE FROM gallery_images WHERE url = $1', [res.data.url])
})

test('uploaded filenames are random, never derived from the original filename or item id', async () => {
  const product = await createProduct()
  const res = await uploadRequest('POST', `/api/upload/products/${product.id}`, {
    filename: 'my-photo.jpg', contentType: 'image/jpeg', bytes: FAKE_IMAGE_BYTES, headers: sysadminHeaders(),
  })
  assert.strictEqual(res.status, 200)
  const storedName = path.basename(res.data.url)
  assert.ok(!storedName.includes('my-photo'))
  assert.ok(!storedName.includes(`products-${product.id}`))
})

// ── Rejected uploads ─────────────────────────────────────────────────────────

test('an svg disguised as an image is rejected', async () => {
  const product = await createProduct()
  const res = await uploadRequest('POST', `/api/upload/products/${product.id}`, {
    filename: 'evil.svg', contentType: 'image/svg+xml', bytes: Buffer.from('<svg onload="alert(1)"></svg>'), headers: sysadminHeaders(),
  })
  assert.strictEqual(res.status, 400)
  const row = (await pool.query('SELECT 1 FROM media WHERE type = $1 AND item_id = $2', ['products', product.id])).rows[0]
  assert.strictEqual(row, undefined)
})

test('an html file renamed with a .jpg extension is rejected (extension and mimetype must both match)', async () => {
  const product = await createProduct()
  const res = await uploadRequest('POST', `/api/upload/products/${product.id}`, {
    filename: 'evil.jpg', contentType: 'text/html', bytes: Buffer.from('<script>alert(1)</script>'), headers: sysadminHeaders(),
  })
  assert.strictEqual(res.status, 400)
})

test('an .html file is rejected outright', async () => {
  const product = await createProduct()
  const res = await uploadRequest('POST', `/api/upload/products/${product.id}`, {
    filename: 'evil.html', contentType: 'text/html', bytes: Buffer.from('<script>alert(1)</script>'), headers: sysadminHeaders(),
  })
  assert.strictEqual(res.status, 400)
})

test('upload requires sysadmin or owner', async () => {
  const product = await createProduct()
  const res = await uploadRequest('POST', `/api/upload/products/${product.id}`, {
    filename: 'photo.jpg', contentType: 'image/jpeg', bytes: FAKE_IMAGE_BYTES,
  })
  assert.strictEqual(res.status, 401)
})

// ── Replacing and deleting ───────────────────────────────────────────────────

test('re-uploading for the same product replaces the file on disk', async () => {
  const product = await createProduct()
  const first = await uploadRequest('POST', `/api/upload/products/${product.id}`, {
    filename: 'one.jpg', contentType: 'image/jpeg', bytes: FAKE_IMAGE_BYTES, headers: sysadminHeaders(),
  })
  const firstPath = uploadDirFor(first.data.url)
  assert.ok(fs.existsSync(firstPath))

  const second = await uploadRequest('POST', `/api/upload/products/${product.id}`, {
    filename: 'two.png', contentType: 'image/png', bytes: FAKE_IMAGE_BYTES, headers: sysadminHeaders(),
  })
  assert.notStrictEqual(second.data.url, first.data.url)
  assert.ok(fs.existsSync(uploadDirFor(second.data.url)))
  assert.ok(!fs.existsSync(firstPath), 'previous file should have been deleted')

  const row = (await pool.query('SELECT url FROM media WHERE type = $1 AND item_id = $2', ['products', product.id])).rows[0]
  assert.strictEqual(row.url, second.data.url)
})

test('deleting a gallery item removes its file from disk', async () => {
  const uploaded = await uploadRequest('POST', '/api/upload/gallery', {
    filename: 'remove-me.jpg', contentType: 'image/jpeg', bytes: FAKE_IMAGE_BYTES, headers: sysadminHeaders(),
  })
  const filePath = uploadDirFor(uploaded.data.url)
  assert.ok(fs.existsSync(filePath))

  const row = (await pool.query('SELECT id FROM gallery_images WHERE url = $1', [uploaded.data.url])).rows[0]
  const del = await request('DELETE', `/api/gallery/${row.id}`, undefined, sysadminHeaders())
  assert.strictEqual(del.status, 200)
  assert.ok(!fs.existsSync(filePath))
})

test('removing a category image deletes its file from disk', async () => {
  const category = await createCategory()
  const uploaded = await uploadRequest('POST', `/api/upload/categories/${category.id}`, {
    filename: 'cover.jpg', contentType: 'image/jpeg', bytes: FAKE_IMAGE_BYTES, headers: sysadminHeaders(),
  })
  const filePath = uploadDirFor(uploaded.data.url)
  assert.ok(fs.existsSync(filePath))

  const del = await request('DELETE', `/api/categories/${category.id}/image`, undefined, sysadminHeaders())
  assert.strictEqual(del.status, 200)
  assert.ok(!fs.existsSync(filePath))
})

test('hard-deleting a product with no history removes its uploaded image file too', async () => {
  const product = await createProduct()
  const uploaded = await uploadRequest('POST', `/api/upload/products/${product.id}`, {
    filename: 'product.jpg', contentType: 'image/jpeg', bytes: FAKE_IMAGE_BYTES, headers: sysadminHeaders(),
  })
  const filePath = uploadDirFor(uploaded.data.url)
  assert.ok(fs.existsSync(filePath))

  const del = await request('DELETE', `/api/admin/products/${product.id}`, undefined, sysadminHeaders())
  assert.strictEqual(del.status, 200)
  assert.strictEqual(del.data.mode, 'hard')
  assert.ok(!fs.existsSync(filePath))
  createdProductIds.splice(createdProductIds.indexOf(product.id), 1)
})

// ── Remove Image (DELETE /api/upload/:type/:id) ─────────────────────────────

test('DELETE /api/upload/products/:id removes the file from disk and clears the media row', async () => {
  const product = await createProduct()
  const uploaded = await uploadRequest('POST', `/api/upload/products/${product.id}`, {
    filename: 'remove-me.jpg', contentType: 'image/jpeg', bytes: FAKE_IMAGE_BYTES, headers: sysadminHeaders(),
  })
  const filePath = uploadDirFor(uploaded.data.url)
  assert.ok(fs.existsSync(filePath))

  const del = await request('DELETE', `/api/upload/products/${product.id}`, undefined, sysadminHeaders())
  assert.strictEqual(del.status, 200)
  assert.ok(!fs.existsSync(filePath), 'the file should be deleted from disk')

  const row = (await pool.query('SELECT 1 FROM media WHERE type = $1 AND item_id = $2', ['products', product.id])).rows[0]
  assert.strictEqual(row, undefined, 'the media row should be cleared')

  const lookup = await request('GET', `/api/upload/products/${product.id}`)
  assert.strictEqual(lookup.data.url, null)
})

test('DELETE /api/upload/categories/:id removes the file and clears image_url', async () => {
  const category = await createCategory()
  const uploaded = await uploadRequest('POST', `/api/upload/categories/${category.id}`, {
    filename: 'cover.jpg', contentType: 'image/jpeg', bytes: FAKE_IMAGE_BYTES, headers: sysadminHeaders(),
  })
  const filePath = uploadDirFor(uploaded.data.url)

  const del = await request('DELETE', `/api/upload/categories/${category.id}`, undefined, sysadminHeaders())
  assert.strictEqual(del.status, 200)
  assert.ok(!fs.existsSync(filePath))

  const row = (await pool.query('SELECT image_url FROM categories WHERE id = $1', [category.id])).rows[0]
  assert.strictEqual(row.image_url, null)
})

test('DELETE /api/upload/:type/:id 404s when there is no image to remove', async () => {
  const product = await createProduct()
  const res = await request('DELETE', `/api/upload/products/${product.id}`, undefined, sysadminHeaders())
  assert.strictEqual(res.status, 404)
})

test('removing an image requires sysadmin or owner - staff is blocked', async () => {
  const product = await createProduct()
  await uploadRequest('POST', `/api/upload/products/${product.id}`, {
    filename: 'staff-blocked.jpg', contentType: 'image/jpeg', bytes: FAKE_IMAGE_BYTES, headers: sysadminHeaders(),
  })

  const staffAttempt = await request('DELETE', `/api/upload/products/${product.id}`, undefined, staffHeaders())
  assert.strictEqual(staffAttempt.status, 403)

  const unauthenticated = await request('DELETE', `/api/upload/products/${product.id}`, undefined)
  assert.strictEqual(unauthenticated.status, 401)

  const row = (await pool.query('SELECT 1 FROM media WHERE type = $1 AND item_id = $2', ['products', product.id])).rows[0]
  assert.ok(row, 'the image should still be there after a blocked attempt')
})
