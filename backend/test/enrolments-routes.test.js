const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')

// node --test runs each test file in its own process, so running the real
// app here never collides with a manually-run dev server on port 3002, and
// these env vars (and the fetch stub below) never leak into other test files.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4011'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4011'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'
// Payflex is configured here (with fake credentials and a stubbed fetch, as
// payflex.test.js also does) so the "Payflex out of range" validation branch
// can be reached. Ozow is intentionally left unconfigured - every other
// validation check in this file happens before a provider-configured check,
// so it never needs to be real.
process.env.PAYFLEX_CLIENT_ID = process.env.PAYFLEX_CLIENT_ID || 'test-client-id'
process.env.PAYFLEX_CLIENT_SECRET = process.env.PAYFLEX_CLIENT_SECRET || 'test-client-secret'
process.env.PAYFLEX_API_URL = process.env.PAYFLEX_API_URL || 'https://api.example.com'
process.env.PAYFLEX_AUTH_URL = process.env.PAYFLEX_AUTH_URL || 'https://auth.example.com/auth/merchant'
process.env.PAYFLEX_AUDIENCE = process.env.PAYFLEX_AUDIENCE || 'https://audience.example.com'
// Set to empty (not deleted) - index.js's own dotenv.config() call never
// overwrites a key that already exists in process.env, even an empty one,
// but would otherwise refill a deleted key straight back from .env.
process.env.OZOW_SITE_CODE = ''
process.env.OZOW_PRIVATE_KEY = ''
process.env.OZOW_API_KEY = ''

const realFetch = global.fetch
global.fetch = async (url, options = {}) => {
  const urlStr = String(url)
  if (urlStr === process.env.PAYFLEX_AUTH_URL) {
    return { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) }
  }
  if (urlStr.endsWith('/configuration')) {
    // A tight range, so a R2500 or R6000 course is reliably out of range
    // without depending on real sandbox limits.
    return { ok: true, json: async () => ({ minimumAmount: 50, maximumAmount: 950 }) }
  }
  return realFetch(url, options)
}

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

// A Tuesday at least two weeks out, so it's always both future and a valid
// training day regardless of when the suite runs.
const futureTuesday = () => {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  while (date.getDay() !== 2) date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

// The next Sunday from today - always an invalid training day.
const nextSunday = () => {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  while (date.getDay() !== 0) date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

const validEnrolment = () => ({
  courseId: 1,
  name: 'Route Test',
  phone: '0821234567',
  email: 'route-test@example.com',
  preferredStartDate: futureTuesday(),
  paymentOption: 'deposit_ozow',
})

let api
before(async () => {
  api = require('../index')
  await waitForServer()
})

test('POST /api/enrolments rejects an invalid South African phone number', async () => {
  const res = await request('POST', '/api/enrolments', { ...validEnrolment(), phone: '12345' })
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /South African number/i)
})

test('POST /api/enrolments rejects a date in the past', async () => {
  const res = await request('POST', '/api/enrolments', { ...validEnrolment(), preferredStartDate: '2020-01-07' })
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /Tuesday to Saturday/i)
})

test('POST /api/enrolments rejects a Sunday start date', async () => {
  const res = await request('POST', '/api/enrolments', { ...validEnrolment(), preferredStartDate: nextSunday() })
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /Tuesday to Saturday/i)
})

test('POST /api/enrolments rejects Payflex for a course priced outside its configured range', async () => {
  const res = await request('POST', '/api/enrolments', {
    ...validEnrolment(),
    courseId: 3, // R6000 - outside the stubbed R50-R950 range
    paymentOption: 'full_payflex',
  })
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /Payflex is only available/i)
})

test('POST /api/enrolments rejects an unavailable payment option', async () => {
  const res = await request('POST', '/api/enrolments', { ...validEnrolment(), paymentOption: 'full_eft' })
  assert.strictEqual(res.status, 400)
  assert.match(res.data.error, /choose how you would like to pay/i)
})

test('POST /api/enrolments refuses Ozow while it is unconfigured', async () => {
  const res = await request('POST', '/api/enrolments', validEnrolment())
  assert.strictEqual(res.status, 503)
  assert.match(res.data.error, /taking a short break/i)
})

after(async () => {
  const { pool } = require('../db')
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
  global.fetch = realFetch
})
