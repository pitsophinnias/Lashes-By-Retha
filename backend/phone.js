// Retha only serves South African customers for now. Accepts 082 685 5399,
// 0826855399, +27 82 685 5399, +27826855399 and 27826855399 (spaces, dashes,
// dots and brackets are ignored); returns the normalised +27XXXXXXXXX form,
// or null if the input isn't a valid South African mobile/landline number.
function normaliseSaPhone(input) {
  if (!input) return null
  const cleaned = String(input).trim().replace(/[\s\-.()]/g, '')
  if (!/^\+?\d+$/.test(cleaned)) return null

  let digits = cleaned.replace(/^\+/, '')
  if (digits.startsWith('27')) {
    digits = `0${digits.slice(2)}`
  }
  if (!/^0[1-8]\d{8}$/.test(digits)) return null

  return `+27${digits.slice(1)}`
}

module.exports = { normaliseSaPhone }
