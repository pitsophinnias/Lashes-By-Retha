// Shared by ozow.js and payflex.js: once each has fetched its own provider's
// status and decided isPaid/newStatus, this applies that decision to
// whichever order, student or pre-order the payment belongs to. Exactly one
// of payment.order_id/payment.student_id/payment.preorder_id is set on any
// payment row.

const crypto = require('crypto')
const { readSystemSettings } = require('./src/systemSettings/store')

// Only the latest attempt in the same provider's payments table may move the
// order's overall payment_status - a stale result from an older attempt
// (e.g. a late "Cancelled" after the customer already succeeded on a retry)
// must not overwrite it. A paid result always wins and is never downgraded,
// regardless of which attempt it came from. Returns the order when this call
// is the one that actually marks it paid, so the caller sends exactly one
// notification; otherwise null.
async function applyOrderOutcome(client, table, payment, isPaid, newStatus) {
  const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [payment.order_id])
  const order = orderResult.rows[0]
  if (!order) return null
  if (order.payment_status === 'paid') return null // already paid - a second result must change nothing

  const latestAttemptResult = await client.query(
    `SELECT id FROM ${table} WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [order.id]
  )
  const isLatestAttempt = latestAttemptResult.rows[0]?.id === payment.id

  if (isPaid) {
    await client.query(`UPDATE orders SET payment_status = 'paid', paid_at = NOW() WHERE id = $1`, [order.id])
    return order
  }
  if (isLatestAttempt) {
    await client.query('UPDATE orders SET payment_status = $1 WHERE id = $2', [newStatus, order.id])
  }
  return null
}

// A student can have several successful payments over time (a deposit, then
// a balance) - unlike an order, a later payment never supersedes an earlier
// one, it adds to it. The caller only reaches here for a payment attempt
// that has just turned paid and was never counted before, so this always
// credits it exactly once. Returns the updated student (with its course
// attached) for the caller's notification.
async function applyStudentOutcome(client, payment) {
  const studentResult = await client.query('SELECT * FROM students WHERE id = $1 FOR UPDATE', [payment.student_id])
  const student = studentResult.rows[0]
  if (!student) return null

  const courseResult = await client.query('SELECT * FROM courses WHERE id = $1', [student.class_id])
  const course = courseResult.rows[0] || null
  const price = course ? parseFloat(course.price) : parseFloat(payment.amount)
  const amountPaid = parseFloat(student.amount_paid) + parseFloat(payment.amount)
  const paymentStatus = amountPaid >= price ? 'paid' : (amountPaid > 0 ? 'partial' : 'unpaid')
  const status = student.status === 'awaiting_payment' ? 'active' : student.status

  await client.query(
    `UPDATE students SET amount_paid = $1, payment_status = $2, status = $3 WHERE id = $4`,
    [amountPaid.toFixed(2), paymentStatus, status, student.id]
  )
  return { ...student, amount_paid: amountPaid, course }
}

// A pre-order can have two successful payments over time (a deposit, then a
// balance) - like a student's payments, a later one adds to amount_paid
// rather than superseding it. The caller only reaches here for a payment
// attempt that has just turned paid and was never counted before, so this
// always credits it exactly once. Moves awaiting_deposit -> deposit_paid
// once the deposit is covered, and arrived -> paid_in_full once the total is
// covered - at which point it also creates the linked order, guarded on
// order_id still being empty so a duplicate callback can never create a
// second one. promised_by_date is set once, from whatever the lead time
// setting says at the moment the deposit clears, and is never recalculated
// afterwards even if the setting changes later. Returns enough for the
// caller's notification.
async function applyPreorderOutcome(client, payment) {
  const preorderResult = await client.query('SELECT * FROM preorders WHERE id = $1 FOR UPDATE', [payment.preorder_id])
  const preorder = preorderResult.rows[0]
  if (!preorder) return null

  const quantity = parseInt(preorder.quantity) || 1
  const amountPaid = parseFloat(preorder.amount_paid) + parseFloat(payment.amount)
  let status = preorder.status
  let promisedByDate = preorder.promised_by_date
  let justDepositPaid = false
  let justPaidInFull = false

  if (status === 'awaiting_deposit' && amountPaid + 0.005 >= parseFloat(preorder.deposit_amount)) {
    status = 'deposit_paid'
    justDepositPaid = true
    const settings = await readSystemSettings()
    const promised = new Date()
    promised.setDate(promised.getDate() + settings.preorders.maxDays)
    // Built from local calendar fields, not toISOString() - converting
    // "now" to UTC first can land on the wrong side of midnight depending
    // on the server's local timezone.
    promisedByDate = `${promised.getFullYear()}-${String(promised.getMonth() + 1).padStart(2, '0')}-${String(promised.getDate()).padStart(2, '0')}`
  }

  const totalDue = parseFloat(preorder.price_at_order) * quantity + parseFloat(preorder.delivery_fee)
  if (status === 'arrived' && amountPaid + 0.005 >= totalDue) {
    status = 'paid_in_full'
    justPaidInFull = true
  }

  await client.query(
    `UPDATE preorders SET amount_paid = $1, status = $2, promised_by_date = $3 WHERE id = $4`,
    [amountPaid.toFixed(2), status, promisedByDate, preorder.id]
  )

  const productResult = await client.query('SELECT * FROM products WHERE id = $1', [preorder.product_id])
  const product = productResult.rows[0] || null

  let orderId = preorder.order_id
  if (justPaidInFull && !orderId) {
    const publicToken = crypto.randomBytes(24).toString('hex')
    const subtotal = parseFloat(preorder.price_at_order) * quantity
    const total = subtotal + parseFloat(preorder.delivery_fee)
    const orderResult = await client.query(
      `INSERT INTO orders (
         customer_name, customer_phone, customer_email, total, fulfilment_method, subtotal, delivery_fee,
         delivery_address, delivery_suburb, delivery_city, delivery_postal_code, delivery_notes,
         payment_method, payment_status, paid_at, public_token, is_test
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ozow','paid',NOW(),$13,$14) RETURNING *`,
      [
        preorder.customer_name, preorder.customer_phone, preorder.customer_email, total, preorder.fulfilment_method,
        subtotal, preorder.delivery_fee, preorder.delivery_address, preorder.delivery_suburb, preorder.delivery_city,
        preorder.delivery_postal_code, preorder.delivery_notes, publicToken, preorder.is_test,
      ]
    )
    const order = orderResult.rows[0]
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, qty, price, product_option_id, option_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        order.id, preorder.product_id, product ? product.name : 'Pre-order item', quantity, preorder.price_at_order,
        preorder.product_option_id, preorder.option_name,
      ]
    )
    await client.query('UPDATE preorders SET order_id = $1 WHERE id = $2', [order.id, preorder.id])
    orderId = order.id
  }

  return {
    preorder: { ...preorder, amount_paid: amountPaid, status },
    product,
    justDepositPaid,
    justPaidInFull,
    orderId,
  }
}

module.exports = { applyOrderOutcome, applyStudentOutcome, applyPreorderOutcome }
