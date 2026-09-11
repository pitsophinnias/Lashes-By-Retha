require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3002

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', project: 'Lashes By Retha' })
})

app.listen(PORT, () => {
  console.log(`Lashes By Retha backend listening on port ${PORT}`)
})
