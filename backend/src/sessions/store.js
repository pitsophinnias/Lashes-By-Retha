const { pool } = require('../../db')
const config = require('./config')

const createSession = async (userId, req) => {
  const result = await pool.query(
    `INSERT INTO sessions (user_id, user_agent, ip_address) VALUES ($1, $2, $3) RETURNING id, issued_at`,
    [userId, (req?.headers?.['user-agent'] || '').slice(0, 255) || null, req?.ip || null]
  )
  return result.rows[0]
}

// The one place idle-timeout and max-session-age are enforced. Called on
// every authenticated request (see backend/auth.js) - a session that's
// been idle too long, or has existed too long regardless of activity, is
// rejected here even if its JWT signature and tokenVersion are still
// valid. `background: true` (set from the X-Background request header)
// skips the last_activity_at update, so polling or automated background
// checks can never keep an otherwise-idle session alive.
const checkAndTouchSession = async (sessionId, { background } = {}) => {
  if (!sessionId) return { ok: false, reason: 'not_found' }
  const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId])
  const session = result.rows[0]
  if (!session) return { ok: false, reason: 'not_found' }
  if (session.revoked_at) return { ok: false, reason: 'revoked' }

  const now = Date.now()
  const issuedAt = new Date(session.issued_at).getTime()
  const lastActivityAt = new Date(session.last_activity_at).getTime()

  if (now - issuedAt > config.maxSessionMs + config.graceMs) {
    return { ok: false, reason: 'max_age' }
  }
  if (now - lastActivityAt > config.idleTimeoutMs + config.graceMs) {
    return { ok: false, reason: 'idle' }
  }

  if (!background) {
    await pool.query('UPDATE sessions SET last_activity_at = NOW() WHERE id = $1', [sessionId])
  }
  return { ok: true }
}

const revokeSession = async (sessionId) => {
  if (!sessionId) return
  await pool.query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL', [sessionId])
}

// Every session for a user, revoked or not - used by "log out everywhere"
// alongside the existing token_version bump, so already-idle-checked
// requests are rejected immediately rather than waiting for their own
// idle/max-age window to lapse naturally.
const revokeAllSessionsForUser = async (userId) => {
  await pool.query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId])
}

// Housekeeping only - a session row is meaningless once both the user's
// token_version and this table's own idle/max-age rules would reject it
// long before 30 days are up. Mirrors cleanupErrorLog's shape.
const cleanupSessions = async () => {
  try {
    await pool.query(`DELETE FROM sessions WHERE issued_at < NOW() - INTERVAL '30 days'`)
  } catch (err) {
    console.error('Session cleanup error:', err.message)
  }
}

module.exports = { createSession, checkAndTouchSession, revokeSession, revokeAllSessionsForUser, cleanupSessions }
