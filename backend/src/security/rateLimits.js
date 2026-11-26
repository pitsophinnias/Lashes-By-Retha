// Tiered rate limits. Every limiter here is keyed per-IP, per-username,
// per-phone or per-order - never a single global counter across all
// visitors - because South African mobile customers (Vodacom, MTN, Telkom,
// Cell C) routinely share one public IP behind CGNAT. An IP-only limit
// tight enough to stop abuse from one person would also lock out dozens of
// genuine customers sharing that IP, so every "creation"/"payment" tier
// pairs a loose per-IP ceiling with a tight per-customer one.
//
// All thresholds are env-configurable (see .env.example) so they can be
// retuned on the server without a deploy.
const { rateLimit, ipKeyGenerator } = require('express-rate-limit')
const { normaliseSaPhone } = require('../../phone')
const { logSecurityEvent, alertIfDue, maskPhone, SEVERITY } = require('./events')

const envInt = (name, fallback) => {
  const parsed = parseInt(process.env[name], 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const FIFTEEN_MIN = 15 * 60 * 1000
const ONE_HOUR = 60 * 60 * 1000

const POLITE_MESSAGE = "We're receiving a lot of requests right now. Please try again in a few minutes."

// Shared by every limiter below - records the hit as a security event
// (never blocks the 429 response on that write) and always replies with
// the same soft, non-alarming message rather than a raw rate-limit error.
const makeHandler = (limiterName, describeIdentifier) => async (req, res, next, options) => {
  const identifier = describeIdentifier ? describeIdentifier(req) : undefined
  logSecurityEvent({
    type: 'rate_limit',
    severity: SEVERITY.WARNING,
    ip: req.ip,
    identifier,
    route: `${req.method} ${req.baseUrl || ''}${req.path}`,
    details: `${limiterName} limit exceeded`,
  })
  res.status(options.statusCode || 429).json({ error: POLITE_MESSAGE })
}

const usernameKey = (req) => {
  const username = String(req.body?.username || '').trim().toLowerCase()
  return username ? `user:${username}` : ipKeyGenerator(req.ip)
}

const phoneKey = (req) => {
  const raw = req.body?.customerPhone || req.body?.phone
  const normalised = raw ? normaliseSaPhone(raw) : null
  return normalised ? `phone:${normalised}` : ipKeyGenerator(req.ip)
}

// For security-event logging only - never the full number, which the
// bucket key above still needs in order to actually group by customer.
const maskedPhoneIdentifier = (req) => {
  const raw = req.body?.customerPhone || req.body?.phone
  const normalised = raw ? normaliseSaPhone(raw) : null
  return normalised ? maskPhone(normalised) : req.ip
}

const orderKey = (req) => {
  const token = req.body?.orderToken || req.params?.token
  return token ? `order:${token}` : ipKeyGenerator(req.ip)
}

// ── General API (product lists, settings, etc.) ────────────────────────────
const generalApiLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_GENERAL_WINDOW_MS', 60 * 1000),
  limit: envInt('RATE_LIMIT_GENERAL_MAX', 1000),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' || (req.method === 'GET' && req.path.startsWith('/uploads')),
  handler: makeHandler('general'),
})

// ── Admin login ──────────────────────────────────────────────────────────────
// Successful logins never count against either counter (skipSuccessfulRequests);
// the login route also explicitly resets the username counter on success,
// since that's a stronger guarantee than just "didn't increment it".
const loginUsernameLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_LOGIN_WINDOW_MS', FIFTEEN_MIN),
  limit: envInt('RATE_LIMIT_LOGIN_USERNAME_MAX', 5),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: usernameKey,
  handler: async (req, res, next, options) => {
    const username = String(req.body?.username || '').trim().toLowerCase()
    logSecurityEvent({
      type: 'login_lockout',
      severity: SEVERITY.CRITICAL,
      ip: req.ip,
      identifier: username || undefined,
      route: 'POST /api/auth/login',
      details: 'Username locked out after too many failed attempts',
    })
    await alertIfDue(
      `Account locked out: ${username || 'unknown'}`,
      `The account "${username || 'unknown'}" was locked out after too many failed login attempts from ${req.ip}.`
    )
    res.status(options.statusCode || 429).json({ error: 'Too many failed login attempts. Please try again later.' })
  },
})

const loginIpLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_LOGIN_WINDOW_MS', FIFTEEN_MIN),
  limit: envInt('RATE_LIMIT_LOGIN_IP_MAX', 30),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: makeHandler('login_ip'),
})

// ── Order / enrolment creation ──────────────────────────────────────────────
const orderCreationIpLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_ORDER_IP_WINDOW_MS', FIFTEEN_MIN),
  limit: envInt('RATE_LIMIT_ORDER_IP_MAX', 100),
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('order_creation_ip'),
})

const orderCreationPhoneLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_ORDER_PHONE_WINDOW_MS', ONE_HOUR),
  limit: envInt('RATE_LIMIT_ORDER_PHONE_MAX', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: phoneKey,
  handler: makeHandler('order_creation_phone', maskedPhoneIdentifier),
})

// ── Payment initiation (Ozow/Payflex start, pay-balance, retry) ────────────
const paymentInitIpLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_PAYMENT_IP_WINDOW_MS', FIFTEEN_MIN),
  limit: envInt('RATE_LIMIT_PAYMENT_IP_MAX', 100),
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('payment_init_ip'),
})

const paymentInitKeyLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_PAYMENT_KEY_WINDOW_MS', ONE_HOUR),
  limit: envInt('RATE_LIMIT_PAYMENT_KEY_MAX', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: orderKey,
  handler: makeHandler('payment_init_key', (req) => orderKey(req)),
})

// ── Uploads (per authenticated user) ────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_UPLOAD_WINDOW_MS', FIFTEEN_MIN),
  limit: envInt('RATE_LIMIT_UPLOAD_MAX', 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
  handler: makeHandler('upload', (req) => (req.user?.id ? `user:${req.user.id}` : req.ip)),
})

module.exports = {
  POLITE_MESSAGE,
  generalApiLimiter,
  loginUsernameLimiter,
  loginIpLimiter,
  orderCreationIpLimiter,
  orderCreationPhoneLimiter,
  paymentInitIpLimiter,
  paymentInitKeyLimiter,
  uploadLimiter,
}
