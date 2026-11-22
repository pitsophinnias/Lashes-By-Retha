const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const jwt = require('jsonwebtoken')
const { createTestSessionId } = require('./helpers/session')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4025'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4025'
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
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('Server did not start in time')
}

let api
let pool
let JWT_SECRET
let sessionConfig
const testUserIds = []

const createTestUser = async (roleName) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `admin-session-test-${roleName}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  return result.rows[0]
}

const tokenFor = (user, sessionId) => jwt.sign(
  { id: user.id, username: user.username, role: 'owner', tokenVersion: user.token_version, sessionId },
  JWT_SECRET,
  { expiresIn: '1h' }
)

// Backdates a session row's timestamp(s) directly rather than waiting for
// real time to pass - exercises exactly the same comparisons
// checkAndTouchSession() makes, just far faster and deterministically.
const backdateSession = async (sessionId, { issuedSecondsAgo, lastActivitySecondsAgo }) => {
  if (issuedSecondsAgo !== undefined) {
    await pool.query(`UPDATE sessions SET issued_at = NOW() - INTERVAL '${issuedSecondsAgo} seconds' WHERE id = $1`, [sessionId])
  }
  if (lastActivitySecondsAgo !== undefined) {
    await pool.query(`UPDATE sessions SET last_activity_at = NOW() - INTERVAL '${lastActivitySecondsAgo} seconds' WHERE id = $1`, [sessionId])
  }
}

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET
  sessionConfig = require('../src/sessions/config')
})

test('a normal, recently-active session is accepted', async () => {
  const user = await createTestUser('owner')
  const sessionId = await createTestSessionId(pool, user.id)
  const res = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${tokenFor(user, sessionId)}` })
  assert.strictEqual(res.status, 200)
})

test('a session idle for longer than the idle timeout (plus grace) is rejected as SESSION_EXPIRED/idle', async () => {
  const user = await createTestUser('owner')
  const sessionId = await createTestSessionId(pool, user.id)
  await backdateSession(sessionId, { lastActivitySecondsAgo: sessionConfig.idleTimeoutMs / 1000 + sessionConfig.graceSeconds + 5 })

  const res = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${tokenFor(user, sessionId)}` })
  assert.strictEqual(res.status, 401)
  assert.strictEqual(res.data.code, 'SESSION_EXPIRED')
  assert.strictEqual(res.data.reason, 'idle')
})

test('the grace margin tolerates being just past the idle timeout', async () => {
  const user = await createTestUser('owner')
  const sessionId = await createTestSessionId(pool, user.id)
  // Past the raw idle timeout, but still within the grace margin.
  await backdateSession(sessionId, { lastActivitySecondsAgo: sessionConfig.idleTimeoutMs / 1000 + 5 })

  const res = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${tokenFor(user, sessionId)}` })
  assert.strictEqual(res.status, 200)
})

test('a session past the max session age is rejected as SESSION_EXPIRED/max_age even with very recent activity', async () => {
  const user = await createTestUser('owner')
  const sessionId = await createTestSessionId(pool, user.id)
  await backdateSession(sessionId, {
    issuedSecondsAgo: sessionConfig.maxSessionMs / 1000 + sessionConfig.graceSeconds + 5,
    lastActivitySecondsAgo: 0,
  })

  const res = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${tokenFor(user, sessionId)}` })
  assert.strictEqual(res.status, 401)
  assert.strictEqual(res.data.code, 'SESSION_EXPIRED')
  assert.strictEqual(res.data.reason, 'max_age')
})

test('a request marked X-Background does not refresh last_activity_at, but a normal request does', async () => {
  const user = await createTestUser('owner')
  const sessionId = await createTestSessionId(pool, user.id)
  const backdateTo = sessionConfig.idleTimeoutMs / 1000 - 5 // not idle yet, but clearly backdated
  await backdateSession(sessionId, { lastActivitySecondsAgo: backdateTo })

  const beforeRow = (await pool.query('SELECT last_activity_at FROM sessions WHERE id = $1', [sessionId])).rows[0]

  const bgRes = await request('GET', '/api/auth/me', undefined, {
    Authorization: `Bearer ${tokenFor(user, sessionId)}`,
    'X-Background': '1',
  })
  assert.strictEqual(bgRes.status, 200)
  const afterBackground = (await pool.query('SELECT last_activity_at FROM sessions WHERE id = $1', [sessionId])).rows[0]
  assert.strictEqual(afterBackground.last_activity_at.getTime(), beforeRow.last_activity_at.getTime(),
    'a background request must not move last_activity_at forward')

  const normalRes = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${tokenFor(user, sessionId)}` })
  assert.strictEqual(normalRes.status, 200)
  const afterNormal = (await pool.query('SELECT last_activity_at FROM sessions WHERE id = $1', [sessionId])).rows[0]
  assert.ok(afterNormal.last_activity_at.getTime() > beforeRow.last_activity_at.getTime(),
    'a genuine request must refresh last_activity_at')
})

test('logging out revokes the session - the same token is rejected on the next request', async () => {
  const user = await createTestUser('owner')
  const sessionId = await createTestSessionId(pool, user.id)
  const token = tokenFor(user, sessionId)

  const before = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${token}` })
  assert.strictEqual(before.status, 200)

  const logoutRes = await request('POST', '/api/auth/logout', undefined, { Authorization: `Bearer ${token}` })
  assert.strictEqual(logoutRes.status, 200)

  const after1 = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${token}` })
  assert.strictEqual(after1.status, 401)
  assert.strictEqual(after1.data.code, 'SESSION_EXPIRED')
  assert.strictEqual(after1.data.reason, 'revoked')
})

test('a request with no sessionId at all is rejected', async () => {
  const user = await createTestUser('owner')
  const token = jwt.sign({ id: user.id, username: user.username, role: 'owner', tokenVersion: user.token_version }, JWT_SECRET, { expiresIn: '1h' })
  const res = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${token}` })
  assert.strictEqual(res.status, 401)
  assert.strictEqual(res.data.code, 'SESSION_EXPIRED')
  assert.strictEqual(res.data.reason, 'not_found')
})

test('GET /api/auth/session-config exposes the configured timeouts, publicly', async () => {
  const res = await request('GET', '/api/auth/session-config')
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.idleTimeoutMinutes, sessionConfig.idleTimeoutMinutes)
  assert.strictEqual(res.data.idleWarningSeconds, sessionConfig.idleWarningSeconds)
  assert.strictEqual(res.data.maxSessionHours, sessionConfig.maxSessionHours)
  assert.strictEqual(res.data.graceSeconds, sessionConfig.graceSeconds)
})

test('a real login creates a session, and the issued token/session work end to end', async () => {
  const username = `admin-session-login-test-${Date.now()}`
  const bcrypt = require('bcrypt')
  const hash = await bcrypt.hash('a-strong-test-password', 4)
  const roleRow = (await pool.query(`SELECT id FROM roles WHERE name = 'owner'`)).rows[0]
  const userResult = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, $2, $3, TRUE, FALSE) RETURNING id`,
    [username, hash, roleRow.id]
  )
  testUserIds.push(userResult.rows[0].id)

  const loginRes = await request('POST', '/api/auth/login', { username, password: 'a-strong-test-password' })
  assert.strictEqual(loginRes.status, 200)
  assert.ok(loginRes.data.token)
  assert.ok(loginRes.data.issuedAt)

  const meRes = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${loginRes.data.token}` })
  assert.strictEqual(meRes.status, 200)
  assert.strictEqual(meRes.data.username, username)

  const decoded = jwt.decode(loginRes.data.token)
  assert.ok(decoded.sessionId)
  const sessionRow = (await pool.query('SELECT * FROM sessions WHERE id = $1', [decoded.sessionId])).rows[0]
  assert.ok(sessionRow, 'login must create a real sessions row')
  assert.strictEqual(sessionRow.user_id, userResult.rows[0].id)

  const logoutRes = await request('POST', '/api/auth/logout', undefined, { Authorization: `Bearer ${loginRes.data.token}` })
  assert.strictEqual(logoutRes.status, 200)
  const afterLogout = await request('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${loginRes.data.token}` })
  assert.strictEqual(afterLogout.status, 401)
})

after(async () => {
  await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [testUserIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
