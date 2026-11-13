// Shared by ozow.js and payflex.js: once each has fetched its own provider's
// status and decided isPaid/newStatus, this applies that decision to
// whichever order or student the payment belongs to. Exactly one of
// payment.order_id/payment.student_id is set on any payment row.

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

module.exports = { applyOrderOutcome, applyStudentOutcome }
