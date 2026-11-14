const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const dotenv = require('dotenv')
dotenv.config()

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { authenticate, requireRole, JWT_SECRET } = require('./auth')

const { pool, createTables } = require('./db')
const { cloudinary, isCloudinaryEnabled, uploadBuffer } = require('./cloudinary')
const ozow = require('./ozow')
const payflex = require('./payflex')
const { normaliseSaPhone } = require('./phone')
const siteSettingsDefaults = require('./src/siteSettings/defaults')
const {
  ValidationError: SiteSettingsValidationError,
  validateAndMergeContent,
  validateAndMergeTheme,
  fillMissingWithDefaults,
  contentFieldSpec,
} = require('./src/siteSettings/schema')
const {
  SITE_SETTINGS_KEYS,
  siteSettingsRolesForKey,
  saveSiteSetting,
} = require('./src/siteSettings/store')

const app = express()
const PORT = process.env.PORT || 3002
const isProd = process.env.NODE_ENV === 'production'

// Flat courier fee for a delivery order. The one place this is defined -
// orders always get their fee computed here, never from the browser.
const DELIVERY_FEE = 120

// Render sits in front of this app as a reverse proxy - trust its
// X-Forwarded-For header so rate limiting sees the real visitor IP.
app.set('trust proxy', 1)

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // product/gallery images load on the customer site
}))

// ── Rate limiting ────────────────────────────────────────────────────────────
// Defined before the Ozow routes below, which need globalLimiter at
// registration time.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/api/health' || (req.method === 'GET' && req.path.startsWith('/uploads')),
})

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many failed login attempts. Please try again later.' },
})

const ordersLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many orders from this address. Please try again later.' },
})

const enrolmentsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many enrolments from this address. Please try again later.' },
})

// ── Ozow return & notify ─────────────────────────────────────────────────────
// Mounted before the CORS middleware below: Ozow's browser redirects come
// from https://pay.ozow.com and its server-to-server notifications may carry
// no or odd Origin headers, so these two paths must never hit the CORS check.
const ozowFormParser = express.urlencoded({ extended: false, limit: '100kb' })

// Caps how long we wait for reconcileOzowPayment before redirecting the
// customer back to the shop - the redirect itself is never proof of payment,
// this is just so the browser doesn't hang if Ozow's status API is slow.
const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(resolve, ms)),
])

// A payment row belongs to either an order or a student (training
// enrolment) - looks up whichever public token it resolves to, and which
// query param name the customer site expects it back under. whereClause
// must reference the payment row as "p".
async function lookupPublicToken(table, whereClause, params) {
  const result = await pool.query(
    `SELECT o.public_token AS order_token, s.public_token AS student_token
     FROM ${table} p
     LEFT JOIN orders o ON o.id = p.order_id
     LEFT JOIN students s ON s.id = p.student_id
     WHERE ${whereClause}`,
    params
  )
  const row = result.rows[0]
  if (row?.order_token) return { param: 'order', token: row.order_token }
  if (row?.student_token) return { param: 'enrolment', token: row.student_token }
  return null
}

const handleOzowReturn = async (req, res) => {
  const { outcome } = req.params
  if (!['success', 'cancel', 'error'].includes(outcome)) return res.status(404).end()

  const reference = (req.body && req.body.TransactionReference) || req.query.TransactionReference
  let resolved = null

  if (reference) {
    await withTimeout(ozow.reconcileOzowPayment(reference), 5000)
    try {
      resolved = await lookupPublicToken('ozow_payments', 'p.transaction_reference = $1', [reference])
    } catch (err) {
      console.error('Ozow return lookup failed:', err.message)
    }
  }

  const redirectOutcome = resolved ? outcome : 'error'
  const redirectUrl = new URL(`${ozow.CUSTOMER_SITE_URL || 'http://localhost'}/`)
  redirectUrl.searchParams.set('payment', redirectOutcome)
  if (resolved) redirectUrl.searchParams.set(resolved.param, resolved.token)
  res.redirect(303, redirectUrl.toString())
}

app.get('/api/payments/ozow/return/:outcome', globalLimiter, handleOzowReturn)
app.post('/api/payments/ozow/return/:outcome', globalLimiter, ozowFormParser, handleOzowReturn)

app.post('/api/payments/ozow/notify', globalLimiter, ozowFormParser, async (req, res) => {
  if (!ozow.isOzowConfigured) return res.status(503).end()
  const body = req.body || {}

  if (String(body.SiteCode) !== String(ozow.OZOW_SITE_CODE)) {
    console.warn('Ozow notify: site code mismatch')
    return res.status(400).json({ error: 'Invalid notification' })
  }
  if (!ozow.verifyResponseHash(body, ozow.OZOW_PRIVATE_KEY)) {
    console.warn('Ozow notify: hash verification failed')
    return res.status(400).json({ error: 'Invalid notification' })
  }

  console.log(`Ozow notify received: ${body.TransactionReference} ${body.Status}`)

  try {
    await pool.query(
      'UPDATE ozow_payments SET raw_notification = $1, updated_at = NOW() WHERE transaction_reference = $2',
      [JSON.stringify(body), body.TransactionReference]
    )
  } catch (err) {
    console.error('Failed to store Ozow notification:', err.message)
  }

  // A verified notification (SiteCode and hash already checked above) is
  // proof on its own - passed through as a fallback for when the status API
  // has no match yet (e.g. a test transaction not queryable on the live API).
  await ozow.reconcileOzowPayment(body.TransactionReference, body)
  res.status(200).send('OK')
})

// ── Payflex return & callback ─────────────────────────────────────────────────
// Mounted before CORS, same reasoning as the Ozow routes above: Payflex's
// browser redirects and server-to-server callback must never hit the CORS check.
const payflexJsonParser = express.json({ limit: '100kb' })

const handlePayflexReturn = async (req, res) => {
  const { outcome } = req.params
  if (!['confirm', 'cancel'].includes(outcome)) return res.status(404).end()

  const source = req.method === 'POST' ? (req.body || {}) : req.query
  const identifier = source.orderId || source.merchantReference
  let resolved = null

  if (identifier) {
    await withTimeout(payflex.reconcilePayflexPayment(identifier), 5000)
    try {
      resolved = await lookupPublicToken(
        'payflex_payments',
        'p.merchant_reference = $1 OR p.payflex_order_id = $1',
        [identifier]
      )
    } catch (err) {
      console.error('Payflex return lookup failed:', err.message)
    }
  }

  const redirectOutcome = resolved ? outcome : 'error'
  const redirectUrl = new URL(`${payflex.CUSTOMER_SITE_URL || 'http://localhost'}/`)
  redirectUrl.searchParams.set('payment', redirectOutcome)
  if (resolved) redirectUrl.searchParams.set(resolved.param, resolved.token)
  res.redirect(303, redirectUrl.toString())
}

app.get('/api/payments/payflex/return/:outcome', globalLimiter, handlePayflexReturn)
app.post('/api/payments/payflex/return/:outcome', globalLimiter, payflexJsonParser, handlePayflexReturn)

app.post('/api/payments/payflex/callback', globalLimiter, payflexJsonParser, async (req, res) => {
  if (!payflex.isPayflexConfigured) return res.status(503).end()
  const body = req.body || {}
  // Never trust this body for status - it's only used to find which payment
  // attempt to re-check against Payflex's own GET /order/{orderId}.
  const identifier = body.orderId || body.merchantReference
  if (identifier) {
    await payflex.reconcilePayflexPayment(identifier)
  }
  res.status(200).send('OK')
})

// ── CORS — only allow known frontend origins ────────────────────────────────
// ALLOWED_ORIGINS entries can pick up stray whitespace, quotes or a trailing
// slash when set through a hosting dashboard - clean each one so a valid
// origin doesn't fail CORS just because it doesn't match byte-for-byte.
const cleanOrigin = (origin) => origin.trim().replace(/^['"]|['"]$/g, '').trim().replace(/\/+$/, '')

const allowedOrigins = [
  ...(isProd ? [] : ['http://localhost:5273', 'http://localhost:5274']),
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(cleanOrigin).filter(Boolean)
    : []),
]

if (isProd) {
  console.log('Allowed CORS origins:', allowedOrigins.join(', ') || '(none configured)')
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS blocked: ${origin}`))
  },
}))

app.use(express.json({ limit: '1mb' }))
app.use(globalLimiter)

// ── Upload directories ────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads')
const PRODUCT_DIR = path.join(UPLOAD_DIR, 'products')
const CLASS_DIR = path.join(UPLOAD_DIR, 'classes')
const GALLERY_DIR = path.join(UPLOAD_DIR, 'gallery')

;[UPLOAD_DIR, PRODUCT_DIR, CLASS_DIR, GALLERY_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

const TYPE_DIRS = { products: PRODUCT_DIR, classes: CLASS_DIR, gallery: GALLERY_DIR }

// Matches only the exact type-id with any extension (e.g. "products-2.jpg"),
// never a prefix collision like "products-1" matching "products-10.jpg".
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const findFilesForId = (dir, type, id) => {
  const pattern = new RegExp(`^${escapeRegExp(type)}-${escapeRegExp(id)}\\.[a-zA-Z0-9]+$`)
  return fs.readdirSync(dir).filter(f => pattern.test(f))
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ── Multer ────────────────────────────────────────────────────────────────────
// With Cloudinary configured, files are held in memory and streamed up rather
// than written to Render's disk, which is wiped on every restart or sleep.
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm']

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // /api/upload/gallery has no :type param (unlike /api/upload/:type/:id),
    // so req.params.type is undefined there - treat that as gallery too.
    cb(null, TYPE_DIRS[req.params.type || 'gallery'])
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const base = (req.params.type || 'gallery') === 'gallery'
      ? `gallery-${Date.now()}`
      : `${req.params.type}-${req.params.id || Date.now()}`
    cb(null, `${base}${ext}`)
  }
})

const storage = isCloudinaryEnabled ? multer.memoryStorage() : diskStorage

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase()
  if ([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].includes(ext)) cb(null, true)
  else cb(new Error('Only image and video files are allowed'), false)
}

// Cloudinary's free plan caps images at 10MB and videos at 100MB - the
// multer limit covers the worst case, and checkFileSize below enforces the
// tighter image limit with a friendly message instead of a raw 413.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_VIDEO_BYTES } })

const checkFileSize = (file) => {
  const ext = path.extname(file.originalname).toLowerCase()
  const isVideo = VIDEO_EXTENSIONS.includes(ext)
  const max = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
  if (file.size <= max) return null
  // In local-disk mode, multer has already written the file by the time we
  // can check its size - remove it so a rejected upload doesn't linger.
  if (file.path) { try { fs.unlinkSync(file.path) } catch {} }
  return isVideo ? 'Videos must be smaller than 100MB.' : 'Images must be smaller than 10MB.'
}

// ── Notification helper ───────────────────────────────────────────────────────
const addNotification = async (type, title, message) => {
  try {
    await pool.query(
      'INSERT INTO notifications (type, title, message) VALUES ($1, $2, $3)',
      [type, title, message]
    )
  } catch (err) {
    console.error('Failed to add notification:', err.message)
  }
}

ozow.setNotifier(addNotification)
payflex.setNotifier(addNotification)

// Lash length/curl options, grouped by product id, for attaching to a
// product list response. Pass includeInactive to also return deactivated
// options (used by the admin screen; the public shop never sees them).
const fetchVariantsByProduct = async (includeInactive) => {
  const result = await pool.query(
    includeInactive
      ? 'SELECT * FROM product_variants ORDER BY product_id ASC, length_mm ASC, curl ASC'
      : 'SELECT * FROM product_variants WHERE is_active = TRUE ORDER BY product_id ASC, length_mm ASC, curl ASC'
  )
  const byProduct = {}
  result.rows.forEach(v => {
    if (!byProduct[v.product_id]) byProduct[v.product_id] = []
    byProduct[v.product_id].push({
      id: v.id,
      lengthMm: v.length_mm,
      curl: v.curl,
      stockQuantity: v.stock_quantity,
      lowStockThreshold: v.low_stock_threshold,
      isActive: v.is_active,
    })
  })
  return byProduct
}

const addAuditLog = async (userId, username, action, details, ipAddress) => {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, username, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [userId, username, action, details || null, ipAddress || null]
    )
  } catch (err) {
    console.error('Audit log error:', err.message)
  }
}

// ── Auto-archive notifications older than 7 days ─────────────────────────────
const archiveOldNotifications = async () => {
  try {
    const result = await pool.query(
      `UPDATE notifications SET archived = TRUE
       WHERE archived = FALSE
       AND created_at < NOW() - INTERVAL '7 days'`
    )
    if (result.rowCount > 0) {
      console.log(`Archived ${result.rowCount} old notifications`)
    }
  } catch (err) {
    console.error('Archive error:', err.message)
  }
}

setInterval(archiveOldNotifications, 60 * 60 * 1000)

// ── Auto-archive orders older than 7 days ────────────────────────────────────
// A paid-but-unconfirmed order is never archived - Retha still has to pack
// it. It archives once it's confirmed and old enough, same as any other order.
const archiveOldOrders = async () => {
  try {
    const result = await pool.query(
      `UPDATE orders SET archived = TRUE, archived_at = NOW()
       WHERE archived = FALSE
       AND created_at < NOW() - INTERVAL '7 days'
       AND NOT (payment_status = 'paid' AND status <> 'confirmed')`
    )
    if (result.rowCount > 0) {
      console.log(`Archived ${result.rowCount} old orders`)
    }
  } catch (err) {
    console.error('Order archive error:', err.message)
  }
}

setInterval(archiveOldOrders, 60 * 60 * 1000)

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', project: 'Lashes By Retha' })
})

// ── Auth ──────────────────────────────────────────────────────────────────────
// Login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' })
  }
  try {
    const result = await pool.query(
      `SELECT u.*, r.name as role_name FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.username = $1 AND u.is_active = TRUE`,
      [username]
    )
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }
    const user = result.rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      await addAuditLog(user.id, user.username, 'LOGIN_FAILED', 'Invalid password', req.ip)
      return res.status(401).json({ error: 'Invalid username or password' })
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role_name },
      JWT_SECRET,
      { expiresIn: '8h' }
    )
    await addAuditLog(user.id, user.username, 'LOGIN', 'Successful login', req.ip)
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role_name,
        must_change_password: user.must_change_password,
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Get current user
app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.must_change_password, r.name as role
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [req.user.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// Change password
app.post('/api/auth/change-password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' })
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    const user = result.rows[0]
    if (current_password) {
      const valid = await bcrypt.compare(current_password, user.password_hash)
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })
    }
    const hash = await bcrypt.hash(new_password, 12)
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
      [hash, req.user.id]
    )
    await addAuditLog(req.user.id, req.user.username, 'PASSWORD_CHANGED', 'User changed their password', req.ip)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' })
  }
})

// Get all users (sysadmin and owner only)
app.get('/api/users', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.is_active, u.must_change_password,
              u.created_at, r.name as role
       FROM users u JOIN roles r ON r.id = u.role_id
       ORDER BY u.created_at DESC`
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Create user (sysadmin: any role, owner: staff only)
app.post('/api/users', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const { username, email, password, role_name } = req.body
  if (!username || !password || !role_name) {
    return res.status(400).json({ error: 'Username, password and role are required' })
  }
  // Owner can only create staff
  if (req.user.role === 'owner' && role_name !== 'staff') {
    return res.status(403).json({ error: 'Owners can only create staff users' })
  }
  try {
    const roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', [role_name])
    if (roleResult.rows.length === 0) return res.status(400).json({ error: 'Invalid role' })
    const hash = await bcrypt.hash(password, 12)
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role_id, must_change_password, created_by)
       VALUES ($1, $2, $3, $4, TRUE, $5) RETURNING id, username, email`,
      [username, email || null, hash, roleResult.rows[0].id, req.user.id]
    )
    await addAuditLog(req.user.id, req.user.username, 'USER_CREATED',
      `Created user "${username}" with role "${role_name}"`, req.ip)
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Username already exists' })
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Update user (sysadmin only for role changes, owner can deactivate staff)
app.patch('/api/users/:id', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const { is_active, role_name, email } = req.body
  const targetId = parseInt(req.params.id)
  try {
    let roleId = null
    if (role_name) {
      if (req.user.role !== 'sysadmin') {
        return res.status(403).json({ error: 'Only sysadmin can change roles' })
      }
      const roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', [role_name])
      if (roleResult.rows.length === 0) return res.status(400).json({ error: 'Invalid role' })
      roleId = roleResult.rows[0].id
    }
    await pool.query(
      `UPDATE users SET
        is_active = COALESCE($1, is_active),
        role_id = COALESCE($2, role_id),
        email = COALESCE($3, email)
       WHERE id = $4`,
      [is_active, roleId, email, targetId]
    )
    await addAuditLog(req.user.id, req.user.username, 'USER_UPDATED',
      `Updated user id ${targetId}`, req.ip)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Reset user password (sysadmin only)
app.post('/api/users/:id/reset-password', authenticate, requireRole('sysadmin'), async (req, res) => {
  const { new_password } = req.body
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }
  try {
    const hash = await bcrypt.hash(new_password, 12)
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE id = $2',
      [hash, req.params.id]
    )
    await addAuditLog(req.user.id, req.user.username, 'PASSWORD_RESET',
      `Reset password for user id ${req.params.id}`, req.ip)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

// Get roles (sysadmin only)
app.get('/api/roles', authenticate, requireRole('sysadmin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM roles ORDER BY id')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch roles' })
  }
})

// Get audit logs (sysadmin only)
app.get('/api/audit-logs', authenticate, requireRole('sysadmin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = 50
    const offset = (page - 1) * limit
    const result = await pool.query(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    )
    const count = await pool.query('SELECT COUNT(*) FROM audit_logs')
    res.json({
      logs: result.rows,
      total: parseInt(count.rows[0].count),
      page,
      pages: Math.ceil(parseInt(count.rows[0].count) / limit)
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs' })
  }
})

// ── Site settings ─────────────────────────────────────────────────────────────
// Lets owner/sysadmin edit the customer site's text (content) and colours/
// fonts (theme) from the admin dashboard, with undo via history. Content can
// be edited by owner and sysadmin; theme is sysadmin only, same split as the
// rest of this file's requireRole() calls.
const requireSiteSettingsRole = (req, res, next) => {
  if (!SITE_SETTINGS_KEYS.includes(req.params.key)) {
    return res.status(400).json({ error: 'Unknown settings key' })
  }
  if (!siteSettingsRolesForKey(req.params.key).includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' })
  }
  next()
}

// Public: the customer site reads its own copy and theme from here.
app.get('/api/site-settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM site_settings')
    const stored = Object.fromEntries(result.rows.map((r) => [r.key, r.value]))
    res.set('Cache-Control', 'public, max-age=60')
    res.json({
      content: fillMissingWithDefaults(stored.content, siteSettingsDefaults.content),
      theme: fillMissingWithDefaults(stored.theme, siteSettingsDefaults.theme),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch site settings' })
  }
})

app.put('/api/admin/site-settings/content', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT value FROM site_settings WHERE key = $1', ['content'])
    const current = rows[0] ? rows[0].value : siteSettingsDefaults.content
    const merged = validateAndMergeContent(current, req.body)
    await saveSiteSetting('content', merged, req.user.id)
    await addAuditLog(req.user.id, req.user.username, 'SITE_SETTINGS_UPDATED', 'Updated site content', req.ip)
    res.json(merged)
  } catch (err) {
    if (err instanceof SiteSettingsValidationError) {
      return res.status(400).json({ error: err.message, field: err.field })
    }
    console.error(err)
    res.status(500).json({ error: 'Failed to update site content' })
  }
})

// Lets the admin's content form build its character counters from the
// backend's own limits, instead of copying them into the frontend by hand.
app.get('/api/admin/site-settings/content/spec', authenticate, requireRole('sysadmin', 'owner'), (req, res) => {
  res.json(contentFieldSpec())
})

app.put('/api/admin/site-settings/theme', authenticate, requireRole('sysadmin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT value FROM site_settings WHERE key = $1', ['theme'])
    const current = rows[0] ? rows[0].value : siteSettingsDefaults.theme
    const merged = validateAndMergeTheme(current, req.body)
    await saveSiteSetting('theme', merged, req.user.id)
    await addAuditLog(req.user.id, req.user.username, 'SITE_SETTINGS_UPDATED', 'Updated site theme', req.ip)
    res.json(merged)
  } catch (err) {
    if (err instanceof SiteSettingsValidationError) {
      return res.status(400).json({ error: err.message, field: err.field })
    }
    console.error(err)
    res.status(500).json({ error: 'Failed to update site theme' })
  }
})

app.get('/api/admin/site-settings/:key/history', authenticate, requireSiteSettingsRole, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT h.id, h.value, h.saved_at, u.username AS saved_by
       FROM site_settings_history h
       LEFT JOIN users u ON u.id = h.saved_by
       WHERE h.key = $1
       ORDER BY h.saved_at DESC
       LIMIT 10`,
      [req.params.key]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch site settings history' })
  }
})

app.post('/api/admin/site-settings/:key/restore/:historyId', authenticate, requireSiteSettingsRole, async (req, res) => {
  const { key, historyId } = req.params
  try {
    const { rows } = await pool.query(
      'SELECT value FROM site_settings_history WHERE id = $1 AND key = $2',
      [historyId, key]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'History entry not found' })
    await saveSiteSetting(key, rows[0].value, req.user.id)
    await addAuditLog(req.user.id, req.user.username, 'SITE_SETTINGS_RESTORED',
      `Restored ${key} from history #${historyId}`, req.ip)
    res.json({ success: true, value: rows[0].value })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to restore site settings' })
  }
})

app.post('/api/admin/site-settings/:key/reset', authenticate, requireSiteSettingsRole, async (req, res) => {
  const { key } = req.params
  try {
    await saveSiteSetting(key, siteSettingsDefaults[key], req.user.id)
    await addAuditLog(req.user.id, req.user.username, 'SITE_SETTINGS_RESET', `Reset ${key} to defaults`, req.ip)
    res.json({ success: true, value: siteSettingsDefaults[key] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to reset site settings' })
  }
})

// ── Products ──────────────────────────────────────────────────────────────────
// Public: active products only, for the customer site.
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, detail, price, badge, stock_quantity, low_stock_threshold
       FROM products WHERE is_active = TRUE ORDER BY id ASC`
    )
    const variantsByProduct = await fetchVariantsByProduct(false)
    res.json(result.rows.map(p => {
      const options = variantsByProduct[p.id] || []
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        detail: p.detail,
        price: parseFloat(p.price),
        badge: p.badge,
        stockQuantity: p.stock_quantity,
        lowStockThreshold: p.low_stock_threshold,
        hasOptions: options.length > 0,
        options,
      }
    }))
  } catch (err) {
    console.error(err)
    res.json([])
  }
})

// Admin: every product, active or not, for the management screen.
app.get('/api/admin/products', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC')
    const variantsByProduct = await fetchVariantsByProduct(true)
    res.json(result.rows.map(p => {
      const options = variantsByProduct[p.id] || []
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        detail: p.detail,
        price: parseFloat(p.price),
        badge: p.badge,
        stockQuantity: p.stock_quantity,
        lowStockThreshold: p.low_stock_threshold,
        isActive: p.is_active,
        hasOptions: options.length > 0,
        options,
      }
    }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

app.post('/api/admin/products', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const { name, description, detail, price, badge, stockQuantity, lowStockThreshold } = req.body
  if (!name || !name.trim() || price === undefined || price === null || price === '') {
    return res.status(400).json({ error: 'Name and price are required' })
  }
  try {
    const result = await pool.query(
      `INSERT INTO products (name, description, detail, price, badge, stock_quantity, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        name.trim(),
        description || '',
        detail || '',
        parseFloat(price),
        badge || null,
        parseInt(stockQuantity) || 0,
        parseInt(lowStockThreshold) || 3,
      ]
    )
    const p = result.rows[0]
    await addNotification('section', 'Product added', `"${p.name}" was added to the shop.`)
    res.status(201).json({
      id: p.id, name: p.name, description: p.description, detail: p.detail,
      price: parseFloat(p.price), badge: p.badge, stockQuantity: p.stock_quantity,
      lowStockThreshold: p.low_stock_threshold, isActive: p.is_active,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create product' })
  }
})

// Edit a product. Never deletes - is_active is the only way to remove one
// from the shop, because old orders still refer to this id.
app.patch('/api/admin/products/:id', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const id = parseInt(req.params.id)
  try {
    const existingResult = await pool.query('SELECT * FROM products WHERE id = $1', [id])
    if (existingResult.rows.length === 0) return res.status(404).json({ error: 'Product not found' })
    const existing = existingResult.rows[0]
    const { name, description, detail, price, badge, lowStockThreshold, isActive } = req.body

    const merged = {
      name: name !== undefined ? name : existing.name,
      description: description !== undefined ? description : existing.description,
      detail: detail !== undefined ? detail : existing.detail,
      price: price !== undefined && price !== '' ? parseFloat(price) : existing.price,
      badge: badge !== undefined ? (badge || null) : existing.badge,
      low_stock_threshold: lowStockThreshold !== undefined && lowStockThreshold !== ''
        ? parseInt(lowStockThreshold) : existing.low_stock_threshold,
      is_active: isActive !== undefined ? !!isActive : existing.is_active,
    }

    const result = await pool.query(
      `UPDATE products SET name=$1, description=$2, detail=$3, price=$4, badge=$5,
        low_stock_threshold=$6, is_active=$7, updated_at = NOW() WHERE id = $8 RETURNING *`,
      [merged.name, merged.description, merged.detail, merged.price, merged.badge,
       merged.low_stock_threshold, merged.is_active, id]
    )
    const p = result.rows[0]
    if (existing.is_active && !p.is_active) {
      await addNotification('section', 'Product deactivated', `"${p.name}" was deactivated and removed from the shop.`)
    }
    res.json({
      id: p.id, name: p.name, description: p.description, detail: p.detail,
      price: parseFloat(p.price), badge: p.badge, stockQuantity: p.stock_quantity,
      lowStockThreshold: p.low_stock_threshold, isActive: p.is_active,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update product' })
  }
})

// Adjust stock outside of a sale (restock or a manual correction). Every
// change is recorded in stock_movements for a full history.
app.post('/api/admin/products/:id/stock', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const id = parseInt(req.params.id)
  const { change, reason, note } = req.body
  const delta = parseInt(change)
  if (!delta || isNaN(delta)) {
    return res.status(400).json({ error: 'A non-zero stock change is required' })
  }
  if (!['restock', 'adjustment'].includes(reason)) {
    return res.status(400).json({ error: 'Reason must be "restock" or "adjustment"' })
  }
  try {
    const existingResult = await pool.query('SELECT * FROM products WHERE id = $1', [id])
    if (existingResult.rows.length === 0) return res.status(404).json({ error: 'Product not found' })
    const existing = existingResult.rows[0]
    const newStock = Math.max(0, existing.stock_quantity + delta)
    const result = await pool.query(
      'UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [newStock, id]
    )
    await pool.query(
      'INSERT INTO stock_movements (product_id, change, reason, user_id, note) VALUES ($1, $2, $3, $4, $5)',
      [id, newStock - existing.stock_quantity, reason, req.user.id, note || null]
    )
    const p = result.rows[0]
    res.json({ id: p.id, stockQuantity: p.stock_quantity })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to adjust stock' })
  }
})

// Same as above, but for one lash length/curl option rather than the whole
// product.
app.post('/api/admin/products/:productId/variants/:variantId/stock', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const productId = parseInt(req.params.productId)
  const variantId = parseInt(req.params.variantId)
  const { change, reason, note } = req.body
  const delta = parseInt(change)
  if (!delta || isNaN(delta)) {
    return res.status(400).json({ error: 'A non-zero stock change is required' })
  }
  if (!['restock', 'adjustment'].includes(reason)) {
    return res.status(400).json({ error: 'Reason must be "restock" or "adjustment"' })
  }
  try {
    const existingResult = await pool.query(
      'SELECT * FROM product_variants WHERE id = $1 AND product_id = $2', [variantId, productId]
    )
    if (existingResult.rows.length === 0) return res.status(404).json({ error: 'Option not found' })
    const existing = existingResult.rows[0]
    const newStock = Math.max(0, existing.stock_quantity + delta)
    const result = await pool.query(
      'UPDATE product_variants SET stock_quantity = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [newStock, variantId]
    )
    await pool.query(
      'INSERT INTO stock_movements (product_id, variant_id, change, reason, user_id, note) VALUES ($1, $2, $3, $4, $5, $6)',
      [productId, variantId, newStock - existing.stock_quantity, reason, req.user.id, note || null]
    )
    const v = result.rows[0]
    res.json({ id: v.id, stockQuantity: v.stock_quantity })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to adjust stock' })
  }
})

// ── Students ──────────────────────────────────────────────────────────────────
// Classes are a static list on the frontend (CLASSES), backed by the courses
// table now - class_id matches a courses.id, not a foreign key, so an
// unrecognised id just means course/balance come back null.
const getCourse = async (classId) => {
  const result = await pool.query('SELECT * FROM courses WHERE id = $1', [classId])
  return result.rows[0] || null
}

const serializeStudent = (s, course) => {
  const amountPaid = parseFloat(s.amount_paid || 0)
  const price = course ? parseFloat(course.price) : null
  return {
    id: s.id, classId: s.class_id, name: s.name, whatsapp: s.whatsapp, email: s.email,
    preferredStartDate: s.preferred_start_date,
    paymentStatus: s.payment_status, notes: s.notes, enrolledAt: s.enrolled_at,
    status: s.status, completedAt: s.completed_at,
    amountPaid, balance: price !== null ? Math.max(0, price - amountPaid) : null,
    source: s.source, publicToken: s.public_token,
  }
}

app.get('/api/classes/:classId/students', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  try {
    const course = await getCourse(req.params.classId)
    const result = await pool.query(
      'SELECT * FROM students WHERE class_id = $1 ORDER BY enrolled_at DESC',
      [req.params.classId]
    )
    res.json(result.rows.map(s => serializeStudent(s, course)))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch students' })
  }
})

app.post('/api/classes/:classId/students', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const { name, whatsapp, paymentStatus, notes } = req.body
  if (!name || !name.trim() || !whatsapp || !whatsapp.trim()) {
    return res.status(400).json({ error: 'Name and WhatsApp number are required' })
  }
  try {
    const result = await pool.query(
      `INSERT INTO students (class_id, name, whatsapp, payment_status, notes, status, source)
       VALUES ($1, $2, $3, $4, $5, 'active', 'admin') RETURNING *`,
      [req.params.classId, name.trim(), whatsapp.trim(), paymentStatus || 'unpaid', notes || '']
    )
    const s = result.rows[0]
    await addNotification('section', 'New student enrolled', `${s.name} was added to a Lash Training class.`)
    const course = await getCourse(req.params.classId)
    res.status(201).json(serializeStudent(s, course))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to add student' })
  }
})

app.patch('/api/classes/:classId/students/:studentId', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const { paymentStatus, notes } = req.body
  try {
    const result = await pool.query(
      `UPDATE students SET payment_status = COALESCE($1, payment_status),
       notes = COALESCE($2, notes)
       WHERE id = $3 AND class_id = $4 RETURNING *`,
      [paymentStatus, notes, req.params.studentId, req.params.classId]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found' })
    const course = await getCourse(req.params.classId)
    res.json(serializeStudent(result.rows[0], course))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update student' })
  }
})

// Lets Retha delete an "awaiting payment" enrolment that never completed -
// these aren't current students, but they're still rows in the same table.
app.delete('/api/classes/:classId/students/:studentId', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM students WHERE id = $1 AND class_id = $2 RETURNING id',
      [req.params.studentId, req.params.classId]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to remove student' })
  }
})

// Admin-added students never get a public_token at creation (orders/website
// enrolments do) - this creates one on first use, so "Copy balance link"
// always has something to copy.
app.post('/api/classes/:classId/students/:studentId/ensure-token', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT public_token FROM students WHERE id = $1 AND class_id = $2',
      [req.params.studentId, req.params.classId]
    )
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Student not found' })
    let token = existing.rows[0].public_token
    if (!token) {
      token = crypto.randomBytes(24).toString('hex')
      await pool.query('UPDATE students SET public_token = $1 WHERE id = $2', [token, req.params.studentId])
    }
    const siteUrl = ozow.CUSTOMER_SITE_URL || payflex.CUSTOMER_SITE_URL || ''
    res.json({ token, link: `${siteUrl}/?enrolment=${token}` })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to generate link' })
  }
})

// Marks a student as having finished the course, so they move from Current
// students to Past students without losing their history.
app.patch('/api/classes/:classId/students/:studentId/complete', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE students SET status = 'completed', completed_at = NOW()
       WHERE id = $1 AND class_id = $2 RETURNING *`,
      [req.params.studentId, req.params.classId]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found' })
    const course = await getCourse(req.params.classId)
    res.json(serializeStudent(result.rows[0], course))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to mark student as finished' })
  }
})

// Undoes a mistaken "Finished course" - moves the student back to Current students.
app.patch('/api/classes/:classId/students/:studentId/reactivate', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE students SET status = 'active', completed_at = NULL
       WHERE id = $1 AND class_id = $2 RETURNING *`,
      [req.params.studentId, req.params.classId]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found' })
    const course = await getCourse(req.params.classId)
    res.json(serializeStudent(result.rows[0], course))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to move student back to current students' })
  }
})

// ── Orders ────────────────────────────────────────────────────────────────────
// Public: the customer site has no login and must be able to place orders.
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())

// Training runs Tuesday to Saturday (same days as pickup) - a preferred
// start date must be one of those days and strictly in the future, in SA's
// own timezone rather than the server's.
function isValidFutureCourseDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  // Built from the string's own year/month/day at UTC midnight, not by
  // parsing "+02:00" - that would shift the instant back into the previous
  // UTC day and get this calendar date's weekday wrong.
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (isNaN(date.getTime())) return false
  const nowSAST = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const todaySAST = new Date(Date.UTC(nowSAST.getUTCFullYear(), nowSAST.getUTCMonth(), nowSAST.getUTCDate()))
  if (date <= todaySAST) return false
  const dayOfWeek = date.getUTCDay() // 0 Sun .. 6 Sat
  return dayOfWeek >= 2 && dayOfWeek <= 6 // Tuesday to Saturday
}

// ── Courses ───────────────────────────────────────────────────────────────────
app.get('/api/courses', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM courses WHERE is_active = TRUE ORDER BY id ASC')
    res.json(result.rows.map(c => ({
      id: c.id, name: c.name, durationDays: c.duration_days,
      price: parseFloat(c.price), deposit: parseFloat(c.deposit),
    })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch courses' })
  }
})

// ── Dashboard calendar ────────────────────────────────────────────────────────
// Training start dates and orders placed in a given month, for the admin
// dashboard's business calendar. One call instead of the dashboard fetching
// every class's students plus every order just to find what falls in a month.
app.get('/api/dashboard/calendar', authenticate, requireRole('sysadmin', 'owner', 'staff'), async (req, res) => {
  const month = req.query.month
  if (!/^\d{4}-\d{2}$/.test(month || '')) {
    return res.status(400).json({ error: 'month must be in YYYY-MM format' })
  }
  const [year, mon] = month.split('-').map(Number)
  const start = new Date(year, mon - 1, 1)
  const end = new Date(year, mon, 1)
  try {
    const studentsResult = await pool.query(
      `SELECT s.id, s.class_id, s.name, s.status, s.preferred_start_date, s.amount_paid,
              c.name AS course_name, c.price AS course_price
       FROM students s
       LEFT JOIN courses c ON c.id = s.class_id
       WHERE s.status IN ('active', 'awaiting_payment')
         AND s.preferred_start_date >= $1 AND s.preferred_start_date < $2
       ORDER BY s.preferred_start_date ASC`,
      [start, end]
    )
    // Students' payment amounts are owner/sysadmin only everywhere else
    // (classes/:id/students denies staff outright) - staff get whether a
    // balance is owed, never the figure itself.
    const isStaff = req.user.role === 'staff'
    const students = studentsResult.rows.map(s => {
      const amountPaid = parseFloat(s.amount_paid || 0)
      const price = s.course_price !== null ? parseFloat(s.course_price) : null
      const balance = price !== null ? Math.max(0, price - amountPaid) : null
      return {
        id: s.id,
        classId: s.class_id,
        courseName: s.course_name,
        name: s.name,
        status: s.status,
        preferredStartDate: s.preferred_start_date,
        hasBalance: balance !== null && balance > 0,
        balance: isStaff ? null : balance,
      }
    })

    const ordersResult = await pool.query(
      `SELECT id, customer_name, total, status, payment_status, created_at
       FROM orders
       WHERE created_at >= $1 AND created_at < $2
       ORDER BY created_at ASC`,
      [start, end]
    )
    const orders = ordersResult.rows.map(o => ({
      id: o.id,
      customerName: o.customer_name,
      total: parseFloat(o.total),
      status: o.status,
      paymentStatus: o.payment_status,
      createdAt: o.created_at,
      needsConfirmation: o.payment_status === 'paid' && o.status !== 'confirmed',
    }))

    res.json({ students, orders })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch calendar data' })
  }
})

app.post('/api/orders', ordersLimiter, async (req, res) => {
  const {
    customerName, customerPhone, customerEmail, items, fulfilmentMethod, paymentMethod,
    deliveryAddress, deliverySuburb, deliveryCity, deliveryPostalCode, deliveryNotes,
  } = req.body
  if (!customerName || !customerPhone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  const normalisedPhone = normaliseSaPhone(customerPhone)
  if (!normalisedPhone) {
    return res.status(400).json({
      error: "We're only able to serve customers in South Africa for now, so please use a South African number, for example 082 123 4567."
    })
  }
  if (!['delivery', 'pickup'].includes(fulfilmentMethod)) {
    return res.status(400).json({ error: 'Please choose delivery or pickup.' })
  }
  if (fulfilmentMethod === 'delivery' &&
      (!deliveryAddress?.trim() || !deliverySuburb?.trim() || !deliveryCity?.trim() || !deliveryPostalCode?.trim())) {
    return res.status(400).json({ error: 'Please complete your delivery address.' })
  }
  if (!['ozow', 'payflex'].includes(paymentMethod)) {
    return res.status(400).json({ error: "We're only able to take online payments at the moment." })
  }
  const isPaymentMethodConfigured = paymentMethod === 'ozow' ? ozow.isOzowConfigured : payflex.isPayflexConfigured
  if (!isPaymentMethodConfigured) {
    return res.status(503).json({
      error: "Online payments are taking a short break. Please message us on WhatsApp at 082 685 5399 and we'll gladly help you place your order."
    })
  }
  if (paymentMethod === 'payflex' && !isValidEmail(customerEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address to pay with Payflex.' })
  }
  try {
    // Look up every product server-side - price and total are never trusted
    // from the browser, and unknown or inactive products are rejected.
    const productIds = items.map(i => parseInt(i.id)).filter(n => !isNaN(n))
    const productResult = productIds.length
      ? await pool.query('SELECT * FROM products WHERE id = ANY($1)', [productIds])
      : { rows: [] }
    const productsById = {}
    productResult.rows.forEach(p => { productsById[p.id] = p })

    // A product with lash length/curl options requires a valid, active,
    // in-stock option; a product without any never looks at variantId.
    const variantResult = productIds.length
      ? await pool.query('SELECT * FROM product_variants WHERE product_id = ANY($1)', [productIds])
      : { rows: [] }
    const variantsByProduct = {}
    variantResult.rows.forEach(v => {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = []
      variantsByProduct[v.product_id].push(v)
    })

    const orderItems = []
    let subtotal = 0
    for (const item of items) {
      const product = productsById[parseInt(item.id)]
      if (!product || !product.is_active) {
        return res.status(400).json({
          error: `"${item.name || 'One of the items in your cart'}" is no longer available. Please remove it and try again.`
        })
      }
      const qty = parseInt(item.qty)
      if (!qty || qty <= 0) {
        return res.status(400).json({ error: 'Invalid quantity' })
      }

      const productVariants = variantsByProduct[product.id] || []
      let variant = null
      if (productVariants.length > 0) {
        variant = productVariants.find(v => v.id === parseInt(item.variantId))
        if (!variant || !variant.is_active) {
          return res.status(400).json({
            error: `Please choose a length for "${product.name}" before adding it to your cart.`
          })
        }
        if (qty > variant.stock_quantity) {
          return res.status(400).json({
            error: `Only ${variant.stock_quantity} left of "${product.name}" in ${variant.length_mm}mm, ${variant.curl} curl. Please lower the quantity.`
          })
        }
      }

      const price = parseFloat(product.price)
      subtotal += price * qty
      orderItems.push({
        productId: product.id,
        name: product.name,
        qty,
        price,
        variantId: variant ? variant.id : null,
        lengthMm: variant ? variant.length_mm : null,
        curl: variant ? variant.curl : null,
      })
    }

    const deliveryFee = fulfilmentMethod === 'delivery' ? DELIVERY_FEE : 0
    const total = subtotal + deliveryFee
    const publicToken = crypto.randomBytes(24).toString('hex')

    const orderResult = await pool.query(
      `INSERT INTO orders (
         customer_name, customer_phone, customer_email, total, fulfilment_method, subtotal, delivery_fee,
         delivery_address, delivery_suburb, delivery_city, delivery_postal_code, delivery_notes,
         payment_method, public_token
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        customerName, normalisedPhone, (customerEmail || '').trim() || null, total, fulfilmentMethod, subtotal, deliveryFee,
        fulfilmentMethod === 'delivery' ? deliveryAddress.trim() : null,
        fulfilmentMethod === 'delivery' ? deliverySuburb.trim() : null,
        fulfilmentMethod === 'delivery' ? deliveryCity.trim() : null,
        fulfilmentMethod === 'delivery' ? deliveryPostalCode.trim() : null,
        fulfilmentMethod === 'delivery' ? ((deliveryNotes || '').trim() || null) : null,
        paymentMethod, publicToken,
      ]
    )
    const order = orderResult.rows[0]
    for (const item of orderItems) {
      await pool.query(
        `INSERT INTO order_items (order_id, product_id, product_name, qty, price, variant_id, length_mm, curl)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [order.id, item.productId, item.name, item.qty, item.price, item.variantId, item.lengthMm, item.curl]
      )
    }
    await addNotification('order', 'New order received',
      `${customerName} placed a ${fulfilmentMethod} order for ${orderItems.length} item${orderItems.length !== 1 ? 's' : ''} totalling R${total}.`)
    console.log('New order:', order.id)
    res.status(201).json({ success: true, orderId: order.id, orderToken: order.public_token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save order' })
  }
})

app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const view = ['active', 'archived'].includes(req.query.view) ? req.query.view : 'all'
    const ordersResult = await pool.query(
      view === 'active' ? 'SELECT * FROM orders WHERE archived = FALSE ORDER BY created_at DESC'
        : view === 'archived' ? 'SELECT * FROM orders WHERE archived = TRUE ORDER BY created_at DESC'
        : 'SELECT * FROM orders ORDER BY created_at DESC'
    )
    const orders = ordersResult.rows
    for (const order of orders) {
      const itemsResult = await pool.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [order.id]
      )
      order.items = itemsResult.rows.map(i => ({
        id: i.product_id,
        name: i.product_name,
        qty: i.qty,
        price: parseFloat(i.price),
        variantId: i.variant_id,
        lengthMm: i.length_mm,
        curl: i.curl,
      }))
      const latestOzowResult = await pool.query(
        'SELECT ozow_transaction_id, status FROM ozow_payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
        [order.id]
      )
      const latestOzow = latestOzowResult.rows[0]
      const latestPayflexResult = await pool.query(
        'SELECT payflex_order_id, status FROM payflex_payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
        [order.id]
      )
      const latestPayflex = latestPayflexResult.rows[0]
      order.customerName = order.customer_name
      order.customerPhone = order.customer_phone
      order.customerEmail = order.customer_email
      order.createdAt = order.created_at
      order.total = parseFloat(order.total)
      order.fulfilmentMethod = order.fulfilment_method
      order.subtotal = order.subtotal !== null ? parseFloat(order.subtotal) : null
      order.deliveryFee = order.delivery_fee !== null ? parseFloat(order.delivery_fee) : null
      order.deliveryAddress = order.delivery_address
      order.deliverySuburb = order.delivery_suburb
      order.deliveryCity = order.delivery_city
      order.deliveryPostalCode = order.delivery_postal_code
      order.deliveryNotes = order.delivery_notes
      order.paymentMethod = order.payment_method
      order.paymentStatus = order.payment_status
      order.paidAt = order.paid_at
      order.ozowTransactionId = latestOzow ? latestOzow.ozow_transaction_id : null
      order.ozowStatus = latestOzow ? latestOzow.status : null
      order.payflexOrderId = latestPayflex ? latestPayflex.payflex_order_id : null
      order.payflexStatus = latestPayflex ? latestPayflex.status : null
      order.archivedAt = order.archived_at
    }
    res.json(orders)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch orders' })
  }
})

// ── Ozow payments ─────────────────────────────────────────────────────────────
app.get('/api/payments/options', async (req, res) => {
  const payflexOptions = { enabled: payflex.isPayflexConfigured, minimumAmount: null, maximumAmount: null }
  if (payflex.isPayflexConfigured) {
    try {
      const config = await payflex.getConfiguration()
      if (config) {
        payflexOptions.minimumAmount = config.minimumAmount
        payflexOptions.maximumAmount = config.maximumAmount
      }
    } catch (err) {
      console.error('Failed to fetch Payflex configuration:', err.message)
    }
  }
  res.json({ ozow: ozow.isOzowConfigured, payflex: payflexOptions })
})

app.post('/api/payments/ozow/start', ordersLimiter, async (req, res) => {
  if (!ozow.isOzowConfigured) {
    return res.status(503).json({ error: 'Ozow payments are not available right now.' })
  }
  const { orderToken } = req.body
  if (!orderToken) return res.status(400).json({ error: 'Missing order token' })
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE public_token = $1', [orderToken])
    const order = orderResult.rows[0]
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.payment_method !== 'ozow') {
      return res.status(400).json({ error: 'This order is not set up for Ozow payment.' })
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'This order has already been paid.' })
    }
    if (order.status === 'confirmed') {
      return res.status(400).json({ error: 'This order has already been confirmed.' })
    }

    const { transactionReference, amountStr, fields } = ozow.buildOzowFields(order.id, order.total)
    await pool.query(
      `INSERT INTO ozow_payments (order_id, transaction_reference, amount, status, is_test)
       VALUES ($1, $2, $3, 'started', $4)`,
      [order.id, transactionReference, amountStr, ozow.OZOW_IS_TEST]
    )
    res.json({ action: 'https://pay.ozow.com/', fields })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to start Ozow payment' })
  }
})

app.post('/api/payments/payflex/start', ordersLimiter, async (req, res) => {
  if (!payflex.isPayflexConfigured) {
    return res.status(503).json({ error: 'Payflex payments are not available right now.' })
  }
  const { orderToken } = req.body
  if (!orderToken) return res.status(400).json({ error: 'Missing order token' })
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE public_token = $1', [orderToken])
    const order = orderResult.rows[0]
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.payment_method !== 'payflex') {
      return res.status(400).json({ error: 'This order is not set up for Payflex payment.' })
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'This order has already been paid.' })
    }
    if (order.status === 'confirmed') {
      return res.status(400).json({ error: 'This order has already been confirmed.' })
    }

    const config = await payflex.getConfiguration()
    const total = parseFloat(order.total)
    if (!payflex.isAmountWithinRange(total, config)) {
      return res.status(400).json({
        error: `Payflex is only available for orders between R${config.minimumAmount} and R${config.maximumAmount}.`
      })
    }

    const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id])
    const merchantReference = payflex.generateMerchantReference(order.id)
    const payflexOrder = await payflex.createPayflexOrder({
      orderId: order.id,
      amount: total,
      shippingAmount: order.delivery_fee || 0,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      email: order.customer_email,
      merchantReference,
      items: itemsResult.rows.map(i => ({
        name: i.product_name,
        sku: i.product_id,
        quantity: i.qty,
        price: i.price,
      })),
    })

    await pool.query(
      `INSERT INTO payflex_payments (order_id, merchant_reference, payflex_order_id, amount, status)
       VALUES ($1, $2, $3, $4, 'started')`,
      [order.id, merchantReference, payflexOrder.payflexOrderId, total.toFixed(2)]
    )
    res.json({ redirectUrl: payflexOrder.redirectUrl })
  } catch (err) {
    console.error('Failed to start Payflex payment:', err.message)
    res.status(500).json({ error: 'Failed to start Payflex payment' })
  }
})

// In-memory maps of orderId -> last reconcile check timestamp, so a customer
// refreshing the result page repeatedly can't hammer either provider's status API.
const lastOzowCheck = new Map()
const lastPayflexCheck = new Map()

app.get('/api/orders/by-token/:token', async (req, res) => {
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE public_token = $1', [req.params.token])
    let order = orderResult.rows[0]
    if (!order) return res.status(404).json({ error: 'Order not found' })

    if (ozow.isOzowConfigured && order.payment_method === 'ozow' &&
        ['unpaid', 'pending'].includes(order.payment_status)) {
      const latestPaymentResult = await pool.query(
        'SELECT * FROM ozow_payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
        [order.id]
      )
      const latestPayment = latestPaymentResult.rows[0]
      const isRecent = latestPayment && (Date.now() - new Date(latestPayment.created_at).getTime()) < 24 * 60 * 60 * 1000
      const lastCheck = lastOzowCheck.get(order.id) || 0
      if (latestPayment && isRecent && Date.now() - lastCheck > 30000) {
        lastOzowCheck.set(order.id, Date.now())
        await ozow.reconcileOzowPayment(latestPayment.transaction_reference)
        const refreshed = await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])
        order = refreshed.rows[0]
      }
    }

    if (payflex.isPayflexConfigured && order.payment_method === 'payflex' &&
        ['unpaid', 'pending'].includes(order.payment_status)) {
      const latestPaymentResult = await pool.query(
        'SELECT * FROM payflex_payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
        [order.id]
      )
      const latestPayment = latestPaymentResult.rows[0]
      const isRecent = latestPayment && (Date.now() - new Date(latestPayment.created_at).getTime()) < 24 * 60 * 60 * 1000
      const lastCheck = lastPayflexCheck.get(order.id) || 0
      if (latestPayment && isRecent && Date.now() - lastCheck > 30000) {
        lastPayflexCheck.set(order.id, Date.now())
        await payflex.reconcilePayflexPayment(latestPayment.merchant_reference)
        const refreshed = await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])
        order = refreshed.rows[0]
      }
    }

    const latestOzowResult = await pool.query(
      'SELECT ozow_transaction_id, status FROM ozow_payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [order.id]
    )
    const latestOzow = latestOzowResult.rows[0]
    const latestPayflexResult = await pool.query(
      'SELECT payflex_order_id, status FROM payflex_payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [order.id]
    )
    const latestPayflex = latestPayflexResult.rows[0]

    res.json({
      id: order.id,
      total: parseFloat(order.total),
      fulfilmentMethod: order.fulfilment_method,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      status: order.status,
      ozowTransactionId: latestOzow ? latestOzow.ozow_transaction_id : null,
      ozowStatus: latestOzow ? latestOzow.status : null,
      payflexOrderId: latestPayflex ? latestPayflex.payflex_order_id : null,
      payflexStatus: latestPayflex ? latestPayflex.status : null,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch order' })
  }
})

app.patch('/api/orders/:token/switch-to-eft', async (req, res) => {
  res.status(410).json({ error: 'Paying by EFT is no longer available. Please try paying again online.' })
})

// Lets a customer switch an unpaid, unconfirmed order to the other online
// payment provider - e.g. after Ozow was cancelled, try Payflex instead.
app.patch('/api/orders/:token/switch-provider', async (req, res) => {
  const { provider } = req.body
  if (!['ozow', 'payflex'].includes(provider)) {
    return res.status(400).json({ error: 'Please choose Ozow or Payflex.' })
  }
  const isProviderConfigured = provider === 'ozow' ? ozow.isOzowConfigured : payflex.isPayflexConfigured
  if (!isProviderConfigured) {
    return res.status(503).json({ error: 'That payment method is not available right now.' })
  }
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE public_token = $1', [req.params.token])
    const order = orderResult.rows[0]
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'This order has already been paid.' })
    }
    if (order.status === 'confirmed') {
      return res.status(400).json({ error: 'This order has already been confirmed.' })
    }
    if (provider === 'payflex' && !isValidEmail(order.customer_email)) {
      return res.status(400).json({ error: 'Please provide a valid email address to pay with Payflex.' })
    }
    await pool.query(
      `UPDATE orders SET payment_method = $1, payment_status = 'unpaid' WHERE id = $2`,
      [provider, order.id]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to switch payment method' })
  }
})

// ── Training enrolment ───────────────────────────────────────────────────────
app.post('/api/enrolments', enrolmentsLimiter, async (req, res) => {
  const { courseId, name, phone, email, preferredStartDate, paymentOption } = req.body
  if (!name || !name.trim() || !phone || !email || !preferredStartDate || !paymentOption) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  const normalisedPhone = normaliseSaPhone(phone)
  if (!normalisedPhone) {
    return res.status(400).json({
      error: "We're only able to serve customers in South Africa for now, so please use a South African number, for example 082 123 4567."
    })
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' })
  }
  if (!['deposit_ozow', 'full_ozow', 'full_payflex'].includes(paymentOption)) {
    return res.status(400).json({ error: 'Please choose how you would like to pay.' })
  }
  if (!isValidFutureCourseDate(preferredStartDate)) {
    return res.status(400).json({ error: 'Please choose a future Tuesday to Saturday date for your preferred start.' })
  }
  const provider = paymentOption === 'full_payflex' ? 'payflex' : 'ozow'
  const isProviderConfigured = provider === 'ozow' ? ozow.isOzowConfigured : payflex.isPayflexConfigured
  if (!isProviderConfigured) {
    return res.status(503).json({
      error: "Online payments are taking a short break. Please message us on WhatsApp at 082 685 5399 and we'll gladly help you enrol."
    })
  }
  try {
    const course = await getCourse(courseId)
    if (!course || !course.is_active) {
      return res.status(400).json({ error: 'Please choose a course.' })
    }
    const amount = paymentOption === 'deposit_ozow' ? parseFloat(course.deposit) : parseFloat(course.price)

    if (provider === 'payflex') {
      const config = await payflex.getConfiguration()
      if (!payflex.isAmountWithinRange(amount, config)) {
        return res.status(400).json({
          error: `Payflex is only available for amounts between R${config.minimumAmount} and R${config.maximumAmount}.`
        })
      }
    }

    const publicToken = crypto.randomBytes(24).toString('hex')
    const studentResult = await pool.query(
      `INSERT INTO students (class_id, name, whatsapp, email, preferred_start_date, payment_status, status, public_token, source)
       VALUES ($1, $2, $3, $4, $5, 'unpaid', 'awaiting_payment', $6, 'website') RETURNING *`,
      [course.id, name.trim(), normalisedPhone, email.trim(), preferredStartDate, publicToken]
    )
    const student = studentResult.rows[0]

    if (provider === 'ozow') {
      const { transactionReference, amountStr, fields } = ozow.buildOzowFields(student.id, amount, {
        bankReferenceLabel: `HBH Training ${student.id}`,
      })
      await pool.query(
        `INSERT INTO ozow_payments (student_id, transaction_reference, amount, status, is_test, purpose)
         VALUES ($1, $2, $3, 'started', $4, $5)`,
        [student.id, transactionReference, amountStr, ozow.OZOW_IS_TEST, paymentOption === 'deposit_ozow' ? 'deposit' : 'full']
      )
      await addNotification('section', 'New training enrolment',
        `${student.name} started enrolling for ${course.name}.`)
      return res.status(201).json({ success: true, enrolmentToken: publicToken, action: 'https://pay.ozow.com/', fields })
    }

    const merchantReference = payflex.generateMerchantReference(student.id)
    const payflexOrder = await payflex.createPayflexOrder({
      amount,
      description: `Hair By Her training: ${course.name}`,
      customerName: name.trim(),
      customerPhone: normalisedPhone,
      email: email.trim(),
      merchantReference,
      items: [{ name: course.name, sku: course.id, quantity: 1, price: amount }],
    })
    await pool.query(
      `INSERT INTO payflex_payments (student_id, merchant_reference, payflex_order_id, amount, status, purpose)
       VALUES ($1, $2, $3, $4, 'started', 'full')`,
      [student.id, merchantReference, payflexOrder.payflexOrderId, amount.toFixed(2)]
    )
    await addNotification('section', 'New training enrolment',
      `${student.name} started enrolling for ${course.name}.`)
    res.status(201).json({ success: true, enrolmentToken: publicToken, redirectUrl: payflexOrder.redirectUrl })
  } catch (err) {
    console.error('Failed to create enrolment:', err.message)
    res.status(500).json({ error: 'Failed to create enrolment' })
  }
})

app.get('/api/enrolments/by-token/:token', async (req, res) => {
  try {
    const studentResult = await pool.query('SELECT * FROM students WHERE public_token = $1', [req.params.token])
    let student = studentResult.rows[0]
    if (!student) return res.status(404).json({ error: 'Enrolment not found' })

    if (ozow.isOzowConfigured) {
      const latestResult = await pool.query(
        'SELECT * FROM ozow_payments WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1', [student.id]
      )
      const latest = latestResult.rows[0]
      const isRecent = latest && (Date.now() - new Date(latest.created_at).getTime()) < 24 * 60 * 60 * 1000
      const lastCheck = lastOzowCheck.get(`student-${student.id}`) || 0
      if (latest && ['started', 'pending'].includes(latest.status) && isRecent && Date.now() - lastCheck > 30000) {
        lastOzowCheck.set(`student-${student.id}`, Date.now())
        await ozow.reconcileOzowPayment(latest.transaction_reference)
        const refreshed = await pool.query('SELECT * FROM students WHERE id = $1', [student.id])
        student = refreshed.rows[0]
      }
    }

    if (payflex.isPayflexConfigured) {
      const latestResult = await pool.query(
        'SELECT * FROM payflex_payments WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1', [student.id]
      )
      const latest = latestResult.rows[0]
      const isRecent = latest && (Date.now() - new Date(latest.created_at).getTime()) < 24 * 60 * 60 * 1000
      const lastCheck = lastPayflexCheck.get(`student-${student.id}`) || 0
      if (latest && ['started', 'pending'].includes(latest.status) && isRecent && Date.now() - lastCheck > 30000) {
        lastPayflexCheck.set(`student-${student.id}`, Date.now())
        await payflex.reconcilePayflexPayment(latest.merchant_reference)
        const refreshed = await pool.query('SELECT * FROM students WHERE id = $1', [student.id])
        student = refreshed.rows[0]
      }
    }

    const course = await getCourse(student.class_id)
    const price = course ? parseFloat(course.price) : 0
    const amountPaid = parseFloat(student.amount_paid)
    const balance = Math.max(0, price - amountPaid)

    const latestOzowResult = await pool.query(
      'SELECT status FROM ozow_payments WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1', [student.id]
    )
    const latestPayflexResult = await pool.query(
      'SELECT status FROM payflex_payments WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1', [student.id]
    )
    const latestOzowStatus = latestOzowResult.rows[0]?.status || null
    const latestPayflexStatus = latestPayflexResult.rows[0]?.status || null
    const latestIsOzow = latestOzowResult.rows[0] && (!latestPayflexResult.rows[0] ||
      new Date(latestOzowResult.rows[0].created_at) > new Date(latestPayflexResult.rows[0].created_at))

    let payflexAvailableForBalance = false
    if (payflex.isPayflexConfigured && balance > 0) {
      const config = await payflex.getConfiguration()
      payflexAvailableForBalance = payflex.isAmountWithinRange(balance, config)
    }

    res.json({
      courseName: course ? course.name : null,
      price,
      amountPaid,
      balance,
      paymentStatus: student.payment_status,
      status: student.status,
      latestProvider: latestOzowStatus || latestPayflexStatus ? (latestIsOzow ? 'ozow' : 'payflex') : null,
      latestStatus: latestIsOzow ? latestOzowStatus : latestPayflexStatus,
      providers: { ozow: ozow.isOzowConfigured && balance > 0, payflex: payflexAvailableForBalance },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch enrolment' })
  }
})

app.post('/api/enrolments/:token/pay-balance', enrolmentsLimiter, async (req, res) => {
  const { provider } = req.body
  if (!['ozow', 'payflex'].includes(provider)) {
    return res.status(400).json({ error: 'Please choose Ozow or Payflex.' })
  }
  const isProviderConfigured = provider === 'ozow' ? ozow.isOzowConfigured : payflex.isPayflexConfigured
  if (!isProviderConfigured) {
    return res.status(503).json({ error: 'That payment method is not available right now.' })
  }
  try {
    const studentResult = await pool.query('SELECT * FROM students WHERE public_token = $1', [req.params.token])
    const student = studentResult.rows[0]
    if (!student) return res.status(404).json({ error: 'Enrolment not found' })
    const course = await getCourse(student.class_id)
    if (!course) return res.status(400).json({ error: 'Course not found' })
    const balance = parseFloat(course.price) - parseFloat(student.amount_paid)
    if (balance <= 0) {
      return res.status(400).json({ error: 'There is nothing left to pay on this enrolment.' })
    }

    if (provider === 'ozow') {
      const { transactionReference, amountStr, fields } = ozow.buildOzowFields(student.id, balance, {
        bankReferenceLabel: `HBH Balance ${student.id}`,
      })
      await pool.query(
        `INSERT INTO ozow_payments (student_id, transaction_reference, amount, status, is_test, purpose)
         VALUES ($1, $2, $3, 'started', $4, 'balance')`,
        [student.id, transactionReference, amountStr, ozow.OZOW_IS_TEST]
      )
      return res.json({ action: 'https://pay.ozow.com/', fields })
    }

    const config = await payflex.getConfiguration()
    if (!payflex.isAmountWithinRange(balance, config)) {
      return res.status(400).json({
        error: `Payflex is only available for amounts between R${config.minimumAmount} and R${config.maximumAmount}.`
      })
    }
    const merchantReference = payflex.generateMerchantReference(student.id)
    const payflexOrder = await payflex.createPayflexOrder({
      amount: balance,
      description: `Hair By Her training balance: ${course.name}`,
      customerName: student.name,
      customerPhone: student.whatsapp,
      email: student.email,
      merchantReference,
      items: [{ name: `${course.name} balance`, sku: course.id, quantity: 1, price: balance }],
    })
    await pool.query(
      `INSERT INTO payflex_payments (student_id, merchant_reference, payflex_order_id, amount, status, purpose)
       VALUES ($1, $2, $3, $4, 'started', 'balance')`,
      [student.id, merchantReference, payflexOrder.payflexOrderId, balance.toFixed(2)]
    )
    res.json({ redirectUrl: payflexOrder.redirectUrl })
  } catch (err) {
    console.error('Failed to start balance payment:', err.message)
    res.status(500).json({ error: 'Failed to start balance payment' })
  }
})

// Retries the most recent payment attempt exactly as it was (same provider,
// same amount and purpose) - for when a deposit or full-price attempt was
// cancelled or failed, before anything has been paid. Pay-balance above is
// for a *new* balance payment once something already has been.
app.post('/api/enrolments/:token/retry', enrolmentsLimiter, async (req, res) => {
  try {
    const studentResult = await pool.query('SELECT * FROM students WHERE public_token = $1', [req.params.token])
    const student = studentResult.rows[0]
    if (!student) return res.status(404).json({ error: 'Enrolment not found' })

    const [latestOzowResult, latestPayflexResult] = await Promise.all([
      pool.query('SELECT * FROM ozow_payments WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1', [student.id]),
      pool.query('SELECT * FROM payflex_payments WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1', [student.id]),
    ])
    const latestOzow = latestOzowResult.rows[0]
    const latestPayflex = latestPayflexResult.rows[0]
    let latest = null, provider = null
    if (latestOzow && (!latestPayflex || new Date(latestOzow.created_at) > new Date(latestPayflex.created_at))) {
      latest = latestOzow; provider = 'ozow'
    } else if (latestPayflex) {
      latest = latestPayflex; provider = 'payflex'
    }
    if (!latest) return res.status(400).json({ error: 'There is no previous payment to retry.' })
    if (latest.status === 'paid') return res.status(400).json({ error: 'This has already been paid.' })

    const amount = parseFloat(latest.amount)
    const course = await getCourse(student.class_id)

    if (provider === 'ozow') {
      if (!ozow.isOzowConfigured) return res.status(503).json({ error: 'Ozow payments are not available right now.' })
      const { transactionReference, amountStr, fields } = ozow.buildOzowFields(student.id, amount, {
        bankReferenceLabel: `HBH Training ${student.id}`,
      })
      await pool.query(
        `INSERT INTO ozow_payments (student_id, transaction_reference, amount, status, is_test, purpose)
         VALUES ($1, $2, $3, 'started', $4, $5)`,
        [student.id, transactionReference, amountStr, ozow.OZOW_IS_TEST, latest.purpose]
      )
      return res.json({ action: 'https://pay.ozow.com/', fields })
    }

    if (!payflex.isPayflexConfigured) return res.status(503).json({ error: 'Payflex payments are not available right now.' })
    const merchantReference = payflex.generateMerchantReference(student.id)
    const payflexOrder = await payflex.createPayflexOrder({
      amount,
      description: `Hair By Her training: ${course ? course.name : ''}`,
      customerName: student.name,
      customerPhone: student.whatsapp,
      email: student.email,
      merchantReference,
      items: [{ name: course ? course.name : 'Training', sku: student.class_id, quantity: 1, price: amount }],
    })
    await pool.query(
      `INSERT INTO payflex_payments (student_id, merchant_reference, payflex_order_id, amount, status, purpose)
       VALUES ($1, $2, $3, $4, 'started', $5)`,
      [student.id, merchantReference, payflexOrder.payflexOrderId, amount.toFixed(2), latest.purpose]
    )
    res.json({ redirectUrl: payflexOrder.redirectUrl })
  } catch (err) {
    console.error('Failed to retry enrolment payment:', err.message)
    res.status(500).json({ error: 'Failed to retry payment' })
  }
})

// Confirming an order is when stock actually leaves the shelf. Done inside
// one transaction: every item's stock is locked and checked before any of
// it is touched, so a short-on-stock item refuses the whole confirmation
// rather than leaving some products deducted and others not.
app.patch('/api/orders/:id/confirm', authenticate, async (req, res) => {
  const id = parseInt(req.params.id)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id])
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Order not found' })
    }
    const order = orderResult.rows[0]
    if (order.status === 'confirmed') {
      await client.query('ROLLBACK')
      return res.json({ success: true })
    }

    const itemsResult = await client.query('SELECT * FROM order_items WHERE order_id = $1', [id])
    const lowStockCrossed = []

    for (const item of itemsResult.rows) {
      const productResult = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [item.product_id])
      const product = productResult.rows[0]
      if (!product) continue // product no longer exists; nothing to deduct

      if (item.variant_id) {
        // This item was for a specific lash length/curl - stock lives on
        // the option, not the product.
        const variantResult = await client.query('SELECT * FROM product_variants WHERE id = $1 FOR UPDATE', [item.variant_id])
        const variant = variantResult.rows[0]
        if (!variant) continue // option no longer exists; nothing to deduct

        const optionLabel = `${variant.length_mm}mm, ${variant.curl} curl`
        if (variant.stock_quantity < item.qty) {
          await client.query('ROLLBACK')
          return res.status(400).json({
            error: `Not enough stock for "${product.name}" (${optionLabel}) - only ${variant.stock_quantity} left, but this order needs ${item.qty}. Restock before confirming.`
          })
        }

        const newStock = variant.stock_quantity - item.qty
        await client.query('UPDATE product_variants SET stock_quantity = $1, updated_at = NOW() WHERE id = $2', [newStock, variant.id])
        await client.query(
          'INSERT INTO stock_movements (product_id, variant_id, change, reason, order_id, user_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [product.id, variant.id, -item.qty, 'sale', id, req.user.id]
        )
        if (variant.stock_quantity > variant.low_stock_threshold && newStock <= variant.low_stock_threshold) {
          lowStockCrossed.push({ name: `${product.name} ${variant.length_mm}mm ${variant.curl} curl`, stock: newStock })
        }
        continue
      }

      if (product.stock_quantity < item.qty) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          error: `Not enough stock for "${product.name}" - only ${product.stock_quantity} left, but this order needs ${item.qty}. Restock before confirming.`
        })
      }

      const newStock = product.stock_quantity - item.qty
      await client.query('UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2', [newStock, product.id])
      await client.query(
        'INSERT INTO stock_movements (product_id, change, reason, order_id, user_id) VALUES ($1, $2, $3, $4, $5)',
        [product.id, -item.qty, 'sale', id, req.user.id]
      )
      if (product.stock_quantity > product.low_stock_threshold && newStock <= product.low_stock_threshold) {
        lowStockCrossed.push({ name: product.name, stock: newStock })
      }
    }

    await client.query("UPDATE orders SET status = 'confirmed' WHERE id = $1", [id])
    await client.query('COMMIT')

    await addNotification('order', 'Order confirmed',
      `Order #${id} for ${order.customer_name} has been marked as confirmed.`)
    for (const p of lowStockCrossed) {
      await addNotification('stock', 'Low stock',
        `"${p.name}" is running low - only ${p.stock} left.`)
    }
    res.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Failed to confirm order' })
  } finally {
    client.release()
  }
})

// ── Image uploads ─────────────────────────────────────────────────────────────
app.post('/api/upload/:type/:id', authenticate, requireRole('sysadmin', 'owner'), upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const { type, id } = req.params
  if (!TYPE_DIRS[type]) return res.status(400).json({ error: 'Invalid type' })
  const sizeError = checkFileSize(req.file)
  if (sizeError) return res.status(400).json({ error: sizeError })

  try {
    if (isCloudinaryEnabled) {
      const result = await uploadBuffer(req.file.buffer, {
        folder: `hairbyher/${type}`,
        public_id: `${type}-${id}`,
        overwrite: true,
        invalidate: true,
        resource_type: 'auto',
      })
      await pool.query(
        `INSERT INTO media (type, item_id, url, public_id, resource_type, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (type, item_id) DO UPDATE
         SET url = $3, public_id = $4, resource_type = $5, updated_at = NOW()`,
        [type, id, result.secure_url, result.public_id, result.resource_type]
      )
      await addNotification('image', 'Image uploaded', `A new image was uploaded for ${type} (id: ${id}).`)
      return res.json({ success: true, url: result.secure_url })
    }

    // Local disk fallback - remove any previous file(s) for this id so a
    // replacement upload with a different extension can't leave the old
    // image as the one still served.
    const dir = TYPE_DIRS[type]
    findFilesForId(dir, type, id)
      .filter(f => f !== req.file.filename)
      .forEach(f => { try { fs.unlinkSync(path.join(dir, f)) } catch {} })
    const url = `/uploads/${type}/${req.file.filename}`
    await addNotification('image', 'Image uploaded', `A new image was uploaded for ${type} (id: ${id}).`)
    res.json({ success: true, url })
  } catch (err) {
    console.error('Upload failed:', err)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

app.post('/api/upload/gallery', authenticate, requireRole('sysadmin', 'owner'), upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const sizeError = checkFileSize(req.file)
  if (sizeError) return res.status(400).json({ error: sizeError })

  const ext = path.extname(req.file.originalname).toLowerCase()
  const fileType = VIDEO_EXTENSIONS.includes(ext) ? 'video' : 'image'

  try {
    if (isCloudinaryEnabled) {
      const result = await uploadBuffer(req.file.buffer, {
        folder: 'hairbyher/gallery',
        resource_type: 'auto',
      })
      await pool.query(
        'INSERT INTO gallery_images (filename, url, type, public_id) VALUES ($1, $2, $3, $4)',
        [result.public_id, result.secure_url, fileType, result.public_id]
      )
      await addNotification('image', 'Gallery image added', 'A new file was added to the gallery.')
      return res.json({ success: true, url: result.secure_url, type: fileType })
    }

    const url = `/uploads/gallery/${req.file.filename}`
    await pool.query(
      'INSERT INTO gallery_images (filename, url, type) VALUES ($1, $2, $3)',
      [req.file.filename, url, fileType]
    )
    await addNotification('image', 'Gallery image added', 'A new file was added to the gallery.')
    res.json({ success: true, url, type: fileType })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save gallery image' })
  }
})

app.get('/api/gallery', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM gallery_images ORDER BY created_at DESC')
    res.json(result.rows.map(r => ({ id: r.id, filename: r.filename, url: r.url, type: r.type })))
  } catch {
    res.json([])
  }
})

app.delete('/api/gallery/:id', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const { id } = req.params
  try {
    const result = await pool.query('SELECT * FROM gallery_images WHERE id = $1', [id])
    const row = result.rows[0]
    if (!row) return res.status(404).json({ error: 'Gallery item not found' })

    if (isCloudinaryEnabled && row.public_id) {
      await cloudinary.uploader.destroy(row.public_id, {
        resource_type: row.type === 'video' ? 'video' : 'image',
      })
    } else if (!isCloudinaryEnabled) {
      try { fs.unlinkSync(path.join(GALLERY_DIR, row.filename)) } catch {}
    }

    await pool.query('DELETE FROM gallery_images WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    console.error('Failed to delete gallery item:', err)
    res.status(500).json({ error: 'Failed to delete gallery item' })
  }
})

app.get('/api/upload/:type/:id', async (req, res) => {
  const { type, id } = req.params
  if (type !== 'products' && type !== 'classes') return res.status(400).json({ error: 'Invalid type' })
  try {
    if (isCloudinaryEnabled) {
      const result = await pool.query(
        'SELECT url FROM media WHERE type = $1 AND item_id = $2',
        [type, id]
      )
      return res.json({ url: result.rows[0]?.url || null })
    }
    const dir = TYPE_DIRS[type]
    const [match] = findFilesForId(dir, type, id)
    res.json({ url: match ? `/uploads/${type}/${match}` : null })
  } catch {
    res.json({ url: null })
  }
})

// ── Image positions ───────────────────────────────────────────────────────────
app.post('/api/position/:type/:id', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const { type, id } = req.params
  const { position } = req.body
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    return res.status(400).json({ error: 'Invalid position' })
  }
  try {
    await pool.query(
      `INSERT INTO image_positions (type, item_id, x, y)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (type, item_id) DO UPDATE SET x = $3, y = $4`,
      [type, parseInt(id), position.x, position.y]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save position' })
  }
})

app.get('/api/position/:type/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT x, y FROM image_positions WHERE type = $1 AND item_id = $2',
      [req.params.type, parseInt(req.params.id)]
    )
    if (result.rows.length === 0) return res.json({ position: null })
    const { x, y } = result.rows[0]
    res.json({ position: { x: parseFloat(x), y: parseFloat(y) } })
  } catch {
    res.json({ position: null })
  }
})

// ── Categories ────────────────────────────────────────────────────────────────
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY id ASC')
    res.json(result.rows.map(r => ({ id: r.id, name: r.name, createdAt: r.created_at })))
  } catch {
    res.json([])
  }
})

app.post('/api/categories', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const { name } = req.body
  if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required' })
  const trimmed = name.trim()
  try {
    const result = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) RETURNING *',
      [trimmed]
    )
    await addNotification('section', 'Section created',
      `A new product section "${trimmed}" was created.`)
    res.status(201).json({ id: result.rows[0].id, name: result.rows[0].name })
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'A category with that name already exists' })
    res.status(500).json({ error: 'Failed to create category' })
  }
})

app.delete('/api/categories/:id', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const id = parseInt(req.params.id)
  try {
    const catResult = await pool.query('SELECT name FROM categories WHERE id = $1', [id])
    if (catResult.rows.length === 0) return res.status(404).json({ error: 'Category not found' })
    const name = catResult.rows[0].name
    await pool.query('DELETE FROM categories WHERE id = $1', [id])
    await addNotification('section', 'Section removed',
      `The product section "${name}" was removed.`)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete category' })
  }
})

app.get('/api/categories/products/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT product_id, category_id FROM product_categories')
    const map = {}
    result.rows.forEach(r => { map[r.product_id] = r.category_id })
    res.json(map)
  } catch {
    res.json({})
  }
})

app.get('/api/categories/product/:productId', async (req, res) => {
  const pid = parseInt(req.params.productId)
  try {
    const result = await pool.query(
      `SELECT pc.category_id, c.name FROM product_categories pc
       JOIN categories c ON c.id = pc.category_id
       WHERE pc.product_id = $1`,
      [pid]
    )
    if (result.rows.length === 0) return res.json({ categoryId: null, categoryName: null })
    res.json({ categoryId: result.rows[0].category_id, categoryName: result.rows[0].name })
  } catch {
    res.json({ categoryId: null, categoryName: null })
  }
})

app.post('/api/categories/product/:productId', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  const pid = parseInt(req.params.productId)
  const { categoryId } = req.body
  try {
    if (!categoryId) {
      await pool.query('DELETE FROM product_categories WHERE product_id = $1', [pid])
      return res.json({ success: true, message: 'Product removed from category' })
    }
    await pool.query(
      `INSERT INTO product_categories (product_id, category_id)
       VALUES ($1, $2)
       ON CONFLICT (product_id) DO UPDATE SET category_id = $2`,
      [pid, categoryId]
    )
    const catResult = await pool.query('SELECT name FROM categories WHERE id = $1', [categoryId])
    res.json({ success: true, categoryId, categoryName: catResult.rows[0]?.name })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to assign category' })
  }
})

// ── Notifications ─────────────────────────────────────────────────────────────
app.get('/api/notifications/archived', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE archived = TRUE ORDER BY created_at DESC LIMIT 100'
    )
    res.json(result.rows.map(r => ({
      id: r.id, type: r.type, title: r.title,
      message: r.message, read: r.read, createdAt: r.created_at
    })))
  } catch {
    res.json([])
  }
})

app.get('/api/notifications/unread-count', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE read = FALSE AND archived = FALSE'
    )
    res.json({ count: parseInt(result.rows[0].count) })
  } catch {
    res.json({ count: 0 })
  }
})

app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE archived = FALSE ORDER BY created_at DESC LIMIT 50'
    )
    res.json(result.rows.map(r => ({
      id: r.id, type: r.type, title: r.title,
      message: r.message, read: r.read, createdAt: r.created_at
    })))
  } catch {
    res.json([])
  }
})

app.patch('/api/notifications/read-all', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = TRUE WHERE archived = FALSE')
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to mark all read' })
  }
})

app.patch('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = TRUE WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to mark read' })
  }
})

// ── CORS / upload error handler ──────────────────────────────────────────────
// Without this, a blocked origin or an oversized upload falls through to
// Express's default handler and comes back as an unhandled 500.
app.use((err, req, res, next) => {
  if (err.message?.startsWith('CORS blocked')) {
    console.error(err.message)
    return res.status(403).json({ error: 'Origin not allowed' })
  }
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File is too large. Videos must be under 100MB, images under 10MB.' })
  }
  if (err.message === 'Only image and video files are allowed') {
    return res.status(400).json({ error: err.message })
  }
  next(err)
})

// ── Start server ──────────────────────────────────────────────────────────────
let server
const start = async () => {
  await createTables()
  await archiveOldNotifications()
  await archiveOldOrders()
  server = app.listen(PORT, () => {
    console.log(`Lashes By Retha backend listening on port ${PORT}`)
  })
}

start()

// Exposed only so tests can close the listening server cleanly - nothing in
// the app itself reads these exports.
module.exports = { app, getServer: () => server }
