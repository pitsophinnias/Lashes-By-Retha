import React, { useState, useEffect, useRef, useMemo } from 'react'

const CLASSES = [
  {
    id: 1,
    name: 'Classic Individual Lash Training',
    duration: '1-day course',
    level: 'Beginner',
    price: 2500,
    deposit: 500,
    description: 'Unlock the art of effortless elegance with our Classic Lash training. A comprehensive 1-day course designed to give you everything you need to start your lash journey.',
    learns: ['Classic lash training', 'Lash theory and anatomy', 'Lash isolation and placement', 'Lash design and mapping', 'Lash prepping and removal', 'Sanitation and safety protocols'],
    includes: ['Lunch and refreshments', 'Training manual', 'Certificate of attendance', 'Lash kit', 'Lash removal kit', 'Ongoing support'],
  },
  {
    id: 2,
    name: 'Classic Individual Lash Training',
    duration: '2-day course',
    level: 'Beginner',
    price: 4000,
    deposit: 500,
    description: 'Our comprehensive 2-day Classic Lash course gives you more time to practise and perfect your technique before you start working with clients.',
    learns: ['Classic lash training', 'Lash theory and anatomy', 'Lash isolation and placement', 'Lash design and mapping', 'Lash prepping and removal', 'Sanitation and safety protocols'],
    includes: ['Lunch and refreshments', 'Training manual', 'Certificate of attendance', 'Lash kit', 'Lash removal kit', 'Ongoing support'],
  },
  {
    id: 3,
    name: 'Advanced Individual Lash Training',
    duration: '4-day intensive course',
    level: 'Advanced',
    price: 6000,
    deposit: 500,
    description: 'Take your lash skills to the next level with our intensive 4-day Advanced course. Covering classic, hybrid and volume techniques, this course is designed to make you a well-rounded lash professional.',
    learns: ['Classic, hybrid and volume lash', 'Fan making', 'Lash theory and anatomy', 'Lash isolation and placement', 'Lash design and mapping', 'Lash prepping and removal', 'Sanitation and safety protocols'],
    includes: ['Lunch and refreshments', 'Training manual', 'Certificate of attendance', 'Lash kit', 'Lash removal kit', 'Ongoing support'],
  },
]

const POLICIES = {
  booking: [
    {
      label: 'Deposit',
      heading: 'Securing Your Appointment',
      body: "To secure your booking, we kindly ask for a non-refundable deposit of R100, payable immediately after your appointment is confirmed. Once your appointment is confirmed, we'll send you a secure Ozow payment link so you can pay straight from your banking app. Your slot is only secured once your deposit has been received.",
    },
    {
      label: 'Cancellation and Rescheduling',
      heading: 'Changes to Your Booking',
      body: 'We completely understand that life happens. If you need to reschedule or cancel, we simply ask that you let us know at least 12 hours before your appointment. Cancellations or reschedules made after this time will unfortunately result in your deposit being forfeited.',
    },
    {
      label: 'Late Arrivals',
      heading: 'Please Try to Be on Time',
      body: 'We have a 15-minute grace period in place for all appointments. If you arrive more than 15 minutes late, we may not be able to accommodate your full service, and your appointment may need to be cancelled with the deposit forfeited. We always do our best to make things work, and we appreciate you doing the same.',
    },
    {
      label: 'After Your Appointment',
      heading: 'Something Not Quite Right?',
      body: 'Your satisfaction means everything to us. If you experience any concerns with your lash extensions after your visit, please reach out to us within 48 hours of your appointment date and we will gladly look into it for you. Unfortunately we are unable to assist with concerns raised after this period.',
    },
    {
      label: 'Refunds',
      heading: 'Refund Policy',
      body: 'As all our services are rendered in person and with care, we are unable to offer refunds on services performed. We always strive to make sure you leave happy, so please do not hesitate to speak to us during your appointment if something does not feel right.',
    },
  ],
  returns: [
    {
      heading: 'Our Promise',
      body: "We want you to love every product you receive from us. If something isn't right, here's how we'll help.",
    },
    {
      heading: 'If Your Product Is Faulty',
      body: "Please let us know on WhatsApp (082 685 5399) as soon as you notice the problem, ideally within 7 days of receiving your order, with a photo of the product. You can return a faulty product within six months of delivery, and you're welcome to choose a replacement, a refund or store credit. A product is not considered faulty if it was damaged through use, incorrect application or not following care instructions.",
    },
    {
      heading: 'Cancelling An Online Order',
      body: "You may cancel an online order within 7 days of receiving it, as long as the lash trays are unopened, sealed and in their original packaging. Please contact us on WhatsApp before sending anything back. The return courier fee is for your account, and we'll refund you within 30 days of receiving the returned items.",
    },
    {
      heading: 'Opened Products',
      body: 'For hygiene reasons, we kindly ask that you understand we cannot accept opened lash trays or used products unless they are faulty.',
    },
    {
      heading: 'Choosing The Right Size',
      body: "Please double-check the length, curl and diameter before placing your order. We are unable to exchange or refund opened trays ordered in the wrong size. If you're unsure which size to choose, please don't hesitate to message us and we'll gladly help.",
    },
    {
      heading: 'Store Credit',
      body: 'Where we offer store credit, it can be used on any of our other products.',
    },
  ],
  delivery: [
    {
      heading: 'Where We Deliver',
      body: 'We deliver anywhere in South Africa using The Courier Guy or Aramex. We do not deliver outside South Africa at this time.',
    },
    {
      heading: 'Delivery Fee',
      body: 'Delivery is a flat fee of R120 per order, added at checkout.',
    },
    {
      heading: 'How Long It Takes',
      body: "We send your order once your payment has been confirmed. Delivery usually takes 3 to 5 working days, depending on your province. Delivery times are set by the courier company, so they may sometimes take a little longer. We'll share your tracking details with you on WhatsApp.",
    },
    {
      heading: 'Collecting Your Order',
      body: "You're welcome to collect your order from our studio at no charge, at 125 Piet Retief Boulevard, Vanderbijlpark SE1. Collection is Tuesday to Saturday, 08:00 to 17:00, once we've let you know your order is ready.",
    },
    {
      heading: 'Damaged Parcels',
      body: "If your parcel arrives damaged, please send us photos of the packaging and the product on WhatsApp within 48 hours of receiving it. We'll look into whether the damage happened in packing or in transit, and we'll make it right with a replacement or refund for any faulty items.",
    },
    {
      heading: 'Missing Parcels',
      body: "If your parcel hasn't arrived within the expected time, please let us know. We'll follow up with the courier straight away and open an investigation. Once the courier's investigation is complete, we'll send you a replacement or a full refund.",
    },
    {
      heading: 'Delivery Details',
      body: 'Please make sure your address and phone number are correct at checkout. If a parcel is returned to us because of an incorrect address, a new delivery fee will apply.',
    },
  ],
  training: [
    {
      heading: 'Securing Your Spot',
      body: 'A non-refundable deposit of R500 secures your place on a training course, paid online when you enrol.',
    },
    {
      heading: 'Paying The Balance',
      body: "The remaining balance is due before your training starts, and we'll send you a personal link to pay it online. You're also welcome to pay your course in full when you enrol, in 4 interest-free instalments with Payflex. Your certificate will be issued once your course fees have been paid in full.",
    },
    {
      heading: 'Moving To Another Date',
      body: "We understand that plans change. If you let us know at least 48 hours before your course starts, we'll gladly move you to another available date and your deposit will carry over. If you cancel or postpone with less than 48 hours' notice, or don't attend, your deposit will unfortunately be forfeited.",
    },
  ],
  privacy: [
    {
      heading: 'Your Privacy Matters',
      body: 'Your privacy matters to us. This policy explains what information we collect and how we look after it, in line with the Protection of Personal Information Act (POPIA).',
    },
    {
      heading: 'What We Collect',
      list: {
        type: 'bullet',
        items: [
          'Your name and WhatsApp number when you place an order or enrol for training',
          'Your delivery address if you choose delivery',
          'The details of your order or training course',
        ],
      },
    },
    {
      heading: 'Why We Collect It',
      body: "We only use your information to process your order, arrange delivery or collection, manage your training enrolment, and contact you about these. We will not send you marketing messages unless you've agreed to receive them.",
    },
    {
      heading: 'Who We Share It With',
      body: "We never sell your information. We only share what's needed with the courier delivering your order, the payment providers that process your payment, and the services that host our website and images. Each of them only receives what they need to do their part.",
    },
    {
      heading: 'How Long We Keep It',
      body: 'We keep your information for as long as we need it for your order or training, and for any period the law requires for our business records.',
    },
    {
      heading: 'Cookies',
      body: 'Our website does not use advertising or tracking cookies.',
    },
    {
      heading: 'Your Rights',
      body: (
        <>
          You may ask us what information we hold about you, ask us to correct it, or ask us to delete it. Please
          email lashesbyretha@gmail.com and we'll gladly help. If you're unhappy with how we've handled your
          information, you may contact the{' '}
          <a href="https://inforegulator.org.za" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            Information Regulator
          </a>
          .
        </>
      ),
    },
  ],
  terms: [
    {
      heading: 'Agreement',
      body: 'By placing an order or enrolling for training on our website, you agree to these terms.',
    },
    {
      heading: 'Terms Of Use',
      list: {
        type: 'numbered',
        items: [
          'Prices: All prices are in South African Rand. We are not VAT registered, so no VAT is added to our prices. Prices may change from time to time, but the price you see when you order is the price you pay.',
          "Orders: Your order is confirmed once we've received your payment. If an item is out of stock after you've paid, we'll let you know and offer you another option or a full refund.",
          'Payment: Orders are paid online at checkout with Ozow, straight from your banking app, or in 4 interest-free instalments with Payflex.',
          'Delivery, returns and training: Our Delivery, Returns and Lash Training policies form part of these terms.',
          'Appointments: Appointments are booked through our Setmore booking page and follow our Booking Policy.',
          'Product use: Our products are for professional use. Please follow the care and application guidance provided.',
          'Your rights: Nothing in these terms takes away your rights under the Consumer Protection Act or the Electronic Communications and Transactions Act.',
          'Changes: We may update these terms from time to time. The version on our website when you order is the one that applies.',
          'Law: These terms are governed by the laws of South Africa.',
        ],
      },
    },
    {
      heading: 'Questions?',
      body: "Please don't hesitate to contact us on WhatsApp at 082 685 5399 or email lashesbyretha@gmail.com.",
    },
  ],
}

// Mirrors backend/src/siteSettings/defaults.js exactly, so the page renders
// with these straight away (no blank flash while the API loads) and falls
// back to them quietly if the API is ever unreachable. Keep this in sync if
// that file's defaults ever change.
const DEFAULT_CONTENT = {
  hero: {
    heading: 'Effortless Booking. Endless Beauty.',
    subtext: 'Lash extensions, brow lamination & luxe wigs.',
    tagline: "Hair so good, it's by her.",
    bookButtonLabel: 'Book Now',
    shopButtonLabel: 'Shop Products',
  },
  contact: {
    addressLine1: '125 Piet Retief Boulevard, SE1',
    addressLine2: 'Vanderbijlpark, Gauteng',
    phone: '+27 82 685 5399',
    email: 'lashesbyretha@gmail.com',
    hoursLabel: 'Beauty Hours',
    hoursLine1: 'Tuesday to Saturday',
    hoursLine2: '8:00 AM to 5:00 PM',
    whatsappLabel: 'WhatsApp',
    whatsappText: 'Chat with us on WhatsApp',
  },
  sectionHeadings: {
    products: 'Our Products',
    classes: 'Lash Training',
    gallery: 'Our Work',
    contact: 'Contact Us',
  },
  footer: {
    text: '',
  },
}

// Mirrors backend/src/siteSettings/defaults.js's theme exactly.
const DEFAULT_THEME_COLORS = {
  background: '#FFFAF8',
  accent: '#C47A8A',
  navBackground: '#FDF0F3',
  text: '#2C2C2C',
  mutedText: '#7A6670',
}
const DEFAULT_FONTS = { heading: 'Cormorant Garamond', body: 'Lato' }
const DEFAULT_THEME = { colors: DEFAULT_THEME_COLORS, fonts: DEFAULT_FONTS, preset: 'default' }

// Every other colour this page uses today, derived from the 5 theme colours
// above. When the 5 base colours are still the defaults, deriveShades below
// returns this object verbatim - its values are exactly what was hard-coded
// here before theming existed, so the default site stays pixel-identical.
// Only recomputed by formula once a base colour actually changes.
const DEFAULT_SHADES = {
  border: '#F5DDE2',
  surface: '#FFFFFF',
  mutedLabel: '#C4A0A8',
  borderSoft: '#F7EEF0',
  mutedCaption: '#9A7A82',
  bodyTextSoft: '#5A4A50',
  accentSoftBg: '#FADADD',
  placeholderPink1: '#EDD5DB',
  accentHover: '#A8606F',
  accentStrong: '#A0566A',
  bodyTextDark: '#4A4A4A',
  placeholderPink2: '#F2E4E8',
  disabledText: '#C8B8BC',
  mutedCaption2: '#9A8A8E',
  placeholderPink3: '#F5EDF0',
  errorBorder: '#F5C0CC',
  iconMuted: '#C8A8B0',
  footerBg: '#2C1A20',
}

const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)))
const hexToRgb = (hex) => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const rgbToHex = ([r, g, b]) => `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0').toUpperCase()).join('')}`
// Blends hexB into hexA by weight (0 = all hexA, 1 = all hexB).
const mix = (hexA, hexB, weight) => {
  const a = hexToRgb(hexA), b = hexToRgb(hexB)
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * weight))
}
const lighten = (hex, amount) => mix(hex, '#FFFFFF', amount)
const darken = (hex, amount) => mix(hex, '#000000', amount)

// Computes every derived shade from the 5 base colours - only ever called
// with customised colours, since the default case is handled by returning
// DEFAULT_SHADES directly (see useEffect below).
const deriveShades = (colors) => ({
  border: lighten(colors.accent, 0.78),
  surface: '#FFFFFF',
  mutedLabel: mix(colors.mutedText, colors.accent, 0.35),
  borderSoft: lighten(colors.accent, 0.90),
  mutedCaption: mix(colors.mutedText, colors.accent, 0.20),
  bodyTextSoft: mix(colors.text, colors.mutedText, 0.45),
  accentSoftBg: lighten(colors.accent, 0.75),
  placeholderPink1: lighten(colors.accent, 0.82),
  accentHover: darken(colors.accent, 0.12),
  accentStrong: darken(colors.accent, 0.16),
  bodyTextDark: lighten(colors.text, 0.18),
  placeholderPink2: lighten(colors.accent, 0.80),
  disabledText: lighten(colors.mutedText, 0.45),
  mutedCaption2: mix(colors.mutedText, colors.text, 0.30),
  placeholderPink3: lighten(colors.accent, 0.86),
  errorBorder: lighten(colors.accent, 0.55),
  iconMuted: mix(colors.accent, colors.mutedText, 0.5),
  footerBg: mix(darken(colors.text, 0.05), colors.accent, 0.15),
})

const colorsMatchDefault = (colors) =>
  Object.keys(DEFAULT_THEME_COLORS).every((key) => colors?.[key]?.toUpperCase() === DEFAULT_THEME_COLORS[key])

// A warm greeting and a soft, tasteful particle animation for each occasion
// preset - keyed by the exact preset name the admin's Theme page saves.
// Nothing shows for the everyday presets or an unset/unrecognised preset.
const OCCASION_GREETINGS = {
  'New Year': { message: "Wishing you a sparkling New Year, from all of us at Hair By Her.", animation: 'sparkle' },
  "Valentine's Day": { message: "Happy Valentine's Day, with love from Hair By Her.", animation: 'hearts' },
  'Easter': { message: 'Happy Easter from Hair By Her.', animation: 'petals' },
  'Freedom Day': { message: 'Happy Freedom Day from Hair By Her.', animation: 'leaves' },
  "Mother's Day": { message: "Happy Mother's Day to the beautiful mothers in our lives.", animation: 'petals' },
  "Women's Month": { message: "Celebrating every woman this Women's Month.", animation: 'sparkle' },
  'Heritage Day': { message: 'Happy Heritage Day from Hair By Her.', animation: 'leaves' },
  'Black Friday': { message: 'Our Black Friday specials are here for a limited time.', animation: 'sparkle' },
  'Festive Season': { message: 'Merry Christmas and a joyful festive season from Hair By Her.', animation: 'snow' },
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:3002'

// Cloudinary URLs are already absolute; local-disk URLs are relative and
// need the API host in front of them.
const mediaUrl = (url) => (url && /^https?:\/\//.test(url) ? url : `${API}${url}`)

// Matches the backend's DELIVERY_FEE - used here only to show a live order
// summary before checkout; the server always computes the real charge.
const DELIVERY_FEE = 120
const PICKUP_ADDRESS = '125 Piet Retief Boulevard, Vanderbijlpark Se1, Gauteng 1911'
const PICKUP_HOURS = 'Tuesday to Saturday, 08:00 to 17:00'

// Render's free tier puts the backend to sleep after 15 minutes idle, and it
// can take up to a minute to wake back up - this is how long we wait for the
// health check before giving up and showing the shop as unreachable.
const BACKEND_WAKE_TIMEOUT_MS = 60000

const SA_PHONE_ERROR = "We're only able to serve customers in South Africa for now, so please use a South African number, for example 082 123 4567."
const EMAIL_ERROR = 'Please enter a valid email address.'

// Mirrors the backend's own normaliseSaPhone - accepts 082 685 5399,
// 0826855399, +27 82 685 5399, +27826855399 and 27826855399 (spaces, dashes,
// dots and brackets ignored); returns the +27XXXXXXXXX form, or null.
const normaliseSaPhone = (input) => {
  if (!input) return null
  const cleaned = String(input).trim().replace(/[\s\-.()]/g, '')
  if (!/^\+?\d+$/.test(cleaned)) return null

  let digits = cleaned.replace(/^\+/, '')
  if (digits.startsWith('27')) {
    digits = `0${digits.slice(2)}`
  }
  if (!/^0[1-8]\d{8}$/.test(digits)) return null

  return `+27${digits.slice(1)}`
}

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())

// Builds the wa.me and tel: link targets from the contact card's display
// phone number ("+27 82 685 5399"), so changing the number in Website
// Content updates both links too.
const phoneDigits = (phone) => String(phone || '').replace(/\D/g, '')
const whatsAppHref = (phone) => `https://wa.me/${phoneDigits(phone)}`
const telHref = (phone) => `tel:+${phoneDigits(phone)}`
// Local format ("082 685 5399") from the same stored number, for the spots
// that read the number aloud in a sentence rather than only linking it.
const localPhoneDisplay = (phone) => {
  const digits = phoneDigits(phone)
  const national = digits.startsWith('27') ? `0${digits.slice(2)}` : digits
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 10)}`
}

const ENROL_DATE_ERROR = 'Please choose a future Tuesday to Saturday for your preferred start date.'

// Mirrors the backend's own isValidFutureCourseDate - training runs Tuesday
// to Saturday, same as pickup, and the date must be strictly in the future
// in South Africa's own timezone rather than the visitor's.
const isValidFutureCourseDate = (dateStr) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const nowSAST = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const todaySAST = new Date(Date.UTC(nowSAST.getUTCFullYear(), nowSAST.getUTCMonth(), nowSAST.getUTCDate()))
  if (date <= todaySAST) return false
  const dayOfWeek = date.getUTCDay()
  return dayOfWeek >= 2 && dayOfWeek <= 6
}

// Tomorrow's date (SAST), as yyyy-mm-dd, for the date picker's min attribute.
const tomorrowSAST = () => {
  const nowSAST = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const tomorrow = new Date(Date.UTC(nowSAST.getUTCFullYear(), nowSAST.getUTCMonth(), nowSAST.getUTCDate() + 1))
  return tomorrow.toISOString().slice(0, 10)
}

// Payflex's official product widget (per their widgets docs) - a small
// script-rendered calculator showing the "pay in instalments" message. Each
// instance gets its own <script> tag, appended directly (not via innerHTML,
// which never executes), so the widget can tell them apart on the page.
function PayflexWidget({ amount, min, max }) {
  const containerRef = useRef(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el || amount == null) return
    const script = document.createElement('script')
    script.async = true
    script.type = 'application/javascript'
    const params = new URLSearchParams({ type: 'calculator', amount: String(amount) })
    if (min != null) params.set('min', String(min))
    if (max != null) params.set('max', String(max))
    script.src = `https://widgets.payflex.co.za/2.0.3/payflex-widget.min.js?${params.toString()}`
    el.appendChild(script)
    return () => { try { el.removeChild(script) } catch {} }
  }, [amount, min, max])
  return <div ref={containerRef} />
}

// A row of square, pill-style buttons for choosing a payment option -
// shared by checkout, the enrol form and the balance view so every payment
// choice in the app looks and behaves the same way. Each option is either
// { key, icon } (e.g. the Ozow logo) or { key, label } (plain text, e.g.
// "Payflex" or "Pay R500 deposit now"), optionally with disabled: true.
function PaymentChoiceButtons({ options, selected, onSelect }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
      {options.map(opt => (
        <button
          key={opt.key}
          type="button"
          onClick={() => !opt.disabled && onSelect(opt.key)}
          disabled={opt.disabled}
          style={{
            flex: 1,
            minWidth: '140px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 12px',
            borderRadius: '10px',
            fontSize: '16px',
            fontWeight: 700,
            fontFamily: 'inherit',
            letterSpacing: '0.3px',
            textAlign: 'center',
            border: `1px solid ${selected === opt.key ? 'var(--accent)' : 'var(--border)'}`,
            background: selected === opt.key ? 'var(--accent)' : 'white',
            color: opt.disabled ? 'var(--disabled-text)' : selected === opt.key ? 'white' : 'var(--text)',
            cursor: opt.disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {opt.icon ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: selected === opt.key ? '4px 10px' : '0',
              borderRadius: '8px',
              background: selected === opt.key ? 'white' : 'transparent',
            }}>
              {opt.icon}
            </span>
          ) : opt.label}
        </button>
      ))}
    </div>
  )
}

const OZOW_ICON = <img src="/ozow-logo.png" alt="Ozow" style={{ height: '22px', width: 'auto', display: 'block' }} />

function App() {
  const [showPolicies, setShowPolicies] = useState(false)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState(false)
  const [orderName, setOrderName] = useState('')
  const [orderPhone, setOrderPhone] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [orderEmail, setOrderEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [fulfilmentMethod, setFulfilmentMethod] = useState(null)
  const [paymentOptions, setPaymentOptions] = useState({ ozow: false, payflex: { enabled: false, minimumAmount: null, maximumAmount: null } })
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentResult, setPaymentResult] = useState(null)
  const [paymentResultLoading, setPaymentResultLoading] = useState(false)
  const [pendingPollCount, setPendingPollCount] = useState(0)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliverySuburb, setDeliverySuburb] = useState('')
  const [deliveryCity, setDeliveryCity] = useState('')
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [policyTab, setPolicyTab] = useState('booking')
  const [products, setProducts] = useState([])
  const [selectedOptions, setSelectedOptions] = useState({})
  const [productImages, setProductImages] = useState({})
  const [productPositions, setProductPositions] = useState({})
  const [galleryImages, setGalleryImages] = useState([])
  const [categories, setCategories] = useState([])
  const [productCategories, setProductCategories] = useState({})
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [expandedClassId, setExpandedClassId] = useState(null)
  // 'checking' while we wait for a sleeping backend to wake up, 'ready' once
  // it responds, 'unreachable' once it fails to respond within the timeout.
  const [backendStatus, setBackendStatus] = useState('checking')
  // Live name/price/deposit by course id, merged over CLASSES below - the
  // descriptions and curriculum text stay hard-coded here for now.
  const [courseData, setCourseData] = useState({})
  // Starts as DEFAULT_CONTENT so the page never shows a blank flash while
  // the API loads, and stays on it quietly if the API fails.
  const [siteContent, setSiteContent] = useState(DEFAULT_CONTENT)
  const [siteTheme, setSiteTheme] = useState(DEFAULT_THEME)
  // Remembers which occasion banner was last dismissed, so it stays hidden
  // for that occasion but reappears the moment a different one goes live.
  const [dismissedOccasion, setDismissedOccasion] = useState(() => {
    try { return localStorage.getItem('hbh_dismissed_occasion') || '' } catch { return '' }
  })
  const [enrolFormOpenFor, setEnrolFormOpenFor] = useState(null)
  const [enrolName, setEnrolName] = useState('')
  const [enrolPhone, setEnrolPhone] = useState('')
  const [enrolPhoneTouched, setEnrolPhoneTouched] = useState(false)
  const [enrolEmail, setEnrolEmail] = useState('')
  const [enrolEmailTouched, setEnrolEmailTouched] = useState(false)
  const [enrolStartDate, setEnrolStartDate] = useState('')
  const [enrolPaymentOption, setEnrolPaymentOption] = useState(null)
  const [enrolSubmitting, setEnrolSubmitting] = useState(false)
  const [enrolError, setEnrolError] = useState('')
  const [enrolmentResult, setEnrolmentResult] = useState(null)
  const [enrolmentResultLoading, setEnrolmentResultLoading] = useState(false)
  const [enrolPendingPollCount, setEnrolPendingPollCount] = useState(0)
  const bookingUrl = 'https://lashesbyretha.setmore.com'

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Wakes a sleeping Render backend before we rely on it for anything. The
  // rest of the page (hero, about, training, contact, policies) is static
  // and never waits on this.
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), BACKEND_WAKE_TIMEOUT_MS)
    fetch(`${API}/api/health`, { signal: controller.signal })
      .then(r => { if (r.ok) setBackendStatus('ready'); else setBackendStatus('unreachable') })
      .catch(() => setBackendStatus('unreachable'))
      .finally(() => clearTimeout(timer))
    return () => { clearTimeout(timer); controller.abort() }
  }, [])

  useEffect(() => {
    if (backendStatus !== 'ready') return
    fetch(`${API}/api/products`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setProducts(data)
        else setProducts([])
      })
      .catch(() => setProducts([]))
    fetch(`${API}/api/gallery`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setGalleryImages(data)
        else setGalleryImages([])
      })
      .catch(() => setGalleryImages([]))
    fetch(`${API}/api/categories`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setCategories(data)
        else setCategories([])
      })
      .catch(() => setCategories([]))
    fetch(`${API}/api/categories/products/all`)
      .then(r => r.json())
      .then(data => {
        if (data && typeof data === 'object' && !Array.isArray(data)) setProductCategories(data)
        else setProductCategories({})
      })
      .catch(() => setProductCategories({}))
    fetch(`${API}/api/payments/options`)
      .then(r => r.json())
      .then(data => setPaymentOptions({
        ozow: !!data?.ozow,
        payflex: {
          enabled: !!data?.payflex?.enabled,
          minimumAmount: data?.payflex?.minimumAmount ?? null,
          maximumAmount: data?.payflex?.maximumAmount ?? null,
        },
      }))
      .catch(() => setPaymentOptions({ ozow: false, payflex: { enabled: false, minimumAmount: null, maximumAmount: null } }))
    fetch(`${API}/api/courses`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return
        const byId = {}
        data.forEach(c => { byId[c.id] = c })
        setCourseData(byId)
      })
      .catch(() => {})
    // If this fails, siteContent/siteTheme just stay on their defaults -
    // quietly, with no error shown to the visitor.
    fetch(`${API}/api/site-settings`)
      .then(r => r.json())
      .then(data => {
        if (data?.content) setSiteContent(data.content)
        if (data?.theme) setSiteTheme(data.theme)
      })
      .catch(() => {})
  }, [backendStatus])

  // Pushes the 5 base colours, their derived shades and the chosen fonts
  // onto :root as CSS variables, and the browser chrome colour to match -
  // every themed colour and font-family in this file reads from these.
  useEffect(() => {
    const colors = siteTheme.colors || DEFAULT_THEME_COLORS
    const shades = colorsMatchDefault(colors) ? DEFAULT_SHADES : deriveShades(colors)
    const root = document.documentElement.style
    Object.entries(colors).forEach(([key, value]) => {
      root.setProperty(`--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, value)
    })
    Object.entries(shades).forEach(([key, value]) => {
      root.setProperty(`--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, value)
    })
    const fonts = siteTheme.fonts || DEFAULT_FONTS
    root.setProperty('--font-heading', `'${fonts.heading}', '${DEFAULT_FONTS.heading}', serif`)
    root.setProperty('--font-body', `'${fonts.body}', '${DEFAULT_FONTS.body}', sans-serif`)

    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = colors.accent
  }, [siteTheme])

  // Loads only the two chosen Google Fonts, replacing the previous link -
  // the font-family stacks above already fall back to the current fonts if
  // this never loads (offline, or the font name is unrecognised).
  useEffect(() => {
    const fonts = siteTheme.fonts || DEFAULT_FONTS
    const families = [fonts.heading, fonts.body]
      .filter((name, i, arr) => arr.indexOf(name) === i)
      .map(name => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:ital,wght@0,400;0,600;0,700;1,400`)
      .join('&')
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`
    document.head.appendChild(link)
    return () => { try { document.head.removeChild(link) } catch {} }
  }, [siteTheme.fonts])

  // Looks up an order by its token for the payment result panel below.
  const fetchOrderByToken = async (token) => {
    const res = await fetch(`${API}/api/orders/by-token/${token}`)
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return null
    return data
  }

  // Looks up an enrolment by its token for the enrolment result/balance panel below.
  const fetchEnrolmentByToken = async (token) => {
    const res = await fetch(`${API}/api/enrolments/by-token/${token}`)
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return null
    return data
  }

  // Reads ?payment=&order= (shop) or ?payment=&enrolment= left behind by a
  // provider redirect, or a bare ?enrolment= balance link Retha sends
  // directly (no payment= - there was no redirect), then removes it from
  // the URL so refreshing the page doesn't re-trigger the lookup.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const payment = params.get('payment')
    const orderToken = params.get('order')
    const enrolmentToken = params.get('enrolment')
    if (!payment && !enrolmentToken) return
    window.history.replaceState({}, '', window.location.pathname)
    if (enrolmentToken) {
      setEnrolmentResultLoading(true)
      fetchEnrolmentByToken(enrolmentToken).then(data => {
        setEnrolmentResult({ outcome: payment || null, data, token: enrolmentToken })
        setEnrolmentResultLoading(false)
      })
      return
    }
    if (!payment) return
    if (!orderToken) {
      setPaymentResult({ outcome: 'error', order: null, token: null })
      return
    }
    setPaymentResultLoading(true)
    fetchOrderByToken(orderToken).then(data => {
      setPaymentResult({ outcome: payment, order: data, token: orderToken })
      setPaymentResultLoading(false)
    })
  }, [])

  // While a payment looks pending, re-check every 5 seconds for up to a minute.
  useEffect(() => {
    if (!paymentResult || !paymentResult.token) return
    const status = paymentResult.order?.paymentStatus
    const isPendingLike = status === 'pending' || status === 'unpaid'
    const isEft = paymentResult.order?.paymentMethod === 'eft'
    if (!isPendingLike || isEft || pendingPollCount >= 12) return
    const timer = setTimeout(async () => {
      const data = await fetchOrderByToken(paymentResult.token)
      if (data) setPaymentResult(prev => (prev ? { ...prev, order: data } : prev))
      setPendingPollCount(c => c + 1)
    }, 5000)
    return () => clearTimeout(timer)
  }, [paymentResult, pendingPollCount])

  // Same pending re-check, for the enrolment result panel.
  useEffect(() => {
    if (!enrolmentResult || !enrolmentResult.token) return
    const latestStatus = enrolmentResult.data?.latestStatus
    const isPendingLike = latestStatus === 'pending' || latestStatus === 'started'
    if (!isPendingLike || enrolPendingPollCount >= 12) return
    const timer = setTimeout(async () => {
      const data = await fetchEnrolmentByToken(enrolmentResult.token)
      if (data) setEnrolmentResult(prev => (prev ? { ...prev, data } : prev))
      setEnrolPendingPollCount(c => c + 1)
    }, 5000)
    return () => clearTimeout(timer)
  }, [enrolmentResult, enrolPendingPollCount])

  // Product images and positions depend on the product list having loaded.
  useEffect(() => {
    products.forEach(async p => {
      try {
        const res = await fetch(`${API}/api/upload/products/${p.id}`)
        const data = await res.json()
        if (data && data.url) setProductImages(prev => ({ ...prev, [p.id]: data.url }))
      } catch {}
      try {
        const posRes = await fetch(`${API}/api/position/products/${p.id}`)
        const posData = await posRes.json()
        if (posData && posData.position) setProductPositions(prev => ({ ...prev, [p.id]: posData.position }))
      } catch {}
    })
  }, [products])

  const scrollToShop = () => {
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })
  }

  const renderBackendStatus = () => {
    if (backendStatus === 'checking') {
      return (
        <p className="backend-status-message is-loading">
          Just a moment while we get everything ready for you.
        </p>
      )
    }
    if (backendStatus === 'unreachable') {
      return (
        <p className="backend-status-message is-error">
          We're having trouble loading our products right now. Please refresh the page, or message us on{' '}
          <a href={whatsAppHref(siteContent.contact.phone)} target="_blank" rel="noopener noreferrer">WhatsApp at {localPhoneDisplay(siteContent.contact.phone)}</a>.
        </p>
      )
    }
    return null
  }

  // A cart line is identified by cartKey, not product id, so the same
  // product in two different lash lengths is two separate lines.
  const addToCart = (item) => {
    if (item.stockQuantity <= 0) return
    setCart(prev => {
      const existing = prev.find(i => i.cartKey === item.cartKey)
      const currentQty = existing ? existing.qty : 0
      if (currentQty >= item.stockQuantity) return prev // already at the most we have
      if (existing) {
        return prev.map(i => i.cartKey === item.cartKey ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { ...item, qty: 1 }]
    })
    setCartOpen(true)
  }

  const removeFromCart = (cartKey) => {
    setCart(prev => prev.filter(item => item.cartKey !== cartKey))
  }

  const updateQty = (cartKey, delta) => {
    setCart(prev => prev.map(item =>
      item.cartKey === cartKey ? { ...item, qty: Math.max(1, Math.min(item.stockQuantity, item.qty + delta)) } : item
    ).filter(item => item.qty > 0))
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0)
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0)
  const deliveryFeeApplicable = fulfilmentMethod === 'delivery' ? DELIVERY_FEE : 0
  const orderTotal = cartTotal + deliveryFeeApplicable
  const deliveryAddressComplete = !!(deliveryAddress.trim() && deliverySuburb.trim() && deliveryCity.trim() && deliveryPostalCode.trim())
  const normalisedOrderPhone = normaliseSaPhone(orderPhone)
  const phoneError = (phoneTouched && !normalisedOrderPhone) ? SA_PHONE_ERROR : ''
  const payflexAvailableForAmount = paymentOptions.payflex.enabled &&
    (paymentOptions.payflex.minimumAmount == null || orderTotal >= paymentOptions.payflex.minimumAmount) &&
    (paymentOptions.payflex.maximumAmount == null || orderTotal <= paymentOptions.payflex.maximumAmount)
  const noWayToPay = !paymentOptions.ozow && !payflexAvailableForAmount
  const emailRequired = paymentMethod === 'payflex'
  const emailProvided = !!orderEmail.trim()
  const emailOk = emailRequired ? (emailProvided && isValidEmail(orderEmail)) : (!emailProvided || isValidEmail(orderEmail))
  const emailError = (emailTouched && !emailOk) ? EMAIL_ERROR : ''
  const canPlaceOrder = !!(orderName.trim() && normalisedOrderPhone && fulfilmentMethod &&
    (fulfilmentMethod === 'pickup' || deliveryAddressComplete) &&
    !noWayToPay && emailOk &&
    ((paymentMethod === 'ozow' && paymentOptions.ozow) || (paymentMethod === 'payflex' && payflexAvailableForAmount)))

  // CLASSES' hard-coded name/price/deposit are overridden by the live
  // courses API, matched by id - descriptions and curriculum text stay local.
  const coursesMerged = CLASSES.map(c => ({ ...c, ...(courseData[c.id] || {}) }))

  const closePaymentResult = () => {
    setPaymentResult(null)
    setPendingPollCount(0)
  }

  // Builds a hidden form and submits it - used by both the shop and training
  // payment flows to hand off to Ozow. The browser navigates away from here.
  const submitOzowForm = (action, fields) => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = action
    Object.entries(fields).forEach(([key, value]) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = key
      input.value = value
      form.appendChild(input)
    })
    document.body.appendChild(form)
    form.submit()
  }

  const submitToOzow = async (orderToken) => {
    try {
      const res = await fetch(`${API}/api/payments/ozow/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderToken }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.action || !data?.fields) {
        setOrderError(data?.error || "I couldn't take you to Ozow just now. Please try again in a moment.")
        setPaymentSubmitting(false)
        setPaymentResultLoading(false)
        return
      }
      submitOzowForm(data.action, data.fields)
    } catch (err) {
      console.error('Ozow start failed:', err)
      setOrderError("I couldn't reach the shop just now. Please check your connection and try again.")
      setPaymentSubmitting(false)
      setPaymentResultLoading(false)
    }
  }

  const submitToPayflex = async (orderToken) => {
    try {
      const res = await fetch(`${API}/api/payments/payflex/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderToken }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.redirectUrl) {
        setOrderError(data?.error || "I couldn't take you to Payflex just now. Please try again in a moment.")
        setPaymentSubmitting(false)
        setPaymentResultLoading(false)
        return
      }
      window.location.assign(data.redirectUrl)
    } catch (err) {
      console.error('Payflex start failed:', err)
      setOrderError("I couldn't reach the shop just now. Please check your connection and try again.")
      setPaymentSubmitting(false)
      setPaymentResultLoading(false)
    }
  }

  // Retries the same provider the order already used.
  const retryPayment = async () => {
    if (!paymentResult?.token) return
    setPaymentResultLoading(true)
    if (paymentResult.order?.paymentMethod === 'payflex') await submitToPayflex(paymentResult.token)
    else await submitToOzow(paymentResult.token)
  }

  // Switches the same order to the other online provider, then immediately
  // starts that provider's payment flow.
  const switchProvider = async (toProvider) => {
    if (!paymentResult?.token) return
    setPaymentResultLoading(true)
    try {
      const res = await fetch(`${API}/api/orders/${paymentResult.token}/switch-provider`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: toProvider }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setOrderError(data?.error || "I couldn't switch payment methods just now. Please try again.")
        setPaymentResultLoading(false)
        return
      }
      if (toProvider === 'payflex') await submitToPayflex(paymentResult.token)
      else await submitToOzow(paymentResult.token)
    } catch (err) {
      console.error('Switch provider failed:', err)
      setOrderError("I couldn't reach the shop just now. Please check your connection and try again.")
      setPaymentResultLoading(false)
    }
  }

  const openEnrolForm = (courseId) => {
    setEnrolFormOpenFor(courseId)
    setEnrolName('')
    setEnrolPhone('')
    setEnrolPhoneTouched(false)
    setEnrolEmail('')
    setEnrolEmailTouched(false)
    setEnrolStartDate('')
    setEnrolPaymentOption(null)
    setEnrolError('')
  }

  const closeEnrolmentResult = () => {
    setEnrolmentResult(null)
    setEnrolPendingPollCount(0)
  }

  const openCourse = enrolFormOpenFor != null ? coursesMerged.find(c => c.id === enrolFormOpenFor) : null
  const normalisedEnrolPhone = normaliseSaPhone(enrolPhone)
  const enrolPhoneError = (enrolPhoneTouched && !normalisedEnrolPhone) ? SA_PHONE_ERROR : ''
  const enrolEmailOk = !!enrolEmail.trim() && isValidEmail(enrolEmail)
  const enrolEmailError = (enrolEmailTouched && !enrolEmailOk) ? EMAIL_ERROR : ''
  const enrolDateOk = isValidFutureCourseDate(enrolStartDate)
  const enrolDateError = (enrolStartDate && !enrolDateOk) ? ENROL_DATE_ERROR : ''
  const enrolPayflexAvailable = !!openCourse && paymentOptions.payflex.enabled &&
    (paymentOptions.payflex.minimumAmount == null || openCourse.price >= paymentOptions.payflex.minimumAmount) &&
    (paymentOptions.payflex.maximumAmount == null || openCourse.price <= paymentOptions.payflex.maximumAmount)
  const enrolNoWayToPay = !!openCourse && !paymentOptions.ozow && !enrolPayflexAvailable
  const canSubmitEnrolment = !!(openCourse && enrolName.trim() && normalisedEnrolPhone && enrolEmailOk && enrolDateOk &&
    enrolPaymentOption && !enrolNoWayToPay &&
    (enrolPaymentOption === 'full_payflex' ? enrolPayflexAvailable : paymentOptions.ozow))

  const submitEnrolment = async () => {
    setEnrolPhoneTouched(true)
    setEnrolEmailTouched(true)
    if (!canSubmitEnrolment) return
    setEnrolError('')
    setEnrolSubmitting(true)
    try {
      const res = await fetch(`${API}/api/enrolments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: openCourse.id,
          name: enrolName,
          phone: enrolPhone,
          email: enrolEmail,
          preferredStartDate: enrolStartDate,
          paymentOption: enrolPaymentOption,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        setEnrolError(data?.error || "I couldn't start your enrolment just now. Please try again in a moment.")
        setEnrolSubmitting(false)
        return
      }
      if (data.redirectUrl) window.location.assign(data.redirectUrl)
      else if (data.action && data.fields) submitOzowForm(data.action, data.fields)
    } catch (err) {
      console.error('Enrolment failed:', err)
      setEnrolError("I couldn't reach the shop just now. Please check your connection and try again.")
      setEnrolSubmitting(false)
    }
  }

  // Retries the most recent payment attempt exactly as it was (same
  // provider, amount and purpose) - for a deposit or full-price attempt
  // that was cancelled or failed.
  const retryEnrolmentPayment = async () => {
    if (!enrolmentResult?.token) return
    setEnrolError('')
    setEnrolmentResultLoading(true)
    try {
      const res = await fetch(`${API}/api/enrolments/${enrolmentResult.token}/retry`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setEnrolError(data?.error || "I couldn't retry that payment just now. Please try again.")
        setEnrolmentResultLoading(false)
        return
      }
      if (data.redirectUrl) window.location.assign(data.redirectUrl)
      else if (data.action && data.fields) submitOzowForm(data.action, data.fields)
    } catch (err) {
      console.error('Retry enrolment payment failed:', err)
      setEnrolError("I couldn't reach the shop just now. Please check your connection and try again.")
      setEnrolmentResultLoading(false)
    }
  }

  // Starts a new payment for whatever is still owed - separate from
  // retrying, since a balance can be paid any time after the deposit.
  const payEnrolmentBalance = async (provider) => {
    if (!enrolmentResult?.token) return
    setEnrolError('')
    setEnrolmentResultLoading(true)
    try {
      const res = await fetch(`${API}/api/enrolments/${enrolmentResult.token}/pay-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setEnrolError(data?.error || "I couldn't start that payment just now. Please try again.")
        setEnrolmentResultLoading(false)
        return
      }
      if (data.redirectUrl) window.location.assign(data.redirectUrl)
      else if (data.action && data.fields) submitOzowForm(data.action, data.fields)
    } catch (err) {
      console.error('Pay balance failed:', err)
      setEnrolError("I couldn't reach the shop just now. Please check your connection and try again.")
      setEnrolmentResultLoading(false)
    }
  }

  const renderFieldError = (msg) => (
    <p style={{ fontSize: '12px', color: 'var(--accent)', margin: '0 0 12px 0', lineHeight: 1.6 }}>{msg}</p>
  )

  const openPolicies = (tab) => {
    setPolicyTab(tab)
    setShowPolicies(true)
    window.scrollTo(0, 0)
  }

  const renderPolicySections = (sections) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {sections.map((section, i) => (
        <div
          key={i}
          style={{
            background: 'var(--surface)',
            borderRadius: '12px',
            borderLeft: '4px solid var(--accent)',
            padding: '24px 28px',
            boxShadow: '0 2px 12px rgba(196, 122, 138, 0.08)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--text)',
              marginBottom: '10px',
            }}
          >
            {section.heading}
          </div>
          {section.body && (
            <div style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--body-text-dark)' }}>{section.body}</div>
          )}
          {section.list && section.list.type === 'numbered' && (
            <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {section.list.items.map((item, idx) => (
                <li key={idx} style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--body-text-dark)' }}>{item}</li>
              ))}
            </ol>
          )}
          {section.list && section.list.type === 'bullet' && (
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {section.list.items.map((item, idx) => (
                <li key={idx} style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--body-text-dark)' }}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )

  const buildOrderPayload = () => ({
    customerName: orderName,
    customerPhone: orderPhone,
    customerEmail: orderEmail.trim() || undefined,
    items: cart.map(i => ({ id: i.id, variantId: i.variantId, name: i.name, qty: i.qty, price: i.price })),
    fulfilmentMethod,
    deliveryAddress: fulfilmentMethod === 'delivery' ? deliveryAddress : undefined,
    deliverySuburb: fulfilmentMethod === 'delivery' ? deliverySuburb : undefined,
    deliveryCity: fulfilmentMethod === 'delivery' ? deliveryCity : undefined,
    deliveryPostalCode: fulfilmentMethod === 'delivery' ? deliveryPostalCode : undefined,
    deliveryNotes: fulfilmentMethod === 'delivery' ? deliveryNotes : undefined,
  })

  const startOzowPayment = async () => {
    if (!canPlaceOrder) return
    setOrderError('')
    setPaymentSubmitting(true)
    try {
      const res = await fetch(`${API}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildOrderPayload(), paymentMethod: 'ozow' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.orderToken) {
        setOrderError(data?.error || "I couldn't get your order through just now, but don't worry, your cart is still here. Please try again in a moment.")
        setPaymentSubmitting(false)
        return
      }
      // The cart isn't persisted and this page is about to unload for Ozow,
      // so it's safe to clear it now that the order has been created.
      setCart([])
      await submitToOzow(data.orderToken)
    } catch (err) {
      console.error('Ozow order creation failed:', err)
      setOrderError("I couldn't reach the shop just now, but your cart is safe. Please check your connection and try again.")
      setPaymentSubmitting(false)
    }
  }

  const startPayflexPayment = async () => {
    if (!canPlaceOrder) return
    setOrderError('')
    setPaymentSubmitting(true)
    try {
      const res = await fetch(`${API}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildOrderPayload(), paymentMethod: 'payflex' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.orderToken) {
        setOrderError(data?.error || "I couldn't get your order through just now, but don't worry, your cart is still here. Please try again in a moment.")
        setPaymentSubmitting(false)
        return
      }
      // The cart isn't persisted and this page is about to unload for Payflex,
      // so it's safe to clear it now that the order has been created.
      setCart([])
      await submitToPayflex(data.orderToken)
    } catch (err) {
      console.error('Payflex order creation failed:', err)
      setOrderError("I couldn't reach the shop just now, but your cart is safe. Please check your connection and try again.")
      setPaymentSubmitting(false)
    }
  }

  const placeOrder = () => {
    setPhoneTouched(true)
    setEmailTouched(true)
    if (paymentMethod === 'payflex') startPayflexPayment()
    else if (paymentMethod === 'ozow') startOzowPayment()
  }

  const renderProductCard = (product) => {
    const hasOptions = product.options && product.options.length > 0
    const sel = selectedOptions[product.id] || {}
    const lengths = hasOptions ? [...new Set(product.options.map(o => o.lengthMm))].sort((a, b) => a - b) : []
    const curls = hasOptions ? [...new Set(product.options.map(o => o.curl))] : []
    const showCurlPicker = curls.length > 1

    const lengthDisabled = (len) =>
      !product.options.some(o => o.lengthMm === len && o.isActive && o.stockQuantity > 0)
    const curlDisabled = (curl) => {
      if (sel.lengthMm) {
        const match = product.options.find(o => o.lengthMm === sel.lengthMm && o.curl === curl)
        return !match || !match.isActive || match.stockQuantity <= 0
      }
      return !product.options.some(o => o.curl === curl && o.isActive && o.stockQuantity > 0)
    }
    // Mobile dropdown only: the length list narrows to the chosen curl, the
    // same way the curl pills already narrow to the chosen length above.
    const lengthDisabledForCurl = (len) => {
      if (showCurlPicker && sel.curl) {
        const match = product.options.find(o => o.lengthMm === len && o.curl === sel.curl)
        return !match || !match.isActive || match.stockQuantity <= 0
      }
      return lengthDisabled(len)
    }

    const selectedVariant = hasOptions
      ? product.options.find(o => o.lengthMm === sel.lengthMm && (!showCurlPicker || o.curl === sel.curl))
      : null
    const choiceComplete = !hasOptions || !!selectedVariant
    const effectiveStock = hasOptions ? (selectedVariant ? selectedVariant.stockQuantity : null) : product.stockQuantity
    const effectiveLowThreshold = hasOptions ? (selectedVariant ? selectedVariant.lowStockThreshold : null) : product.lowStockThreshold

    // Clicking an already-selected length or curl unselects it.
    const pickLength = (len) => setSelectedOptions(prev => ({
      ...prev,
      [product.id]: { ...prev[product.id], lengthMm: prev[product.id]?.lengthMm === len ? undefined : len },
    }))
    const pickCurl = (curl) => setSelectedOptions(prev => ({
      ...prev,
      [product.id]: { ...prev[product.id], curl: prev[product.id]?.curl === curl ? undefined : curl },
    }))

    const handleLengthSelect = (e) => {
      const value = e.target.value
      setSelectedOptions(prev => ({
        ...prev,
        [product.id]: { ...prev[product.id], lengthMm: value ? Number(value) : undefined },
      }))
    }
    const handleCurlSelect = (e) => {
      const value = e.target.value
      setSelectedOptions(prev => ({
        ...prev,
        [product.id]: { ...prev[product.id], curl: value || undefined },
      }))
    }

    const pillStyle = (active, disabled) => ({
      padding: '6px 10px',
      borderRadius: '16px',
      fontSize: '12px',
      fontWeight: 600,
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent)' : 'var(--surface)',
      color: disabled ? 'var(--disabled-text)' : active ? 'var(--surface)' : 'var(--text)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      textDecoration: disabled ? 'line-through' : 'none',
    })

    const handleAdd = () => {
      if (!choiceComplete) return
      const item = hasOptions
        ? {
            id: product.id,
            variantId: selectedVariant.id,
            lengthMm: selectedVariant.lengthMm,
            curl: selectedVariant.curl,
            name: `${product.name}, ${selectedVariant.lengthMm}mm, ${selectedVariant.curl} curl`,
            price: product.price,
            stockQuantity: selectedVariant.stockQuantity,
            cartKey: `${product.id}-${selectedVariant.id}`,
          }
        : {
            id: product.id,
            variantId: null,
            lengthMm: null,
            curl: null,
            name: product.name,
            price: product.price,
            stockQuantity: product.stockQuantity,
            cartKey: String(product.id),
          }
      addToCart(item)
    }

    return (
      <div className="product-card" key={product.id}>
        <div style={{ height: '240px', overflow: 'hidden', position: 'relative' }}>
          {productImages[product.id] ? (
            <img
              className="product-img"
              src={mediaUrl(productImages[product.id])}
              alt={product.name}
              style={{
                width: '100%',
                height: '240px',
                objectFit: 'cover',
                display: 'block',
                transition: 'transform 0.3s ease',
                objectPosition: productPositions[product.id]
                  ? `${productPositions[product.id].x}% ${productPositions[product.id].y}%`
                  : '50% 50%',
              }}
            />
          ) : (
            <div className="product-image-placeholder">Product Image</div>
          )}
        </div>
        <div className="product-card-body" style={{ padding: '16px 18px 20px 18px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {product.badge && <span className="product-badge" style={{ marginBottom: '8px' }}>{product.badge}</span>}
          <h3 className="product-name">{product.name}</h3>
          <p className="product-description">{product.description}</p>
          <div className="product-detail-line" style={{ fontSize: '11px', color: 'var(--muted-label)', letterSpacing: '0.3px', marginBottom: '10px', fontStyle: 'italic', textTransform: 'uppercase' }}>
            {product.detail}
          </div>
          <p className="product-price">R {product.price}</p>

          {hasOptions && (
            <div className="product-options" style={{ marginBottom: '10px' }}>
              {isMobile ? (
                <>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                    Length
                  </label>
                  <select
                    className="option-select"
                    value={sel.lengthMm ?? ''}
                    onChange={handleLengthSelect}
                    style={{ marginBottom: showCurlPicker ? '10px' : '0' }}
                  >
                    <option value="">Choose a length</option>
                    {lengths.map(len => {
                      const disabled = lengthDisabledForCurl(len)
                      return (
                        <option key={len} value={len} disabled={disabled}>
                          {len}mm{disabled ? ' (sold out)' : ''}
                        </option>
                      )
                    })}
                  </select>

                  {showCurlPicker && (
                    <>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                        Curl
                      </label>
                      <select className="option-select" value={sel.curl ?? ''} onChange={handleCurlSelect}>
                        <option value="">Choose a curl</option>
                        {curls.map(curl => {
                          const disabled = curlDisabled(curl)
                          return (
                            <option key={curl} value={curl} disabled={disabled}>
                              {curl} curl{disabled ? ' (sold out)' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                    Length
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: showCurlPicker ? '12px' : '0' }}>
                    {lengths.map(len => (
                      <button
                        key={len}
                        type="button"
                        onClick={() => !lengthDisabled(len) && pickLength(len)}
                        disabled={lengthDisabled(len)}
                        style={pillStyle(sel.lengthMm === len, lengthDisabled(len))}
                      >
                        {len}mm
                      </button>
                    ))}
                  </div>

                  {showCurlPicker && (
                    <>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                        Curl
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {curls.map(curl => (
                          <button
                            key={curl}
                            type="button"
                            onClick={() => !curlDisabled(curl) && pickCurl(curl)}
                            disabled={curlDisabled(curl)}
                            style={pillStyle(sel.curl === curl, curlDisabled(curl))}
                          >
                            {curl} curl
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <div className="product-availability" style={{ fontSize: '12px', marginBottom: '10px', fontWeight: 600 }}>
            {!choiceComplete ? (
              <span style={{ color: 'var(--muted-caption)', fontStyle: 'italic', fontWeight: 400 }}>
                Choose a length{showCurlPicker ? ' and curl' : ''} to see availability
              </span>
            ) : effectiveStock <= 0 ? (
              <span style={{ color: 'var(--muted-caption)', fontStyle: 'italic', fontWeight: 400 }}>Sold out for now</span>
            ) : effectiveStock <= effectiveLowThreshold ? (
              <span style={{ color: 'var(--accent)' }}>Only {effectiveStock} left</span>
            ) : (
              <span style={{ color: 'var(--muted-caption)', fontWeight: 400 }}>In stock</span>
            )}
          </div>
          <button
            className="btn-add-cart add-to-cart-btn"
            onClick={handleAdd}
            disabled={!choiceComplete || effectiveStock <= 0}
            style={(!choiceComplete || effectiveStock <= 0) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            {!choiceComplete ? 'Select Options' : effectiveStock <= 0 ? 'Sold Out' : 'Add to Cart'}
          </button>
        </div>
      </div>
    )
  }

  const activeOccasion = OCCASION_GREETINGS[siteTheme.preset] || null
  const showOccasionBanner = !!activeOccasion && dismissedOccasion !== siteTheme.preset

  const dismissOccasionBanner = () => {
    setDismissedOccasion(siteTheme.preset)
    try { localStorage.setItem('hbh_dismissed_occasion', siteTheme.preset) } catch {}
  }

  // A fixed set of particles per animation type, regenerated only when the
  // occasion itself changes - not on every render.
  const occasionParticles = useMemo(() => {
    if (!activeOccasion) return []
    const counts = { snow: 18, hearts: 14, petals: 14, leaves: 12, sparkle: 16 }
    const count = counts[activeOccasion.animation] || 14
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 6 + Math.random() * 8,
      duration: 8 + Math.random() * 10,
      delay: Math.random() * 10,
      drift: (Math.random() - 0.5) * 80,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOccasion?.animation])

  return (
    <div className="page">
      <style>{`

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          font-family: var(--font-body);
          background: var(--background);
          color: var(--text);
        }

        .page {
          font-family: var(--font-body);
          color: var(--text);
          background-color: var(--background);
          min-height: 100vh;
        }

        /* Nav */
        .nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background-color: var(--nav-background);
          color: var(--text);
          height: 100px;
          padding-left: 2rem;
          padding-right: 2rem;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 1px 8px rgba(196, 122, 138, 0.12);
        }

        .nav-links {
          list-style: none;
          display: flex;
          gap: 2rem;
          align-items: center;
        }

        .nav-links a {
          color: var(--text);
          text-decoration: none;
          font-size: 0.95rem;
          transition: color 0.2s ease;
        }

        .nav-links a:hover {
          color: var(--accent);
        }

        .nav-links .book-now-link {
          background-color: var(--accent);
          color: var(--surface);
          padding: 8px 20px;
          border-radius: 24px;
          transition: background-color 0.2s ease;
        }

        .nav-links .book-now-link:hover {
          background-color: var(--accent-hover);
          color: var(--surface);
        }

        /* Hero */
        .hero {
          width: 100%;
          background: radial-gradient(ellipse at 60% 40%, var(--accent-soft-bg) 0%, var(--background) 70%);
          padding-top: 6rem;
          padding-bottom: 48px;
          padding-left: 2rem;
          padding-right: 2rem;
          text-align: center;
        }

        .hero-headline {
          font-family: var(--font-heading);
          font-size: 52px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 1rem;
          color: var(--text);
        }

        .hero-subtext {
          font-family: var(--font-body);
          font-size: 16px;
          font-weight: 300;
          letter-spacing: 0.3px;
          color: var(--muted-text);
          max-width: 600px;
          margin: 0 auto 0.5rem auto;
          line-height: 1.6;
        }

        .hero-tagline {
          font-family: var(--font-heading);
          font-style: italic;
          font-size: 22px;
          color: var(--accent);
          max-width: 600px;
          margin: 0 auto 2.5rem auto;
        }

        .hero-buttons {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .btn {
          display: inline-block;
          padding: 14px 32px;
          border-radius: 28px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-decoration: none;
          cursor: pointer;
          border: none;
          transition: background-color 0.2s ease, transform 0.1s ease;
        }

        .btn-primary {
          background-color: var(--accent);
          color: var(--surface);
        }

        .btn-primary:hover {
          background-color: var(--accent-hover);
        }

        .btn-secondary {
          background-color: transparent;
          color: var(--accent);
          border: 2px solid var(--accent);
        }

        .btn-secondary:hover {
          background-color: var(--accent);
          color: var(--surface);
        }

        /* Generic section */
        .section {
          padding: 5rem 2rem;
          text-align: center;
        }

        .section-alt {
          background-color: var(--nav-background);
        }

        #shop {
          background-color: var(--background);
        }

        #classes {
          background-color: var(--nav-background);
        }

        #gallery {
          background-color: var(--background);
        }

        #contact {
          background-color: var(--nav-background);
        }

        .section-heading {
          font-family: var(--font-heading);
          font-size: 38px;
          font-weight: 700;
          margin-bottom: 0;
          color: var(--text);
        }

        .section-heading::after {
          content: '';
          display: block;
          width: 48px;
          height: 2px;
          background: var(--accent);
          margin: 8px auto 24px auto;
        }

        .section-text {
          font-size: 1.05rem;
          color: var(--muted-text);
        }

        /* Backend wake-up / unreachable states */
        .backend-status-message {
          max-width: 480px;
          margin: 0 auto;
          padding: 48px 20px;
          text-align: center;
          font-size: 1.05rem;
          color: var(--muted-text);
        }

        .backend-status-message.is-loading {
          animation: backendStatusPulse 1.6s ease-in-out infinite;
        }

        .backend-status-message.is-error {
          color: var(--accent-strong);
          font-weight: 600;
        }

        .backend-status-message a {
          color: var(--accent);
          text-decoration: underline;
        }

        @keyframes backendStatusPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }

        /* Products */
        .products-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          max-width: 1200px;
          margin: 2rem auto 0 auto;
          text-align: left;
        }

        .product-card {
          background: var(--surface);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 2px 16px rgba(196, 122, 138, 0.10);
          border: 1px solid var(--border);
          display: flex;
          flex-direction: column;
        }

        .product-card:hover .product-img {
          transform: scale(1.04);
        }

        .product-image-placeholder {
          height: 240px;
          background-color: var(--accent-soft-bg);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          font-size: 13px;
          font-style: italic;
        }

        .product-badge {
          display: inline-block;
          background-color: var(--accent);
          color: var(--surface);
          font-size: 11px;
          padding: 3px 10px;
          border-radius: 20px;
          margin-bottom: 8px;
          width: fit-content;
        }

        .product-name {
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 18px;
          color: var(--text);
          margin-bottom: 6px;
          line-height: 1.2;
        }

        .product-description {
          font-size: 13px;
          color: var(--muted-text);
          line-height: 1.6;
          margin-bottom: 8px;
          flex: 1;
        }

        .product-price {
          font-size: 20px;
          font-weight: 700;
          color: var(--accent);
          margin-bottom: 14px;
        }

        .option-select {
          display: block;
          width: 100%;
          min-height: 44px;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-family: var(--font-body);
          font-size: 14px;
          cursor: pointer;
        }

        .option-select:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 2px rgba(196, 122, 138, 0.25);
        }

        .btn-add-cart {
          width: 100%;
          background-color: var(--accent);
          color: var(--surface);
          border: none;
          padding: 12px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.5px;
          transition: background 0.2s;
        }

        .btn-add-cart:hover {
          background-color: var(--accent-hover);
        }

        .add-to-cart-btn:hover {
          background: var(--accent-strong) !important;
        }

        /* Classes */
        .classes-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
          max-width: 1000px;
          margin: 2rem auto 0 auto;
          text-align: left;
        }

        .class-card {
          background-color: var(--surface);
          box-shadow: 0 2px 16px rgba(196, 122, 138, 0.10);
          border-radius: 16px;
          border: 1px solid var(--border);
          padding: 28px;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        .class-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .class-name {
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 20px;
          color: var(--text);
          margin-bottom: 4px;
        }

        .class-level-badge {
          background-color: var(--accent-soft-bg);
          color: var(--accent);
          font-size: 11px;
          font-weight: 600;
          padding: 4px 12px;
          border-radius: 20px;
          white-space: nowrap;
        }

        .class-duration {
          font-size: 13px;
          color: var(--muted-caption2);
          margin-top: 4px;
          margin-bottom: 12px;
        }

        .class-description {
          font-size: 13px;
          color: var(--body-text-soft);
          line-height: 1.7;
          margin-bottom: 16px;
        }

        .class-price {
          font-size: 24px;
          font-weight: 700;
          color: var(--accent);
          margin-bottom: 4px;
        }

        .class-seats {
          font-size: 12px;
          color: var(--muted-caption2);
          margin-top: 4px;
          margin-bottom: 18px;
          font-style: italic;
        }

        .class-certification {
          font-size: 13px;
          color: var(--muted-text);
          font-style: italic;
          margin-bottom: 16px;
        }

        .btn-enquire {
          width: 100%;
          border: 2px solid var(--accent);
          background-color: transparent;
          color: var(--accent);
          padding: 12px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.5px;
          margin-top: auto;
          transition: all 0.2s;
        }

        .btn-enquire:hover {
          background-color: var(--accent);
          color: var(--surface);
        }

        .enquire-btn:hover {
          background: var(--accent) !important;
          color: white !important;
        }

        /* Gallery */
        .gallery-subheading {
          margin-bottom: 0;
        }

        .gallery-grid {
          column-count: 3;
          column-gap: 12px;
          max-width: 1100px;
          margin: 0 auto;
        }

        @media (max-width: 768px) {
          .products-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .classes-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
        }

        @media (max-width: 768px) {
          .product-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }

        /* Contact */
        #contact {
          padding: 72px 24px;
        }

        /* Footer */
        .footer {
          background-color: var(--footer-bg);
          color: var(--muted-label);
          text-align: center;
          padding: 32px 20px;
          font-size: 13px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .social-icon-link:hover {
          background: var(--accent) !important;
          border-color: var(--accent) !important;
        }

        .social-icon-link:hover svg {
          color: var(--surface);
          fill: var(--surface);
        }

        .footer-policies-link {
          background: none;
          border: none;
          color: rgba(255,255,255,0.5);
          font-size: 12px;
          text-decoration: underline;
          cursor: pointer;
          font-family: inherit;
          padding: 0;
          transition: color 0.2s ease;
        }

        .footer-policies-link:hover {
          color: var(--accent);
        }

        .class-item::before {
          content: '-';
          position: absolute;
          left: 0;
          color: var(--accent);
        }

        @media (max-width: 440px) {
          .cart-drawer {
            width: 100vw !important;
            right: -100vw !important;
          }

          .cart-drawer.open {
            right: 0 !important;
          }
        }

        @media (max-width: 640px) {
          .hero-headline {
            font-size: 2rem;
          }

          .hero-tagline {
            font-size: 18px;
          }
        }

        /* ── Mobile base ── */
        @media (max-width: 768px) {

          /* Nav */
          .mobile-nav { padding: 0 16px !important; }
          .mobile-logo {
            height: 60px !important;
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
          }

          /* Hero */
          .hero-section { padding: 48px 20px 40px 20px !important; }
          .hero-heading { font-size: 34px !important; line-height: 1.2 !important; }
          .hero-tagline { font-size: 17px !important; }
          .hero-buttons { flex-direction: column !important; align-items: center !important; gap: 12px !important; }
          .hero-btn { width: 100% !important; max-width: 280px !important; }

          /* Products */
          .product-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
          .products-section { padding: 60px 16px !important; }
          .product-card-body { padding: 12px 14px 14px 14px !important; }
          .product-name { margin-bottom: 4px !important; }
          .product-description {
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            margin-bottom: 6px !important;
          }
          .product-detail-line {
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            margin-bottom: 8px !important;
          }
          .product-price { margin-bottom: 8px !important; }
          .product-options { margin-bottom: 8px !important; }
          .product-availability { margin-bottom: 8px !important; }

          /* Classes */
          .classes-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
          .classes-grid > *:last-child:nth-child(odd) {
            grid-column: 1 / -1 !important;
            max-width: calc(50% - 6px) !important;
            margin: 0 auto !important;
          }
          .classes-section { padding: 60px 16px !important; }
          .scope-grid-customer { grid-template-columns: 1fr !important; }
          .scope-grid-customer > div > div:first-child { font-size: 9px !important; letter-spacing: 1px !important; margin-bottom: 6px !important; }
          .class-card { padding: 16px !important; }
          .class-name { font-size: 15px !important; margin-bottom: 2px !important; }
          .class-level-badge { font-size: 9px !important; padding: 3px 8px !important; }
          .class-duration { font-size: 11px !important; margin-bottom: 10px !important; }
          .class-description { font-size: 12px !important; line-height: 1.5 !important; margin-bottom: 12px !important; }
          .class-item { font-size: 11px !important; line-height: 1.5 !important; }
          .class-price { font-size: 18px !important; }
          .class-seats { font-size: 10px !important; margin-bottom: 12px !important; }
          .class-certification { font-size: 11px !important; margin-bottom: 12px !important; }
          .btn-enquire { font-size: 11px !important; padding: 10px !important; }

          /* Gallery */
          .gallery-section { padding: 60px 16px !important; }
          .gallery-grid { column-count: 2 !important; column-gap: 8px !important; }

          /* Contact */
          .contact-section { padding: 60px 16px !important; }
          .contact-card { padding: 24px 20px !important; max-width: 100% !important; }

          /* Cart drawer */
          .cart-drawer { width: 100vw !important; }

          /* Footer */
          .site-footer { padding: 24px 16px !important; }

        }

        .desktop-nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
        }

        .hamburger-btn {
          display: none;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: var(--text);
          line-height: 1;
        }

        @media (max-width: 768px) {
          .desktop-nav-links { display: none !important; }
          .hamburger-btn { display: block !important; }
        }

        @media (max-width: 480px) {
          .hero-heading { font-size: 28px !important; }
          .hero-tagline { font-size: 16px !important; }

          .policies-nav { padding: 0 16px !important; height: auto !important; min-height: 60px !important; flex-wrap: wrap !important; gap: 8px !important; padding-top: 10px !important; padding-bottom: 10px !important; }
          .policies-content { padding: 40px 16px !important; }
          .policies-tabs { width: 100% !important; max-width: 100% !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .policies-tabs button { flex-shrink: 0 !important; white-space: nowrap !important; }
        }

        /* Occasion banner + particle animation - shown only while an
           occasion theme preset (e.g. "Festive Season") is active. */
        .occasion-banner {
          position: relative;
          z-index: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 10px 20px;
          text-align: center;
          font-size: 13px;
          font-weight: 600;
          background: var(--nav-background);
          color: var(--text);
          border-bottom: 1px solid var(--border);
        }

        .occasion-banner-close {
          background: none;
          border: none;
          color: var(--muted-text);
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          padding: 0;
        }

        .occasion-particles {
          position: fixed;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 1;
        }

        .occasion-particle {
          position: absolute;
          top: -24px;
          border-radius: 50%;
          opacity: 0.7;
          animation-name: occasion-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        @keyframes occasion-fall {
          0% { transform: translateY(-10vh) translateX(0) rotate(0deg); }
          100% { transform: translateY(110vh) translateX(var(--drift, 20px)) rotate(360deg); }
        }

        @keyframes occasion-twinkle {
          0%, 100% { opacity: 0; transform: scale(0.6); }
          50% { opacity: 0.9; transform: scale(1.15); }
        }

        .occasion-particle.snow { background: #FFFFFF; box-shadow: 0 0 4px rgba(255,255,255,0.8); }
        .occasion-particle.hearts { background: var(--accent); border-radius: 50% 50% 50% 0; transform: rotate(45deg); }
        .occasion-particle.petals { background: var(--accent-soft-bg); border-radius: 60% 0 60% 0; }
        .occasion-particle.leaves { background: var(--accent); border-radius: 0 70% 0 70%; }
        .occasion-particle.sparkle {
          background: var(--accent);
          border-radius: 2px;
          animation-name: occasion-twinkle;
        }

        @media (prefers-reduced-motion: reduce) {
          .occasion-particle { animation: none !important; display: none; }
        }

        @media (max-width: 600px) {
          .occasion-banner { font-size: 12px; padding: 8px 14px; gap: 10px; }
        }
      `}</style>

      {showOccasionBanner && (
        <div className="occasion-banner">
          <span>{activeOccasion.message}</span>
          <button className="occasion-banner-close" onClick={dismissOccasionBanner} aria-label="Dismiss">
            x
          </button>
        </div>
      )}

      {showOccasionBanner && (
        <div className="occasion-particles" aria-hidden="true">
          {occasionParticles.map(p => (
            <span
              key={p.id}
              className={`occasion-particle ${activeOccasion.animation}`}
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.size,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
                '--drift': `${p.drift}px`,
              }}
            />
          ))}
        </div>
      )}

      {!showPolicies && (
      <>
      <nav className="nav mobile-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <button
          className="hamburger-btn"
          onClick={() => setMobileMenuOpen(prev => !prev)}
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--text)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {mobileMenuOpen
              ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
              : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
            }
          </svg>
        </button>
        <img
          src="/logo.png"
          alt="Lashes By Retha"
          className="mobile-logo"
          style={{ height: '90px', width: 'auto', objectFit: 'contain', display: 'block' }}
        />
        <div className="nav-links desktop-nav-links" style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <a href="#home">Home</a>
          <a href="#shop">Shop</a>
          <a href="#classes">Lash Training</a>
          <a
            className="book-now-link"
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Book Now
          </a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
          <button
            onClick={() => setCartOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              padding: '6px',
              marginLeft: '12px',
              color: 'var(--text)',
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {cartCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  background: 'var(--accent)',
                  color: 'white',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  fontSize: '10px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div style={{
          position: 'fixed',
          top: '100px',
          left: 0,
          right: 0,
          background: 'var(--nav-background)',
          borderBottom: '1px solid var(--border)',
          zIndex: 999,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          boxShadow: '0 4px 16px rgba(196,122,138,0.15)',
        }}>
          {[
            { label: 'Home', href: '#home' },
            { label: 'Shop', href: '#shop' },
            { label: 'Lash Training', href: '#classes' },
          ].map(link => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'block',
                padding: '12px 8px',
                fontSize: '15px',
                fontWeight: '600',
                color: 'var(--text)',
                textDecoration: 'none',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {link.label}
            </a>
          ))}
          <a
            href="https://lashesbyretha.setmore.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              display: 'block',
              marginTop: '8px',
              padding: '12px',
              background: 'var(--accent)',
              color: 'white',
              borderRadius: '10px',
              textAlign: 'center',
              fontWeight: '700',
              fontSize: '14px',
              textDecoration: 'none',
              letterSpacing: '0.5px',
            }}
          >
            Book Now
          </a>
        </div>
      )}

      <section id="home" className="hero hero-section">
        <h1 className="hero-headline hero-heading">{siteContent.hero.heading}</h1>
        <p className="hero-subtext">
          {siteContent.hero.subtext}
        </p>
        <p className="hero-tagline">{siteContent.hero.tagline}</p>
        <div className="hero-buttons">
          <a
            className="btn btn-primary hero-btn"
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {siteContent.hero.bookButtonLabel}
          </a>
          <button className="btn btn-secondary hero-btn" onClick={scrollToShop}>
            {siteContent.hero.shopButtonLabel}
          </button>
        </div>
      </section>

      <section id="shop" className="section products-section">
        <h2 className="section-heading">{siteContent.sectionHeadings.products}</h2>
        {backendStatus !== 'ready' ? renderBackendStatus() : (() => {
          const grouped = []

          // Add categorised groups in order
          categories.forEach(cat => {
            const catProducts = products.filter(p => productCategories[p.id] === cat.id)
            if (catProducts.length > 0) {
              grouped.push({ id: cat.id, name: cat.name, products: catProducts })
            }
          })

          // Add uncategorised products at the end
          const uncategorised = products.filter(p => !productCategories[p.id])
          if (uncategorised.length > 0) {
            grouped.push({ id: 'uncategorised', name: null, products: uncategorised })
          }

          // If no categories loaded yet, show all products flat (fallback)
          if (grouped.length === 0) {
            return (
              <div className="product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', textAlign: 'left', alignItems: 'start' }}>
                {products.map(product => renderProductCard(product))}
              </div>
            )
          }

          return grouped.map(group => (
            <div key={group.id} style={{ marginBottom: '48px', textAlign: 'left' }}>
              {group.name && (
                <div style={{ marginBottom: '20px', paddingLeft: '8px' }}>
                  <h3 style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '24px',
                    fontWeight: '700',
                    color: 'var(--text)',
                    marginBottom: '6px',
                    letterSpacing: '0.3px',
                  }}>{group.name}</h3>
                  <div style={{ width: '28px', height: '2px', background: 'var(--accent)', marginLeft: '2px' }} />
                </div>
              )}
              <div className="product-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '24px',
                alignItems: 'start',
              }}>
                {group.products.map(product => renderProductCard(product))}
              </div>
            </div>
          ))
        })()}
      </section>

      <section id="classes" className="section section-alt classes-section">
        <h2 className="section-heading">{siteContent.sectionHeadings.classes}</h2>
        <div className="classes-grid">
          {coursesMerged.map((cls) => (
            <div
              className="class-card"
              key={cls.id}
              onClick={() => { if (isMobile) setExpandedClassId(cls.id) }}
              style={{ cursor: isMobile ? 'pointer' : 'default' }}
            >
              <div style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 80,
                height: 80,
                background: 'radial-gradient(circle at top right, var(--border-soft) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />
              <div className="class-card-top">
                <span className="class-name">{cls.name}</span>
                <span className="class-level-badge">{cls.level}</span>
              </div>
              {!isMobile && <p className="class-duration">{cls.duration}</p>}
              <p className="class-description">{cls.description}</p>
              {!isMobile && (
                <div className="scope-grid-customer" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '8px' }}>
                      What you will learn
                    </div>
                    {cls.learns.map((item) => (
                      <div
                        className="class-item"
                        key={item}
                        style={{ fontSize: '13px', color: 'var(--body-text-soft)', lineHeight: 1.7, paddingLeft: '12px', position: 'relative' }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '8px' }}>
                      What is included
                    </div>
                    {cls.includes.map((item) => (
                      <div
                        className="class-item"
                        key={item}
                        style={{ fontSize: '13px', color: 'var(--body-text-soft)', lineHeight: 1.7, paddingLeft: '12px', position: 'relative' }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="class-price">R {cls.price}</p>
              {!isMobile && <p className="class-seats">Non-refundable deposit of R{cls.deposit} to secure your spot</p>}
              {isMobile && (
                <p style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, textAlign: 'center', marginTop: '4px' }}>
                  Tap to view full details
                </p>
              )}
              {!isMobile && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn-enquire enquire-btn"
                    onClick={(e) => { e.stopPropagation(); openEnrolForm(cls.id) }}
                    style={{ flex: 1, display: 'block', textAlign: 'center', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Enrol Now
                  </button>
                  <a
                    className="btn-enquire enquire-btn"
                    href={`${whatsAppHref(siteContent.contact.phone)}?text=Hi%20Retha%2C%20I%20am%20interested%20in%20the%20${encodeURIComponent(cls.name)}%20(${encodeURIComponent(cls.duration)})`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ flex: 1, display: 'block', textAlign: 'center', textDecoration: 'none', background: 'white', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                  >
                    Enquire Now
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {expandedClassId && isMobile && (() => {
        const cls = coursesMerged.find((c) => c.id === expandedClassId)
        if (!cls) return null
        return (
          <>
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(44,44,44,0.4)',
                zIndex: 800,
              }}
              onClick={() => setExpandedClassId(null)}
            />
            <div
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '90%',
                maxWidth: '380px',
                maxHeight: '85vh',
                overflowY: 'auto',
                background: 'var(--background)',
                borderRadius: '16px',
                zIndex: 900,
                padding: '40px 24px 24px 24px',
                boxShadow: '0 12px 40px rgba(44,44,44,0.25)',
              }}
            >
              <button
                onClick={() => setExpandedClassId(null)}
                style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted-text)' }}
              >
                x
              </button>
              <div className="class-card-top">
                <span className="class-name">{cls.name}</span>
                <span className="class-level-badge">{cls.level}</span>
              </div>
              <p className="class-duration">{cls.duration}</p>
              <p className="class-description">{cls.description}</p>
              <div className="scope-grid-customer" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    What you will learn
                  </div>
                  {cls.learns.map((item) => (
                    <div
                      className="class-item"
                      key={item}
                      style={{ fontSize: '13px', color: 'var(--body-text-soft)', lineHeight: 1.7, paddingLeft: '12px', position: 'relative' }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    What is included
                  </div>
                  {cls.includes.map((item) => (
                    <div
                      className="class-item"
                      key={item}
                      style={{ fontSize: '13px', color: 'var(--body-text-soft)', lineHeight: 1.7, paddingLeft: '12px', position: 'relative' }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <p className="class-price">R {cls.price}</p>
              <p className="class-seats">Non-refundable deposit of R{cls.deposit} to secure your spot</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn-enquire enquire-btn"
                  onClick={() => { setExpandedClassId(null); openEnrolForm(cls.id) }}
                  style={{ flex: 1, display: 'block', textAlign: 'center', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Enrol Now
                </button>
                <a
                  className="btn-enquire enquire-btn"
                  href={`${whatsAppHref(siteContent.contact.phone)}?text=Hi%20Retha%2C%20I%20am%20interested%20in%20the%20${encodeURIComponent(cls.name)}%20(${encodeURIComponent(cls.duration)})`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flex: 1, display: 'block', textAlign: 'center', textDecoration: 'none', background: 'white', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                >
                  Enquire Now
                </a>
              </div>
            </div>
          </>
        )
      })()}

      {enrolFormOpenFor != null && openCourse && (() => {
        const fieldStyle = (error, extra) => ({
          width: '100%',
          padding: '12px 14px',
          borderRadius: '10px',
          border: `1px solid ${error ? 'var(--accent)' : 'var(--border)'}`,
          fontSize: '14px',
          marginBottom: error ? '6px' : '12px',
          background: 'white',
          color: 'var(--text)',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          outline: 'none',
          ...extra,
        })
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,44,44,0.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ position: 'relative', background: 'var(--background)', borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(44,44,44,0.2)' }}>
              <button
                onClick={() => setEnrolFormOpenFor(null)}
                style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted-text)' }}
              >
                x
              </button>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                Enrol in {openCourse.name}
              </div>
              <p style={{ fontSize: '13px', color: 'var(--muted-caption)', marginTop: 0, marginBottom: '16px' }}>{openCourse.duration}</p>

              <input
                type="text"
                placeholder="Full name"
                value={enrolName}
                onChange={(e) => setEnrolName(e.target.value)}
                style={fieldStyle(false)}
              />

              <input
                type="tel"
                inputMode="tel"
                placeholder="e.g. 082 123 4567"
                value={enrolPhone}
                onChange={(e) => setEnrolPhone(e.target.value)}
                onBlur={() => setEnrolPhoneTouched(true)}
                style={fieldStyle(enrolPhoneError)}
              />
              {enrolPhoneError && renderFieldError(enrolPhoneError)}

              <input
                type="email"
                inputMode="email"
                placeholder="Your email address"
                value={enrolEmail}
                onChange={(e) => setEnrolEmail(e.target.value)}
                onBlur={() => setEnrolEmailTouched(true)}
                style={fieldStyle(enrolEmailError)}
              />
              {enrolEmailError && renderFieldError(enrolEmailError)}

              <input
                type="date"
                min={tomorrowSAST()}
                value={enrolStartDate}
                onChange={(e) => setEnrolStartDate(e.target.value)}
                style={fieldStyle(enrolDateError)}
              />
              {enrolDateError && renderFieldError(enrolDateError)}

              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: '8px 0 12px' }}>
                How Would You Like To Pay
              </div>

              <PaymentChoiceButtons
                options={[
                  { key: 'deposit_ozow', label: `Pay R${openCourse.deposit} deposit now`, disabled: !paymentOptions.ozow },
                  { key: 'full_ozow', label: `Pay R${openCourse.price} in full now`, disabled: !paymentOptions.ozow },
                  paymentOptions.payflex.enabled && {
                    key: 'full_payflex', label: 'Pay in 4 interest-free instalments', disabled: !enrolPayflexAvailable,
                  },
                ].filter(Boolean)}
                selected={enrolPaymentOption}
                onSelect={setEnrolPaymentOption}
              />

              {paymentOptions.payflex.enabled && !enrolPayflexAvailable && (
                <p style={{ fontSize: '12px', color: 'var(--muted-text)', marginTop: '0', lineHeight: 1.6 }}>
                  Instalments available for amounts between R{paymentOptions.payflex.minimumAmount} and R{paymentOptions.payflex.maximumAmount}.
                </p>
              )}
              {enrolPaymentOption === 'full_payflex' && (
                <PayflexWidget amount={openCourse.price} min={paymentOptions.payflex.minimumAmount} max={paymentOptions.payflex.maximumAmount} />
              )}

              {enrolNoWayToPay && (
                <div style={{ background: 'var(--nav-background)', borderRadius: '12px', padding: '16px 20px', marginTop: '8px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text)', margin: 0, lineHeight: 1.7 }}>
                    Online payments are taking a short break. Please message us on{' '}
                    <a href={whatsAppHref(siteContent.contact.phone)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      WhatsApp at {localPhoneDisplay(siteContent.contact.phone)}
                    </a>{' '}and we'll gladly help you enrol.
                  </p>
                </div>
              )}

              <p style={{ fontSize: '12px', color: 'var(--muted-text)', margin: '12px 0', lineHeight: 1.6 }}>
                Your deposit secures your place. The balance is due before your course starts, and we'll send you a
                link to pay it.{' '}
                <button
                  onClick={() => { setEnrolFormOpenFor(null); openPolicies('training') }}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: '12px', textDecoration: 'underline', fontFamily: 'inherit' }}
                >
                  View our training policy
                </button>
              </p>

              {enrolError && renderFieldError(enrolError)}

              <button
                onClick={submitEnrolment}
                disabled={!canSubmitEnrolment || enrolSubmitting}
                style={{
                  width: '100%',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '24px',
                  padding: '14px 22px',
                  fontSize: '15px',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: (!canSubmitEnrolment || enrolSubmitting) ? 'not-allowed' : 'pointer',
                  opacity: (!canSubmitEnrolment || enrolSubmitting) ? 0.6 : 1,
                  marginTop: '8px',
                }}
              >
                {enrolSubmitting
                  ? (enrolPaymentOption === 'full_payflex' ? 'Taking you to Payflex...' : 'Taking you to Ozow...')
                  : 'Continue'}
              </button>
            </div>
          </div>
        )
      })()}

      {enrolmentResult && (() => {
        const data = enrolmentResult.data
        // 'paid' always means balance is 0 (payment_status only becomes
        // 'paid' once amountPaid >= price) - 'partial' is deposit-paid,
        // balance-owing, which needs its own framing, not "still confirming".
        const status = !data ? 'error'
          : data.paymentStatus === 'paid' ? 'paid'
          : data.paymentStatus === 'partial' ? 'partial'
          : (data.latestStatus === 'cancelled' || data.latestStatus === 'failed') ? data.latestStatus
          : 'pending'

        const btnPrimary = {
          background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '24px',
          padding: '12px 22px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }
        const btnSecondary = {
          background: 'white', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '24px',
          padding: '12px 22px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }
        const heading = { fontFamily: 'var(--font-heading)', fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }
        const body = { fontSize: '14px', color: 'var(--muted-text)', lineHeight: 1.7, marginBottom: '20px' }

        const payBalanceOptions = data ? [
          data.providers?.ozow && { key: 'ozow', icon: OZOW_ICON },
          data.providers?.payflex && { key: 'payflex', label: 'Payflex' },
        ].filter(Boolean) : []

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,44,44,0.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: 'var(--background)', borderRadius: '16px', padding: '32px', maxWidth: '420px', width: '100%', boxShadow: '0 8px 32px rgba(44,44,44,0.2)' }}>
              {enrolmentResultLoading ? (
                <p style={{ fontSize: '14px', color: 'var(--muted-text)', textAlign: 'center', margin: 0 }}>
                  Just a moment while we check on your payment...
                </p>
              ) : status === 'paid' ? (
                <>
                  <div style={heading}>Thank you, you're all paid up!</div>
                  <p style={body}>
                    We've received your full payment for {data.courseName}. We're looking forward to having you on
                    the course!
                  </p>
                  <button onClick={closeEnrolmentResult} style={btnPrimary}>Close</button>
                </>
              ) : status === 'partial' ? (
                <>
                  <div style={heading}>Your balance is waiting for you</div>
                  <p style={body}>
                    We've received R{data.amountPaid.toFixed(2)} for {data.courseName}. The remaining balance of
                    R{data.balance.toFixed(2)} is due before your course starts - you're welcome to pay it now, or
                    wait for the link we'll send you closer to the time.
                  </p>
                  {enrolError && renderFieldError(enrolError)}
                  {payBalanceOptions.length > 0 && (
                    <PaymentChoiceButtons options={payBalanceOptions} selected={null} onSelect={payEnrolmentBalance} />
                  )}
                  <button onClick={closeEnrolmentResult} style={{ ...btnSecondary, marginTop: '8px' }}>Close</button>
                </>
              ) : status === 'pending' ? (
                <>
                  <div style={heading}>We're still confirming your payment</div>
                  <p style={body}>
                    This usually only takes a moment. We'll keep checking for you, so please don't close this page
                    just yet. If you'd rather not wait, you're welcome to close this and we'll update your enrolment
                    as soon as it's confirmed.
                  </p>
                  <button onClick={closeEnrolmentResult} style={btnSecondary}>Close</button>
                </>
              ) : (
                <>
                  <div style={heading}>
                    {status === 'error' ? "We couldn't find that enrolment" : "It looks like your payment didn't go through"}
                  </div>
                  <p style={body}>
                    Not to worry, your enrolment is still here for you. Please don't hesitate to try paying again.
                  </p>
                  {enrolError && renderFieldError(enrolError)}
                  {data ? (
                    <button onClick={retryEnrolmentPayment} style={btnPrimary}>Try paying again</button>
                  ) : (
                    <button onClick={closeEnrolmentResult} style={btnPrimary}>Close</button>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })()}

      <section id="gallery" className="section section-alt gallery-section">
        <h2 className="section-heading">{siteContent.sectionHeadings.gallery}</h2>
        <p className="section-text gallery-subheading">A glimpse of the sets we create</p>
        {backendStatus !== 'ready' ? renderBackendStatus() : (
        <div className="gallery-grid">
          {galleryImages.length > 0 ? (
            galleryImages.map((img) => (
              <div
                key={img.filename}
                style={{ borderRadius: '10px', overflow: 'hidden', marginBottom: '12px', breakInside: 'avoid' }}
              >
                {img.type === 'video' ? (
                  <video
                    src={mediaUrl(img.url)}
                    autoPlay
                    muted
                    loop
                    playsInline
                    style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block', borderRadius: '8px' }}
                  />
                ) : (
                  <img
                    src={mediaUrl(img.url)}
                    alt="Lash work"
                    style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }}
                  />
                )}
              </div>
            ))
          ) : (
            [
              { height: 220, background: 'var(--border-soft)' },
              { height: 280, background: 'var(--placeholder-pink1)' },
              { height: 200, background: 'var(--placeholder-pink2)' },
              { height: 260, background: 'var(--placeholder-pink1)' },
              { height: 240, background: 'var(--border-soft)' },
              { height: 300, background: 'var(--border-soft)' },
              { height: 210, background: 'var(--placeholder-pink2)' },
              { height: 270, background: 'var(--placeholder-pink3)' },
              { height: 230, background: 'var(--placeholder-pink1)' },
            ].map((tile, i) => (
              <div
                key={i}
                style={{
                  height: `${tile.height}px`,
                  background: tile.background,
                  borderRadius: '10px',
                  overflow: 'hidden',
                  marginBottom: '12px',
                  breakInside: 'avoid',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  paddingBottom: '12px',
                }}
              >
                <span style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--muted-label)', letterSpacing: '1px', textTransform: 'uppercase' }}>Lash Work</span>
              </div>
            ))
          )}
        </div>
        )}
      </section>

      <section id="contact" className="section contact-section">
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '38px',
              fontWeight: '700',
              color: 'var(--text)',
              marginBottom: '8px',
            }}>
              {siteContent.sectionHeadings.contact}
            </h2>
            <div style={{ width: '48px', height: '2px', background: 'var(--accent)', margin: '8px auto 0 auto' }} />
          </div>

          <div className="contact-card" style={{ background: 'var(--surface)', borderRadius: '16px', padding: '32px', boxShadow: '0 2px 16px rgba(196,122,138,0.10)', border: '1px solid var(--border)', maxWidth: '560px', margin: '0 auto' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '20px', display: 'block' }}>
              Get in Touch
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-label)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Address</span>
              <span style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.6 }}>{siteContent.contact.addressLine1}<br />{siteContent.contact.addressLine2}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-label)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Phone</span>
              <a href={telHref(siteContent.contact.phone)} style={{ fontSize: '14px', color: 'var(--text)', textDecoration: 'none' }}>{siteContent.contact.phone}</a>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-label)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{siteContent.contact.hoursLabel}</span>
              <span style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.6 }}>{siteContent.contact.hoursLine1}<br />{siteContent.contact.hoursLine2}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-label)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{siteContent.contact.whatsappLabel}</span>
              <a href={whatsAppHref(siteContent.contact.phone)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                {siteContent.contact.whatsappText}
              </a>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-label)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Email</span>
              <a href={`mailto:${siteContent.contact.email}`} style={{ fontSize: '14px', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                {siteContent.contact.email}
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer site-footer">
        <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'center' }}>
          <a
            className="social-icon-link"
            href="https://www.instagram.com/lashes_by_retha/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--muted-label)',
              transition: 'background 0.2s',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
            </svg>
          </a>
          <a
            className="social-icon-link"
            href="https://web.facebook.com/hairbyherza"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--muted-label)',
              transition: 'background 0.2s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
            </svg>
          </a>
          <a
            className="social-icon-link"
            href="https://www.tiktok.com/@lashes_by_retha?_r=1&_t=ZS-99kLLHuvNt2"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TikTok"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--muted-label)',
              transition: 'background 0.2s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
            </svg>
          </a>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="footer-policies-link" onClick={() => openPolicies('booking')}>Policies</button>
          <button className="footer-policies-link" onClick={() => openPolicies('returns')}>Returns</button>
          <button className="footer-policies-link" onClick={() => openPolicies('delivery')}>Delivery</button>
          <button className="footer-policies-link" onClick={() => openPolicies('privacy')}>Privacy</button>
          <button className="footer-policies-link" onClick={() => openPolicies('terms')}>Terms</button>
        </div>
        {siteContent.footer.text && (
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: '480px' }}>
            {siteContent.footer.text}
          </p>
        )}
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
          Hair By Her (Pty) Ltd &middot; Reg. No. 2022/273934/07
        </p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>&copy; {new Date().getFullYear()} Hair By Her. All rights reserved.</p>
        </div>
      </footer>
      </>
      )}

      {showPolicies && (
        <div style={{ minHeight: '100vh', background: 'var(--background)', fontFamily: 'var(--font-body)' }}>
          <div
            className="policies-nav"
            style={{
              background: 'var(--nav-background)',
              borderBottom: '1px solid var(--border)',
              padding: '0 40px',
              height: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              Hair By Her
            </span>
            <button
              onClick={() => setShowPolicies(false)}
              style={{
                background: 'none',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                borderRadius: '20px',
                padding: '6px 18px',
                fontSize: '13px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Back to site
            </button>
          </div>

          <div className="policies-content" style={{ maxWidth: '720px', margin: '0 auto', padding: '60px 24px' }}>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '42px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '8px',
              }}
            >
              Our Policies
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--muted-text)', lineHeight: 1.6, marginBottom: '8px' }}>
              We want every visit to be a wonderful experience for you. These policies help us make sure things run smoothly for everyone — we truly appreciate your understanding and cooperation.
            </p>
            <div style={{ width: '48px', height: '2px', background: 'var(--accent)', margin: '16px 0 48px 0' }} />

            <div
              className="policies-tabs"
              style={{
                display: 'flex',
                gap: 0,
                marginBottom: '32px',
                borderRadius: '24px',
                border: '1px solid var(--border)',
                overflow: 'hidden',
                width: 'fit-content',
              }}
            >
              {[
                ['booking', 'Booking'],
                ['returns', 'Returns'],
                ['delivery', 'Delivery'],
                ['training', 'Lash Training'],
                ['privacy', 'Privacy'],
                ['terms', 'Terms'],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setPolicyTab(tab)}
                  style={{
                    padding: '10px 24px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    fontFamily: 'inherit',
                    transition: 'background 0.2s',
                    background: policyTab === tab ? 'var(--accent)' : 'var(--surface)',
                    color: policyTab === tab ? 'var(--surface)' : 'var(--muted-text)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {renderPolicySections(POLICIES[policyTab])}

            <div
              style={{
                marginTop: '48px',
                paddingTop: '32px',
                borderTop: '1px solid var(--border)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '22px',
                  fontWeight: 600,
                  color: 'var(--text)',
                  marginBottom: '8px',
                }}
              >
                Download Our Policies
              </div>
              <p style={{ fontSize: '13px', color: 'var(--muted-text)', marginBottom: '20px' }}>
                Prefer to save a copy? Download our policies summary below.
              </p>
              <a
                href="/Hair-By-Her-Policies.pdf"
                download="Hair-By-Her-Policies.pdf"
                style={{
                  display: 'inline-block',
                  background: 'var(--accent)',
                  color: 'var(--surface)',
                  borderRadius: '24px',
                  padding: '12px 28px',
                  fontSize: '14px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  letterSpacing: '0.3px',
                }}
              >
                Download PDF
              </a>
            </div>
          </div>
        </div>
      )}

      {!showPolicies && cartCount > 0 && (
        <div
          style={{ position: 'fixed', bottom: '32px', right: '24px', zIndex: 500, cursor: 'pointer' }}
          onClick={() => setCartOpen(true)}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(196, 122, 138, 0.4)',
              position: 'relative',
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <div
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: 'var(--text)',
                color: 'white',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {cartCount}
            </div>
          </div>
        </div>
      )}

      {!showPolicies && (
        <>
          {cartOpen && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(44,44,44,0.4)',
                zIndex: 600,
              }}
              onClick={() => {
                setCartOpen(false)
                setCheckoutStep(false)
                setOrderError('')
              }}
            />
          )}

          <div
            className={`cart-drawer${cartOpen ? ' open' : ''}`}
            style={{
              position: 'fixed',
              top: 0,
              right: cartOpen ? '0' : '-420px',
              width: '400px',
              maxWidth: '100vw',
              height: '100%',
              background: 'var(--background)',
              zIndex: 700,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-4px 0 24px rgba(44,44,44,0.12)',
              transition: 'right 0.3s ease',
            }}
          >
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>
                Your Cart
              </div>
              <button
                onClick={() => {
                  setCartOpen(false)
                  setCheckoutStep(false)
                  setOrderError('')
                }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted-text)' }}
              >
                x
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {!checkoutStep ? (
                cart.length === 0 ? (
                  <p style={{ fontSize: '14px', color: 'var(--muted-text)', textAlign: 'center', marginTop: '40px' }}>
                    Your cart is empty.
                  </p>
                ) : (
                  <>
                    {cart.map((item) => (
                      <div
                        key={item.cartKey}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingBottom: '16px',
                          marginBottom: '16px',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--muted-caption)' }}>R {item.price}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <button
                            onClick={() => updateQty(item.cartKey, -1)}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              border: '1px solid var(--border)',
                              background: 'white',
                              cursor: 'pointer',
                              fontSize: '16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text)',
                            }}
                          >
                            -
                          </button>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', minWidth: '16px', textAlign: 'center' }}>
                            {item.qty}
                          </span>
                          <button
                            onClick={() => addToCart(item)}
                            disabled={item.qty >= item.stockQuantity}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              border: '1px solid var(--border)',
                              background: 'white',
                              cursor: item.qty >= item.stockQuantity ? 'not-allowed' : 'pointer',
                              opacity: item.qty >= item.stockQuantity ? 0.4 : 1,
                              fontSize: '16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text)',
                            }}
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeFromCart(item.cartKey)}
                            style={{ background: 'none', border: 'none', color: 'var(--icon-muted)', fontSize: '14px', cursor: 'pointer', marginLeft: '4px' }}
                          >
                            x
                          </button>
                        </div>
                      </div>
                    ))}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: '8px',
                        paddingTop: '16px',
                        borderTop: '2px solid var(--border)',
                      }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Subtotal</span>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent)' }}>R {cartTotal}</span>
                    </div>

                    <button
                      onClick={() => setCheckoutStep(true)}
                      style={{
                        width: '100%',
                        background: 'var(--accent)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '24px',
                        padding: '14px',
                        fontSize: '15px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        marginTop: '20px',
                      }}
                    >
                      Proceed to Checkout
                    </button>
                  </>
                )
              ) : (
                <>
                  <button
                    onClick={() => setCheckoutStep(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      padding: 0,
                      marginBottom: '20px',
                      textDecoration: 'underline',
                      fontFamily: 'inherit',
                    }}
                  >
                    Back to cart
                  </button>

                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>
                    Your Details
                  </div>

                  <input
                    type="text"
                    placeholder="Your name"
                    value={orderName}
                    onChange={(e) => setOrderName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      fontSize: '14px',
                      marginBottom: '12px',
                      background: 'white',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />

                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="e.g. 082 123 4567"
                    value={orderPhone}
                    onChange={(e) => setOrderPhone(e.target.value)}
                    onBlur={() => setPhoneTouched(true)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: `1px solid ${phoneError ? 'var(--accent)' : 'var(--border)'}`,
                      fontSize: '14px',
                      marginBottom: phoneError ? '6px' : '12px',
                      background: 'white',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />

                  {phoneError && (
                    <p style={{ fontSize: '12px', color: 'var(--accent)', margin: '0 0 12px 0', lineHeight: 1.6 }}>
                      {phoneError}
                    </p>
                  )}

                  <input
                    type="email"
                    inputMode="email"
                    placeholder={emailRequired ? 'Your email address' : 'Your email address (optional)'}
                    value={orderEmail}
                    onChange={(e) => setOrderEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: `1px solid ${emailError ? 'var(--accent)' : 'var(--border)'}`,
                      fontSize: '14px',
                      marginBottom: emailError ? '6px' : '12px',
                      background: 'white',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />

                  {emailError && (
                    <p style={{ fontSize: '12px', color: 'var(--accent)', margin: '0 0 12px 0', lineHeight: 1.6 }}>
                      {emailError}
                    </p>
                  )}

                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>
                    Delivery or Pickup
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    {['delivery', 'pickup'].map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setFulfilmentMethod(method)}
                        style={{
                          flex: 1,
                          padding: '12px',
                          borderRadius: '10px',
                          fontSize: '14px',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                          border: `1px solid ${fulfilmentMethod === method ? 'var(--accent)' : 'var(--border)'}`,
                          background: fulfilmentMethod === method ? 'var(--accent)' : 'white',
                          color: fulfilmentMethod === method ? 'white' : 'var(--text)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {method}
                      </button>
                    ))}
                  </div>

                  {fulfilmentMethod === 'delivery' && (
                    <div style={{ marginBottom: '16px' }}>
                      <input
                        type="text"
                        placeholder="Street address"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        style={{
                          width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)',
                          fontSize: '14px', marginBottom: '10px', background: 'white', color: 'var(--text)',
                          fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Suburb"
                        value={deliverySuburb}
                        onChange={(e) => setDeliverySuburb(e.target.value)}
                        style={{
                          width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)',
                          fontSize: '14px', marginBottom: '10px', background: 'white', color: 'var(--text)',
                          fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <input
                          type="text"
                          placeholder="Town or city"
                          value={deliveryCity}
                          onChange={(e) => setDeliveryCity(e.target.value)}
                          style={{
                            flex: 1, padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)',
                            fontSize: '14px', background: 'white', color: 'var(--text)',
                            fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Postal code"
                          value={deliveryPostalCode}
                          onChange={(e) => setDeliveryPostalCode(e.target.value)}
                          style={{
                            width: '120px', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)',
                            fontSize: '14px', background: 'white', color: 'var(--text)',
                            fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
                          }}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Delivery notes (optional)"
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        style={{
                          width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)',
                          fontSize: '14px', background: 'white', color: 'var(--text)',
                          fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
                        }}
                      />
                    </div>
                  )}

                  {fulfilmentMethod === 'pickup' && (
                    <div
                      style={{
                        background: 'var(--nav-background)',
                        borderRadius: '12px',
                        padding: '14px 18px',
                        marginBottom: '16px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.7 }}>
                        Pickup from {PICKUP_ADDRESS}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.7 }}>
                        {PICKUP_HOURS}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted-text)', marginTop: '6px', lineHeight: 1.6 }}>
                        We'll let you know on WhatsApp when your order is ready to collect.
                      </div>
                    </div>
                  )}

                  {(paymentOptions.ozow || paymentOptions.payflex.enabled) && (
                    <div style={{ marginTop: '8px', marginBottom: '16px' }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>
                        How Would You Like To Pay
                      </div>

                      <PaymentChoiceButtons
                        options={[
                          paymentOptions.ozow && { key: 'ozow', icon: OZOW_ICON },
                          paymentOptions.payflex.enabled && { key: 'payflex', label: 'Payflex', disabled: !payflexAvailableForAmount },
                        ].filter(Boolean)}
                        selected={paymentMethod}
                        onSelect={setPaymentMethod}
                      />

                      {paymentOptions.ozow && (
                        <p style={{ fontSize: '12px', color: 'var(--muted-text)', marginTop: '0', marginBottom: '6px', lineHeight: 1.6 }}>
                          Pay securely from your own banking app.
                        </p>
                      )}

                      {paymentOptions.payflex.enabled && (
                        <>
                          <p style={{ fontSize: '12px', color: 'var(--muted-text)', marginTop: '0', lineHeight: 1.6 }}>
                            {payflexAvailableForAmount
                              ? 'Pay in 4 interest-free instalments.'
                              : `Available for orders between R${paymentOptions.payflex.minimumAmount} and R${paymentOptions.payflex.maximumAmount}.`}
                          </p>
                          {paymentMethod === 'payflex' && (
                            <PayflexWidget
                              amount={orderTotal}
                              min={paymentOptions.payflex.minimumAmount}
                              max={paymentOptions.payflex.maximumAmount}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {noWayToPay && (
                    <div
                      style={{
                        background: 'var(--nav-background)',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        marginTop: '8px',
                        marginBottom: '20px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.7, margin: 0 }}>
                        Online payments are taking a short break. Please message us on{' '}
                        <a href={whatsAppHref(siteContent.contact.phone)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                          WhatsApp at {localPhoneDisplay(siteContent.contact.phone)}
                        </a>
                        {' '}and we'll gladly help you place your order.
                      </p>
                    </div>
                  )}

                  {paymentMethod === 'ozow' && (
                    <div
                      style={{
                        background: 'var(--nav-background)',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        marginTop: '8px',
                        marginBottom: '20px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.7, margin: 0 }}>
                        You'll be taken to Ozow to complete your payment securely from your own banking app. Please
                        don't close this page until you're redirected back to us.
                      </p>
                    </div>
                  )}

                  {paymentMethod === 'payflex' && (
                    <div
                      style={{
                        background: 'var(--nav-background)',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        marginTop: '8px',
                        marginBottom: '20px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.7, margin: 0 }}>
                        You'll be taken to Payflex to set up your instalments. Please don't close this page until
                        you're redirected back to us.
                      </p>
                    </div>
                  )}

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--muted-text)', marginBottom: '4px' }}>
                      <span>Subtotal</span>
                      <span>R {cartTotal}</span>
                    </div>
                    {fulfilmentMethod === 'delivery' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--muted-text)', marginBottom: '4px' }}>
                        <span>Delivery fee</span>
                        <span>R {DELIVERY_FEE}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                      <span>Total</span>
                      <span>R {orderTotal}</span>
                    </div>
                  </div>

                  {orderError && (
                    <div style={{
                      background: 'var(--nav-background)',
                      border: '1px solid var(--error-border)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      marginBottom: '16px',
                      fontSize: '13px',
                      color: 'var(--accent-strong)',
                      lineHeight: 1.6,
                    }}>
                      {orderError}
                    </div>
                  )}

                  {!noWayToPay && (
                    <button
                      onClick={placeOrder}
                      disabled={!canPlaceOrder || paymentSubmitting}
                      style={{
                        width: '100%',
                        background: 'var(--accent)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '24px',
                        padding: '14px',
                        fontSize: '15px',
                        fontWeight: 700,
                        cursor: (!canPlaceOrder || paymentSubmitting) ? 'not-allowed' : 'pointer',
                        opacity: (!canPlaceOrder || paymentSubmitting) ? 0.5 : 1,
                      }}
                    >
                      {paymentSubmitting
                        ? (paymentMethod === 'payflex' ? 'Taking you to Payflex...' : 'Taking you to Ozow...')
                        : 'Place Order'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {paymentResult && (() => {
        const order = paymentResult.order
        const status = !order ? 'error'
          : order.paymentStatus === 'paid' ? 'paid'
          : (order.paymentStatus === 'cancelled' || order.paymentStatus === 'failed') ? order.paymentStatus
          : order.paymentMethod === 'eft' ? 'eft'
          : 'pending'

        const otherProvider = order?.paymentMethod === 'ozow' ? 'payflex' : 'ozow'
        const otherProviderAvailable = !order ? false
          : otherProvider === 'ozow'
            ? paymentOptions.ozow
            : paymentOptions.payflex.enabled &&
              (paymentOptions.payflex.minimumAmount == null || order.total >= paymentOptions.payflex.minimumAmount) &&
              (paymentOptions.payflex.maximumAmount == null || order.total <= paymentOptions.payflex.maximumAmount)

        const btnPrimary = {
          background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '24px',
          padding: '12px 22px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }
        const btnSecondary = {
          background: 'white', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '24px',
          padding: '12px 22px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }
        const heading = { fontFamily: 'var(--font-heading)', fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }
        const body = { fontSize: '14px', color: 'var(--muted-text)', lineHeight: 1.7, marginBottom: '20px' }

        return (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(44,44,44,0.5)',
              zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
            }}
          >
            <div style={{ background: 'var(--background)', borderRadius: '16px', padding: '32px', maxWidth: '420px', width: '100%', boxShadow: '0 8px 32px rgba(44,44,44,0.2)' }}>
              {paymentResultLoading ? (
                <p style={{ fontSize: '14px', color: 'var(--muted-text)', textAlign: 'center', margin: 0 }}>
                  Just a moment while we check on your payment...
                </p>
              ) : status === 'paid' ? (
                <>
                  <div style={heading}>Thank you, your payment went through!</div>
                  <p style={body}>
                    Your order number is #{order.id}. Retha will be in touch about your delivery or pickup shortly.
                    We appreciate your support!
                  </p>
                  <button onClick={closePaymentResult} style={btnPrimary}>Continue Shopping</button>
                </>
              ) : status === 'eft' ? (
                <>
                  <div style={heading}>No problem, let's pay by EFT</div>
                  <p style={body}>
                    Your order is still here and waiting for you. Please use HBH-{order?.id} as your payment
                    reference.
                  </p>
                  <div style={{ background: 'var(--nav-background)', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.8 }}>Bank: FNB</div>
                    <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.8 }}>Account name: Hair By Her</div>
                    <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.8 }}>Account number: 63093932440</div>
                    <p style={{ fontSize: '12px', color: 'var(--muted-text)', marginTop: '8px', marginBottom: 0, lineHeight: 1.6 }}>
                      Please send your proof of payment via WhatsApp to 082 685 5399 after making payment.
                    </p>
                  </div>
                  <button onClick={closePaymentResult} style={btnPrimary}>Continue Shopping</button>
                </>
              ) : status === 'pending' ? (
                <>
                  <div style={heading}>Your bank is still confirming the payment</div>
                  <p style={body}>
                    This usually only takes a moment. We'll keep checking for you, so please don't close this page
                    just yet. If you'd rather not wait, you're welcome to close this and we'll update your order as
                    soon as your bank confirms it.
                  </p>
                  <button onClick={closePaymentResult} style={btnSecondary}>Close</button>
                </>
              ) : (
                <>
                  <div style={heading}>
                    {status === 'error' ? "We couldn't find that payment" : "It looks like your payment didn't go through"}
                  </div>
                  <p style={body}>
                    Not to worry, your order is still here for you. Please don't hesitate to try paying again.
                  </p>
                  {order ? (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button onClick={retryPayment} style={btnPrimary}>Try paying again</button>
                      {otherProviderAvailable && (
                        <button onClick={() => switchProvider(otherProvider)} style={btnSecondary}>
                          Try another way to pay
                        </button>
                      )}
                    </div>
                  ) : (
                    <button onClick={closePaymentResult} style={btnPrimary}>Close</button>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default App
