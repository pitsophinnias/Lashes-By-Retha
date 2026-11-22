// Mirrors backend/src/messaging/templates.js's renderTemplate/
// findUnknownPlaceholders exactly (tested there - see that file's test
// suite) - duplicated rather than shared, since this needs to run
// synchronously on every keystroke for the Settings page's live preview
// and the Message Customer panel, and there's no shared package between
// this Vite app and the Express backend to import it from.
export const COMMON_PLACEHOLDERS = ['customer_name', 'first_name', 'business_name', 'reference', 'bank_details', 'pop_number']

export const GROUP_PLACEHOLDERS = {
  orders: ['items', 'total'],
  preorders: ['items', 'deposit', 'balance', 'amount_paid'],
  training: ['course_name', 'course_end_date', 'due_date', 'balance', 'amount_paid', 'total'],
}

export const PLACEHOLDERS_BY_GROUP = Object.fromEntries(
  Object.entries(GROUP_PLACEHOLDERS).map(([group, names]) => [group, [...COMMON_PLACEHOLDERS, ...names]])
)

export const ALL_PLACEHOLDERS = [...new Set([...COMMON_PLACEHOLDERS, ...Object.values(GROUP_PLACEHOLDERS).flat()])]

export const renderTemplate = (text, data = {}, { whatsapp = true } = {}) => {
  const rendered = String(text || '').replace(/\{(\w+)\}/g, (_match, key) => {
    const value = data[key]
    return value === undefined || value === null ? '' : String(value)
  })
  return whatsapp ? rendered : rendered.replace(/\*/g, '')
}

export const findUnknownPlaceholders = (text, knownPlaceholders = ALL_PLACEHOLDERS) => {
  const found = new Set()
  const pattern = /\{(\w+)\}/g
  let match
  while ((match = pattern.exec(String(text || '')))) {
    if (!knownPlaceholders.includes(match[1])) found.add(match[1])
  }
  return Array.from(found)
}
