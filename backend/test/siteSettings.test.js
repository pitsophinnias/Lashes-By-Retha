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
