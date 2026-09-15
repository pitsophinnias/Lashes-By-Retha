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
  res.status(201).json({ success: true, orderId: order.id })
})

app.get('/api/orders', (req, res) => {
  res.json(orders)
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

// Upload image for a product or class
app.post('/api/upload/:type/:id', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const url = `/uploads/${req.params.type}/${req.file.filename}`
  console.log(`Image uploaded: ${url}`)
  res.json({ success: true, url })
})

// Upload image to gallery (no id needed)
app.post('/api/upload/gallery', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const url = `/uploads/gallery/${req.file.filename}`
  console.log(`Gallery image uploaded: ${url}`)
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

app.listen(PORT, () => {
  console.log(`Lashes By Retha backend listening on port ${PORT}`)
})
