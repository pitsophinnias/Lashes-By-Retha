// Kept behind this tiny interface - whatsappLink/emailLink - so an
// automated channel (e.g. the WhatsApp Business API) can be added later
// as a third implementation without the Message Customer panel or
// anything that calls these needing to change at all (see Step 8 of the
// task this was built for).
const { normalizeWhatsAppNumber } = require('./phone')

// mailto: bodies get unwieldy fast - most mail clients (and some OSes)
// start silently truncating well before 2000 characters, so the panel
// shows a "too long, copy instead" note rather than send a clipped email.
const MAILTO_SAFE_LENGTH = 1800

const whatsappLink = (phone, text) => {
  const number = normalizeWhatsAppNumber(phone)
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

// Returns null (not a link) when the encoded mailto would be too long -
// the caller shows a "copy instead" note rather than send a clipped email.
const emailLink = (email, subject, body) => {
  if (!email) return null
  const encodedSubject = encodeURIComponent(subject || '')
  const encodedBody = encodeURIComponent(body || '')
  if (encodedSubject.length + encodedBody.length > MAILTO_SAFE_LENGTH) return null
  return `mailto:${email}?subject=${encodedSubject}&body=${encodedBody}`
}

module.exports = { whatsappLink, emailLink, MAILTO_SAFE_LENGTH }
