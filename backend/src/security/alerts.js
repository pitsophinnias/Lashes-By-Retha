// Periodic sweep for the threshold-based Security page alerts (the
// event-triggered ones - username lockout, payment hash/signature
// mismatches - fire immediately at the point they happen instead; see
// index.js and rateLimits.js). Run on an interval from index.js.
const { pool } = require('../../db')
const { alertIfDue } = require('./events')
const { getSslDaysRemaining } = require('./sslCheck')
const { getDiskUsage } = require('./diskUsage')

const checkSecurityAlerts = async (uploadDir) => {
  try {
    const failedLogins = await pool.query(
      `SELECT COUNT(*) FROM security_events WHERE type = 'login_failed' AND created_at > NOW() - INTERVAL '15 minutes'`
    )
    if (parseInt(failedLogins.rows[0].count, 10) >= 20) {
      await alertIfDue(
        'High rate of failed admin logins',
        `${failedLogins.rows[0].count} failed admin login attempts in the last 15 minutes, across all usernames.`
      )
    }
  } catch (err) { console.error('Security alert check (failed logins) failed:', err.message) }

  try {
    const repeatIps = await pool.query(
      `SELECT ip, COUNT(*) AS count FROM security_events
       WHERE type = 'rate_limit' AND created_at > NOW() - INTERVAL '1 hour' AND ip IS NOT NULL
       GROUP BY ip HAVING COUNT(*) >= 5`
    )
    for (const row of repeatIps.rows) {
      await alertIfDue(
        `Repeated rate limit hits from ${row.ip}`,
        `${row.ip} has hit a rate limit ${row.count} times in the last hour.`
      )
    }
  } catch (err) { console.error('Security alert check (repeat IPs) failed:', err.message) }

  try {
    const serverErrors = await pool.query(
      `SELECT COUNT(*) FROM error_log WHERE created_at > NOW() - INTERVAL '15 minutes'`
    )
    if (parseInt(serverErrors.rows[0].count, 10) >= 10) {
      await alertIfDue(
        'High rate of server errors',
        `${serverErrors.rows[0].count} server errors logged in the last 15 minutes.`
      )
    }
  } catch (err) { console.error('Security alert check (server errors) failed:', err.message) }

  try {
    const lastSuccess = await pool.query(
      `SELECT started_at FROM backup_runs WHERE status = 'ok' ORDER BY started_at DESC LIMIT 1`
    )
    const lastAt = lastSuccess.rows[0]?.started_at
    const hoursSince = lastAt ? (Date.now() - new Date(lastAt).getTime()) / (1000 * 60 * 60) : null
    if (hoursSince === null || hoursSince > 26) {
      await alertIfDue(
        'Backups are overdue',
        lastAt
          ? `The last successful backup was ${Math.round(hoursSince)} hours ago.`
          : 'No successful backup has ever been recorded.'
      )
    }
  } catch (err) { console.error('Security alert check (backups) failed:', err.message) }

  try {
    const daysLeft = await getSslDaysRemaining()
    if (daysLeft !== null && daysLeft < 14) {
      await alertIfDue(
        'SSL certificate expiring soon',
        `The SSL certificate has ${daysLeft} day(s) left before it expires.`
      )
    }
  } catch (err) { console.error('Security alert check (SSL) failed:', err.message) }

  try {
    const disk = await getDiskUsage(uploadDir)
    if (disk && disk.usedPercent > 85) {
      await alertIfDue(
        'Disk space running low',
        `Disk usage is at ${disk.usedPercent}%.`
      )
    }
  } catch (err) { console.error('Security alert check (disk) failed:', err.message) }
}

module.exports = { checkSecurityAlerts }
