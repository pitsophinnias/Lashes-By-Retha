const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { pool } = require('../db')
const {
  ValidationError,
  validateAndMergeContent,
  validateAndMergeTheme,
  fillMissingWithDefaults,
  contentFieldSpec,
  themeFieldSpec,
  THEME_PRESETS,
  contrastRatio,
  checkThemeContrast,
  MIN_CONTRAST_RATIO,
} = require('../src/siteSettings/schema')
const { siteSettingsRolesForKey, saveSiteSetting } = require('../src/siteSettings/store')
const defaults = require('../src/siteSettings/defaults')

// ── Roles ────────────────────────────────────────────────────────────────────

test('content is editable by sysadmin and owner, theme by sysadmin only', () => {
  assert.deepStrictEqual(siteSettingsRolesForKey('content'), ['sysadmin', 'owner'])
  assert.deepStrictEqual(siteSettingsRolesForKey('theme'), ['sysadmin'])
})

// ── Content validation ───────────────────────────────────────────────────────

test('validateAndMergeContent accepts a partial update and keeps the rest of current', () => {
  const merged = validateAndMergeContent(defaults.content, { hero: { heading: 'New Heading' } })
  assert.strictEqual(merged.hero.heading, 'New Heading')
  assert.strictEqual(merged.hero.subtext, defaults.content.hero.subtext)
  assert.deepStrictEqual(merged.contact, defaults.content.contact)
})

test('validateAndMergeContent trims whitespace', () => {
  const merged = validateAndMergeContent(defaults.content, { hero: { heading: '  Spaced Out  ' } })
  assert.strictEqual(merged.hero.heading, 'Spaced Out')
})

test('validateAndMergeContent rejects an unknown field, naming it', () => {
  assert.throws(
    () => validateAndMergeContent(defaults.content, { hero: { notReal: 'x' } }),
    (err) => err instanceof ValidationError && err.field === 'content.hero.notReal'
  )
})

// Payment wording, policy text, prices, deposits and course data are never
// part of CONTENT_SPEC/THEME_SPEC at all, so there is no field path that
// could ever carry them - these are a few representative attempts, not an
// exhaustive list, since the allowlist itself is what makes them impossible.
test('validateAndMergeContent rejects attempts to smuggle in pricing or course data', () => {
  assert.throws(
    () => validateAndMergeContent(defaults.content, { pricing: { coursePrice: 999 } }),
    (err) => err instanceof ValidationError && err.field === 'content.pricing'
  )
  assert.throws(
    () => validateAndMergeContent(defaults.content, { hero: { price: '100' } }),
    (err) => err instanceof ValidationError && err.field === 'content.hero.price'
  )
  assert.throws(
    () => validateAndMergeContent(defaults.content, { payment: { ozowLabel: 'Pay with Ozow' } }),
    (err) => err instanceof ValidationError && err.field === 'content.payment'
  )
})

test('validateAndMergeContent rejects a wrong type, naming the field', () => {
  assert.throws(
    () => validateAndMergeContent(defaults.content, { hero: { heading: 123 } }),
    (err) => err instanceof ValidationError && err.field === 'content.hero.heading'
  )
})

test('validateAndMergeContent rejects text over its max length', () => {
  assert.throws(
    () => validateAndMergeContent(defaults.content, { hero: { bookButtonLabel: 'x'.repeat(31) } }),
    (err) => err instanceof ValidationError && err.field === 'content.hero.bookButtonLabel'
  )
})

test('validateAndMergeContent rejects HTML', () => {
  assert.throws(
    () => validateAndMergeContent(defaults.content, { hero: { heading: '<b>Hi</b>' } }),
    (err) => err instanceof ValidationError && err.field === 'content.hero.heading'
  )
})

test('validateAndMergeContent rejects an empty required field', () => {
  assert.throws(
    () => validateAndMergeContent(defaults.content, { hero: { heading: '   ' } }),
    (err) => err instanceof ValidationError && err.field === 'content.hero.heading'
  )
})

// ── Contact phone and email validation ──────────────────────────────────────

test('validateAndMergeContent accepts a South African phone number and stores it in display format', () => {
  const merged = validateAndMergeContent(defaults.content, { contact: { phone: '0826855399' } })
  assert.strictEqual(merged.contact.phone, '+27 82 685 5399')
})

test('validateAndMergeContent accepts the phone number already in display format', () => {
  const merged = validateAndMergeContent(defaults.content, { contact: { phone: '+27 82 685 5399' } })
  assert.strictEqual(merged.contact.phone, '+27 82 685 5399')
})

test('validateAndMergeContent rejects a non-South African phone number, naming the field', () => {
  assert.throws(
    () => validateAndMergeContent(defaults.content, { contact: { phone: '+1 555 123 4567' } }),
    (err) => err instanceof ValidationError && err.field === 'content.contact.phone'
  )
})

test('validateAndMergeContent accepts a valid email address', () => {
  const merged = validateAndMergeContent(defaults.content, { contact: { email: 'owner@example.com' } })
  assert.strictEqual(merged.contact.email, 'owner@example.com')
})

test('validateAndMergeContent rejects an invalid email address, naming the field', () => {
  assert.throws(
    () => validateAndMergeContent(defaults.content, { contact: { email: 'not-an-email' } }),
    (err) => err instanceof ValidationError && err.field === 'content.contact.email'
  )
})

// ── Theme validation ─────────────────────────────────────────────────────────

test('validateAndMergeTheme accepts a valid hex colour and upper-cases it', () => {
  const merged = validateAndMergeTheme(defaults.theme, { colors: { accent: '#abcdef' } })
  assert.strictEqual(merged.colors.accent, '#ABCDEF')
})

test('validateAndMergeTheme rejects a non-hex colour, naming the field', () => {
  assert.throws(
    () => validateAndMergeTheme(defaults.theme, { colors: { accent: 'pink' } }),
    (err) => err instanceof ValidationError && err.field === 'theme.colors.accent'
  )
})

test('validateAndMergeTheme rejects a colour missing the # or wrong length', () => {
  assert.throws(() => validateAndMergeTheme(defaults.theme, { colors: { accent: 'C47A8A' } }), ValidationError)
  assert.throws(() => validateAndMergeTheme(defaults.theme, { colors: { accent: '#C47A8' } }), ValidationError)
})

test('validateAndMergeTheme accepts an allowed font', () => {
  const merged = validateAndMergeTheme(defaults.theme, { fonts: { heading: 'Playfair Display' } })
  assert.strictEqual(merged.fonts.heading, 'Playfair Display')
})

test('validateAndMergeTheme rejects a font outside the allowed list, naming the field', () => {
  assert.throws(
    () => validateAndMergeTheme(defaults.theme, { fonts: { heading: 'Comic Sans MS' } }),
    (err) => err instanceof ValidationError && err.field === 'theme.fonts.heading'
  )
})

// ── Contrast check ───────────────────────────────────────────────────────────

test('contrastRatio matches a hand-computed WCAG ratio for black on white', () => {
  // Black on white is the maximum possible ratio, 21:1.
  assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 0.01)
})

test('checkThemeContrast rejects a new accent that fails white-text contrast, naming the pair and ratio', () => {
  const current = defaults.theme
  const merged = { ...current, colors: { ...current.colors, accent: '#F5C6D0' } } // very light pink, fails against white
  assert.throws(
    () => checkThemeContrast(merged, current, defaults.theme),
    (err) => err instanceof ValidationError && /white button text on accent/.test(err.message) && /ratio of \d\.\d\d:1/.test(err.message)
  )
})

test('checkThemeContrast rejects new text/background colours with insufficient contrast', () => {
  const current = defaults.theme
  const merged = { ...current, colors: { ...current.colors, text: '#D8D0D2', background: '#FFFAF8' } }
  assert.throws(
    () => checkThemeContrast(merged, current, defaults.theme),
    (err) => err instanceof ValidationError && /text on background/.test(err.message)
  )
})

test('checkThemeContrast allows re-saving the current theme unchanged, even though its own accent is under 4.5:1 against white', () => {
  assert.ok(contrastRatio('#FFFFFF', defaults.theme.colors.accent) < MIN_CONTRAST_RATIO, 'this test assumes the historic accent fails the new gate on its own')
  const current = defaults.theme
  const merged = { ...current }
  assert.doesNotThrow(() => checkThemeContrast(merged, current, defaults.theme))
})

test('checkThemeContrast allows switching to the "Hair By Her Rose" default preset from a different current theme', () => {
  const rose = THEME_PRESETS.find(p => p.name === 'Hair By Her Rose')
  const current = { ...defaults.theme, colors: { ...defaults.theme.colors, accent: '#7E6A9C', text: '#2E2A38' } }
  const merged = { ...current, colors: rose.colors, fonts: rose.fonts }
  assert.doesNotThrow(() => checkThemeContrast(merged, current, defaults.theme))
})

test('checkThemeContrast still gates a genuinely new colour choice even when unrelated fields change', () => {
  const current = defaults.theme
  const merged = { ...current, colors: { ...current.colors, accent: '#F5C6D0' }, fonts: { ...current.fonts, body: 'Jost' } }
  assert.throws(() => checkThemeContrast(merged, current, defaults.theme), ValidationError)
})

test('every new preset (other than the historic default) clears the contrast check unassisted', () => {
  // "Hair By Her Rose" is the historic default itself - it only clears the
  // gate via the exemption above, same as the real default colours do.
  for (const preset of THEME_PRESETS.filter(p => p.name !== 'Hair By Her Rose')) {
    assert.doesNotThrow(
      () => checkThemeContrast({ colors: preset.colors, fonts: preset.fonts }, { colors: {} }, { colors: {} }),
      `${preset.name} should pass the contrast check unassisted`
    )
  }
})

// ── Theme field spec ─────────────────────────────────────────────────────────

test('themeFieldSpec returns the allowed fonts and the preset list', () => {
  const spec = themeFieldSpec()
  assert.ok(spec.headingFonts.includes('Cormorant Garamond'))
  assert.ok(spec.bodyFonts.includes('Lato'))
  assert.strictEqual(spec.presets.length, 4)
  assert.ok(spec.presets.some(p => p.name === 'Hair By Her Rose'))
})

// ── Content field spec ───────────────────────────────────────────────────────

test('contentFieldSpec mirrors CONTENT_SPEC shape with just a maxLength per field', () => {
  const spec = contentFieldSpec()
  assert.strictEqual(spec.hero.heading.maxLength, 60)
  assert.strictEqual(spec.contact.phone.maxLength, 20)
  assert.strictEqual(spec.contact.email.maxLength, 60)
  assert.strictEqual(spec.sectionHeadings.products.maxLength, 60)
  assert.strictEqual(spec.footer.text.maxLength, 160)
})

// ── Defaults fill-in ─────────────────────────────────────────────────────────

test('fillMissingWithDefaults fills in missing nested fields only', () => {
  const partial = { hero: { heading: 'Custom Heading' } }
  const filled = fillMissingWithDefaults(partial, defaults.content)
  assert.strictEqual(filled.hero.heading, 'Custom Heading')
  assert.strictEqual(filled.hero.subtext, defaults.content.hero.subtext)
  assert.deepStrictEqual(filled.contact, defaults.content.contact)
})

// ── History / save behaviour (hits the real DB, like reconcile.test.js) ──────

test('saveSiteSetting archives the previous value and trims history to 10', async () => {
  const key = `test-${Date.now()}`
  try {
    for (let i = 0; i <= 11; i++) {
      await saveSiteSetting(key, { v: i }, null)
    }

    const current = (await pool.query('SELECT value FROM site_settings WHERE key = $1', [key])).rows[0]
    assert.deepStrictEqual(current.value, { v: 11 })

    const history = (await pool.query(
      'SELECT value FROM site_settings_history WHERE key = $1 ORDER BY saved_at ASC', [key]
    )).rows
    assert.strictEqual(history.length, 10)
    // v0 was the first value archived, so it is the one trimmed away once an
    // 11th history row would otherwise exist.
    assert.deepStrictEqual(history.map((r) => r.value), Array.from({ length: 10 }, (_, i) => ({ v: i + 1 })))
  } finally {
    await pool.query('DELETE FROM site_settings_history WHERE key = $1', [key])
    await pool.query('DELETE FROM site_settings WHERE key = $1', [key])
  }
})

test('restoring counts as a save, so the value it replaces becomes restorable too', async () => {
  const key = `t${Date.now() % 1000000}r`
  try {
    await saveSiteSetting(key, { v: 'first' }, null)
    await saveSiteSetting(key, { v: 'second' }, null)

    // Simulate restoring the first value, the way the restore endpoint does.
    await saveSiteSetting(key, { v: 'first' }, null)

    const current = (await pool.query('SELECT value FROM site_settings WHERE key = $1', [key])).rows[0]
    assert.deepStrictEqual(current.value, { v: 'first' })

    const mostRecentHistory = (await pool.query(
      'SELECT value FROM site_settings_history WHERE key = $1 ORDER BY saved_at DESC LIMIT 1', [key]
    )).rows[0]
    assert.deepStrictEqual(mostRecentHistory.value, { v: 'second' })
  } finally {
    await pool.query('DELETE FROM site_settings_history WHERE key = $1', [key])
    await pool.query('DELETE FROM site_settings WHERE key = $1', [key])
  }
})
