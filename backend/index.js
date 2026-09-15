require('dotenv').config()
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const UPLOAD_DIR = path.join(__dirname, 'uploads')
const PRODUCT_DIR = path.join(UPLOAD_DIR, 'products')
const CLASS_DIR = path.join(UPLOAD_DIR, 'classes')
const GALLERY_DIR = path.join(UPLOAD_DIR, 'gallery')

;[UPLOAD_DIR, PRODUCT_DIR, CLASS_DIR, GALLERY_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

const app = express()
const PORT = process.env.PORT || 3002

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

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

const orders = []
const positions = {}

// Notifications store
const notifications = []
let notificationIdCounter = 1

const addNotification = (type, title, message) => {
  const notification = {
    id: notificationIdCounter++,
    type, // 'order' | 'image' | 'section' | 'system'
    title,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  }
  notifications.unshift(notification)
  // Keep only last 50 notifications
  if (notifications.length > 50) notifications.pop()
  return notification
}

const archivedNotifications = []

const archiveOldNotifications = () => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const toArchive = notifications.filter(n => new Date(n.createdAt) < sevenDaysAgo)
  toArchive.forEach(n => {
    archivedNotifications.unshift({ ...n, archived: true })
    const index = notifications.findIndex(x => x.id === n.id)
    if (index !== -1) notifications.splice(index, 1)
  })
  // Keep only last 100 archived notifications
  if (archivedNotifications.length > 100) {
    archivedNotifications.splice(100)
  }
}

// Run cleanup every hour
setInterval(archiveOldNotifications, 60 * 60 * 1000)

// Add a welcome notification on startup
addNotification('system', 'Dashboard ready', 'Hair By Her admin dashboard is live and running.')

// Categories store
const categories = [
  { id: 1, name: 'Lashes', createdAt: new Date().toISOString() },
  { id: 2, name: 'Wigs', createdAt: new Date().toISOString() },
]
let categoryIdCounter = 3

// Product category assignments: { productId: categoryId }
const productCategories = {
  1: 1, // Classic Lash Trays -> Lashes
  2: 1, // YY Lash Trays -> Lashes
  3: 1, // Volume Lash Trays -> Lashes
  4: 1, // Lash Shampoo Combo -> Lashes
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', project: 'Lashes By Retha' })
})

app.post('/api/orders', (req, res) => {
  const { customerName, customerPhone, items, total } = req.body
  if (!customerName || !customerPhone || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  const order = {
    id: orders.length + 1,
    customerName,
    customerPhone,
    items,
    total,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  orders.push(order)
  console.log('New order received:', JSON.stringify(order, null, 2))
  addNotification('order', 'New order received', `${customerName} placed an order for ${items.length} item${items.length !== 1 ? 's' : ''} totalling R${total}.`)
  res.status(201).json({ success: true, orderId: order.id })
})

app.get('/api/orders', (req, res) => {
  res.json(orders)
})

app.patch('/api/orders/:id/confirm', (req, res) => {
  const id = parseInt(req.params.id)
  const order = orders.find(o => o.id === id)
  if (!order) return res.status(404).json({ error: 'Order not found' })
  order.status = 'confirmed'
  addNotification('order', 'Order confirmed', `Order #${id} for ${order.customerName} has been marked as confirmed.`)
  res.json({ success: true })
})

// Save image position
app.post('/api/position/:type/:id', (req, res) => {
  const { type, id } = req.params
  const { position } = req.body
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    return res.status(400).json({ error: 'Invalid position' })
  }
  const key = `${type}-${id}`
  positions[key] = position
  console.log(`Position saved: ${key} -> ${position.x}% ${position.y}%`)
  res.json({ success: true })
})

// Get image position
app.get('/api/position/:type/:id', (req, res) => {
  const key = `${req.params.type}-${req.params.id}`
  res.json({ position: positions[key] || null })
})

// Get all categories
app.get('/api/categories', (req, res) => {
  res.json(categories)
})

// Create a new category
app.post('/api/categories', (req, res) => {
  const { name } = req.body
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' })
  }
  const trimmed = name.trim()
  if (categories.find(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
    return res.status(400).json({ error: 'A category with that name already exists' })
  }
  const category = {
    id: categoryIdCounter++,
    name: trimmed,
    createdAt: new Date().toISOString(),
  }
  categories.push(category)
  console.log(`Category created: ${category.name} (id: ${category.id})`)
  addNotification('section', 'Section created', `A new product section "${trimmed}" was created.`)
  res.status(201).json(category)
})

// Delete a category
app.delete('/api/categories/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const index = categories.findIndex(c => c.id === id)
  if (index === -1) return res.status(404).json({ error: 'Category not found' })
  const name = categories[index].name
  categories.splice(index, 1)
  addNotification('section', 'Section removed', `The product section "${name}" was removed.`)
  // Remove assignments for this category
  Object.keys(productCategories).forEach(pid => {
    if (productCategories[pid] === id) delete productCategories[pid]
  })
  console.log(`Category deleted: ${name}`)
  res.json({ success: true })
})

// Get category assignment for a product
app.get('/api/categories/product/:productId', (req, res) => {
  const pid = parseInt(req.params.productId)
  const categoryId = productCategories[pid] || null
  const category = categoryId ? categories.find(c => c.id === categoryId) : null
  res.json({ categoryId, categoryName: category ? category.name : null })
})

// Assign a product to a category
app.post('/api/categories/product/:productId', (req, res) => {
  const pid = parseInt(req.params.productId)
  const { categoryId } = req.body
  if (!categoryId) {
    delete productCategories[pid]
    return res.json({ success: true, message: 'Product removed from category' })
  }
  const category = categories.find(c => c.id === categoryId)
  if (!category) return res.status(404).json({ error: 'Category not found' })
  productCategories[pid] = categoryId
  console.log(`Product ${pid} assigned to category: ${category.name}`)
  res.json({ success: true, categoryId, categoryName: category.name })
})

// Get all products with their category assignments
app.get('/api/categories/products/all', (req, res) => {
  res.json(productCategories)
})

// Upload image for a product or class
app.post('/api/upload/:type/:id', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const url = `/uploads/${req.params.type}/${req.file.filename}`
  console.log(`Image uploaded: ${url}`)
  addNotification('image', 'Image uploaded', `A new image was uploaded for ${req.params.type} (id: ${req.params.id}).`)
  res.json({ success: true, url })
})

// Upload image to gallery (no id needed)
app.post('/api/upload/gallery', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const url = `/uploads/gallery/${req.file.filename}`
  console.log(`Gallery image uploaded: ${url}`)
  addNotification('image', 'Gallery image added', 'A new image was added to the gallery.')
  res.json({ success: true, url })
})

// Get all gallery images
app.get('/api/gallery', (req, res) => {
  try {
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp']
    const videoExts = ['.mp4', '.mov', '.webm']
    const files = fs.readdirSync(GALLERY_DIR)
      .filter(f => {
        const ext = path.extname(f).toLowerCase()
        return [...imageExts, ...videoExts].includes(ext)
      })
      .map(f => {
        const ext = path.extname(f).toLowerCase()
        return {
          filename: f,
          url: `/uploads/gallery/${f}`,
          type: videoExts.includes(ext) ? 'video' : 'image'
        }
      })
    res.json(files)
  } catch {
    res.json([])
  }
})

// Get image for a specific product or class
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

// Get all notifications
app.get('/api/notifications', (req, res) => {
  res.json(notifications)
})

// Get archived notifications (older than 7 days)
app.get('/api/notifications/archived', (req, res) => {
  res.json(archivedNotifications)
})

// Mark a notification as read
app.patch('/api/notifications/:id/read', (req, res) => {
  const id = parseInt(req.params.id)
  const notification = notifications.find(n => n.id === id)
  if (!notification) return res.status(404).json({ error: 'Notification not found' })
  notification.read = true
  res.json({ success: true })
})

// Mark all notifications as read
app.patch('/api/notifications/read-all', (req, res) => {
  notifications.forEach(n => { n.read = true })
  res.json({ success: true })
})

// Get unread count
app.get('/api/notifications/unread-count', (req, res) => {
  res.json({ count: notifications.filter(n => !n.read).length })
})

app.listen(PORT, () => {
  console.log(`Lashes By Retha backend listening on port ${PORT}`)
})
