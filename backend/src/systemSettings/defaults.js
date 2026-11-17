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

module.exports = { maintenance, payments, preorders }
