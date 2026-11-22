// General-purpose cleanup for building a wa.me link, as distinct from
// backend/phone.js's normaliseSaPhone (which is strict and SA-only, used
// to validate a number at checkout/enrolment time). This one just needs
// to turn whatever's already stored (or typed into the Message Customer
// panel) into the digits-only form wa.me wants - it never rejects a
// number just because it isn't South African.
//
// "082 685 5399", "0826855399", "+27 82 685 5399" and "27826855399" all
// become "27826855399". A number that already has some other country
// code is left as its cleaned digits-only form. Returns null for anything
// that can't plausibly be a phone number at all (letters, too short, too
// long).
const MIN_PLAUSIBLE_DIGITS = 8
const MAX_PLAUSIBLE_DIGITS = 15 // E.164's own ceiling

const normalizeWhatsAppNumber = (input) => {
  if (!input) return null
  const cleaned = String(input).trim().replace(/[\s\-().]/g, '').replace(/^\+/, '')
  if (!/^\d+$/.test(cleaned)) return null

  // A 10-digit number starting with 0 only ever means a South African local
  // number here (0 is never a real leading digit in an international
  // number) - deliberately broader than backend/phone.js's own stricter
  // SA validator, since this is a best-effort cleanup, not a gate that
  // should reject an otherwise-fine number over its second digit.
  if (cleaned.length === 10 && cleaned[0] === '0') {
    return `27${cleaned.slice(1)}`
  }

  if (cleaned.length < MIN_PLAUSIBLE_DIGITS || cleaned.length > MAX_PLAUSIBLE_DIGITS) return null
  return cleaned
}

module.exports = { normalizeWhatsAppNumber }
