const { test } = require('node:test')
const assert = require('node:assert')
const { renderTemplate, findUnknownPlaceholders, TEMPLATES, ALL_PLACEHOLDERS } = require('../src/messaging/templates')

test('renderTemplate substitutes every known placeholder', () => {
  const result = renderTemplate('Hi {first_name}, your total is R {total}', { first_name: 'Naledi', total: '220.00' })
  assert.strictEqual(result, 'Hi Naledi, your total is R 220.00')
})

test('renderTemplate renders a missing (undefined) placeholder as empty text, never raw braces', () => {
  const result = renderTemplate('Hi {first_name}, balance: R {balance}', { first_name: 'Naledi' })
  assert.strictEqual(result, 'Hi Naledi, balance: R ')
  assert.ok(!result.includes('{'))
})

test('renderTemplate renders a null placeholder value as empty text too', () => {
  const result = renderTemplate('Due: {due_date}', { due_date: null })
  assert.strictEqual(result, 'Due: ')
})

test('renderTemplate renders a completely unknown placeholder as empty text', () => {
  const result = renderTemplate('Oops {totl}', {})
  assert.strictEqual(result, 'Oops ')
})

test('renderTemplate keeps *bold* markers for WhatsApp, strips them for email', () => {
  const text = '*Total: R 220.00*'
  assert.strictEqual(renderTemplate(text, {}, { whatsapp: true }), '*Total: R 220.00*')
  assert.strictEqual(renderTemplate(text, {}, { whatsapp: false }), 'Total: R 220.00')
})

test('renderTemplate: sale savings line renders exactly when a discount is present', () => {
  const items = '• Blossom Moist Essence Primer x1 — R 220.00 (you saved R 60.00 ✨)'
  const result = renderTemplate('{items}', { items })
  assert.strictEqual(result, items)
})

test('findUnknownPlaceholders flags a typo and nothing else', () => {
  const unknown = findUnknownPlaceholders('Hi {first_name}, your {totl} is R {total}')
  assert.deepStrictEqual(unknown, ['totl'])
})

test('findUnknownPlaceholders returns an empty array when every placeholder is known', () => {
  const unknown = findUnknownPlaceholders('Hi {first_name}, total R {total}, ref {reference}')
  assert.deepStrictEqual(unknown, [])
})

test('every built-in default template only uses known placeholders', () => {
  for (const tpl of TEMPLATES) {
    const unknownInBody = findUnknownPlaceholders(tpl.body)
    const unknownInSubject = findUnknownPlaceholders(tpl.emailSubject)
    assert.deepStrictEqual(unknownInBody, [], `${tpl.id} body has unknown placeholders: ${unknownInBody}`)
    assert.deepStrictEqual(unknownInSubject, [], `${tpl.id} subject has unknown placeholders: ${unknownInSubject}`)
  }
})

test('every built-in default template signs off "With love," followed by {business_name}', () => {
  for (const tpl of TEMPLATES) {
    assert.match(tpl.body, /With love,\s*\n\{business_name\}/, `${tpl.id} is missing the sign-off`)
  }
})

test('every built-in template id is covered by exactly one of orders/preorders/training', () => {
  const groups = new Set(TEMPLATES.map((t) => t.group))
  assert.deepStrictEqual([...groups].sort(), ['orders', 'preorders', 'training'])
})

test('ALL_PLACEHOLDERS includes every placeholder named in the task spec', () => {
  const required = [
    'customer_name', 'first_name', 'items', 'total', 'reference', 'balance',
    'amount_paid', 'due_date', 'course_name', 'course_end_date', 'bank_details',
    'pop_number', 'business_name',
  ]
  for (const name of required) {
    assert.ok(ALL_PLACEHOLDERS.includes(name), `missing placeholder: ${name}`)
  }
})
