// Part B: template rendering and phone normalization exist in two places -
// backend/src/messaging/{render,phone}.js (tested here, but not what
// actually builds a wa.me/mailto/Copy message) and admin-dashboard/src/
// messaging/{render,phone}.js (the one the Message Customer panel and
// Settings live preview actually call - see the README's "Messaging
// customers" section for why they're duplicated rather than shared).
//
// This file is the guard against the two silently drifting apart: it runs
// the SAME fixtures (shared/messaging-fixtures.json, at the repo root)
// against both copies and asserts each one matches its expected output -
// which also means they must match each other.
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'shared', 'messaging-fixtures.json'), 'utf8')
)

const backendRender = require('../src/messaging/templates')
const backendPhone = require('../src/messaging/phone')

// Dynamic import() needs a file:// URL on Windows - a bare absolute path
// (C:\...) is rejected by the ESM loader.
const frontendDir = path.join(__dirname, '..', '..', 'admin-dashboard', 'src', 'messaging')
const frontendRenderPromise = import(pathToFileURL(path.join(frontendDir, 'render.js')).href)
const frontendPhonePromise = import(pathToFileURL(path.join(frontendDir, 'phone.js')).href)

for (const fx of fixtures.templateFixtures) {
  test(`[backend] ${fx.name}`, () => {
    assert.strictEqual(backendRender.renderTemplate(fx.body, fx.data, { whatsapp: true }), fx.expectedWhatsapp)
    if ('expectedEmail' in fx) {
      assert.strictEqual(backendRender.renderTemplate(fx.body, fx.data, { whatsapp: false }), fx.expectedEmail)
    }
    if ('expectedEmailSubject' in fx) {
      assert.strictEqual(backendRender.renderTemplate(fx.emailSubject, fx.data, { whatsapp: false }), fx.expectedEmailSubject)
    }
  })

  test(`[frontend] ${fx.name}`, async () => {
    const { renderTemplate } = await frontendRenderPromise
    assert.strictEqual(renderTemplate(fx.body, fx.data, { whatsapp: true }), fx.expectedWhatsapp)
    if ('expectedEmail' in fx) {
      assert.strictEqual(renderTemplate(fx.body, fx.data, { whatsapp: false }), fx.expectedEmail)
    }
    if ('expectedEmailSubject' in fx) {
      assert.strictEqual(renderTemplate(fx.emailSubject, fx.data, { whatsapp: false }), fx.expectedEmailSubject)
    }
  })
}

for (const fx of fixtures.phoneFixtures) {
  test(`[backend] normalizeWhatsAppNumber - ${fx.name}`, () => {
    assert.strictEqual(backendPhone.normalizeWhatsAppNumber(fx.input), fx.expected)
  })

  test(`[frontend] normalizeWhatsAppNumber - ${fx.name}`, async () => {
    const { normalizeWhatsAppNumber } = await frontendPhonePromise
    assert.strictEqual(normalizeWhatsAppNumber(fx.input), fx.expected)
  })
}

test('every template fixture and every phone fixture produced identical output on both renderers', async () => {
  const { renderTemplate: frontendRenderTemplate } = await frontendRenderPromise
  const { normalizeWhatsAppNumber: frontendNormalize } = await frontendPhonePromise

  for (const fx of fixtures.templateFixtures) {
    assert.strictEqual(
      backendRender.renderTemplate(fx.body, fx.data, { whatsapp: true }),
      frontendRenderTemplate(fx.body, fx.data, { whatsapp: true }),
      `[${fx.name}] backend and frontend WhatsApp rendering diverged`
    )
  }
  for (const fx of fixtures.phoneFixtures) {
    assert.strictEqual(
      backendPhone.normalizeWhatsAppNumber(fx.input),
      frontendNormalize(fx.input),
      `[${fx.name}] backend and frontend phone normalization diverged`
    )
  }
})
