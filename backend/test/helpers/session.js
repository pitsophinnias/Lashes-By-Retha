// authenticate() now also enforces idle/max-session-age via a sessions
// row looked up by the token's own sessionId claim (see
// backend/src/sessions/store.js) - a token signed directly in a test,
// without going through POST /api/auth/login, needs a real row behind
// that claim too, or every request made with it is rejected as
// SESSION_EXPIRED/not_found before the route handler ever runs.
const createTestSessionId = async (pool, userId) => {
  const result = await pool.query('INSERT INTO sessions (user_id) VALUES ($1) RETURNING id', [userId])
  return result.rows[0].id
}

module.exports = { createTestSessionId }
