const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'hbh-secret-key-change-in-production'

const authenticate = (req, res, next) => {
  const header = req.headers['authorization']
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  const token = header.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' })
  }
  next()
}

module.exports = { authenticate, requireRole, JWT_SECRET }
