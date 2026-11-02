const { test } = require('node:test')
const assert = require('node:assert')
const crypto = require('node:crypto')
const { requestHash, verifyResponseHash } = require('../ozow')

const PRIVATE_KEY = 'test-private-key'

test('requestHash matches a hand-computed SHA512 string', () => {
  const fields = {
    SiteCode: 'TSTSITE1',
    CountryCode: 'ZA',
    CurrencyCode: 'ZAR',
    Amount: '100.00',
    TransactionReference: 'HBH-1-abc123',
    BankReference: 'HBH Order 1',
    Optional1: '1',
    CancelUrl: 'https://example.com/api/payments/ozow/return/cancel',
    ErrorUrl: 'https://example.com/api/payments/ozow/return/error',
    SuccessUrl: 'https://example.com/api/payments/ozow/return/success',
    NotifyUrl: 'https://example.com/api/payments/ozow/notify',
    IsTest: 'true',
  }

  // Concatenation written out by hand, in Ozow's documented field order,
  // with the private key appended - independent of ozow.js's own logic.
  const handConcatenated =
    'TSTSITE1' + 'ZA' + 'ZAR' + '100.00' + 'HBH-1-abc123' +
    'HBH Order 1' + '1' +
    'https://example.com/api/payments/ozow/return/cancel' +
    'https://example.com/api/payments/ozow/return/error' +
    'https://example.com/api/payments/ozow/return/success' +
    'https://example.com/api/payments/ozow/notify' +
    'true' + PRIVATE_KEY

  const expected = crypto.createHash('sha512').update(handConcatenated.toLowerCase(), 'utf8').digest('hex')

  assert.strictEqual(requestHash(fields, PRIVATE_KEY), expected)
})

test('verifyResponseHash accepts a correctly signed body', () => {
  const fields = {
    SiteCode: 'TSTSITE1',
    TransactionId: 'TXN123',
    TransactionReference: 'HBH-1-abc123',
    Amount: '100.00',
    Status: 'Complete',
    Optional1: '1',
    Optional2: '',
    Optional3: '',
    Optional4: '',
    Optional5: '',
    CurrencyCode: 'ZAR',
    IsTest: 'true',
    StatusMessage: 'Success',
  }

  const handConcatenated =
    fields.SiteCode + fields.TransactionId + fields.TransactionReference + fields.Amount +
    fields.Status + fields.Optional1 + fields.Optional2 + fields.Optional3 + fields.Optional4 +
    fields.Optional5 + fields.CurrencyCode + fields.IsTest + fields.StatusMessage + PRIVATE_KEY

  const hash = crypto.createHash('sha512').update(handConcatenated.toLowerCase(), 'utf8').digest('hex')

  assert.strictEqual(verifyResponseHash({ ...fields, Hash: hash }, PRIVATE_KEY), true)
})

test('verifyResponseHash rejects a tampered Amount', () => {
  const fields = {
    SiteCode: 'TSTSITE1',
    TransactionId: 'TXN123',
    TransactionReference: 'HBH-1-abc123',
    Amount: '100.00',
    Status: 'Complete',
    Optional1: '1',
    Optional2: '',
    Optional3: '',
    Optional4: '',
    Optional5: '',
    CurrencyCode: 'ZAR',
    IsTest: 'true',
    StatusMessage: 'Success',
  }

  const handConcatenated =
    fields.SiteCode + fields.TransactionId + fields.TransactionReference + fields.Amount +
    fields.Status + fields.Optional1 + fields.Optional2 + fields.Optional3 + fields.Optional4 +
    fields.Optional5 + fields.CurrencyCode + fields.IsTest + fields.StatusMessage + PRIVATE_KEY

  const hash = crypto.createHash('sha512').update(handConcatenated.toLowerCase(), 'utf8').digest('hex')

  // Hash was computed for Amount 100.00 - a tampered Amount must not verify.
  const tampered = { ...fields, Amount: '1.00', Hash: hash }

  assert.strictEqual(verifyResponseHash(tampered, PRIVATE_KEY), false)
})
