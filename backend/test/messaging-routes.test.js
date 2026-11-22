const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const http = require('node:http')
const jwt = require('jsonwebtoken')
const { createTestSessionId } = require('./helpers/session')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.PORT = '4026'
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:4026'
process.env.CUSTOMER_SITE_URL = process.env.CUSTOMER_SITE_URL || 'https://www.example.com'

const PORT = Number(process.env.PORT)

const request = (method, pathAndQuery, body, headers = {}) => new Promise((resolve, reject) => {
  const payload = body !== undefined ? JSON.stringify(body) : null
  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: pathAndQuery,
    method,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...headers,
    },
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
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Server did not start in time')
}

let api
let pool
let JWT_SECRET
const testUserIds = []
const createdProductIds = []
const createdStudentIds = []
const createdPreorderIds = []

const roleTokenInfo = {}
const tokenFor = (role) => jwt.sign(
  { id: roleTokenInfo[role].id, username: roleTokenInfo[role].username, role, tokenVersion: roleTokenInfo[role].tokenVersion, sessionId: roleTokenInfo[role].sessionId },
  JWT_SECRET,
  { expiresIn: '1h' }
)
const sysadminHeaders = () => ({ Authorization: `Bearer ${tokenFor('sysadmin')}` })
const ownerHeaders = () => ({ Authorization: `Bearer ${tokenFor('owner')}` })
const staffHeaders = () => ({ Authorization: `Bearer ${tokenFor('staff')}` })

const createTestUser = async (roleName) => {
  const roleRow = (await pool.query('SELECT id FROM roles WHERE name = $1', [roleName])).rows[0]
  const username = `messaging-routes-test-${roleName}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, is_active, must_change_password)
     VALUES ($1, 'x', $2, TRUE, FALSE) RETURNING *`,
    [username, roleRow.id]
  )
  testUserIds.push(result.rows[0].id)
  roleTokenInfo[roleName] = { id: result.rows[0].id, username: result.rows[0].username, tokenVersion: result.rows[0].token_version }
  roleTokenInfo[roleName].sessionId = await createTestSessionId(pool, result.rows[0].id)
}

before(async () => {
  api = require('../index')
  await waitForServer()
  pool = require('../db').pool
  JWT_SECRET = require('../auth').JWT_SECRET
  const sysadminRow = (await pool.query(
    `SELECT u.id, u.username, u.token_version FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'sysadmin' LIMIT 1`
  )).rows[0]
  roleTokenInfo.sysadmin = { id: sysadminRow.id, username: sysadminRow.username, tokenVersion: sysadminRow.token_version }
  roleTokenInfo.sysadmin.sessionId = await createTestSessionId(pool, sysadminRow.id)
  await createTestUser('owner')
  await createTestUser('staff')
})

// ── Templates ─────────────────────────────────────────────────────────────

test('GET /api/message-templates lists every built-in default, none overridden yet', async () => {
  const res = await request('GET', '/api/message-templates', undefined, staffHeaders())
  assert.strictEqual(res.status, 200)
  assert.ok(res.data.length >= 15)
  const orderReceived = res.data.find((t) => t.id === 'order_received')
  assert.ok(orderReceived)
  assert.strictEqual(orderReceived.isOverridden, false)
  assert.match(orderReceived.body, /\{first_name\}/)
})

test('GET /api/message-templates requires authentication', async () => {
  const res = await request('GET', '/api/message-templates')
  assert.strictEqual(res.status, 401)
})

test('staff cannot edit or reset a template, owner can', async () => {
  const staffAttempt = await request('PUT', '/api/message-templates/order_received', { body: 'x', emailSubject: 'y' }, staffHeaders())
  assert.strictEqual(staffAttempt.status, 403)

  const ownerSave = await request('PUT', '/api/message-templates/order_received',
    { body: 'Hi {first_name}, thanks!', emailSubject: 'Thanks {first_name}' }, ownerHeaders())
  assert.strictEqual(ownerSave.status, 200)
  assert.strictEqual(ownerSave.data.isOverridden, true)
  assert.strictEqual(ownerSave.data.body, 'Hi {first_name}, thanks!')
  assert.strictEqual(ownerSave.data.warning, null)

  const listed = await request('GET', '/api/message-templates', undefined, staffHeaders())
  const updated = listed.data.find((t) => t.id === 'order_received')
  assert.strictEqual(updated.isOverridden, true)
  assert.strictEqual(updated.body, 'Hi {first_name}, thanks!')

  const staffReset = await request('DELETE', '/api/message-templates/order_received', undefined, staffHeaders())
  assert.strictEqual(staffReset.status, 403)

  const ownerReset = await request('DELETE', '/api/message-templates/order_received', undefined, ownerHeaders())
  assert.strictEqual(ownerReset.status, 200)
  assert.strictEqual(ownerReset.data.isOverridden, false)
  assert.match(ownerReset.data.body, /Thank you so much for your order/)
})

test('saving a template with an unknown placeholder still saves, but returns a warning', async () => {
  const res = await request('PUT', '/api/message-templates/order_cancelled',
    { body: 'Hi {first_name}, your {totl} was cancelled.', emailSubject: 'Cancelled' }, ownerHeaders())
  assert.strictEqual(res.status, 200)
  assert.match(res.data.warning, /totl/)

  await request('DELETE', '/api/message-templates/order_cancelled', undefined, ownerHeaders())
})

test('editing an unknown template id 404s', async () => {
  const res = await request('PUT', '/api/message-templates/not_a_real_template', { body: 'x', emailSubject: 'y' }, ownerHeaders())
  assert.strictEqual(res.status, 404)
})

// ── Business details ─────────────────────────────────────────────────────

test('GET /api/business-details is public, returns the seeded defaults, and nothing else from settings', async () => {
  const res = await request('GET', '/api/business-details')
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.bankName, 'FNB')
  assert.strictEqual(res.data.accountNumber, '63093932440')
  assert.strictEqual(res.data.accountName, 'Hair By Her')
  assert.strictEqual(res.data.proofOfPaymentNumber, '082 685 5399')
  assert.deepStrictEqual(
    Object.keys(res.data).sort(),
    ['accountName', 'accountNumber', 'bankName', 'proofOfPaymentNumber'],
    'the public endpoint must expose only the four EFT-screen fields'
  )
  assert.strictEqual(res.data.businessName, undefined)
  assert.strictEqual(res.data.paymentReminderDays, undefined)
})

test('GET /api/admin/system/messaging is authenticated (any role) and returns the full settings', async () => {
  const anon = await request('GET', '/api/admin/system/messaging')
  assert.strictEqual(anon.status, 401)

  const res = await request('GET', '/api/admin/system/messaging', undefined, staffHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.bankName, 'FNB')
  assert.strictEqual(res.data.businessName, 'Hair By Her')
  assert.strictEqual(res.data.paymentReminderDays, 14)
})

test('owner can update business details; staff cannot; invalid values are rejected', async () => {
  const staffAttempt = await request('PUT', '/api/admin/system/messaging', { businessName: 'X' }, staffHeaders())
  assert.strictEqual(staffAttempt.status, 403)

  const missingField = await request('PUT', '/api/admin/system/messaging', {
    businessName: 'Hair By Her', bankName: '', accountName: 'Hair By Her', accountNumber: '123',
    proofOfPaymentNumber: '082 685 5399', paymentReminderDays: 3, certificateWarningDays: 7, reminderSnoozeDays: 3,
  }, ownerHeaders())
  assert.strictEqual(missingField.status, 400)

  const badDays = await request('PUT', '/api/admin/system/messaging', {
    businessName: 'Hair By Her', bankName: 'FNB', accountName: 'Hair By Her', accountNumber: '123',
    proofOfPaymentNumber: '082 685 5399', paymentReminderDays: -1, certificateWarningDays: 7, reminderSnoozeDays: 3,
  }, ownerHeaders())
  assert.strictEqual(badDays.status, 400)

  const ok = await request('PUT', '/api/admin/system/messaging', {
    businessName: 'Hair By Her', bankName: 'FNB', accountName: 'Hair By Her', accountNumber: '63093932440',
    proofOfPaymentNumber: '082 685 5399', paymentReminderDays: 5, certificateWarningDays: 10, reminderSnoozeDays: 2,
  }, ownerHeaders())
  assert.strictEqual(ok.status, 200)
  assert.strictEqual(ok.data.paymentReminderDays, 5)

  // Restore defaults so other tests (and the reminders ones below) see the
  // documented default days - via the permanent sysadmin, not the
  // ephemeral test owner, so system_settings.updated_by doesn't end up
  // pointing at a user this file is about to delete in after().
  await request('PUT', '/api/admin/system/messaging', {
    businessName: 'Hair By Her', bankName: 'FNB', accountName: 'Hair By Her', accountNumber: '63093932440',
    proofOfPaymentNumber: '082 685 5399', paymentReminderDays: 14, certificateWarningDays: 7, reminderSnoozeDays: 3,
  }, sysadminHeaders())
})

test('changing the account number is audit-logged with old/new values and raises a sysadmin notification', async () => {
  const changed = await request('PUT', '/api/admin/system/messaging', {
    businessName: 'Hair By Her', bankName: 'FNB', accountName: 'Hair By Her', accountNumber: '11122233344',
    proofOfPaymentNumber: '082 685 5399', paymentReminderDays: 14, certificateWarningDays: 7, reminderSnoozeDays: 3,
  }, ownerHeaders())
  assert.strictEqual(changed.status, 200)

  const auditRow = (await pool.query(
    `SELECT * FROM audit_logs WHERE action = 'MESSAGING_SETTINGS_CHANGED' ORDER BY created_at DESC LIMIT 1`
  )).rows[0]
  assert.ok(auditRow)
  assert.match(auditRow.details, /Account number: "63093932440" -> "11122233344"/)
  assert.ok(auditRow.user_id)
  assert.ok(auditRow.created_at)

  const notificationRow = (await pool.query(
    `SELECT * FROM notifications WHERE type = 'system' AND title = 'Payment account number changed' ORDER BY created_at DESC LIMIT 1`
  )).rows[0]
  assert.ok(notificationRow, 'an account number change must raise a system notification')
  assert.match(notificationRow.message, /11122233344/)

  // Restoring the account number is itself a real change (back to the old
  // value), so it correctly raises a second notification of its own.
  await request('PUT', '/api/admin/system/messaging', {
    businessName: 'Hair By Her', bankName: 'FNB', accountName: 'Hair By Her', accountNumber: '63093932440',
    proofOfPaymentNumber: '082 685 5399', paymentReminderDays: 14, certificateWarningDays: 7, reminderSnoozeDays: 3,
  }, sysadminHeaders())
  const countAfterRestore = (await pool.query(`SELECT COUNT(*) FROM notifications WHERE type = 'system' AND title = 'Payment account number changed'`)).rows[0]
  assert.strictEqual(parseInt(countAfterRestore.count), 2)

  // But saving again with that same (now unchanged) number must not.
  const noChangeAttempt = await request('PUT', '/api/admin/system/messaging', {
    businessName: 'Hair By Her', bankName: 'FNB', accountName: 'Hair By Her', accountNumber: '63093932440',
    proofOfPaymentNumber: '082 685 5399', paymentReminderDays: 14, certificateWarningDays: 7, reminderSnoozeDays: 3,
  }, sysadminHeaders())
  assert.strictEqual(noChangeAttempt.status, 200)
  const countAfter = (await pool.query(`SELECT COUNT(*) FROM notifications WHERE type = 'system' AND title = 'Payment account number changed'`)).rows[0]
  assert.strictEqual(parseInt(countAfter.count), 2, 'saving with no account number change must not raise another notification')
})

// ── Preorders: unmasked contact details ──────────────────────────────────

test('GET /api/admin/preorders returns the real customer name, phone and email, never masked', async () => {
  const product = await (async () => {
    const result = await pool.query(
      `INSERT INTO products (name, price, preorder_enabled, preorder_deposit, stock_quantity) VALUES ($1, 300, TRUE, 100, 0) RETURNING *`,
      [`Messaging Test Product ${Math.random().toString(16).slice(2)}`]
    )
    createdProductIds.push(result.rows[0].id)
    return result.rows[0]
  })()
  const preorder = await (async () => {
    const token = `messaging-test-preorder-${Math.random().toString(16).slice(2)}`
    const result = await pool.query(
      `INSERT INTO preorders (
         product_id, quantity, customer_name, customer_phone, customer_email, fulfilment_method,
         price_at_order, deposit_amount, delivery_fee, status, public_token
       ) VALUES ($1, 1, 'Naledi Mokoena', '+27826855399', 'naledi@example.com', 'pickup', 300, 100, 0, 'awaiting_deposit', $2)
       RETURNING *`,
      [product.id, token]
    )
    createdPreorderIds.push(result.rows[0].id)
    return result.rows[0]
  })()

  const res = await request('GET', '/api/admin/preorders', undefined, ownerHeaders())
  assert.strictEqual(res.status, 200)
  const group = res.data.products.find((p) => p.productId === product.id)
  assert.ok(group)
  const row = group.preorders.find((p) => p.id === preorder.id)
  assert.ok(row)
  assert.strictEqual(row.customerName, 'Naledi Mokoena')
  assert.strictEqual(row.customerPhone, '+27826855399')
  assert.strictEqual(row.customerEmail, 'naledi@example.com')
})

// ── Reminders ──────────────────────────────────────────────────────────────

const addDays = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const createStudent = async (overrides = {}) => {
  const token = `messaging-test-student-${Math.random().toString(16).slice(2)}`
  const result = await pool.query(
    `INSERT INTO students (
       class_id, name, whatsapp, email, payment_status, status, amount_paid, preferred_start_date, start_date, end_date, public_token
     ) VALUES (1, $1, '0821234567', 'student@example.com', $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      overrides.name || `Messaging Test Student ${Math.random().toString(16).slice(2)}`,
      overrides.paymentStatus || 'unpaid',
      overrides.status || 'active',
      overrides.amountPaid || 0,
      overrides.preferredStartDate || null,
      overrides.startDate || null,
      'endDate' in overrides ? overrides.endDate : addDays(7),
      token,
    ]
  )
  createdStudentIds.push(result.rows[0].id)
  // amount_paid is derived from the student_payments ledger from this
  // point on (see src/students/balance.js) - any route that recalculates
  // (complete/reactivate/dates/payments) would otherwise reset the column
  // straight back to 0, since a direct INSERT above leaves no ledger row
  // behind it.
  if (overrides.amountPaid > 0) {
    await pool.query(
      `INSERT INTO student_payments (student_id, amount, source) VALUES ($1, $2, 'legacy')`,
      [result.rows[0].id, overrides.amountPaid]
    )
  }
  return result.rows[0]
}

test('GET /api/admin/reminders includes a student whose balance is due soon, excludes a fully paid one', async () => {
  const studentDue = await createStudent({ endDate: addDays(1), amountPaid: 500 })
  const studentPaid = await createStudent({ endDate: addDays(1), amountPaid: 2500, paymentStatus: 'paid' })

  const res = await request('GET', '/api/admin/reminders', undefined, ownerHeaders())
  assert.strictEqual(res.status, 200)
  assert.ok(res.data.reminders.some((r) => r.studentId === studentDue.id))
  assert.ok(!res.data.reminders.some((r) => r.studentId === studentPaid.id))
})

test('GET /api/admin/reminders lists a student with no end_date under missingCourseDates, not reminders', async () => {
  const student = await createStudent({ endDate: null, amountPaid: 500 })
  const res = await request('GET', '/api/admin/reminders', undefined, ownerHeaders())
  assert.strictEqual(res.status, 200)
  assert.ok(!res.data.reminders.some((r) => r.studentId === student.id))
  assert.ok(res.data.missingCourseDates.some((m) => m.studentId === student.id))
})

test('GET /api/admin/reminders flags a student whose course has ended with an outstanding balance as overdue', async () => {
  const student = await createStudent({ endDate: addDays(-2), amountPaid: 500 })
  const res = await request('GET', '/api/admin/reminders', undefined, ownerHeaders())
  const row = res.data.reminders.find((r) => r.studentId === student.id)
  assert.ok(row)
  assert.strictEqual(row.type, 'overdue')
  assert.match(row.reason, /outstanding/)
})

test('staff cannot see reminders', async () => {
  const res = await request('GET', '/api/admin/reminders', undefined, staffHeaders())
  assert.strictEqual(res.status, 403)
})

test('PATCH /api/admin/students/:id/reminder sets the marker, accepts "overdue", and rejects an invalid type', async () => {
  const student = await createStudent({ endDate: addDays(1) })

  const bad = await request('PATCH', `/api/admin/students/${student.id}/reminder`, { type: 'nonsense' }, ownerHeaders())
  assert.strictEqual(bad.status, 400)

  const ok = await request('PATCH', `/api/admin/students/${student.id}/reminder`, { type: 'overdue' }, ownerHeaders())
  assert.strictEqual(ok.status, 200)

  const row = (await pool.query('SELECT last_reminded_at, last_reminder_type FROM students WHERE id = $1', [student.id])).rows[0]
  assert.ok(row.last_reminded_at)
  assert.strictEqual(row.last_reminder_type, 'overdue')
})

// ── Confirmed course dates ───────────────────────────────────────────────

test('PATCH .../students/:studentId/dates saves start/end dates, validates them, and is owner/sysadmin only', async () => {
  const student = await createStudent({ endDate: null, startDate: null })

  const staffAttempt = await request('PATCH', `/api/classes/1/students/${student.id}/dates`,
    { startDate: '2026-07-01', endDate: '2026-07-15' }, staffHeaders())
  assert.strictEqual(staffAttempt.status, 403)

  const missing = await request('PATCH', `/api/classes/1/students/${student.id}/dates`, {}, ownerHeaders())
  assert.strictEqual(missing.status, 400)

  const backwards = await request('PATCH', `/api/classes/1/students/${student.id}/dates`,
    { startDate: '2026-07-15', endDate: '2026-07-01' }, ownerHeaders())
  assert.strictEqual(backwards.status, 400)

  const ok = await request('PATCH', `/api/classes/1/students/${student.id}/dates`,
    { startDate: '2026-07-01', endDate: '2026-07-15' }, ownerHeaders())
  assert.strictEqual(ok.status, 200)
  assert.strictEqual(ok.data.startDate.slice(0, 10), '2026-07-01')
  assert.strictEqual(ok.data.endDate.slice(0, 10), '2026-07-15')
})

// ── Mark as Finished / certificate hold ──────────────────────────────────

test('PATCH .../complete holds the certificate when a balance remains, and not when fully paid', async () => {
  const withBalance = await createStudent({ amountPaid: 1000 }) // course price is 2500
  const res1 = await request('PATCH', `/api/classes/1/students/${withBalance.id}/complete`, undefined, ownerHeaders())
  assert.strictEqual(res1.status, 200)
  assert.strictEqual(res1.data.certificateOnHold, true)

  const fullyPaid = await createStudent({ amountPaid: 2500 })
  const res2 = await request('PATCH', `/api/classes/1/students/${fullyPaid.id}/complete`, undefined, ownerHeaders())
  assert.strictEqual(res2.status, 200)
  assert.strictEqual(res2.data.certificateOnHold, false)
})

test('GET /api/admin/students/:id looks up a student by id alone, for the certificate-cleared toast', async () => {
  const student = await createStudent()
  const anon = await request('GET', `/api/admin/students/${student.id}`)
  assert.strictEqual(anon.status, 401)
  const res = await request('GET', `/api/admin/students/${student.id}`, undefined, ownerHeaders())
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.data.id, student.id)
})

// ── Student payments ledger ──────────────────────────────────────────────

test('recording a manual payment that clears a held certificate reports it immediately, in the same response', async () => {
  const student = await createStudent({ amountPaid: 1000 }) // course price is 2500
  const completed = await request('PATCH', `/api/classes/1/students/${student.id}/complete`, undefined, ownerHeaders())
  assert.strictEqual(completed.data.certificateOnHold, true)

  const staffAttempt = await request('POST', `/api/classes/1/students/${student.id}/payments`, { amount: 100 }, staffHeaders())
  assert.strictEqual(staffAttempt.status, 403)

  const badAmount = await request('POST', `/api/classes/1/students/${student.id}/payments`, { amount: -5 }, ownerHeaders())
  assert.strictEqual(badAmount.status, 400)

  const partial = await request('POST', `/api/classes/1/students/${student.id}/payments`, { amount: 1000, note: 'EFT part payment' }, ownerHeaders())
  assert.strictEqual(partial.status, 201)
  assert.strictEqual(partial.data.certificateJustCleared, false, 'still owes R500 - must not report cleared yet')
  assert.strictEqual(partial.data.student.certificateOnHold, true)

  const final = await request('POST', `/api/classes/1/students/${student.id}/payments`, { amount: 500 }, ownerHeaders())
  assert.strictEqual(final.status, 201)
  assert.strictEqual(final.data.certificateJustCleared, true, 'the balance reaching zero on THIS call must be reported in the same response')
  assert.strictEqual(final.data.student.certificateOnHold, false)
  assert.strictEqual(final.data.student.balance, 0)

  const listed = await request('GET', `/api/classes/1/students/${student.id}/payments`, undefined, ownerHeaders())
  assert.strictEqual(listed.status, 200)
  assert.strictEqual(listed.data.length, 3) // the initial 1000 (legacy), the 1000 part payment, the final 500
  assert.ok(listed.data.every((p) => p.source === 'manual' || p.source === 'legacy'))
})

test('deleting a payment that pushes a completed student back into debt re-holds the certificate', async () => {
  const student = await createStudent({ amountPaid: 2500 }) // fully paid already
  const completed = await request('PATCH', `/api/classes/1/students/${student.id}/complete`, undefined, ownerHeaders())
  assert.strictEqual(completed.data.certificateOnHold, false, 'fully paid - must not start on hold')

  const listed = await request('GET', `/api/classes/1/students/${student.id}/payments`, undefined, ownerHeaders())
  const legacyPayment = listed.data.find((p) => p.amount === 2500)
  assert.ok(legacyPayment)

  const staffAttempt = await request('DELETE', `/api/classes/1/students/${student.id}/payments/${legacyPayment.id}`, undefined, staffHeaders())
  assert.strictEqual(staffAttempt.status, 403)

  const deleted = await request('DELETE', `/api/classes/1/students/${student.id}/payments/${legacyPayment.id}`, undefined, ownerHeaders())
  assert.strictEqual(deleted.status, 200)
  assert.strictEqual(deleted.data.certificateJustReHeld, true)
  assert.strictEqual(deleted.data.student.certificateOnHold, true)
  assert.strictEqual(deleted.data.student.balance, 2500)
  assert.strictEqual(deleted.data.student.status, 'completed', 're-holding must not move the student off Past Students')

  const unknownPayment = await request('DELETE', `/api/classes/1/students/${student.id}/payments/999999`, undefined, ownerHeaders())
  assert.strictEqual(unknownPayment.status, 404)
})

after(async () => {
  await pool.query('DELETE FROM students WHERE id = ANY($1)', [createdStudentIds])
  await pool.query('DELETE FROM preorders WHERE id = ANY($1)', [createdPreorderIds])
  await pool.query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds])
  await pool.query('DELETE FROM message_templates WHERE id IN ($1, $2)', ['order_received', 'order_cancelled'])
  await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [testUserIds])
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds])
  await new Promise((resolve) => api.getServer().close(resolve))
  await pool.end()
})
