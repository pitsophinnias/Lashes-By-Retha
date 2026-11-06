const { test, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

// node --test runs each test file in its own process, so these env vars
// (and the fetch stub below) never leak into ozow.test.js's process.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || 'TSTSITE1'
process.env.OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || 'test-private-key'
process.env.OZOW_API_KEY = process.env.OZOW_API_KEY || 'test-api-key'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'https://api.example.com'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

const { pool } = require('../db')
const ozow = require('../ozow')

// Routes the status API by transactionReference so each test controls
// exactly what Ozow "returns", fully offline. Only used in this file.
const mockTransactions = new Map()
const realFetch = global.fetch
global.fetch = async (url) => {
  const parsed = new URL(url)
  if (parsed.pathname.endsWith('/GetTransactionByReference')) {
    const ref = parsed.searchParams.get('transactionReference')
    const tx = mockTransactions.get(ref)
    return { ok: true, json: async () => (tx ? [tx] : []) }
  }
  return realFetch(url)
}

const createOrder = async () => {
  const token = `test-token-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO orders (customer_name, customer_phone, total, fulfilment_method, payment_method, payment_status, public_token)
     VALUES ('Reconcile Test', '0820000000', 100.00, 'pickup', 'ozow', 'unpaid', $1)
     RETURNING *`,
    [token]
  )
  return result.rows[0]
}

const createPayment = async (orderId, reference, createdAt) => {
  await pool.query(
    `INSERT INTO ozow_payments (order_id, transaction_reference, amount, status, is_test, created_at)
     VALUES ($1, $2, '100.00', 'started', true, COALESCE($3, NOW()))`,
    [orderId, reference, createdAt || null]
  )
}

const cleanupOrder = async (orderId) => {
  await pool.query('DELETE FROM ozow_payments WHERE order_id = $1', [orderId])
  await pool.query('DELETE FROM orders WHERE id = $1', [orderId])
}

test('reconcileOzowPayment marks an order paid from a camelCase status response', async () => {
  const order = await createOrder()
  const reference = `HBH-${order.id}-camel`
  await createPayment(order.id, reference)
  mockTransactions.set(reference, {
    siteCode: process.env.OZOW_SITE_CODE,
    transactionId: 'TXN-CAMEL-1',
    transactionReference: reference,
    amount: '100.00',
    status: 'Complete',
    statusMessage: 'Success',
  })

  try {
    await ozow.reconcileOzowPayment(reference)
    const orderRow = (await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0]
    const paymentRow = (await pool.query(
      'SELECT * FROM ozow_payments WHERE transaction_reference = $1', [reference]
    )).rows[0]
    assert.strictEqual(orderRow.payment_status, 'paid')
    assert.strictEqual(paymentRow.ozow_transaction_id, 'TXN-CAMEL-1')
  } finally {
    mockTransactions.delete(reference)
    await cleanupOrder(order.id)
  }
})

test('reconcileOzowPayment marks an order paid from a PascalCase status response', async () => {
  const order = await createOrder()
  const reference = `HBH-${order.id}-pascal`
  await createPayment(order.id, reference)
  mockTransactions.set(reference, {
    SiteCode: process.env.OZOW_SITE_CODE,
    TransactionId: 'TXN-PASCAL-1',
    TransactionReference: reference,
    Amount: '100.00',
    Status: 'Complete',
    StatusMessage: 'Success',
  })

  try {
    await ozow.reconcileOzowPayment(reference)
    const orderRow = (await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0]
    const paymentRow = (await pool.query(
      'SELECT * FROM ozow_payments WHERE transaction_reference = $1', [reference]
    )).rows[0]
    assert.strictEqual(orderRow.payment_status, 'paid')
    assert.strictEqual(paymentRow.ozow_transaction_id, 'TXN-PASCAL-1')
  } finally {
    mockTransactions.delete(reference)
    await cleanupOrder(order.id)
  }
})

test('a late Cancelled result for an older attempt does not overwrite the order status set by a newer attempt', async () => {
  const order = await createOrder()
  const olderRef = `HBH-${order.id}-older`
  const newerRef = `HBH-${order.id}-newer`
  await createPayment(order.id, olderRef, new Date(Date.now() - 5 * 60 * 1000).toISOString())
  await createPayment(order.id, newerRef, new Date().toISOString())

  mockTransactions.set(newerRef, {
    SiteCode: process.env.OZOW_SITE_CODE, TransactionId: 'TXN-NEWER', TransactionReference: newerRef,
    Amount: '100.00', Status: 'Pending', StatusMessage: 'Awaiting confirmation',
  })
  mockTransactions.set(olderRef, {
    SiteCode: process.env.OZOW_SITE_CODE, TransactionId: 'TXN-OLDER', TransactionReference: olderRef,
    Amount: '100.00', Status: 'Cancelled', StatusMessage: 'Cancelled by user',
  })

  try {
    // The customer's retry (the newer attempt) is reconciled first - the order moves to pending.
    await ozow.reconcileOzowPayment(newerRef)
    let orderRow = (await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0]
    assert.strictEqual(orderRow.payment_status, 'pending')

    // A delayed result for the older, abandoned attempt arrives afterwards.
    await ozow.reconcileOzowPayment(olderRef)
    orderRow = (await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0]
    assert.strictEqual(
      orderRow.payment_status, 'pending',
      'a stale result from an older attempt must not overwrite the order status set by the latest attempt'
    )

    const olderPaymentRow = (await pool.query(
      'SELECT * FROM ozow_payments WHERE transaction_reference = $1', [olderRef]
    )).rows[0]
    assert.strictEqual(olderPaymentRow.status, 'cancelled', 'the older attempt still records its own outcome')
  } finally {
    mockTransactions.delete(newerRef)
    mockTransactions.delete(olderRef)
    await cleanupOrder(order.id)
  }
})

after(async () => {
  global.fetch = realFetch
  await pool.end()
})
