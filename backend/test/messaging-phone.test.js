const { test } = require('node:test')
const assert = require('node:assert')
const { normalizeWhatsAppNumber } = require('../src/messaging/phone')

test('all four spec formats normalize to the same digits-only number', () => {
  const expected = '27826855399'
  assert.strictEqual(normalizeWhatsAppNumber('082 685 5399'), expected)
  assert.strictEqual(normalizeWhatsAppNumber('0826855399'), expected)
  assert.strictEqual(normalizeWhatsAppNumber('+27 82 685 5399'), expected)
  assert.strictEqual(normalizeWhatsAppNumber('27826855399'), expected)
})

test('strips spaces, dashes and brackets', () => {
  assert.strictEqual(normalizeWhatsAppNumber('(082) 685-5399'), '27826855399')
  assert.strictEqual(normalizeWhatsAppNumber('082-685-5399'), '27826855399')
})

test('a number with another country code is left as its cleaned digits-only form', () => {
  assert.strictEqual(normalizeWhatsAppNumber('+1 555 123 4567'), '15551234567')
  assert.strictEqual(normalizeWhatsAppNumber('+44 20 7946 0958'), '442079460958')
})

test('returns null for letters, empty input, or implausible length', () => {
  assert.strictEqual(normalizeWhatsAppNumber('abc123'), null)
  assert.strictEqual(normalizeWhatsAppNumber(''), null)
  assert.strictEqual(normalizeWhatsAppNumber(null), null)
  assert.strictEqual(normalizeWhatsAppNumber(undefined), null)
  assert.strictEqual(normalizeWhatsAppNumber('12345'), null) // too short
  assert.strictEqual(normalizeWhatsAppNumber('1234567890123456'), null) // too long
})

test('a 10-digit number starting with 0 always becomes 27 + the rest, even an unusual shape', () => {
  assert.strictEqual(normalizeWhatsAppNumber('0926855399'), '27926855399')
})
