const { test, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

// node --test runs each test file in its own process, so these env vars
// (and the fetch stub below) never leak into other test files.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PAYFLEX_CLIENT_ID = process.env.PAYFLEX_CLIENT_ID || 'test-client-id'
process.env.PAYFLEX_CLIENT_SECRET = process.env.PAYFLEX_CLIENT_SECRET || 'test-client-secret'
process.env.PAYFLEX_API_URL = process.env.PAYFLEX_API_URL || 'https://api.example.com'
process.env.PAYFLEX_AUTH_URL = process.env.PAYFLEX_AUTH_URL || 'https://auth.example.com/auth/merchant'
process.env.PAYFLEX_AUDIENCE = process.env.PAYFLEX_AUDIENCE || 'https://audience.example.com'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'https://api.example.com'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

const { pool } = require('../db')
const payflex = require('../payflex')

let authCallCount = 0
let tokenToIssue = { access_token: 'token-1', expires_in: 3600 }
const mockOrders = new Map() // payflexOrderId -> order status object
const realFetch = global.fetch
global.fetch = async (url, options = {}) => {
  const urlStr = String(url)
  if (urlStr === process.env.PAYFLEX_AUTH_URL) {
    authCallCount++
    return { ok: true, json: async () => tokenToIssue }
  }
  if (urlStr.endsWith('/configuration')) {
    return { ok: true, json: async () => ({ minimumAmount: 50, maximumAmount: 950 }) }
  }
  if (urlStr.includes('/order/')) {
    const orderId = decodeURIComponent(urlStr.split('/order/')[1])
    const mocked = mockOrders.get(orderId)
    if (!mocked) return { ok: true, json: async () => ({ orderId, orderStatus: 'Created', amount: 0 }) }
    return { ok: true, json: async () => mocked }
  }
  return realFetch(url, options)
}

test('getAccessToken caches the token and only refreshes once it is close to expiry', async () => {
  authCallCount = 0
  tokenToIssue = { access_token: 'token-a', expires_in: 3600 }
  const first = await payflex.getAccessToken()
  const second = await payflex.getAccessToken()
  assert.strictEqual(first, 'token-a')
  assert.strictEqual(second, 'token-a')
  assert.strictEqual(authCallCount, 1, 'a cached, far-from-expiry token must not trigger a second auth call')

  // Simulate time passing until the cached token is within its refresh window.
  const originalNow = Date.now
  Date.now = () => originalNow() + 3600 * 1000
  tokenToIssue = { access_token: 'token-b', expires_in: 3600 }
  const third = await payflex.getAccessToken()
  Date.now = originalNow

  assert.strictEqual(third, 'token-b')
  assert.strictEqual(authCallCount, 2, 'an expiring token must trigger exactly one refresh')
})

test('isAmountWithinRange refuses amounts outside the configured min/max', () => {
  const config = { minimumAmount: 50, maximumAmount: 950 }
  assert.strictEqual(payflex.isAmountWithinRange(10, config), false)
  assert.strictEqual(payflex.isAmountWithinRange(1000, config), false)
  assert.strictEqual(payflex.isAmountWithinRange(50, config), true)
  assert.strictEqual(payflex.isAmountWithinRange(950, config), true)
  assert.strictEqual(payflex.isAmountWithinRange(500, config), true)
  // No configuration available (e.g. the API call failed) - fails open so a
  // transient Payflex outage isn't what blocks checkout; createPayflexOrder
  // is still the final word.
  assert.strictEqual(payflex.isAmountWithinRange(10, null), true)
})

const createOrder = async () => {
  const token = `test-token-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO orders (customer_name, customer_phone, customer_email, total, fulfilment_method, payment_method, payment_status, public_token)
     VALUES ('Payflex Test', '0820000000', 'payflextest@example.com', 100.00, 'pickup', 'payflex', 'unpaid', $1)
     RETURNING *`,
    [token]
  )
  return result.rows[0]
}

const createPayment = async (orderId, merchantReference, payflexOrderId, amount = '100.00') => {
  await pool.query(
    `INSERT INTO payflex_payments (order_id, merchant_reference, payflex_order_id, amount, status)
     VALUES ($1, $2, $3, $4, 'started')`,
    [orderId, merchantReference, payflexOrderId, amount]
  )
}

const cleanupOrder = async (orderId) => {
  await pool.query('DELETE FROM payflex_payments WHERE order_id = $1', [orderId])
  await pool.query('DELETE FROM orders WHERE id = $1', [orderId])
}

test('reconcilePayflexPayment marks an order paid when Payflex reports Approved', async () => {
  const order = await createOrder()
  const ref = `HBH-${order.id}-approved`
  const payflexOrderId = `pf-${order.id}-approved`
  await createPayment(order.id, ref, payflexOrderId)
  mockOrders.set(payflexOrderId, { orderId: payflexOrderId, orderStatus: 'Approved', amount: 100.00 })

  try {
    await payflex.reconcilePayflexPayment(ref)
    const orderRow = (await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0]
    const paymentRow = (await pool.query('SELECT * FROM payflex_payments WHERE merchant_reference = $1', [ref])).rows[0]
    assert.strictEqual(orderRow.payment_status, 'paid')
    assert.ok(orderRow.paid_at)
    assert.strictEqual(paymentRow.status, 'paid')
  } finally {
    mockOrders.delete(payflexOrderId)
    await cleanupOrder(order.id)
  }
})

test('reconcilePayflexPayment marks an order failed when Payflex reports Declined', async () => {
  const order = await createOrder()
  const ref = `HBH-${order.id}-declined`
  const payflexOrderId = `pf-${order.id}-declined`
  await createPayment(order.id, ref, payflexOrderId)
  mockOrders.set(payflexOrderId, { orderId: payflexOrderId, orderStatus: 'Declined', amount: 100.00 })

  try {
    await payflex.reconcilePayflexPayment(ref)
    const orderRow = (await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0]
    assert.strictEqual(orderRow.payment_status, 'failed')
    assert.strictEqual(orderRow.paid_at, null)
  } finally {
    mockOrders.delete(payflexOrderId)
    await cleanupOrder(order.id)
  }
})

test('reconcilePayflexPayment does not mark an order paid when the amount does not match', async () => {
  const order = await createOrder()
  const ref = `HBH-${order.id}-wrongamount`
  const payflexOrderId = `pf-${order.id}-wrongamount`
  await createPayment(order.id, ref, payflexOrderId, '100.00')
  // Payflex reports Approved, but for the wrong amount - must not be trusted as paid.
  mockOrders.set(payflexOrderId, { orderId: payflexOrderId, orderStatus: 'Approved', amount: 1.00 })

  try {
    await payflex.reconcilePayflexPayment(ref)
    const orderRow = (await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0]
    assert.notStrictEqual(orderRow.payment_status, 'paid')
    assert.strictEqual(orderRow.paid_at, null)
  } finally {
    mockOrders.delete(payflexOrderId)
    await cleanupOrder(order.id)
  }
})

test('a duplicate callback for an already-paid order creates only one admin notification', async () => {
  const order = await createOrder()
  const ref = `HBH-${order.id}-duplicate`
  const payflexOrderId = `pf-${order.id}-duplicate`
  await createPayment(order.id, ref, payflexOrderId)
  mockOrders.set(payflexOrderId, { orderId: payflexOrderId, orderStatus: 'Approved', amount: 100.00 })

  let notifyCount = 0
  payflex.setNotifier(async () => { notifyCount++ })

  try {
    await payflex.reconcilePayflexPayment(ref)
    await payflex.reconcilePayflexPayment(ref) // duplicate callback/poll

    const orderRow = (await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0]
    assert.strictEqual(orderRow.payment_status, 'paid')
    assert.strictEqual(notifyCount, 1, 'a duplicate reconcile call must not fire a second notification')
  } finally {
    payflex.setNotifier(async () => {})
    mockOrders.delete(payflexOrderId)
    await cleanupOrder(order.id)
  }
})

after(async () => {
  global.fetch = realFetch
  await pool.end()
})
