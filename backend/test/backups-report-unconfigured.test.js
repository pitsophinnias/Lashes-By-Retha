const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')

// Checks the "entirely disabled" branch of POST /api/system/backups/report -
// needs its own process (env vars are read once, at require time) with
// BACKUP_REPORT_TOKEN deliberately unset, even if the real .env happens to
// set one for local dev.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
delete process.env.BACKUP_REPORT_TOKEN
process.env.PORT = '4017'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4017'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

const PORT = Number(process.env.PORT)

const request = (method, pathAndQuery, body, headers = {}) => new Promise((resolve, reject) => {
  const payload = body !== undefined ? JSON.stringify(body) : null
  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: pathAndQuery,
    method,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...headers,
    },
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
let pool

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
})

test('POST /api/system/backups/report is entirely unreachable when BACKUP_REPORT_TOKEN is unset', async () => {
  const res = await request('POST', '/api/system/backups/report',
    { startedAt: new Date().toISOString(), status: 'ok' },
    { Authorization: 'Bearer anything-at-all' })
  assert.strictEqual(res.status, 403)
})

after(async () => {
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
