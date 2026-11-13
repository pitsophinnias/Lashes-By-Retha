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
process.env.PAYFLEX_CLIENT_ID = process.env.PAYFLEX_CLIENT_ID || 'test-client-id'
process.env.PAYFLEX_CLIENT_SECRET = process.env.PAYFLEX_CLIENT_SECRET || 'test-client-secret'
process.env.PAYFLEX_API_URL = process.env.PAYFLEX_API_URL || 'https://api.example.com'
process.env.PAYFLEX_AUTH_URL = process.env.PAYFLEX_AUTH_URL || 'https://auth.example.com/auth/merchant'
process.env.PAYFLEX_AUDIENCE = process.env.PAYFLEX_AUDIENCE || 'https://audience.example.com'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'https://api.example.com'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

const { pool } = require('../db')
const ozow = require('../ozow')
const payflex = require('../payflex')

const mockOzowTransactions = new Map() // transactionReference -> transaction object
const mockPayflexOrders = new Map() // payflexOrderId -> order status object
const realFetch = global.fetch
global.fetch = async (url, options = {}) => {
  const urlStr = String(url)
  if (urlStr === process.env.PAYFLEX_AUTH_URL) {
    return { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) }
  }
  if (urlStr.includes('/order/')) {
    const orderId = decodeURIComponent(urlStr.split('/order/')[1])
    const mocked = mockPayflexOrders.get(orderId)
    if (!mocked) return { ok: true, json: async () => ({ orderId, orderStatus: 'Created', amount: 0 }) }
    return { ok: true, json: async () => mocked }
  }
  if (urlStr.includes('GetTransactionByReference')) {
    const reference = new URL(urlStr).searchParams.get('transactionReference')
    const mocked = mockOzowTransactions.get(reference)
    return { ok: true, json: async () => (mocked ? [mocked] : []) }
  }
  return realFetch(url, options)
}

// class_id 1 is the R2500/R500-deposit course seeded by db.js's createTables.
const createStudent = async (overrides = {}) => {
  const token = `test-token-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO students (class_id, name, whatsapp, email, preferred_start_date, payment_status, status, public_token, source, amount_paid)
     VALUES (1, 'Training Test', '0820000000', 'trainingtest@example.com', CURRENT_DATE + 14, 'unpaid', 'awaiting_payment', $1, 'website', 0)
     RETURNING *`,
    [token]
  )
  return result.rows[0]
}

const createOrder = async () => {
  const token = `test-order-token-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO orders (customer_name, customer_phone, customer_email, total, fulfilment_method, payment_method, payment_status, public_token)
     VALUES ('Order Isolation Test', '0820000001', 'orderisolation@example.com', 100.00, 'pickup', 'ozow', 'unpaid', $1)
     RETURNING *`,
    [token]
  )
  return result.rows[0]
}

const createOzowStudentPayment = async (studentId, reference, amount) => {
  await pool.query(
    `INSERT INTO ozow_payments (student_id, transaction_reference, amount, status, is_test, purpose)
     VALUES ($1, $2, $3, 'started', true, 'deposit')`,
    [studentId, reference, amount]
  )
}

const createPayflexStudentPayment = async (studentId, merchantReference, payflexOrderId, amount, purpose = 'balance') => {
  await pool.query(
    `INSERT INTO payflex_payments (student_id, merchant_reference, payflex_order_id, amount, status, purpose)
     VALUES ($1, $2, $3, $4, 'started', $5)`,
    [studentId, merchantReference, payflexOrderId, amount, purpose]
  )
}

const cleanupStudent = async (studentId) => {
  await pool.query('DELETE FROM ozow_payments WHERE student_id = $1', [studentId])
  await pool.query('DELETE FROM payflex_payments WHERE student_id = $1', [studentId])
  await pool.query('DELETE FROM students WHERE id = $1', [studentId])
}

const cleanupOrder = async (orderId) => {
  await pool.query('DELETE FROM ozow_payments WHERE order_id = $1', [orderId])
  await pool.query('DELETE FROM payflex_payments WHERE order_id = $1', [orderId])
  await pool.query('DELETE FROM orders WHERE id = $1', [orderId])
}

test('a deposit paid via Ozow, then the balance paid via Payflex, adds up to the full course price', async () => {
  const student = await createStudent()
  const depositRef = `HBH-${student.id}-deposit`
  await createOzowStudentPayment(student.id, depositRef, '500.00')
  mockOzowTransactions.set(depositRef, {
    TransactionReference: depositRef, Status: 'Complete', Amount: '500.00', SiteCode: process.env.OZOW_SITE_CODE, TransactionId: 'tx-1',
  })

  try {
    await ozow.reconcileOzowPayment(depositRef)
    let studentRow = (await pool.query('SELECT * FROM students WHERE id = $1', [student.id])).rows[0]
    assert.strictEqual(parseFloat(studentRow.amount_paid), 500)
    assert.strictEqual(studentRow.payment_status, 'partial')
    assert.strictEqual(studentRow.status, 'active', 'a paid deposit must move the student out of awaiting_payment')

    const balanceRef = `pf-${student.id}-balance`
    const merchantRef = `HBH-${student.id}-balance`
    await createPayflexStudentPayment(student.id, merchantRef, balanceRef, '2000.00', 'balance')
    mockPayflexOrders.set(balanceRef, { orderId: balanceRef, orderStatus: 'Approved', amount: 2000.00 })
    await payflex.reconcilePayflexPayment(merchantRef)

    studentRow = (await pool.query('SELECT * FROM students WHERE id = $1', [student.id])).rows[0]
    assert.strictEqual(parseFloat(studentRow.amount_paid), 2500, 'deposit + balance must equal the full R2500 course price')
    assert.strictEqual(studentRow.payment_status, 'paid')
  } finally {
    mockOzowTransactions.delete(depositRef)
    await cleanupStudent(student.id)
  }
})

test('a duplicate reconcile call for an already-paid student payment does not double-count or double-notify', async () => {
  const student = await createStudent()
  const reference = `HBH-${student.id}-dup`
  await createOzowStudentPayment(student.id, reference, '500.00')
  mockOzowTransactions.set(reference, {
    TransactionReference: reference, Status: 'Complete', Amount: '500.00', SiteCode: process.env.OZOW_SITE_CODE, TransactionId: 'tx-2',
  })

  let notifyCount = 0
  ozow.setNotifier(async () => { notifyCount++ })

  try {
    await ozow.reconcileOzowPayment(reference)
    await ozow.reconcileOzowPayment(reference) // duplicate notification/poll

    const studentRow = (await pool.query('SELECT * FROM students WHERE id = $1', [student.id])).rows[0]
    assert.strictEqual(parseFloat(studentRow.amount_paid), 500, 'a duplicate reconcile must not credit the deposit twice')
    assert.strictEqual(notifyCount, 1, 'a duplicate reconcile call must not fire a second notification')
  } finally {
    ozow.setNotifier(async () => {})
    mockOzowTransactions.delete(reference)
    await cleanupStudent(student.id)
  }
})

test('reconciling a student payment never touches an unrelated order, and reconciling an order payment never touches an unrelated student', async () => {
  const student = await createStudent()
  const order = await createOrder()
  const studentRef = `HBH-${student.id}-isolation`
  const orderRef = `HBH-${order.id}-isolation`
  await createOzowStudentPayment(student.id, studentRef, '500.00')
  await pool.query(
    `INSERT INTO ozow_payments (order_id, transaction_reference, amount, status, is_test, purpose)
     VALUES ($1, $2, '100.00', 'started', true, 'order')`,
    [order.id, orderRef]
  )
  mockOzowTransactions.set(studentRef, {
    TransactionReference: studentRef, Status: 'Complete', Amount: '500.00', SiteCode: process.env.OZOW_SITE_CODE, TransactionId: 'tx-3',
  })
  mockOzowTransactions.set(orderRef, {
    TransactionReference: orderRef, Status: 'Complete', Amount: '100.00', SiteCode: process.env.OZOW_SITE_CODE, TransactionId: 'tx-4',
  })

  try {
    await ozow.reconcileOzowPayment(studentRef)
    const orderRowAfterStudent = (await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0]
    assert.strictEqual(orderRowAfterStudent.payment_status, 'unpaid', 'reconciling a student payment must not touch an unrelated order')

    await ozow.reconcileOzowPayment(orderRef)
    const studentRowAfterOrder = (await pool.query('SELECT * FROM students WHERE id = $1', [student.id])).rows[0]
    assert.strictEqual(parseFloat(studentRowAfterOrder.amount_paid), 500, 'reconciling an order payment must not touch an unrelated student')

    const orderRowAfter = (await pool.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0]
    assert.strictEqual(orderRowAfter.payment_status, 'paid')
  } finally {
    mockOzowTransactions.delete(studentRef)
    mockOzowTransactions.delete(orderRef)
    await cleanupStudent(student.id)
    await cleanupOrder(order.id)
  }
})

after(async () => {
  global.fetch = realFetch
  await pool.end()
})
