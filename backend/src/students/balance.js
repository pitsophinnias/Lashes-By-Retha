// The one place a student's amount_paid/payment_status/status/
// certificate_on_hold are ever written. Every payment path - a manual
// entry recorded by an owner/staff member, a gateway payment reconciled
// by ozow.js/payflex.js, or deleting/correcting either of those - inserts
// or removes a row in student_payments (the ledger) and then calls this
// to recompute the four fields from that ledger's current total. That's
// what makes "delete a payment and the balance (and certificate hold)
// goes back to what it should be" actually true, instead of each path
// hand-rolling its own increment/decrement that can drift from reality.
//
// Must be called with a client already inside a transaction that holds a
// row lock on the student (SELECT ... FOR UPDATE) - callers do that
// themselves, since they're usually also inserting/deleting the ledger
// row in the same transaction.
async function recalculateStudentBalance(client, studentId) {
  const studentResult = await client.query('SELECT * FROM students WHERE id = $1', [studentId])
  const student = studentResult.rows[0]
  if (!student) return null

  const courseResult = await client.query('SELECT * FROM courses WHERE id = $1', [student.class_id])
  const course = courseResult.rows[0] || null
  const price = course ? parseFloat(course.price) : 0

  const sumResult = await client.query(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM student_payments WHERE student_id = $1',
    [studentId]
  )
  const amountPaid = parseFloat(sumResult.rows[0].total)
  const balance = Math.max(0, price - amountPaid)

  const paymentStatus = amountPaid >= price ? 'paid' : (amountPaid > 0 ? 'partial' : 'unpaid')
  // Only ever promotes awaiting_payment -> active (the first payment
  // landing) - never demotes an already-active/completed student back,
  // even if a correction drops amountPaid to 0.
  const status = student.status === 'awaiting_payment' && amountPaid > 0 ? 'active' : student.status
  // A "Finished" student's certificate is held back exactly when they
  // still owe something - recomputed fresh every time, so a correction or
  // deletion that pushes the balance back above zero re-holds it, not
  // just a one-way clear.
  const certificateOnHold = status === 'completed' && balance > 0

  const wasOnHold = student.certificate_on_hold
  const result = await client.query(
    `UPDATE students SET amount_paid = $1, payment_status = $2, status = $3, certificate_on_hold = $4
     WHERE id = $5 RETURNING *`,
    [amountPaid.toFixed(2), paymentStatus, status, certificateOnHold, studentId]
  )

  return {
    student: { ...result.rows[0], course },
    certificateJustCleared: wasOnHold && !certificateOnHold,
    certificateJustReHeld: !wasOnHold && certificateOnHold,
  }
}

module.exports = { recalculateStudentBalance }
