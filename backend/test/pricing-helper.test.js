const { test } = require('node:test')
const assert = require('node:assert')
const { getEffectivePrice, validateSalePrice, getLowestEffectivePrice } = require('../src/pricing/getEffectivePrice')

test('getEffectivePrice: product with no options, not on sale', () => {
  const product = { price: '300.00', on_sale: false, sale_price: null }
  const result = getEffectivePrice(product)
  assert.deepStrictEqual(result, { price: 300, originalPrice: 300, onSale: false, saveAmount: 0 })
})

test('getEffectivePrice: product with no options, on sale', () => {
  const product = { price: '300.00', on_sale: true, sale_price: '250.00' }
  const result = getEffectivePrice(product)
  assert.deepStrictEqual(result, { price: 250, originalPrice: 300, onSale: true, saveAmount: 50 })
})

test('getEffectivePrice: option on sale uses the product\'s normal price but its own sale price', () => {
  const product = { price: '150.00', on_sale: false, sale_price: null }
  const option = { on_sale: true, sale_price: '123.70' }
  const result = getEffectivePrice(product, option)
  assert.strictEqual(result.price, 123.7)
  assert.strictEqual(result.originalPrice, 150)
  assert.strictEqual(result.onSale, true)
  assert.strictEqual(result.saveAmount, 26.3)
})

test('getEffectivePrice: option not on sale ignores the product\'s own sale flag', () => {
  const product = { price: '150.00', on_sale: true, sale_price: '100.00' }
  const option = { on_sale: false, sale_price: null }
  const result = getEffectivePrice(product, option)
  assert.strictEqual(result.price, 150)
  assert.strictEqual(result.onSale, false)
})

test('getEffectivePrice: onSale true but no sale_price set falls back to the normal price', () => {
  const product = { price: '150.00', on_sale: true, sale_price: null }
  const result = getEffectivePrice(product)
  assert.strictEqual(result.price, 150)
  assert.strictEqual(result.onSale, false)
})

test('validateSalePrice rejects a missing, zero, negative or too-high sale price', () => {
  assert.match(validateSalePrice(undefined, 100), /required/i)
  assert.match(validateSalePrice('', 100), /required/i)
  assert.match(validateSalePrice(0, 100), /greater than R0/i)
  assert.match(validateSalePrice(-5, 100), /greater than R0/i)
  assert.match(validateSalePrice(100, 100), /less than the normal price/i)
  assert.match(validateSalePrice(150, 100), /less than the normal price/i)
})

test('validateSalePrice accepts a genuine discount', () => {
  assert.strictEqual(validateSalePrice(99.99, 100), null)
  assert.strictEqual(validateSalePrice(1, 100), null)
})

test('getLowestEffectivePrice: product with no options returns its own price', () => {
  const product = { price: '80.00', on_sale: false, sale_price: null }
  const result = getLowestEffectivePrice(product, [])
  assert.strictEqual(result.price, 80)
})

test('getLowestEffectivePrice: only the cheapest on-sale option wins', () => {
  const product = { price: '150.00', on_sale: false, sale_price: null }
  const options = [
    { on_sale: false, sale_price: null },
    { on_sale: true, sale_price: '120.00' },
    { on_sale: true, sale_price: '99.00' },
  ]
  const result = getLowestEffectivePrice(product, options)
  assert.strictEqual(result.price, 99)
  assert.strictEqual(result.onSale, true)
  assert.strictEqual(result.saveAmount, 51)
})

test('getLowestEffectivePrice: no option on sale returns the normal price', () => {
  const product = { price: '150.00', on_sale: false, sale_price: null }
  const options = [{ on_sale: false, sale_price: null }, { on_sale: false, sale_price: null }]
  const result = getLowestEffectivePrice(product, options)
  assert.strictEqual(result.price, 150)
  assert.strictEqual(result.onSale, false)
})
