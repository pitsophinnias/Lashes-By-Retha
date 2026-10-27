const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')
dotenv.config()

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { authenticate, requireRole, JWT_SECRET } = require('./auth')

const { pool, createTables } = require('./db')

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

// ── CORS — only allow known frontend origins ────────────────────────────────
const allowedOrigins = [
  ...(isProd ? [] : ['http://localhost:5273', 'http://localhost:5274']),
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
]

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS blocked: ${origin}`))
  },
}))

app.use(express.json({ limit: '1mb' }))

// ── Rate limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/api/health' || (req.method === 'GET' && req.path.startsWith('/uploads')),
})
app.use(globalLimiter)

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
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TYPE_DIRS[req.params.type] || UPLOAD_DIR)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const base = req.params.type === 'gallery'
      ? `gallery-${Date.now()}`
      : `${req.params.type}-${req.params.id || Date.now()}`
    cb(null, `${base}${ext}`)
  }
})

const fileFilter = (req, file, cb) => {
  const allowedImages = ['.jpg', '.jpeg', '.png', '.webp']
  const allowedVideos = ['.mp4', '.mov', '.webm']
  const ext = path.extname(file.originalname).toLowerCase()
  if ([...allowedImages, ...allowedVideos].includes(ext)) cb(null, true)
  else cb(new Error('Only image and video files are allowed'), false)
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } })

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
// Classes are a static list on the frontend (CLASSES), so class_id is just
// the matching id from that list, not a foreign key.
app.get('/api/classes/:classId/students', authenticate, requireRole('sysadmin', 'owner'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM students WHERE class_id = $1 ORDER BY enrolled_at DESC',
      [req.params.classId]
    )
    res.json(result.rows.map(s => ({
      id: s.id, classId: s.class_id, name: s.name, whatsapp: s.whatsapp,
      paymentStatus: s.payment_status, notes: s.notes, enrolledAt: s.enrolled_at,
    })))
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
      `INSERT INTO students (class_id, name, whatsapp, payment_status, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.classId, name.trim(), whatsapp.trim(), paymentStatus || 'unpaid', notes || '']
    )
    const s = result.rows[0]
    await addNotification('section', 'New student enrolled', `${s.name} was added to a Lash Training class.`)
    res.status(201).json({
      id: s.id, classId: s.class_id, name: s.name, whatsapp: s.whatsapp,
      paymentStatus: s.payment_status, notes: s.notes, enrolledAt: s.enrolled_at,
    })
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
    const s = result.rows[0]
    res.json({
      id: s.id, classId: s.class_id, name: s.name, whatsapp: s.whatsapp,
      paymentStatus: s.payment_status, notes: s.notes, enrolledAt: s.enrolled_at,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update student' })
  }
})

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

// ── Orders ────────────────────────────────────────────────────────────────────
// Public: the customer site has no login and must be able to place orders.
app.post('/api/orders', ordersLimiter, async (req, res) => {
  const {
    customerName, customerPhone, items, fulfilmentMethod,
    deliveryAddress, deliverySuburb, deliveryCity, deliveryPostalCode, deliveryNotes,
  } = req.body
  if (!customerName || !customerPhone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (!['delivery', 'pickup'].includes(fulfilmentMethod)) {
    return res.status(400).json({ error: 'Please choose delivery or pickup.' })
  }
  if (fulfilmentMethod === 'delivery' &&
      (!deliveryAddress?.trim() || !deliverySuburb?.trim() || !deliveryCity?.trim() || !deliveryPostalCode?.trim())) {
    return res.status(400).json({ error: 'Please complete your delivery address.' })
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

    const orderResult = await pool.query(
      `INSERT INTO orders (
         customer_name, customer_phone, total, fulfilment_method, subtotal, delivery_fee,
         delivery_address, delivery_suburb, delivery_city, delivery_postal_code, delivery_notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        customerName, customerPhone, total, fulfilmentMethod, subtotal, deliveryFee,
        fulfilmentMethod === 'delivery' ? deliveryAddress.trim() : null,
        fulfilmentMethod === 'delivery' ? deliverySuburb.trim() : null,
        fulfilmentMethod === 'delivery' ? deliveryCity.trim() : null,
        fulfilmentMethod === 'delivery' ? deliveryPostalCode.trim() : null,
        fulfilmentMethod === 'delivery' ? ((deliveryNotes || '').trim() || null) : null,
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
    res.status(201).json({ success: true, orderId: order.id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save order' })
  }
})

app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const ordersResult = await pool.query(
      'SELECT * FROM orders ORDER BY created_at DESC'
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
      order.customerName = order.customer_name
      order.customerPhone = order.customer_phone
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
    }
    res.json(orders)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch orders' })
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
  const dir = TYPE_DIRS[type]
  if (dir) {
    // Remove any previous file(s) for this id so a replacement upload with a
    // different extension can't leave the old image as the one still served.
    findFilesForId(dir, type, id)
      .filter(f => f !== req.file.filename)
      .forEach(f => { try { fs.unlinkSync(path.join(dir, f)) } catch {} })
  }
  const url = `/uploads/${type}/${req.file.filename}`
  await addNotification('image', 'Image uploaded',
    `A new image was uploaded for ${type} (id: ${id}).`)
  res.json({ success: true, url })
})

app.post('/api/upload/gallery', authenticate, requireRole('sysadmin', 'owner'), upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const ext = path.extname(req.file.filename).toLowerCase()
  const videoExts = ['.mp4', '.mov', '.webm']
  const fileType = videoExts.includes(ext) ? 'video' : 'image'
  const url = `/uploads/gallery/${req.file.filename}`
  try {
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
    res.json(result.rows.map(r => ({ filename: r.filename, url: r.url, type: r.type })))
  } catch {
    res.json([])
  }
})

app.get('/api/upload/:type/:id', (req, res) => {
  const { type, id } = req.params
  const dir = type === 'products' ? PRODUCT_DIR : type === 'classes' ? CLASS_DIR : null
  if (!dir) return res.status(400).json({ error: 'Invalid type' })
  try {
    const [match] = findFilesForId(dir, type, id)
    if (match) res.json({ url: `/uploads/${type}/${match}` })
    else res.json({ url: null })
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

// ── CORS error handler ──────────────────────────────────────────────────────
// Without this, a blocked origin falls through to Express's default handler
// and comes back as an unhandled 500.
app.use((err, req, res, next) => {
  if (err.message?.startsWith('CORS blocked')) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }
  next(err)
})

// ── Start server ──────────────────────────────────────────────────────────────
const start = async () => {
  await createTables()
  await archiveOldNotifications()
  await addNotification('system', 'Dashboard ready', 'Hair By Her admin dashboard is live and running.')
  app.listen(PORT, () => {
    console.log(`Lashes By Retha backend listening on port ${PORT}`)
  })
}

start()
