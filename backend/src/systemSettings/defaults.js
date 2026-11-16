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

module.exports = { maintenance, payments }
