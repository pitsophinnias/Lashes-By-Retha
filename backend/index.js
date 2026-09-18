const express = require('express')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')
dotenv.config()

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

// ── Orders ────────────────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
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

app.get('/api/orders', async (req, res) => {
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

app.patch('/api/orders/:id/confirm', async (req, res) => {
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
app.post('/api/upload/:type/:id', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const url = `/uploads/${req.params.type}/${req.file.filename}`
  await addNotification('image', 'Image uploaded',
    `A new image was uploaded for ${req.params.type} (id: ${req.params.id}).`)
  res.json({ success: true, url })
})

app.post('/api/upload/gallery', upload.single('image'), async (req, res) => {
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
app.post('/api/position/:type/:id', async (req, res) => {
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

app.post('/api/categories', async (req, res) => {
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

app.delete('/api/categories/:id', async (req, res) => {
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

app.post('/api/categories/product/:productId', async (req, res) => {
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
app.get('/api/notifications/archived', async (req, res) => {
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

app.get('/api/notifications/unread-count', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE read = FALSE AND archived = FALSE'
    )
    res.json({ count: parseInt(result.rows[0].count) })
  } catch {
    res.json({ count: 0 })
  }
})

app.get('/api/notifications', async (req, res) => {
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

app.patch('/api/notifications/read-all', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = TRUE WHERE archived = FALSE')
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to mark all read' })
  }
})

app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = TRUE WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to mark read' })
  }
})

// ── Students ──────────────────────────────────────────────────────────────────
// Get all students for a class
app.get('/api/classes/:classId/students', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM students WHERE class_id = $1 ORDER BY enrolled_at DESC',
      [req.params.classId]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch students' })
  }
})

// Add a student to a class
app.post('/api/classes/:classId/students', async (req, res) => {
  const { name, whatsapp, payment_status, notes } = req.body
  if (!name || !whatsapp) {
    return res.status(400).json({ error: 'Name and WhatsApp number are required' })
  }
  try {
    const result = await pool.query(
      `INSERT INTO students (class_id, name, whatsapp, payment_status, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.classId, name, whatsapp, payment_status || 'unpaid', notes || '']
    )
    await addNotification('section', 'New student enrolled',
      `${name} has been added to class ${req.params.classId}.`)
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to add student' })
  }
})

// Update a student's payment status
app.patch('/api/classes/:classId/students/:studentId', async (req, res) => {
  const { payment_status, notes } = req.body
  try {
    const result = await pool.query(
      `UPDATE students SET payment_status = COALESCE($1, payment_status),
       notes = COALESCE($2, notes)
       WHERE id = $3 AND class_id = $4 RETURNING *`,
      [payment_status, notes, req.params.studentId, req.params.classId]
    )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Student not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update student' })
  }
})

// Remove a student
app.delete('/api/classes/:classId/students/:studentId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM students WHERE id = $1 AND class_id = $2',
      [req.params.studentId, req.params.classId]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to remove student' })
  }
})

// ── Product overrides ─────────────────────────────────────────────────────────
// Update a product's details (name, price, description)
app.patch('/api/products/:productId', async (req, res) => {
  const { name, price, description } = req.body
  const pid = parseInt(req.params.productId)
  // Products are defined in the frontend PRODUCTS constant
  // We store overrides in a product_overrides table
  try {
    await pool.query(
      `INSERT INTO product_overrides (product_id, name, price, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id) DO UPDATE
       SET name = COALESCE($2, product_overrides.name),
           price = COALESCE($3, product_overrides.price),
           description = COALESCE($4, product_overrides.description)`,
      [pid, name || null, price || null, description || null]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update product' })
  }
})

// Get product overrides
app.get('/api/products/overrides', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM product_overrides')
    const map = {}
    result.rows.forEach(r => { map[r.product_id] = r })
    res.json(map)
  } catch {
    res.json({})
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
