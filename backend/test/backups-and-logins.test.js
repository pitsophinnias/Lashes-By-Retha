const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const jwt = require('jsonwebtoken')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4016'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4016'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'
process.env.BACKUP_REPORT_TOKEN = 'test-backup-report-token'

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
const createdBackupRunIds = []

const createTestUser = async (roleName, { isActive = true } = {}) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `backups-logins-test-${roleName}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, $3, FALSE) RETURNING *`,
    [username, roleRow.id, isActive]
  )
  testUserIds.push(result.rows[0].id)
  return result.rows[0]
}

const tokenForUser = (user, { role, tokenVersion } = {}) => jwt.sign(
  { id: user.id, username: user.username, role: role ?? undefined, tokenVersion: tokenVersion ?? user.token_version },
  JWT_SECRET,
  { expiresIn: '1h' }
)

const insertBackupRun = async ({ startedAt, finishedAt = null, status, sizeBytes = null, location = null, message = null }) => {
  const result = await pool.query(
    `INSERT INTO backup_runs (started_at, finished_at, status, size_bytes, location, message)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [startedAt, finishedAt, status, sizeBytes, location, message]
  )
  createdBackupRunIds.push(result.rows[0].id)
  return result.rows[0].id
}

// backup_runs has nothing to do with orders/students/customers - but after
// the feature/test-data incident, the same discipline applies to every
// shared table: never trust a computed value (like the "warning" flag,
// which looks at *all* rows) unless nothing outside this test is present to
// skew it. Only ever reads here, never deletes anything not in ownIds.
const skipIfForeignBackupRuns = async (t, ownIds) => {
  const { rows } = await pool.query('SELECT id FROM backup_runs')
  const foreign = rows.filter(r => !ownIds.includes(r.id))
  if (foreign.length > 0) {
    t.skip(`backup_runs has ${foreign.length} row(s) outside this test - skipping, since the warning flag looks at every row`)
    return true
  }
  return false
}

let sysadminUser, ownerUser, staffUser

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET

  const existingSysadmin = (await pool.query(
    `SELECT u.id, u.username, u.token_version FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'sysadmin' LIMIT 1`
  )).rows[0]
  sysadminUser = existingSysadmin
  ownerUser = await createTestUser('owner')
  staffUser = await createTestUser('staff')
})

const sysadminHeaders = () => ({ Authorization: `Bearer ${tokenForUser(sysadminUser, { role: 'sysadmin' })}` })

// ── Backup report endpoint ───────────────────────────────────────────────────

test('POST /api/system/backups/report rejects a missing token', async () => {
  const res = await request('POST', '/api/system/backups/report', { startedAt: new Date().toISOString(), status: 'ok' })
  assert.strictEqual(res.status, 401)
})

test('POST /api/system/backups/report rejects a wrong token', async () => {
  const res = await request('POST', '/api/system/backups/report',
    { startedAt: new Date().toISOString(), status: 'ok' },
    { Authorization: 'Bearer not-the-right-token' })
  assert.strictEqual(res.status, 401)
})

test('POST /api/system/backups/report accepts the correct token and records the run', async () => {
  const startedAt = new Date().toISOString()
  const res = await request('POST', '/api/system/backups/report',
    { startedAt, finishedAt: new Date().toISOString(), status: 'ok', sizeBytes: 12345, location: '/var/backups/hairbyher/x.dump.gz' },
    { Authorization: `Bearer ${process.env.BACKUP_REPORT_TOKEN}` })
  assert.strictEqual(res.status, 200)

  const row = (await pool.query('SELECT * FROM backup_runs WHERE location = $1', ['/var/backups/hairbyher/x.dump.gz'])).rows[0]
  assert.ok(row)
  createdBackupRunIds.push(row.id)
  assert.strictEqual(row.status, 'ok')
  assert.strictEqual(row.size_bytes, '12345')
})

test('POST /api/system/backups/report rejects a missing or invalid status', async () => {
  const res = await request('POST', '/api/system/backups/report',
    { startedAt: new Date().toISOString(), status: 'bogus' },
    { Authorization: `Bearer ${process.env.BACKUP_REPORT_TOKEN}` })
  assert.strictEqual(res.status, 400)
})

// ── Backup age warning ───────────────────────────────────────────────────────
// warning looks at *every* row in backup_runs, so each of these tests starts
// by clearing out whatever this file has inserted so far (never anything
// else - see skipIfForeignBackupRuns below) - otherwise an earlier test's
// own "now" row would still be the most recent when a later test is trying
// to test what happens when the most recent row is old or failed.
const resetOwnBackupRuns = async () => {
  if (createdBackupRunIds.length > 0) {
    await pool.query('DELETE FROM backup_runs WHERE id = ANY($1)', [createdBackupRunIds])
    createdBackupRunIds.length = 0
  }
}

test('GET /api/admin/backups warns when the last successful backup is over 26 hours old', async (t) => {
  await resetOwnBackupRuns()
  await insertBackupRun({
    startedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    finishedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    status: 'ok',
  })
  if (await skipIfForeignBackupRuns(t, createdBackupRunIds)) return

  const res = await request('GET', '/api/admin/backups', undefined, sysadminHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.setUp, true)
  assert.strictEqual(res.data.warning, true)
})

test('GET /api/admin/backups has no warning when the last run succeeded recently', async (t) => {
  await resetOwnBackupRuns()
  await insertBackupRun({ startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), status: 'ok' })
  if (await skipIfForeignBackupRuns(t, createdBackupRunIds)) return

  const res = await request('GET', '/api/admin/backups', undefined, sysadminHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.warning, false)
  assert.ok(res.data.lastSuccessAt)
})

test('GET /api/admin/backups warns when the most recent run failed, even if an earlier one succeeded', async (t) => {
  await resetOwnBackupRuns()
  await insertBackupRun({ startedAt: new Date(Date.now() - 60 * 1000).toISOString(), status: 'ok' })
  await insertBackupRun({ startedAt: new Date().toISOString(), status: 'failed', message: 'pg_dump failed' })
  if (await skipIfForeignBackupRuns(t, createdBackupRunIds)) return

  const res = await request('GET', '/api/admin/backups', undefined, sysadminHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.warning, true)
  assert.strictEqual(res.data.runs[0].status, 'failed')
})

// ── Access control ───────────────────────────────────────────────────────────

test('owner and staff get 403 on the new backups/login-activity/logout-everywhere routes', async () => {
  for (const user of [ownerUser, staffUser]) {
    const headers = { Authorization: `Bearer ${tokenForUser(user, { role: user === ownerUser ? 'owner' : 'staff' })}` }
    const checks = [
      await request('GET', '/api/admin/backups', undefined, headers),
      await request('GET', '/api/admin/login-activity', undefined, headers),
      await request('POST', `/api/admin/users/${sysadminUser.id}/logout-everywhere`, undefined, headers),
    ]
    for (const res of checks) assert.strictEqual(res.status, 403)
  }
})

// ── authenticate: DB is the source of truth ──────────────────────────────────

test('role is taken from the database, not the token', async () => {
  // staffUser is really 'staff' in the database - a token lying that it's
  // 'sysadmin' must still be denied a sysadmin-only route.
  const lyingToken = tokenForUser(staffUser, { role: 'sysadmin' })
  const res = await request('GET', '/api/admin/backups', undefined, { Authorization: `Bearer ${lyingToken}` })
  assert.strictEqual(res.status, 403)
})

test('an inactive user is rejected even with an otherwise valid token', async () => {
  const inactiveUser = await createTestUser('staff', { isActive: false })
  const res = await request('GET', '/api/auth/me', undefined,
    { Authorization: `Bearer ${tokenForUser(inactiveUser, { role: 'staff' })}` })
  assert.strictEqual(res.status, 401)
})

test('a user that no longer exists is rejected', async () => {
  const goneUser = await createTestUser('staff')
  const token = tokenForUser(goneUser, { role: 'staff' })
  await pool.query('DELETE FROM users WHERE id = $1', [goneUser.id])
  testUserIds.splice(testUserIds.indexOf(goneUser.id), 1) // already gone - after() shouldn't try again

  const res = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${token}` })
  assert.strictEqual(res.status, 401)
})

// ── Log out everywhere (token_version) ───────────────────────────────────────

test('logging out everywhere invalidates every token issued before it', async () => {
  const user = await createTestUser('staff')
  const oldToken = tokenForUser(user, { role: 'staff' })

  const before = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${oldToken}` })
  assert.strictEqual(before.status, 200)

  const logout = await request('POST', `/api/admin/users/${user.id}/logout-everywhere`, undefined, sysadminHeaders())
  assert.strictEqual(logout.status, 200)

  const after1 = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${oldToken}` })
  assert.strictEqual(after1.status, 401)

  // A freshly minted token with the new token_version still works.
  const refreshed = (await pool.query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0]
  const newToken = tokenForUser(refreshed, { role: 'staff' })
  const after2 = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${newToken}` })
  assert.strictEqual(after2.status, 200)

  const auditRow = (await pool.query(
    `SELECT 1 FROM audit_logs WHERE action = 'USER_LOGGED_OUT_EVERYWHERE' AND details LIKE $1`,
    [`%${user.username}%`]
  )).rows
  assert.strictEqual(auditRow.length, 1)
})

test('logout-everywhere never touches must_change_password', async () => {
  const user = await createTestUser('staff')
  await pool.query('UPDATE users SET must_change_password = FALSE WHERE id = $1', [user.id])
  await request('POST', `/api/admin/users/${user.id}/logout-everywhere`, undefined, sysadminHeaders())
  const row = (await pool.query('SELECT must_change_password FROM users WHERE id = $1', [user.id])).rows[0]
  assert.strictEqual(row.must_change_password, false)
})

after(async () => {
  await pool.query('DELETE FROM backup_runs WHERE id = ANY($1)', [createdBackupRunIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
