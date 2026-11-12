const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')

// node --test runs each test file in its own process, so running the real
// app here never collides with a manually-run dev server on port 3002, and
// these env vars never leak into other test files.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4010'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4010'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'
// Ozow/Payflex are intentionally left unconfigured - this file only checks
// request-validation branches that don't depend on either provider being live.

const PORT = Number(process.env.PORT)

// Uses node:http directly (not the built-in fetch/undici) - avoids a
// Windows-specific libuv assertion crash seen when undici's connection pool
// and node-postgres's sockets close around the same time in this process.
const request = (method, pathAndQuery, body) => new Promise((resolve, reject) => {
  const payload = body ? JSON.stringify(body) : null
  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: pathAndQuery,
    method,
    headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
  }, (res) => {
    let raw = ''
    res.on('data', (chunk) => { raw += chunk })
    res.on('end', () => {
      let data = null
      try { data = raw ? JSON.parse(raw) : null } catch {}
      resolve({ status: res.statusCode, data })
    })
  })
  req.on('error', reject)
  if (payload) req.write(payload)
  req.end()
})

const waitForServer = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await request('GET', '/api/health')
      if (res.status === 200) return
    } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('Server did not start in time')
}

let api
before(async () => {
  api = require('../index')
  await waitForServer()
})

test('POST /api/orders rejects a payment method that is not ozow or payflex', async () => {
  const res = await request('POST', '/api/orders', {
    customerName: 'Route Test',
    customerPhone: '0821234567',
    paymentMethod: 'eft',
    items: [{ id: 1, qty: 1 }],
    fulfilmentMethod: 'pickup',
  })
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /only able to take online payments/i)
})

test('PATCH /api/orders/:token/switch-to-eft always returns 410', async () => {
  const res = await request('PATCH', '/api/orders/anything/switch-to-eft')
  assert.strictEqual(res.status, 410)
  assert.match(res.data.error, /no longer available/i)
})

after(async () => {
  const { pool } = require('../db')
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
