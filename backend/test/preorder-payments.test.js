const { test, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

// node --test runs each test file in its own process, so these env vars
// (and the fetch stub below) never leak into other test files.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.OZOW_SITE_CODE = process.env.OZOW_SITE_CODE || 'TESTSITE'
process.env.OZOW_PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY || 'test-private-key'
process.env.OZOW_API_KEY = process.env.OZOW_API_KEY || 'test-api-key'
process.env.OZOW_IS_TEST = 'true'
process.env.OZOW_TEST_API_BASE = process.env.OZOW_TEST_API_BASE || 'https://stagingapi.example.com'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'https://api.example.com'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

const { pool } = require('../db')
const ozow = require('../ozow')
const { saveSystemSetting } = require('../src/systemSettings/store')

const mockOzowTransactions = new Map() // transactionReference -> transaction object
const realFetch = global.fetch
global.fetch = async (url, options = {}) => {
  const urlStr = String(url)
  if (urlStr.includes('GetTransactionByReference')) {
    const reference = new URL(urlStr).searchParams.get('transactionReference')
    const mocked = mockOzowTransactions.get(reference)
    return { ok: true, json: async () => (mocked ? [mocked] : []) }
  }
  return realFetch(url, options)
}

const createProduct = async ({ price = 2000, deposit = 500 } = {}) => {
  const result = await pool.query(
    `INSERT INTO products (name, price, preorder_enabled, preorder_deposit, stock_quantity)
     VALUES ('Preorder Payments Test Wig', $1, TRUE, $2, 0) RETURNING *`,
    [price, deposit]
  )
  return result.rows[0]
}

const createPreorder = async (product, overrides = {}) => {
  const token = `preorder-token-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO preorders (
       product_id, quantity, customer_name, customer_phone, customer_email, fulfilment_method,
       price_at_order, deposit_amount, delivery_fee, status, public_token
     ) VALUES ($1, $2, 'Preorder Payments Test', '0820000000', 'preorder-payments-test@example.com', 'pickup', $3, $4, 0, $5, $6)
     RETURNING *`,
    [product.id, overrides.quantity || 1, product.price, product.preorder_deposit, overrides.status || 'awaiting_deposit', token]
  )
  return result.rows[0]
}

const createOzowPreorderPayment = async (preorderId, reference, amount, purpose = 'preorder_deposit') => {
  await pool.query(
    `INSERT INTO ozow_payments (preorder_id, transaction_reference, amount, status, is_test, purpose)
     VALUES ($1, $2, $3, 'started', true, $4)`,
    [preorderId, reference, amount, purpose]
  )
}

// Deletes the preorder row before the order it points to (no ON DELETE on
// preorders.order_id - deleting the order first would violate that FK).
const cleanupPreorder = async (preorderId) => {
  const row = (await pool.query('SELECT order_id FROM preorders WHERE id = $1', [preorderId])).rows[0]
  await pool.query('DELETE FROM ozow_payments WHERE preorder_id = $1', [preorderId])
  await pool.query('DELETE FROM preorders WHERE id = $1', [preorderId])
  if (row?.order_id) {
    await pool.query('DELETE FROM order_items WHERE order_id = $1', [row.order_id])
    await pool.query('DELETE FROM orders WHERE id = $1', [row.order_id])
  }
}

const cleanupProduct = async (productId) => {
  await pool.query('DELETE FROM products WHERE id = $1', [productId])
}

test('a paid deposit moves awaiting_deposit to deposit_paid and sets promised_by_date from the lead time setting, unaffected by a later setting change', async () => {
  const product = await createProduct({ price: 2000, deposit: 500 })
  const preorder = await createPreorder(product)
  const reference = `HBH-${preorder.id}-deposit`
  await createOzowPreorderPayment(preorder.id, reference, '500.00')
  mockOzowTransactions.set(reference, {
    TransactionReference: reference, Status: 'Complete', Amount: '500.00', SiteCode: process.env.OZOW_SITE_CODE, TransactionId: 'tx-pre-1',
  })

  try {
    await ozow.reconcileOzowPayment(reference)
    let row = (await pool.query('SELECT * FROM preorders WHERE id = $1', [preorder.id])).rows[0]
    assert.strictEqual(row.status, 'deposit_paid')
    assert.strictEqual(parseFloat(row.amount_paid), 500)

    const expectedDate = new Date()
    expectedDate.setDate(expectedDate.getDate() + 21) // the default maxDays
    const expected = `${expectedDate.getFullYear()}-${String(expectedDate.getMonth() + 1).padStart(2, '0')}-${String(expectedDate.getDate()).padStart(2, '0')}`
    assert.strictEqual(row.promised_by_date, expected)

    await saveSystemSetting('preorders', { minDays: 14, maxDays: 30 }, null)
    row = (await pool.query('SELECT * FROM preorders WHERE id = $1', [preorder.id])).rows[0]
    assert.strictEqual(
      row.promised_by_date, expected,
      'promised_by_date must not move when the lead time setting changes afterwards'
    )
  } finally {
    await saveSystemSetting('preorders', { minDays: 14, maxDays: 21 }, null)
    mockOzowTransactions.delete(reference)
    await cleanupPreorder(preorder.id)
    await cleanupProduct(product.id)
  }
})

test('a duplicate reconcile call for an already-paid deposit does not double-count', async () => {
  const product = await createProduct({ price: 2000, deposit: 500 })
  const preorder = await createPreorder(product)
  const reference = `HBH-${preorder.id}-dup`
  await createOzowPreorderPayment(preorder.id, reference, '500.00')
  mockOzowTransactions.set(reference, {
    TransactionReference: reference, Status: 'Complete', Amount: '500.00', SiteCode: process.env.OZOW_SITE_CODE, TransactionId: 'tx-pre-2',
  })

  let notifyCount = 0
  ozow.setNotifier(async () => { notifyCount++ })

  try {
    await ozow.reconcileOzowPayment(reference)
    await ozow.reconcileOzowPayment(reference) // duplicate notification/poll

    const row = (await pool.query('SELECT * FROM preorders WHERE id = $1', [preorder.id])).rows[0]
    assert.strictEqual(parseFloat(row.amount_paid), 500, 'a duplicate reconcile must not credit the deposit twice')
    assert.strictEqual(notifyCount, 1, 'a duplicate reconcile call must not fire a second notification')
  } finally {
    ozow.setNotifier(async () => {})
    mockOzowTransactions.delete(reference)
    await cleanupPreorder(preorder.id)
    await cleanupProduct(product.id)
  }
})

test('a deposit then the balance add up to paid_in_full and create exactly one order; a duplicate balance callback never creates a second one', async () => {
  const product = await createProduct({ price: 2000, deposit: 500 })
  const preorder = await createPreorder(product)
  const depositRef = `HBH-${preorder.id}-deposit`
  await createOzowPreorderPayment(preorder.id, depositRef, '500.00', 'preorder_deposit')
  mockOzowTransactions.set(depositRef, {
    TransactionReference: depositRef, Status: 'Complete', Amount: '500.00', SiteCode: process.env.OZOW_SITE_CODE, TransactionId: 'tx-pre-3a',
  })

  const balanceRef = `HBH-${preorder.id}-balance`

  try {
    await ozow.reconcileOzowPayment(depositRef)
    // Mark arrived is an admin action (see PATCH /api/admin/preorders/:id/dispatch
    // and mark-arrived) - simulated directly here since this file never boots the server.
    await pool.query(`UPDATE preorders SET status = 'arrived', arrived_at = NOW() WHERE id = $1`, [preorder.id])

    await createOzowPreorderPayment(preorder.id, balanceRef, '1500.00', 'preorder_balance')
    mockOzowTransactions.set(balanceRef, {
      TransactionReference: balanceRef, Status: 'Complete', Amount: '1500.00', SiteCode: process.env.OZOW_SITE_CODE, TransactionId: 'tx-pre-3b',
    })
    await ozow.reconcileOzowPayment(balanceRef)

    const row = (await pool.query('SELECT * FROM preorders WHERE id = $1', [preorder.id])).rows[0]
    assert.strictEqual(row.status, 'paid_in_full')
    assert.strictEqual(parseFloat(row.amount_paid), 2000)
    assert.ok(row.order_id)

    const order = (await pool.query('SELECT * FROM orders WHERE id = $1', [row.order_id])).rows[0]
    assert.ok(order)
    assert.strictEqual(order.payment_status, 'paid')
    assert.strictEqual(parseFloat(order.total), 2000)
    const items = (await pool.query('SELECT * FROM order_items WHERE order_id = $1', [row.order_id])).rows
    assert.strictEqual(items.length, 1)
    assert.strictEqual(items[0].product_id, product.id)

    // A duplicate balance callback (e.g. Ozow redelivering its notification)
    // must not credit amount_paid again or create a second order.
    await ozow.reconcileOzowPayment(balanceRef)
    const rowAfterDup = (await pool.query('SELECT * FROM preorders WHERE id = $1', [preorder.id])).rows[0]
    assert.strictEqual(rowAfterDup.order_id, row.order_id)
    assert.strictEqual(parseFloat(rowAfterDup.amount_paid), 2000)
    const orderCount = await pool.query('SELECT COUNT(*) FROM orders WHERE id = $1', [row.order_id])
    assert.strictEqual(parseInt(orderCount.rows[0].count), 1)
  } finally {
    mockOzowTransactions.delete(depositRef)
    mockOzowTransactions.delete(balanceRef)
    await cleanupPreorder(preorder.id)
    await cleanupProduct(product.id)
  }
})

after(async () => {
  global.fetch = realFetch
  await pool.end()
})
