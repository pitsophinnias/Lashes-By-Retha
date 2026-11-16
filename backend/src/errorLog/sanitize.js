// Strips anything that looks like a customer's email/phone, or a secret
// carried in a "key: value" pair (password, token, API key, hash...), out of
// an error message before it's ever written to error_log. Defence in depth -
// most of this backend's own thrown errors are plain "Failed to X" text with
// no such values in them, but a Postgres error or a third-party API error
// message is free-form text we don't control.

const PATTERNS = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]'],
  // South African numbers and most international ones: 7+ digits, optionally
  // grouped with spaces/dashes/dots/brackets - deliberately broad so a phone
  // number can't slip through in any of its common written forms.
  [/\+?\d[\d\s\-.()]{6,}\d/g, '[redacted-number]'],
  // "Bearer <token>" first, since the token itself has no space for the
  // generic key=value pattern below to stop at.
  [/\bBearer\s+\S+/gi, '[redacted-token]'],
  [/\b(password|pass|secret|token|api[_-]?key|private[_-]?key|authorization|hash|card(?:number)?|cvv)\b\s*[:=]\s*\S+/gi, '$1=[redacted]'],
]

const MAX_LENGTH = 500

function sanitizeMessage(message) {
  let result = String(message == null ? '' : message)
  for (const [pattern, replacement] of PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result.slice(0, MAX_LENGTH)
}

module.exports = { sanitizeMessage }
