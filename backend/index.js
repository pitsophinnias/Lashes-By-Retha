const express = require('express')
const cors = require('cors')
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

app.use(cors())
app.use(express.json())

// ── Upload directories ────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads')
const PRODUCT_DIR = path.join(UPLOAD_DIR, 'products')
const CLASS_DIR = path.join(UPLOAD_DIR, 'classes')
const GALLERY_DIR = path.join(UPLOAD_DIR, 'gallery')

;[UPLOAD_DIR, PRODUCT_DIR, CLASS_DIR, GALLERY_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.params.type
    const dirs = { products: PRODUCT_DIR, classes: CLASS_DIR, gallery: GALLERY_DIR }
    cb(null, dirs[type] || UPLOAD_DIR)
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
app.post('/api/auth/login', async (req, res) => {
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

// ── Orders ────────────────────────────────────────────────────────────────────
app.post('/api/orders', authenticate, async (req, res) => {
  const { customerName, customerPhone, items, total } = req.body
  if (!customerName || !customerPhone || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  try {
    const orderResult = await pool.query(
      'INSERT INTO orders (customer_name, customer_phone, total) VALUES ($1, $2, $3) RETURNING *',
      [customerName, customerPhone, total]
    )
    const order = orderResult.rows[0]
    for (const item of items) {
      await pool.query(
        'INSERT INTO order_items (order_id, product_id, product_name, qty, price) VALUES ($1, $2, $3, $4, $5)',
        [order.id, item.id, item.name, item.qty, item.price]
      )
    }
    await addNotification('order', 'New order received',
      `${customerName} placed an order for ${items.length} item${items.length !== 1 ? 's' : ''} totalling R${total}.`)
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
      }))
      order.customerName = order.customer_name
      order.customerPhone = order.customer_phone
      order.createdAt = order.created_at
    }
    res.json(orders)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch orders' })
  }
})

app.patch('/api/orders/:id/confirm', authenticate, async (req, res) => {
  const id = parseInt(req.params.id)
  try {
    const result = await pool.query(
      "UPDATE orders SET status = 'confirmed' WHERE id = $1 RETURNING *",
      [id]
    )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Order not found' })
    const order = result.rows[0]
    await addNotification('order', 'Order confirmed',
      `Order #${id} for ${order.customer_name} has been marked as confirmed.`)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to confirm order' })
  }
})

// ── Image uploads ─────────────────────────────────────────────────────────────
app.post('/api/upload/:type/:id', authenticate, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const url = `/uploads/${req.params.type}/${req.file.filename}`
  await addNotification('image', 'Image uploaded',
    `A new image was uploaded for ${req.params.type} (id: ${req.params.id}).`)
  res.json({ success: true, url })
})

app.post('/api/upload/gallery', authenticate, upload.single('image'), async (req, res) => {
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
  const dirs = { products: PRODUCT_DIR, classes: CLASS_DIR }
  const dir = dirs[type]
  if (!dir) return res.status(400).json({ error: 'Invalid type' })
  try {
    const files = fs.readdirSync(dir)
    const match = files.find(f => f.startsWith(`${type}-${id}`))
    if (match) res.json({ url: `/uploads/${type}/${match}` })
    else res.json({ url: null })
  } catch {
    res.json({ url: null })
  }
})

// ── Image positions ───────────────────────────────────────────────────────────
app.post('/api/position/:type/:id', authenticate, async (req, res) => {
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

// ── Start server ──────────────────────────────────────────────────────────────
const start = async () => {
  await createTables()
  await addNotification('system', 'Dashboard ready', 'Hair By Her admin dashboard is live and running.')
  app.listen(PORT, () => {
    console.log(`Lashes By Retha backend listening on port ${PORT}`)
  })
}

start()
