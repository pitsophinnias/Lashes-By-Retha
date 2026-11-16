// DB access for system_settings, kept separate from index.js (like
// siteSettings/store.js) so it can be required directly in tests without
// booting the server.

const { pool } = require('../../db')
const { fillMissingWithDefaults } = require('../siteSettings/schema')
const defaults = require('./defaults')

const SYSTEM_SETTINGS_KEYS = Object.keys(defaults)

// Reads both keys fresh from the DB every call, the same as GET
// /api/site-settings does for site_settings - these are cheap primary-key
// reads, and callers gating maintenance/payments need the current value,
// never a stale cached one.
async function readSystemSettings() {
  const { rows } = await pool.query('SELECT key, value FROM system_settings')
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const result = {}
  for (const key of SYSTEM_SETTINGS_KEYS) {
    result[key] = fillMissingWithDefaults(stored[key], defaults[key])
  }
  return result
}

async function saveSystemSetting(key, value, adminId) {
  if (!SYSTEM_SETTINGS_KEYS.includes(key)) {
    throw new Error(`Unknown system settings key: ${key}`)
  }
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at, updated_by) VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW(), updated_by = $3`,
    [key, value, adminId]
  )
}

module.exports = { SYSTEM_SETTINGS_KEYS, readSystemSettings, saveSystemSetting }
