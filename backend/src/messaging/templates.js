// Built-in default WhatsApp/email templates. An owner's edit is stored
// only as an override (see store.js) - this file is never written to, so
// improving a default here reaches every template nobody has touched.
//
// Placeholders are plain {name} tokens, substituted by renderTemplate
// below. Every template signs off "With love, {business_name}" per the
// house style; {business_name} (not a hard-coded "Hair By Her") so a
// future rename reaches every message at once.

const COMMON_PLACEHOLDERS = ['customer_name', 'first_name', 'business_name', 'reference', 'bank_details', 'pop_number']

const GROUP_PLACEHOLDERS = {
  orders: ['items', 'total'],
  preorders: ['items', 'deposit', 'balance', 'amount_paid'],
  // due_date is kept as a known placeholder for backwards compatibility
  // with anything already typed into training_enrolment_confirmed - its
  // value is now the same as course_end_date (see buildStudentTemplateData
  // on the frontend), since there's no separate installment due date any
  // more. New templates should use course_end_date directly.
  training: ['course_name', 'course_end_date', 'due_date', 'balance', 'amount_paid', 'total'],
}

const PLACEHOLDERS_BY_GROUP = Object.fromEntries(
  Object.entries(GROUP_PLACEHOLDERS).map(([group, names]) => [group, [...COMMON_PLACEHOLDERS, ...names]])
)

const ALL_PLACEHOLDERS = [...new Set([...COMMON_PLACEHOLDERS, ...Object.values(GROUP_PLACEHOLDERS).flat()])]

const TEMPLATES = [
  // ── Orders ──────────────────────────────────────────────────────────────
  {
    id: 'order_received',
    group: 'orders',
    label: 'Order received + payment details',
    emailSubject: 'Your order with {business_name} - payment details',
    body: `Hi {first_name} 🌸

Thank you so much for your order with {business_name}! Here's a summary:
{items}
*Total: R {total}*

To confirm your order, please make payment to:
{bank_details}
Reference: {reference}

Kindly send your proof of payment to {pop_number} on WhatsApp.

With love,
{business_name}`,
  },
  {
    id: 'order_payment_received',
    group: 'orders',
    label: 'Payment received',
    emailSubject: 'Payment received - order {reference}',
    body: `Hi {first_name} ✨

Thank you, we've received your payment for order {reference}! Here's what you ordered:
{items}
*Total: R {total}*

We're getting your order ready now, and will let you know as soon as it's ready for collection or on its way to you.

With love,
{business_name}`,
  },
  {
    id: 'order_ready_for_collection',
    group: 'orders',
    label: 'Ready for collection',
    emailSubject: 'Your order {reference} is ready for collection',
    body: `Hi {first_name} 🌸

Great news - your order {reference} is ready for collection!
{items}
*Total: R {total}*

We can't wait to see you. 💕

With love,
{business_name}`,
  },
  {
    id: 'order_dispatched',
    group: 'orders',
    label: 'Dispatched',
    emailSubject: 'Your order {reference} is on its way',
    body: `Hi {first_name} 🌸

Your order {reference} is on its way to you!
{items}
*Total: R {total}*

We hope you love it. 💕

With love,
{business_name}`,
  },
  {
    id: 'order_cancelled',
    group: 'orders',
    label: 'Cancelled',
    emailSubject: 'Your order {reference} has been cancelled',
    body: `Hi {first_name}

We're sorry to let you know that your order {reference} has been cancelled. If you have any questions, please don't hesitate to reach out - we're always happy to help.

With love,
{business_name}`,
  },

  // ── Pre-orders ──────────────────────────────────────────────────────────
  {
    id: 'preorder_confirmed',
    group: 'preorders',
    label: 'Pre-order confirmed + deposit/payment details',
    emailSubject: 'Your pre-order with {business_name} - deposit details',
    body: `Hi {first_name} 🌸

Thank you so much for your pre-order with {business_name}!
{items}

To confirm your pre-order, please pay your deposit of *R {deposit}* to:
{bank_details}
Reference: {reference}

Kindly send your proof of payment to {pop_number} on WhatsApp.

With love,
{business_name}`,
  },
  {
    id: 'preorder_stock_arrived',
    group: 'preorders',
    label: 'Stock arrived',
    emailSubject: 'Your pre-order has arrived!',
    body: `Hi {first_name} ✨

Exciting news - your pre-order has arrived!
{items}

Your remaining balance is *R {balance}*. Please let us know when you'd like to collect or arrange delivery.

With love,
{business_name}`,
  },
  {
    id: 'preorder_ready_or_dispatched',
    group: 'preorders',
    label: 'Ready for collection / dispatched',
    emailSubject: 'Your pre-order is on its way',
    body: `Hi {first_name} 🌸

Your pre-order is ready for collection, or already on its way to you!
{items}
*Total paid: R {amount_paid}*

We hope you love it. 💕

With love,
{business_name}`,
  },
  {
    id: 'preorder_cancelled',
    group: 'preorders',
    label: 'Cancelled',
    emailSubject: 'Your pre-order has been cancelled',
    body: `Hi {first_name}

We're sorry to let you know that your pre-order has been cancelled. If you have any questions, please don't hesitate to reach out.

With love,
{business_name}`,
  },
  {
    id: 'preorder_refunded',
    group: 'preorders',
    label: 'Refunded',
    emailSubject: 'Your pre-order refund',
    body: `Hi {first_name}

Your refund of *R {amount_paid}* for your pre-order has been processed. Please allow a few days for it to reflect, and let us know if you have any questions.

With love,
{business_name}`,
  },

  // ── Lash Training ───────────────────────────────────────────────────────
  {
    id: 'training_enrolment_confirmed',
    group: 'training',
    label: 'Enrolment confirmed + payment schedule',
    emailSubject: 'Welcome to {course_name}!',
    body: `Hi {first_name} 🌸

Welcome to {course_name}! We're so excited to have you join us.

*Course fee: R {total}*
Amount paid so far: R {amount_paid}
Remaining balance: *R {balance}*, due by {due_date}

Kindly send your proof of payment to:
{bank_details}
Reference: {reference}

With love,
{business_name}`,
  },
  {
    id: 'training_payment_received',
    group: 'training',
    label: 'Payment received (with remaining balance, if any)',
    emailSubject: 'Payment received - {course_name}',
    body: `Hi {first_name} ✨

Thank you, we've received your payment for {course_name}!

Amount paid: R {amount_paid}
Remaining balance: *R {balance}*

With love,
{business_name}`,
  },
  {
    id: 'training_payment_reminder',
    group: 'training',
    label: 'Payment reminder (due before course ends)',
    emailSubject: 'Payment reminder - {course_name}',
    body: `Hi {first_name} 🌸

Just a gentle reminder that your remaining balance of *R {balance}* is due before your course ends on {course_end_date}.

Kindly send your proof of payment to:
{bank_details}
Reference: {reference}

With love,
{business_name}`,
  },
  {
    id: 'training_certificate_warning',
    group: 'training',
    label: 'Certificate warning (before course ends)',
    emailSubject: 'Certificate - outstanding balance for {course_name}',
    body: `Hi {first_name}

Kindly note that your certificate can only be issued once your tuition has been paid in full. Your remaining balance is *R {balance}*, due before {course_end_date}.

With love,
{business_name}`,
  },
  {
    id: 'training_overdue',
    group: 'training',
    label: 'Balance overdue (course has ended)',
    emailSubject: 'Outstanding balance - {course_name}',
    body: `Hi {first_name}

Your certificate will be issued as soon as your remaining balance of *R {balance}* has been settled.

Kindly send your proof of payment to:
{bank_details}
Reference: {reference}

With love,
{business_name}`,
  },
  {
    id: 'training_course_completed',
    group: 'training',
    label: 'Course completed / congratulations',
    emailSubject: 'Congratulations, {first_name}!',
    body: `Hi {first_name} 🌸✨

Congratulations on completing {course_name}! We're so proud of you and can't wait to see where your lash journey takes you. 💕

With love,
{business_name}`,
  },
]

const TEMPLATES_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]))

const getDefaultTemplate = (id) => TEMPLATES_BY_ID[id] || null

// Every {placeholder} in the text gets replaced, whether or not the data
// has it - an unknown or missing one always becomes '' (never the raw
// {braces}), so a typo'd placeholder is invisible to the customer rather
// than a glaring bug in a message that's already been sent. WhatsApp text
// keeps its *bold* markers; email strips them to plain asterisk-free text.
const renderTemplate = (text, data = {}, { whatsapp = true } = {}) => {
  const rendered = String(text || '').replace(/\{(\w+)\}/g, (_match, key) => {
    const value = data[key]
    return value === undefined || value === null ? '' : String(value)
  })
  return whatsapp ? rendered : rendered.replace(/\*/g, '')
}

// Used when saving an edited template - flags a typo like {totl} so it can
// be caught before it's ever sent to a customer as empty text.
const findUnknownPlaceholders = (text, knownPlaceholders = ALL_PLACEHOLDERS) => {
  const found = new Set()
  const pattern = /\{(\w+)\}/g
  let match
  while ((match = pattern.exec(String(text || '')))) {
    if (!knownPlaceholders.includes(match[1])) found.add(match[1])
  }
  return Array.from(found)
}

module.exports = {
  TEMPLATES,
  TEMPLATES_BY_ID,
  getDefaultTemplate,
  renderTemplate,
  findUnknownPlaceholders,
  COMMON_PLACEHOLDERS,
  GROUP_PLACEHOLDERS,
  PLACEHOLDERS_BY_GROUP,
  ALL_PLACEHOLDERS,
}
