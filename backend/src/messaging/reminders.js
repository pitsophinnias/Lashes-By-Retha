// Decides whether one lash-training student needs a reminder today, for
// the Dashboard's "Reminders Due" card (GET /api/admin/reminders calls
// this once per active/awaiting-payment student that has an end_date).
//
// Retha's rule: tuition must be fully paid BEFORE the course ends - there
// is no installment schedule, just one balance counted down against the
// confirmed end_date (see students.end_date, set when she confirms an
// enrolment - never preferred_start_date, which is only what the customer
// originally typed in). A student with no end_date yet is skipped here
// entirely and surfaced separately as "missing course dates" (see
// GET /api/admin/reminders), not silently ignored.
const MS_PER_DAY = 24 * 60 * 60 * 1000

const daysBetween = (from, to) => Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)

// type-specific wording - overdue embeds the outstanding amount directly
// (per the Dashboard card's own spec: "Course ended 3 Dec, R X
// outstanding"), the other two just say how many days are left.
const formatReason = (type, days, date, balance) => {
  const formatted = date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
  if (type === 'overdue') return `Course ended ${formatted}, R ${balance.toFixed(2)} outstanding`
  if (type === 'certificate') {
    return days === 0 ? 'Course ends today' : `Course ends in ${days} day${days === 1 ? '' : 's'}`
  }
  return days === 0 ? 'Payment due today' : `Due in ${days} day${days === 1 ? '' : 's'}`
}

// student: a row from `students` (snake_case), joined with its course.
// course: the matching row from `courses`, or null.
// settings: systemSettings.messaging ({ paymentReminderDays,
//   certificateWarningDays, reminderSnoozeDays }).
// now: injectable for tests - defaults to the real current time.
const selectReminder = (student, course, settings, now = new Date()) => {
  if (!course) return null
  if (student.status === 'completed') return null
  if (!student.end_date) return null
  if (student.payment_status === 'paid') return null

  const price = parseFloat(course.price)
  const amountPaid = parseFloat(student.amount_paid) || 0
  const balance = Math.max(0, price - amountPaid)
  if (balance <= 0) return null

  const endDate = new Date(student.end_date)
  const daysUntilEnd = daysBetween(now, endDate)

  // Overdue (already past end_date) always wins; otherwise the closer
  // window (certificate) takes priority over the wider one (payment) -
  // whichever window the student currently falls into.
  let type = null
  if (daysUntilEnd < 0) type = 'overdue'
  else if (daysUntilEnd <= settings.certificateWarningDays) type = 'certificate'
  else if (daysUntilEnd <= settings.paymentReminderDays) type = 'payment'
  if (!type) return null

  // Already reminded about this exact thing recently - don't nag again
  // until the snooze gap has passed. A reminder whose TYPE has changed
  // since the last one (e.g. payment -> overdue) always shows regardless -
  // that's new information, not a repeat.
  if (student.last_reminded_at && student.last_reminder_type === type) {
    const daysSinceReminded = daysBetween(new Date(student.last_reminded_at), now)
    if (daysSinceReminded < settings.reminderSnoozeDays) return null
  }

  return {
    type,
    dueDate: endDate.toISOString().slice(0, 10),
    reason: formatReason(type, daysUntilEnd, endDate, balance),
    amountOutstanding: balance,
  }
}

module.exports = { selectReminder }
