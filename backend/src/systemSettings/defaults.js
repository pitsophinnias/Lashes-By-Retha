// Defaults for system_settings, seeded by db.js and used to fill in any
// field missing from a stored value (see fillMissingWithDefaults in
// ../siteSettings/schema).

const maintenance = {
  enabled: false,
  message: "We're making a few improvements and will be back shortly. Thank you for your patience.",
}

const payments = {
  ozowEnabled: true,
  payflexEnabled: true,
}

// How long a pre-order customer is told to expect to wait, counted from the
// day their deposit is paid. Editable by owner and sysadmin on the
// Pre-orders page - see PUT /api/admin/system/preorders.
const preorders = {
  minDays: 14,
  maxDays: 21,
}

// Lets a sysadmin show test orders/pre-orders/students/notifications in the
// owner and staff views too, for testing on real data without a separate
// account - see canIncludeTestData in index.js. Off by default so test data
// never leaks into Retha's figures by accident.
const showTestData = {
  enabled: false,
}

// Banking/business details used to fill in {bank_details}/{pop_number}/
// {business_name} in message templates, and the reminder timing the
// Dashboard's "Reminders Due" card uses - previously hardcoded in
// customer-site's EFT screen (see backend/src/messaging). Editable by
// owner and sysadmin - see PUT /api/admin/system/messaging - the same
// access level as the pre-order lead time above, since this is a business
// detail, not a system-administration one.
//
// paymentReminderDays/certificateWarningDays count back from a student's
// end_date (tuition must be paid in full before the course ends - there's
// no installment schedule), not from a start date - see
// src/messaging/reminders.js.
const messaging = {
  businessName: 'Hair By Her',
  bankName: 'FNB',
  accountName: 'Hair By Her',
  accountNumber: '63093932440',
  proofOfPaymentNumber: '082 685 5399',
  paymentReminderDays: 14,
  certificateWarningDays: 7,
  reminderSnoozeDays: 3,
}

module.exports = { maintenance, payments, preorders, showTestData, messaging }
