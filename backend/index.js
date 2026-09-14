require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3002

app.use(cors())
app.use(express.json())

const orders = []

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

app.listen(PORT, () => {
  console.log(`Lashes By Retha backend listening on port ${PORT}`)
})
