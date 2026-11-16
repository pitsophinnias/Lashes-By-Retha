// DB access for error_log, kept separate from index.js (like the other
// src/ stores) so it can be required directly in tests without booting the
// server.

const { pool } = require('../../db')
const { sanitizeMessage } = require('./sanitize')

const RETENTION_DAYS = 30
const MAX_ROWS = 2000

// Saves one error_log row and still prints to console, exactly like the
// console.error calls it replaces - this is a logging helper, never allowed
// to throw or to change what the caller does next. req is optional (the
// daily archive jobs and other non-request code have no req to pass) - route
// is the matched route *pattern* (e.g. "/api/orders/:token/retry"), never
// req.path, so a token or id in the URL is never stored. status comes from
// req.res.statusCode, which Express sets as soon as res.status() is called -
// callers should log after sending the response, not before, so this reads
// the real status rather than the default 200.
async function logError(context, err, req) {
  const message = sanitizeMessage(err?.message || String(err))
  console.error(context, message)
  try {
    await pool.query(
      `INSERT INTO error_log (level, context, message, route, method, status, user_id)
       VALUES ('error', $1, $2, $3, $4, $5, $6)`,
      [
        context || null,
        message,
        req?.route?.path || null,
        req?.method || null,
        req?.res?.statusCode || null,
        req?.user?.id || null,
      ]
    )
  } catch (logErr) {
    console.error('Failed to write error_log row:', logErr.message)
  }
}

// Called once at startup and once a day (see index.js) - keeps error_log
// from growing unbounded on a long-running instance.
async function cleanupErrorLog() {
  try {
    await pool.query(`DELETE FROM error_log WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`)
    await pool.query(
      `DELETE FROM error_log WHERE id NOT IN (
         SELECT id FROM error_log ORDER BY created_at DESC LIMIT ${MAX_ROWS}
       )`
    )
  } catch (err) {
    console.error('Failed to clean up error_log:', err.message)
  }
}

module.exports = { logError, cleanupErrorLog, RETENTION_DAYS, MAX_ROWS }
