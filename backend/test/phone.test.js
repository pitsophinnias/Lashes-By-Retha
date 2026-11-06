const { test } = require('node:test')
const assert = require('node:assert')
const { normaliseSaPhone } = require('../phone')

test('accepts the five valid South African formats', () => {
  assert.strictEqual(normaliseSaPhone('082 685 5399'), '+27826855399')
  assert.strictEqual(normaliseSaPhone('0826855399'), '+27826855399')
  assert.strictEqual(normaliseSaPhone('+27 82 685 5399'), '+27826855399')
  assert.strictEqual(normaliseSaPhone('+27826855399'), '+27826855399')
  assert.strictEqual(normaliseSaPhone('27826855399'), '+27826855399')
})

test('ignores dashes, dots and brackets too', () => {
  assert.strictEqual(normaliseSaPhone('082-685-5399'), '+27826855399')
  assert.strictEqual(normaliseSaPhone('(082) 685.5399'), '+27826855399')
})

test('rejects a non-South African country code', () => {
  assert.strictEqual(normaliseSaPhone('+266 57110994'), null)
})

test('rejects a number with no South African prefix at all', () => {
  assert.strictEqual(normaliseSaPhone('57110994'), null)
})

test('rejects a second digit outside 1-8', () => {
  assert.strictEqual(normaliseSaPhone('0926855399'), null)
})

test('rejects a number that is too short', () => {
  assert.strictEqual(normaliseSaPhone('082685539'), null)
})

test('rejects letters', () => {
  assert.strictEqual(normaliseSaPhone('082abc5399'), null)
})

test('rejects empty or missing input', () => {
  assert.strictEqual(normaliseSaPhone(''), null)
  assert.strictEqual(normaliseSaPhone(null), null)
  assert.strictEqual(normaliseSaPhone(undefined), null)
})
