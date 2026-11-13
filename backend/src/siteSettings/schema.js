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
  validateAndMergeContent,
  validateAndMergeTheme,
  fillMissingWithDefaults,
  contentFieldSpec,
}
