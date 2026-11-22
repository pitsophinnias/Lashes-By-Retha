// Builds the placeholder data object renderTemplate needs from a REAL
// order/pre-order/student object already in this app's state - purely a
// frontend concern, since there's no server-side auto-send to feed.

const formatMoney = (n) => Number(n || 0).toFixed(2)

const firstName = (fullName) => (fullName || '').trim().split(/\s+/)[0] || ''

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

const renderItemLine = (item) => {
  const name = item.optionName ? `${item.name} (${item.optionName})` : item.name
  let line = `• ${name} x${item.qty} — R ${formatMoney(item.price)}`
  if (item.discountAmount > 0) line += ` (you saved R ${formatMoney(item.discountAmount)} ✨)`
  return line
}

export const renderItemsBlock = (items) => (items || []).map(renderItemLine).join('\n')

// {bank_details} is deliberately the condensed "BankName AccountNumber"
// form (matching the task's own example), not the longer 3-line block the
// customer-site EFT screen shows - that one reads the individual fields
// straight from business details instead of going through a template.
const commonData = (businessDetails) => ({
  business_name: businessDetails.businessName,
  bank_details: `${businessDetails.bankName} ${businessDetails.accountNumber}`,
  pop_number: businessDetails.proofOfPaymentNumber,
})

// References mirror the bank-reference convention already used for Ozow
// (see backend/ozow.js's bankReferenceLabel: "HBH Order/Preorder/Training
// {id}") and the exact "HBH-{id}" format already shown on customer-site's
// EFT screen for orders - just distinguished by a letter for the other
// two, since order/preorder/student ids can collide.
export const referenceForOrder = (order) => `HBH-${order.id}`
export const referenceForPreorder = (preorder) => `HBH-P${preorder.id}`
export const referenceForStudent = (student) => `HBH-T${student.id}`

export const buildOrderTemplateData = (order, businessDetails) => ({
  ...commonData(businessDetails),
  customer_name: order.customerName,
  first_name: firstName(order.customerName),
  reference: referenceForOrder(order),
  items: renderItemsBlock(order.items),
  total: formatMoney(order.total),
})

export const buildPreorderTemplateData = (preorder, businessDetails) => ({
  ...commonData(businessDetails),
  customer_name: preorder.customerName,
  first_name: firstName(preorder.customerName),
  reference: referenceForPreorder(preorder),
  items: renderItemsBlock([{
    name: preorder.productName,
    optionName: preorder.optionName,
    qty: preorder.quantity,
    price: preorder.price,
    discountAmount: preorder.discountAmount,
  }]),
  deposit: formatMoney(preorder.deposit),
  balance: formatMoney(preorder.balance),
  amount_paid: formatMoney(preorder.amountPaid),
})

// course is the matching entry from CLASSES/coursesMerged ({ name, price }
// or similar) - students don't carry their own course details, the page
// already has it from whichever class is open. Tuition must be fully paid
// before the course ends (no installment schedule), so due_date and
// course_end_date are both just the student's own confirmed end_date -
// never preferred_start_date, which is only what they originally typed in
// before Retha confirmed anything.
export const buildStudentTemplateData = (student, course, businessDetails) => {
  const endDate = student.endDate ? formatDate(student.endDate) : ''
  return {
    ...commonData(businessDetails),
    customer_name: student.name,
    first_name: firstName(student.name),
    reference: referenceForStudent(student),
    course_name: course?.name || '',
    total: course ? formatMoney(course.price) : '',
    balance: formatMoney(student.balance),
    amount_paid: formatMoney(student.amountPaid),
    due_date: endDate,
    course_end_date: endDate,
  }
}

// Which template should be pre-selected in the Message Customer panel's
// dropdown, based on the item's current status - not exhaustive (plain
// orders have no "dispatched"/"cancelled" status of their own to key off,
// so those stay manually-selectable options without a default trigger).
export const defaultTemplateIdForOrder = (order) => {
  if (order.paymentStatus === 'paid' && order.status !== 'confirmed') return 'order_payment_received'
  if (order.status === 'confirmed') {
    return order.fulfilmentMethod === 'delivery' ? 'order_dispatched' : 'order_ready_for_collection'
  }
  return 'order_received'
}

export const defaultTemplateIdForPreorder = (preorder) => ({
  awaiting_deposit: 'preorder_confirmed',
  deposit_paid: 'preorder_confirmed',
  arrived: 'preorder_stock_arrived',
  paid_in_full: 'preorder_ready_or_dispatched',
  dispatched: 'preorder_ready_or_dispatched',
  collected: 'preorder_ready_or_dispatched',
  cancelled: 'preorder_cancelled',
  refunded: 'preorder_refunded',
}[preorder.status] || 'preorder_confirmed')

export const defaultTemplateIdForStudent = (student) => {
  if (student.status === 'completed') return 'training_course_completed'
  if (student.paymentStatus === 'paid' || student.paymentStatus === 'partial') return 'training_payment_received'
  return 'training_enrolment_confirmed'
}

// Sample data for the Settings page's live preview while editing a
// template - never real customer data, just enough to show every
// placeholder filled in.
export const SAMPLE_DATA = {
  orders: {
    customer_name: 'Naledi Mokoena', first_name: 'Naledi', business_name: 'Hair By Her',
    bank_details: 'FNB 63093932440', pop_number: '082 685 5399', reference: 'HBH-1042',
    items: '• Blossom Moist Essence Primer x1 — R 220.00 (you saved R 60.00 ✨)',
    total: '220.00',
  },
  preorders: {
    customer_name: 'Naledi Mokoena', first_name: 'Naledi', business_name: 'Hair By Her',
    bank_details: 'FNB 63093932440', pop_number: '082 685 5399', reference: 'HBH-P88',
    items: '• Luxe 24" Body Wave Wig x1 — R 1800.00',
    deposit: '500.00', balance: '1300.00', amount_paid: '500.00',
  },
  training: {
    customer_name: 'Naledi Mokoena', first_name: 'Naledi', business_name: 'Hair By Her',
    bank_details: 'FNB 63093932440', pop_number: '082 685 5399', reference: 'HBH-T23',
    course_name: 'Classic Individual Lash Training', course_end_date: '17 Jun 2026',
    due_date: '15 Jun 2026', balance: '1500.00', amount_paid: '1000.00', total: '2500.00',
  },
}
