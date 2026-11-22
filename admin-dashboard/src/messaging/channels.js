// A small channel interface - whatsappLink/emailLink/copy - so an
// automated channel (e.g. the WhatsApp Business API) can be added later
// as a third implementation without the Message Customer panel needing
// to change (see Step 8 of the task this was built for). Mirrors
// backend/src/messaging/channels.js's link-building exactly.
import { normalizeWhatsAppNumber } from './phone.js'

// Most mail clients (and some OSes) start silently truncating a mailto:
// well before 2000 characters - the panel shows a "too long, copy
// instead" note rather than send a clipped email.
export const MAILTO_SAFE_LENGTH = 1800

export const whatsappLink = (phone, text) => {
  const number = normalizeWhatsAppNumber(phone)
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

// Returns null (not a link) when the encoded mailto would be too long.
export const emailLink = (email, subject, body) => {
  if (!email) return null
  const encodedSubject = encodeURIComponent(subject || '')
  const encodedBody = encodeURIComponent(body || '')
  if (encodedSubject.length + encodedBody.length > MAILTO_SAFE_LENGTH) return null
  return `mailto:${email}?subject=${encodedSubject}&body=${encodedBody}`
}

export const copyToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }
  return false
}
