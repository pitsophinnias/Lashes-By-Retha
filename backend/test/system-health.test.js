const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const jwt = require('jsonwebtoken')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4014'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4014'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

const { sanitizeMessage } = require('../src/errorLog/sanitize')

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
let logError
let cleanupErrorLog
let JWT_SECRET
let sysadminUserId
const testUserIds = []

// authenticate now loads the user fresh from the database on every request
// (id, is_active, token_version, and the role itself) instead of trusting
// the token's own claims - so every role needs a real user row behind it,
// with that row's current token_version in the signed token.
const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const sysadminHeaders = () => ({ Authorization: `Bearer ${tokenFor('sysadmin')}` })

const createTestUser = async (roleName) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `system-health-test-${roleName}-${Date.now()}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
}

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET
  ;({ logError, cleanupErrorLog } = require('../src/errorLog/store'))
  const userRow = await pool.query(
    `SELECT u.id, u.username, u.token_version FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'sysadmin' LIMIT 1`
  )
  sysadminUserId = userRow.rows[0].id
  roleTokenInfo.sysadmin = { id: userRow.rows[0].id, username: userRow.rows[0].username, tokenVersion: userRow.rows[0].token_version }
  await createTestUser('owner')
  await createTestUser('staff')
})

// ── sanitizeMessage ──────────────────────────────────────────────────────────

test('sanitizeMessage redacts emails, phone-like numbers and key=value secrets', () => {
  assert.strictEqual(
    sanitizeMessage('Failed for customer jane.doe@example.com'),
    'Failed for customer [redacted-email]'
  )
  assert.strictEqual(
    sanitizeMessage('Could not reach +27 82 685 5399'),
    'Could not reach [redacted-number]'
  )
  assert.strictEqual(
    sanitizeMessage('auth failed, password: SuperSecret123'),
    'auth failed, password=[redacted]'
  )
  assert.strictEqual(
    sanitizeMessage('Authorization: Bearer abc.def.ghi'),
    'Authorization=[redacted]'
  )
  assert.strictEqual(sanitizeMessage('Plain failure with no sensitive data'), 'Plain failure with no sensitive data')
})

test('sanitizeMessage truncates very long messages', () => {
  const long = 'x'.repeat(1000)
  assert.strictEqual(sanitizeMessage(long).length, 500)
})

// ── logError ──────────────────────────────────────────────────────────────────

test('logError writes a sanitized row with route (not path), method, status and user id from req', async () => {
  const fakeReq = {
    route: { path: '/api/orders/:token/retry' },
    method: 'POST',
    res: { statusCode: 503 },
    user: { id: sysadminUserId },
  }
  await logError('TEST:logError', new Error('failed for jane.doe@example.com'), fakeReq)

  const { rows } = await pool.query(
    `SELECT * FROM error_log WHERE context = 'TEST:logError' ORDER BY created_at DESC LIMIT 1`
  )
  const row = rows[0]
  assert.ok(row)
  assert.strictEqual(row.message, 'failed for [redacted-email]')
  assert.strictEqual(row.route, '/api/orders/:token/retry')
  assert.strictEqual(row.method, 'POST')
  assert.strictEqual(row.status, 503)
  assert.strictEqual(row.user_id, sysadminUserId)
  assert.strictEqual(row.resolved_at, null)

  await pool.query(`DELETE FROM error_log WHERE context = 'TEST:logError'`)
})

test('logError never throws when req is missing entirely', async () => {
  await assert.doesNotReject(() => logError('TEST:logError-no-req', new Error('background job failed')))
  const { rows } = await pool.query(`SELECT * FROM error_log WHERE context = 'TEST:logError-no-req'`)
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].route, null)
  assert.strictEqual(rows[0].user_id, null)
  await pool.query(`DELETE FROM error_log WHERE context = 'TEST:logError-no-req'`)
})

// ── Retention ────────────────────────────────────────────────────────────────

test('cleanupErrorLog removes rows older than 30 days and caps the table at 2000 rows', async () => {
  await pool.query(
    `INSERT INTO error_log (context, message, created_at) VALUES ('TEST:retention-old', 'old', NOW() - INTERVAL '31 days')`
  )
  const recentContext = 'TEST:retention-recent'
  await pool.query(`INSERT INTO error_log (context, message, created_at) VALUES ($1, 'recent', NOW())`, [recentContext])

  await cleanupErrorLog()

  const old = await pool.query(`SELECT 1 FROM error_log WHERE context = 'TEST:retention-old'`)
  assert.strictEqual(old.rows.length, 0)
  const recent = await pool.query(`SELECT 1 FROM error_log WHERE context = $1`, [recentContext])
  assert.strictEqual(recent.rows.length, 1)

  const count = await pool.query('SELECT COUNT(*) FROM error_log')
  assert.ok(parseInt(count.rows[0].count) <= 2000)

  await pool.query(`DELETE FROM error_log WHERE context = $1`, [recentContext])
})

// ── Access control ───────────────────────────────────────────────────────────

test('owner and staff get 403 on every system health / error log route', async () => {
  for (const role of ['owner', 'staff']) {
    const headers = { Authorization: `Bearer ${tokenFor(role)}` }
    const checks = [
      await request('GET', '/api/admin/system/health', undefined, headers),
      await request('GET', '/api/admin/errors', undefined, headers),
      await request('POST', '/api/admin/errors/resolve', { ids: [1] }, headers),
    ]
    for (const res of checks) assert.strictEqual(res.status, 403, `role ${role} should get 403`)
  }
})

test('the system health and error log routes require authentication', async () => {
  assert.strictEqual((await request('GET', '/api/admin/system/health')).status, 401)
  assert.strictEqual((await request('GET', '/api/admin/errors')).status, 401)
  assert.strictEqual((await request('POST', '/api/admin/errors/resolve', { ids: [1] })).status, 401)
})

// ── System health ────────────────────────────────────────────────────────────

test('GET /api/admin/system/health reports backend, database, services and system settings', async () => {
  const res = await request('GET', '/api/admin/system/health', undefined, sysadminHeaders())
  assert.strictEqual(res.status, 200)
  assert.ok(['ok', 'warning'].includes(res.data.status))
  assert.ok(Array.isArray(res.data.warnings))
  assert.ok(typeof res.data.backend.uptimeSeconds === 'number')
  assert.ok(res.data.backend.nodeVersion.startsWith('v'))
  assert.ok(typeof res.data.backend.memory.rssMb === 'number')
  assert.ok(typeof res.data.backend.version === 'string')
  assert.strictEqual(res.data.database.reachable, true)
  assert.ok(typeof res.data.database.responseTimeMs === 'number')
  assert.ok(typeof res.data.database.sizePercent === 'number')
  assert.ok(typeof res.data.database.rowCounts.orders === 'number')
  assert.ok(typeof res.data.services.ozow.configured === 'boolean')
  assert.ok(typeof res.data.services.payflex.configured === 'boolean')
  assert.ok(typeof res.data.services.cloudinary.configured === 'boolean')
  assert.ok(typeof res.data.systemSettings.maintenance.enabled === 'boolean')
  assert.ok(typeof res.data.systemSettings.payments.ozowEnabled === 'boolean')
  // Never a secret value anywhere in the response.
  const flat = JSON.stringify(res.data)
  assert.ok(!flat.includes(process.env.OZOW_PRIVATE_KEY || '~~none~~'))
  assert.ok(!flat.includes(process.env.JWT_SECRET || '~~none~~'))
})

test('GET /api/admin/system/health warns when a payment is stuck for over an hour', async () => {
  const orderResult = await pool.query(
    `INSERT INTO orders (customer_name, customer_phone, total, payment_method, payment_status, public_token)
     VALUES ('System Health Test', '0821234567', 100.00, 'ozow', 'unpaid', $1) RETURNING id`,
    [`health-test-${Date.now()}`]
  )
  const orderId = orderResult.rows[0].id
  await pool.query(
    `INSERT INTO ozow_payments (order_id, transaction_reference, amount, status, is_test, created_at)
     VALUES ($1, $2, '100.00', 'started', TRUE, NOW() - INTERVAL '2 hours')`,
    [orderId, `health-test-ref-${Date.now()}`]
  )

  const res = await request('GET', '/api/admin/system/health', undefined, sysadminHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.status, 'warning')
  assert.ok(res.data.stuckPayments >= 1)
  assert.ok(res.data.warnings.some(w => w.includes('stuck for over an hour')))

  await pool.query('DELETE FROM ozow_payments WHERE order_id = $1', [orderId])
  await pool.query('DELETE FROM orders WHERE id = $1', [orderId])
})

// ── Error log listing and resolving ──────────────────────────────────────────

test('GET /api/admin/errors groups identical rows with a count, and resolving removes them from the unresolved view', async () => {
  const context = `TEST:grouping-${Date.now()}`
  for (let i = 0; i < 3; i++) {
    await pool.query(
      `INSERT INTO error_log (context, message, route, method, status) VALUES ($1, 'Same failure every time', '/api/x', 'GET', 500)`,
      [context]
    )
  }

  const listed = await request('GET', `/api/admin/errors?resolved=all`, undefined, sysadminHeaders())
  const group = listed.data.find(g => g.context === context)
  assert.ok(group)
  assert.strictEqual(group.count, 3)
  assert.strictEqual(group.ids.length, 3)

  const resolve = await request('POST', '/api/admin/errors/resolve', { ids: group.ids }, sysadminHeaders())
  assert.strictEqual(resolve.status, 200)

  const afterResolve = await request('GET', `/api/admin/errors?resolved=unresolved`, undefined, sysadminHeaders())
  assert.ok(!afterResolve.data.some(g => g.context === context))

  const stillInAll = await request('GET', `/api/admin/errors?resolved=all`, undefined, sysadminHeaders())
  assert.ok(stillInAll.data.some(g => g.context === context))

  await pool.query('DELETE FROM error_log WHERE context = $1', [context])
})

test('POST /api/admin/errors/resolve rejects a non-array or empty ids', async () => {
  const headers = sysadminHeaders()
  assert.strictEqual((await request('POST', '/api/admin/errors/resolve', { ids: 'nope' }, headers)).status, 400)
  assert.strictEqual((await request('POST', '/api/admin/errors/resolve', { ids: [] }, headers)).status, 400)
  assert.strictEqual((await request('POST', '/api/admin/errors/resolve', {}, headers)).status, 400)
})

after(async () => {
  await pool.query(`DELETE FROM error_log WHERE context LIKE 'TEST:%'`)
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
