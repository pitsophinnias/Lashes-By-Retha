const jwt = require('jsonwebtoken')
const { pool } = require('./db')
const { checkAndTouchSession } = require('./src/sessions/store')
const { logSecurityEvent, SEVERITY } = require('./src/security/events')

const isProd = process.env.NODE_ENV === 'production'
let JWT_SECRET = process.env.JWT_SECRET

if (isProd) {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('JWT_SECRET is required in production and must be at least 32 characters.')
    process.exit(1)
  }
} else if (!JWT_SECRET) {
  JWT_SECRET = 'hbh-dev-secret-not-for-production'
  console.warn('JWT_SECRET not set - using an insecure development-only fallback.')
}

// Loads the user fresh from the database on every request instead of
// trusting the token's own claims - a role change, a deactivation, or a
// "log out everywhere" (which bumps token_version) all take effect on the
// user's very next request, rather than waiting for their token to expire
// up to 8 hours later. req.user.role always comes from this lookup, never
// from the token.
const authenticate = async (req, res, next) => {
  const header = req.headers['authorization']
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  const token = header.split(' ')[1]
  let decoded
  try {
    decoded = jwt.verify(token, JWT_SECRET)
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.is_active, u.token_version, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [decoded.id]
    )
    const user = result.rows[0]
    if (user && !user.is_active) {
      logSecurityEvent({
        type: 'deactivated_access', severity: SEVERITY.WARNING, ip: req.ip,
        identifier: user.username, route: `${req.method} ${req.path}`,
        details: 'A deactivated account tried to use an existing session',
      })
    }
    if (!user || !user.is_active || user.token_version !== decoded.tokenVersion) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    // Idle-timeout / max-session-age, enforced on top of the JWT's own
    // (much longer) expiry - see src/sessions/store.js. A request marked
    // X-Background: 1 (polling, background checks) is still checked, but
    // never counts as the activity that keeps a session alive.
    const background = req.headers['x-background'] === '1'
    const sessionResult = await checkAndTouchSession(decoded.sessionId, { background })
    if (!sessionResult.ok) {
      return res.status(401).json({ code: 'SESSION_EXPIRED', reason: sessionResult.reason })
    }

    req.user = { id: user.id, username: user.username, role: user.role }
    req.sessionId = decoded.sessionId
    next()
  } catch (err) {
    console.error('Authentication lookup failed:', err.message)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
  if (!roles.includes(req.user.role)) {
    logSecurityEvent({
      type: 'forbidden_admin_access', severity: SEVERITY.WARNING, ip: req.ip,
      identifier: req.user.username, route: `${req.method} ${req.path}`,
      details: `Role "${req.user.role}" is not allowed (needs one of: ${roles.join(', ')})`,
    })
    return res.status(403).json({ error: 'Insufficient permissions' })
  }
  next()
}

module.exports = { authenticate, requireRole, JWT_SECRET }
