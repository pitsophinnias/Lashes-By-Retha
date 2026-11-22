// Admin session security limits - all configurable via env var so they can
// be shortened for testing without a code change. See the README's
// "Admin session security" section for how to do that.
const positiveNumber = (value, fallback) => {
  const parsed = parseFloat(value)
  return !isNaN(parsed) && parsed > 0 ? parsed : fallback
}

const idleTimeoutMinutes = positiveNumber(process.env.ADMIN_IDLE_TIMEOUT_MINUTES, 5)
const idleWarningSeconds = positiveNumber(process.env.ADMIN_IDLE_WARNING_SECONDS, 60)
const maxSessionHours = positiveNumber(process.env.ADMIN_MAX_SESSION_HOURS, 12)
// Absorbs normal clock/network drift between the frontend's own idle timer
// and this server's - kept roughly equal to the frontend's activity-ping
// throttle, so a session is never rejected just because the last heartbeat
// hasn't arrived yet.
const graceSeconds = positiveNumber(process.env.ADMIN_SESSION_GRACE_SECONDS, 30)

module.exports = {
  idleTimeoutMinutes,
  idleWarningSeconds,
  maxSessionHours,
  graceSeconds,
  idleTimeoutMs: idleTimeoutMinutes * 60 * 1000,
  maxSessionMs: maxSessionHours * 60 * 60 * 1000,
  graceMs: graceSeconds * 1000,
}
