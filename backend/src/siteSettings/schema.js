// Validation for site_settings.content and site_settings.theme. Plain
// hand-rolled checks, no validation library, matching the rest of this
// backend (see phone.js).

const { normaliseSaPhone } = require('../../phone')

// Google Fonts that suit a beauty brand. Each list includes the font
// currently hard-coded on the customer site, so the defaults always validate.
const HEADING_FONTS = [
  'Cormorant Garamond',
  'Playfair Display',
  'Cormorant',
  'Marcellus',
  'Prata',
  'Italiana',
]

const BODY_FONTS = [
  'Lato',
  'Nunito Sans',
  'Jost',
  'Mulish',
  'Work Sans',
  'Quicksand',
]

class ValidationError extends Error {
  constructor(field, message) {
    super(message)
    this.field = field
  }
}

const text = (maxLength) => ({ type: 'text', maxLength })
const hexColor = () => ({ type: 'hexColor' })
const font = (allowed) => ({ type: 'font', allowed })
// maxLength on these two is informational only (the admin form's character
// counter) - the real check is the South African phone format / email shape
// below, not a length limit.
const phoneField = (maxLength) => ({ type: 'phone', maxLength })
const emailField = (maxLength) => ({ type: 'email', maxLength })

const CONTENT_SPEC = {
  hero: {
    heading: text(60),
    subtext: text(160),
    tagline: text(60),
    bookButtonLabel: text(30),
    shopButtonLabel: text(30),
  },
  contact: {
    addressLine1: text(60),
    addressLine2: text(60),
    phone: phoneField(20),
    email: emailField(60),
    hoursLabel: text(30),
    hoursLine1: text(30),
    hoursLine2: text(30),
    whatsappLabel: text(30),
    whatsappText: text(60),
  },
  sectionHeadings: {
    products: text(60),
    classes: text(60),
    gallery: text(60),
    contact: text(60),
  },
  footer: {
    text: text(160),
  },
}

const THEME_SPEC = {
  colors: {
    background: hexColor(),
    accent: hexColor(),
    navBackground: hexColor(),
    text: hexColor(),
    mutedText: hexColor(),
  },
  fonts: {
    heading: font(HEADING_FONTS),
    body: font(BODY_FONTS),
  },
  preset: text(30),
}

// Curated starting points for the Theme page - each one's own colours
// clear the contrast check below on their own. "Hair By Her Rose" is the
// current default; the rest are soft beauty palettes picked to suit the
// same brand. Fonts are included so a preset button fills the whole form.
// "everyday" presets suit any time of year; "occasion" presets are tied to
// a date or month, shown as `period` under the preset's name in the admin.
const THEME_PRESETS = [
  {
    name: 'Hair By Her Rose',
    group: 'everyday',
    colors: { background: '#FFFAF8', accent: '#C47A8A', navBackground: '#FDF0F3', text: '#2C2C2C', mutedText: '#7A6670' },
    fonts: { heading: 'Cormorant Garamond', body: 'Lato' },
  },
  {
    name: 'Nude Blush',
    group: 'everyday',
    colors: { background: '#FBF4EF', accent: '#8C5A4A', navBackground: '#F3E3D8', text: '#3A2B23', mutedText: '#7D6356' },
    fonts: { heading: 'Playfair Display', body: 'Nunito Sans' },
  },
  {
    name: 'Lavender Dusk',
    group: 'everyday',
    colors: { background: '#F7F5FC', accent: '#7E6A9C', navBackground: '#ECE6F5', text: '#2E2A38', mutedText: '#6B6178' },
    fonts: { heading: 'Italiana', body: 'Jost' },
  },
  {
    name: 'Champagne Gold',
    group: 'everyday',
    colors: { background: '#FFFBF2', accent: '#8A6324', navBackground: '#F6EDD8', text: '#2E2A1F', mutedText: '#7A6F56' },
    fonts: { heading: 'Marcellus', body: 'Work Sans' },
  },
  {
    name: 'New Year',
    group: 'occasion',
    period: '1 January',
    colors: { background: '#FFFCF5', accent: '#7A5F20', navBackground: '#F7EFD9', text: '#332B1A', mutedText: '#7A6A42' },
    fonts: { heading: 'Prata', body: 'Quicksand' },
  },
  {
    name: "Valentine's Day",
    group: 'occasion',
    period: '14 February',
    colors: { background: '#FFF5F6', accent: '#9E2A42', navBackground: '#FBE0E6', text: '#3A1620', mutedText: '#8A5560' },
    fonts: { heading: 'Cormorant', body: 'Mulish' },
  },
  {
    name: 'Easter',
    group: 'occasion',
    period: 'March or April',
    colors: { background: '#FFFDF2', accent: '#6E5586', navBackground: '#EAF5EC', text: '#332E3D', mutedText: '#7A7488' },
    fonts: { heading: 'Marcellus', body: 'Quicksand' },
  },
  {
    name: 'Freedom Day',
    group: 'occasion',
    period: '27 April',
    colors: { background: '#FBFAF4', accent: '#5C7A52', navBackground: '#EDF0E2', text: '#26301F', mutedText: '#6B7560' },
    fonts: { heading: 'Playfair Display', body: 'Mulish' },
  },
  {
    name: "Mother's Day",
    group: 'occasion',
    period: '2nd Sunday of May',
    colors: { background: '#FFF8F3', accent: '#9C5A42', navBackground: '#FBE8DD', text: '#3A2821', mutedText: '#8A6A5C' },
    fonts: { heading: 'Cormorant Garamond', body: 'Nunito Sans' },
  },
  {
    name: "Women's Month",
    group: 'occasion',
    period: 'August - 9 August',
    colors: { background: '#FAF7FC', accent: '#6B4A8A', navBackground: '#ECE3F3', text: '#2A2033', mutedText: '#6E5E80' },
    fonts: { heading: 'Italiana', body: 'Jost' },
  },
  {
    name: 'Heritage Day',
    group: 'occasion',
    period: '24 September',
    colors: { background: '#FBF6EE', accent: '#A85A32', navBackground: '#F0E4D2', text: '#2E2418', mutedText: '#7A6248' },
    fonts: { heading: 'Cormorant', body: 'Work Sans' },
  },
  {
    name: 'Black Friday',
    group: 'occasion',
    period: 'Late November',
    colors: { background: '#FAF8F7', accent: '#3A3632', navBackground: '#EDE3DD', text: '#211F1D', mutedText: '#70645C' },
    fonts: { heading: 'Prata', body: 'Jost' },
  },
  {
    name: 'Festive Season',
    group: 'occasion',
    period: 'December',
    colors: { background: '#FFFAF6', accent: '#8C2A33', navBackground: '#E3EADD', text: '#2A1F1A', mutedText: '#7A6A5C' },
    fonts: { heading: 'Playfair Display', body: 'Lato' },
  },
]

const isLeaf = (node) => typeof node.type === 'string'

const validateLeaf = (fieldSpec, value, path) => {
  if (fieldSpec.type === 'text') {
    if (typeof value !== 'string') {
      throw new ValidationError(path, `${path} must be a string`)
    }
    const trimmed = value.trim()
    if (/[<>]/.test(trimmed)) {
      throw new ValidationError(path, `${path} must be plain text - HTML is not allowed`)
    }
    if (trimmed.length === 0) {
      throw new ValidationError(path, `${path} cannot be empty`)
    }
    if (trimmed.length > fieldSpec.maxLength) {
      throw new ValidationError(path, `${path} must be ${fieldSpec.maxLength} characters or fewer`)
    }
    return trimmed
  }

  if (fieldSpec.type === 'hexColor') {
    if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value.trim())) {
      throw new ValidationError(path, `${path} must be a hex colour like #C47A8A`)
    }
    return value.trim().toUpperCase()
  }

  if (fieldSpec.type === 'font') {
    if (typeof value !== 'string' || !fieldSpec.allowed.includes(value.trim())) {
      throw new ValidationError(path, `${path} must be one of: ${fieldSpec.allowed.join(', ')}`)
    }
    return value.trim()
  }

  if (fieldSpec.type === 'phone') {
    const normalised = typeof value === 'string' ? normaliseSaPhone(value) : null
    if (!normalised) {
      throw new ValidationError(path, `${path} must be a South African phone number, for example 082 123 4567`)
    }
    // Stored in the same spaced display format shown on the contact card -
    // +27 82 685 5399, not the bare +27826855399 normaliseSaPhone returns.
    const digits = normalised.slice(3)
    return `+27 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)}`
  }

  if (fieldSpec.type === 'email') {
    if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      throw new ValidationError(path, `${path} must be a valid email address`)
    }
    return value.trim()
  }

  throw new ValidationError(path, `${path} has an unsupported field type`)
}

// Validates `input` against `spec` and merges it onto `current`, field by
// field. Fields/sections left out of `input` keep their current value, so a
// PUT can send just the section being edited. Unknown keys and wrong types
// are rejected rather than ignored.
const validateAndMerge = (spec, current, input, pathPrefix) => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ValidationError(pathPrefix, `${pathPrefix} must be an object`)
  }
  const result = { ...current }
  for (const key of Object.keys(input)) {
    const fieldSpec = spec[key]
    const path = pathPrefix ? `${pathPrefix}.${key}` : key
    if (!fieldSpec) {
      throw new ValidationError(path, `Unknown field: ${path}`)
    }
    if (isLeaf(fieldSpec)) {
      result[key] = validateLeaf(fieldSpec, input[key], path)
    } else {
      result[key] = validateAndMerge(fieldSpec, current?.[key] || {}, input[key], path)
    }
  }
  return result
}

const validateAndMergeContent = (current, input) => validateAndMerge(CONTENT_SPEC, current, input, 'content')
const validateAndMergeTheme = (current, input) => validateAndMerge(THEME_SPEC, current, input, 'theme')

// WCAG 2.x relative luminance / contrast ratio.
const MIN_CONTRAST_RATIO = 4.5
const hexToRgbForContrast = (hex) => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const srgbToLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const relativeLuminance = (hex) => {
  const [r, g, b] = hexToRgbForContrast(hex).map((v) => srgbToLinear(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrastRatio = (hexA, hexB) => {
  const a = relativeLuminance(hexA), b = relativeLuminance(hexB)
  const lighter = Math.max(a, b), darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

// Gates a pair only when it's actually changing to something new. The
// brand's own current colours, and its original defaults, are exempt even
// though the historic accent (#C47A8A) itself only reaches 3.23:1 against
// white - re-saving the theme unchanged, or picking the "Hair By Her Rose"
// preset, must never be blocked by a rule aimed at new colour choices.
const checkThemeContrast = (merged, current, defaults) => {
  const pairs = [
    {
      label: 'text on background', a: merged.colors.text, b: merged.colors.background,
      exempt: (a, b) =>
        (a === current?.colors?.text && b === current?.colors?.background) ||
        (a === defaults.colors.text && b === defaults.colors.background),
    },
    {
      label: 'white button text on accent', a: '#FFFFFF', b: merged.colors.accent,
      exempt: (a, b) => b === current?.colors?.accent || b === defaults.colors.accent,
    },
  ]
  for (const { label, a, b, exempt } of pairs) {
    if (exempt(a, b)) continue
    const ratio = contrastRatio(a, b)
    if (ratio < MIN_CONTRAST_RATIO) {
      throw new ValidationError(
        'theme.colors',
        `${label} only reaches a contrast ratio of ${ratio.toFixed(2)}:1 - it must be at least ${MIN_CONTRAST_RATIO}:1`
      )
    }
  }
}

// Walks a spec tree, replacing every leaf with its { maxLength } - lets the
// admin form build its character counters from the backend's own limits
// instead of duplicating them.
const specMaxLengths = (spec) => {
  const result = {}
  for (const key of Object.keys(spec)) {
    const node = spec[key]
    result[key] = isLeaf(node) ? { maxLength: node.maxLength } : specMaxLengths(node)
  }
  return result
}

const contentFieldSpec = () => specMaxLengths(CONTENT_SPEC)

// For GET /api/admin/site-settings/theme/spec - the admin form's allowed
// fonts and the preset list, from the backend's own source of truth.
const themeFieldSpec = () => ({
  headingFonts: HEADING_FONTS,
  bodyFonts: BODY_FONTS,
  presets: THEME_PRESETS,
})

// Recursively fills any field missing from `value` with the matching field
// from `defaults`, so a stored object that predates a newer field (or is
// simply incomplete) never reaches the caller partial.
const fillMissingWithDefaults = (value, defaults) => {
  if (typeof defaults !== 'object' || defaults === null) {
    return value === undefined ? defaults : value
  }
  const result = {}
  for (const key of Object.keys(defaults)) {
    result[key] = fillMissingWithDefaults(value?.[key], defaults[key])
  }
  return result
}

module.exports = {
  ValidationError,
  HEADING_FONTS,
  BODY_FONTS,
  THEME_PRESETS,
  validateAndMergeContent,
  validateAndMergeTheme,
  fillMissingWithDefaults,
  contentFieldSpec,
  themeFieldSpec,
  contrastRatio,
  checkThemeContrast,
  MIN_CONTRAST_RATIO,
}
