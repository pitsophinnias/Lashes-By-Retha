const { test } = require('node:test')
const assert = require('node:assert')
const { selectReminder } = require('../src/messaging/reminders')

const SETTINGS = { paymentReminderDays: 14, certificateWarningDays: 7, reminderSnoozeDays: 3 }
const NOW = new Date('2026-06-15T10:00:00Z')
const COURSE = { price: '2500.00' }

const addDays = (days) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const baseStudent = (overrides = {}) => ({
  status: 'active',
  payment_status: 'partial',
  amount_paid: '1000.00',
  end_date: addDays(14),
  last_reminded_at: null,
  last_reminder_type: null,
  ...overrides,
})

test('no course at all - never reminded', () => {
  assert.strictEqual(selectReminder(baseStudent(), null, SETTINGS, NOW), null)
})

test('no end_date - never reminded (missing course dates, handled separately)', () => {
  assert.strictEqual(selectReminder(baseStudent({ end_date: null }), COURSE, SETTINGS, NOW), null)
})

test('fully paid - never reminded, even if the course ends soon', () => {
  const student = baseStudent({ payment_status: 'paid', amount_paid: '2500.00' })
  assert.strictEqual(selectReminder(student, COURSE, SETTINGS, NOW), null)
})

test('a completed student is never reminded', () => {
  assert.strictEqual(selectReminder(baseStudent({ status: 'completed' }), COURSE, SETTINGS, NOW), null)
})

test('a fully paid balance (amount_paid >= price) is excluded even with payment_status stuck as partial', () => {
  const student = baseStudent({ amount_paid: '2500.00', payment_status: 'partial' })
  assert.strictEqual(selectReminder(student, COURSE, SETTINGS, NOW), null)
})

// ── Window boundaries: 15 / 14 / 8 / 7 / 0 / -1 days before end_date ───────
test('15 days before end - too far out, not flagged at all', () => {
  const student = baseStudent({ end_date: addDays(15) })
  assert.strictEqual(selectReminder(student, COURSE, SETTINGS, NOW), null)
})

test('14 days before end - exactly at the payment reminder boundary', () => {
  const student = baseStudent({ end_date: addDays(14) })
  const reminder = selectReminder(student, COURSE, SETTINGS, NOW)
  assert.ok(reminder)
  assert.strictEqual(reminder.type, 'payment')
  assert.match(reminder.reason, /Due in 14 days/)
})

test('8 days before end - still a payment reminder (further out than the certificate window)', () => {
  const student = baseStudent({ end_date: addDays(8) })
  const reminder = selectReminder(student, COURSE, SETTINGS, NOW)
  assert.ok(reminder)
  assert.strictEqual(reminder.type, 'payment')
})

test('7 days before end - exactly at the certificate warning boundary', () => {
  const student = baseStudent({ end_date: addDays(7) })
  const reminder = selectReminder(student, COURSE, SETTINGS, NOW)
  assert.ok(reminder)
  assert.strictEqual(reminder.type, 'certificate')
  assert.match(reminder.reason, /Course ends in 7 days/)
})

test('0 days before end (ends today) - still a certificate warning, not overdue', () => {
  const student = baseStudent({ end_date: addDays(0) })
  const reminder = selectReminder(student, COURSE, SETTINGS, NOW)
  assert.ok(reminder)
  assert.strictEqual(reminder.type, 'certificate')
  assert.match(reminder.reason, /Course ends today/)
})

test('-1 days before end (1 day overdue) - overdue, with the amount embedded in the reason', () => {
  const student = baseStudent({ end_date: addDays(-1) })
  const reminder = selectReminder(student, COURSE, SETTINGS, NOW)
  assert.ok(reminder)
  assert.strictEqual(reminder.type, 'overdue')
  assert.strictEqual(reminder.amountOutstanding, 1500)
  assert.match(reminder.reason, /^Course ended .+, R 1500\.00 outstanding$/)
})

test('well overdue is still just "overdue", regardless of how many days have passed', () => {
  const student = baseStudent({ end_date: addDays(-40) })
  const reminder = selectReminder(student, COURSE, SETTINGS, NOW)
  assert.ok(reminder)
  assert.strictEqual(reminder.type, 'overdue')
})

// ── Snooze behaviour (unchanged in spirit, now keyed off end_date) ────────
test('a reminder sent recently (within the snooze gap) for the same type does not resurface', () => {
  const student = baseStudent({
    end_date: addDays(7),
    last_reminded_at: '2026-06-14T10:00:00Z', // 1 day ago, snooze is 3 days
    last_reminder_type: 'certificate',
  })
  assert.strictEqual(selectReminder(student, COURSE, SETTINGS, NOW), null)
})

test('a reminder reappears once the snooze gap has passed', () => {
  const student = baseStudent({
    end_date: addDays(7),
    last_reminded_at: '2026-06-10T10:00:00Z', // 5 days ago, snooze is 3 days
    last_reminder_type: 'certificate',
  })
  const reminder = selectReminder(student, COURSE, SETTINGS, NOW)
  assert.ok(reminder)
})

test('a reminder reappears immediately when the type changes, even within the snooze gap', () => {
  // Reminded 1 day ago (well within the 3-day snooze) about a payment,
  // but the window has since moved into "overdue" - new information, not
  // a repeat, so it must show regardless of the gap.
  const student = baseStudent({
    end_date: addDays(-1),
    last_reminded_at: '2026-06-14T10:00:00Z',
    last_reminder_type: 'payment',
  })
  const reminder = selectReminder(student, COURSE, SETTINGS, NOW)
  assert.ok(reminder)
  assert.strictEqual(reminder.type, 'overdue')
})
