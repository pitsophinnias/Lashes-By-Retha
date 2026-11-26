// Security events for the sysadmin Security page - a unified log of
// everything that doesn't already fit audit_logs, error_log or
// payment_events (all reused as-is; see db.js). Writing here is always
// best-effort: a logging failure must never break the request that
// triggered it.
const { pool } = require('../../db')

const SEVERITY = { INFO: 'info', WARNING: 'warning', CRITICAL: 'critical' }

// Keeps the full number out of events entirely - shows just enough to
// recognise a repeat customer/attacker without exposing the number itself.
// "0826855399" -> "082***5399" (matches the product spec's own example).
const maskPhone = (phone) => {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length <= 7) return '*'.repeat(digits.length)
  return `${digits.slice(0, 3)}${'*'.repeat(digits.length - 7)}${digits.slice(-4)}`
}

async function logSecurityEvent({ type, severity = SEVERITY.INFO, ip, identifier, route, details }) {
  try {
    await pool.query(
      `INSERT INTO security_events (type, severity, ip, identifier, route, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, severity, ip || null, identifier || null, route || null, details || null]
    )
  } catch (err) {
    console.error('Failed to log security event:', err.message)
  }
}

// Creates a sysadmin notification for an alert condition, unless the same
// alert (matched by its exact title) already fired within the last hour -
// the product spec's own de-duplication rule. Returns true if a new
// notification was created, so a caller can log/verify in tests.
async function alertIfDue(title, message) {
  try {
    const recent = await pool.query(
      `SELECT 1 FROM notifications
       WHERE type = 'security' AND title = $1 AND created_at > NOW() - INTERVAL '1 hour'
       LIMIT 1`,
      [title]
    )
    if (recent.rows.length > 0) return false
    await pool.query(
      `INSERT INTO notifications (type, title, message) VALUES ('security', $1, $2)`,
      [title, message]
    )
    return true
  } catch (err) {
    console.error('Failed to create security alert:', err.message)
    return false
  }
}

const RETENTION_DAYS = 90

async function cleanupSecurityEvents() {
  try {
    await pool.query(`DELETE FROM security_events WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`)
  } catch (err) {
    console.error('Failed to clean up security_events:', err.message)
  }
}

module.exports = { SEVERITY, maskPhone, logSecurityEvent, alertIfDue, cleanupSecurityEvents, RETENTION_DAYS }
