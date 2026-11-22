// Mirrors backend/src/messaging/phone.js's normalizeWhatsAppNumber exactly
// (tested there) - see render.js for why this is duplicated rather than
// imported.
const MIN_PLAUSIBLE_DIGITS = 8
const MAX_PLAUSIBLE_DIGITS = 15

export const normalizeWhatsAppNumber = (input) => {
  if (!input) return null
  const cleaned = String(input).trim().replace(/[\s\-().]/g, '').replace(/^\+/, '')
  if (!/^\d+$/.test(cleaned)) return null

  if (cleaned.length === 10 && cleaned[0] === '0') {
    return `27${cleaned.slice(1)}`
  }

  if (cleaned.length < MIN_PLAUSIBLE_DIGITS || cleaned.length > MAX_PLAUSIBLE_DIGITS) return null
  return cleaned
}
