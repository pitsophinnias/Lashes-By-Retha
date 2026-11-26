import React, { useState, useEffect, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { ConfirmProvider, useConfirmDialog } from './ConfirmDialog.jsx'
import { ToastProvider, useToast } from './Toast.jsx'
import { PAGE_TITLES, PATH_TO_PAGE, pageForPath, pathForPage } from './router.js'
import MessageCustomerPanel from './MessageCustomerPanel.jsx'
import StudentDatesDialog from './StudentDatesDialog.jsx'
import RecordPaymentDialog from './RecordPaymentDialog.jsx'
import PreorderProductDialog from './PreorderProductDialog.jsx'
import { whatsappLink } from './messaging/channels.js'
import {
  buildOrderTemplateData, buildPreorderTemplateData, buildStudentTemplateData,
  defaultTemplateIdForOrder, defaultTemplateIdForPreorder, defaultTemplateIdForStudent,
  SAMPLE_DATA,
} from './messaging/buildData.js'
import { renderTemplate, findUnknownPlaceholders, PLACEHOLDERS_BY_GROUP } from './messaging/render.js'

const IconSearch = (props) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const CLASSES = [
  {
    id: 1,
    name: 'Classic Individual Lash Training',
    duration: '1-day course',
    price: 2500,
    description: 'Unlock the art of effortless elegance with our Classic Lash training. A comprehensive 1-day course designed to give you everything you need to start your lash journey.',
    learns: ['Classic lash training', 'Lash theory and anatomy', 'Lash isolation and placement', 'Lash design and mapping', 'Lash prepping and removal', 'Sanitation and safety protocols'],
    includes: ['Lunch and refreshments', 'Training manual', 'Certificate of attendance', 'Lash kit', 'Lash removal kit', 'Ongoing support'],
  },
  {
    id: 2,
    name: 'Classic Individual Lash Training',
    duration: '2-day course',
    price: 4000,
    description: 'Our comprehensive 2-day Classic Lash course gives you more time to practise and perfect your technique before you start working with clients.',
    learns: ['Classic lash training', 'Lash theory and anatomy', 'Lash isolation and placement', 'Lash design and mapping', 'Lash prepping and removal', 'Sanitation and safety protocols'],
    includes: ['Lunch and refreshments', 'Training manual', 'Certificate of attendance', 'Lash kit', 'Lash removal kit', 'Ongoing support'],
  },
  {
    id: 3,
    name: 'Advanced Individual Lash Training',
    duration: '4-day intensive course',
    price: 6000,
    description: 'Take your lash skills to the next level with our intensive 4-day Advanced course. Covering classic, hybrid and volume techniques, this course is designed to make you a well-rounded lash professional.',
    learns: ['Classic, hybrid and volume lash', 'Fan making', 'Lash theory and anatomy', 'Lash isolation and placement', 'Lash design and mapping', 'Lash prepping and removal', 'Sanitation and safety protocols'],
    includes: ['Lunch and refreshments', 'Training manual', 'Certificate of attendance', 'Lash kit', 'Lash removal kit', 'Ongoing support'],
  },
]

const API = import.meta.env.VITE_API_URL || 'http://localhost:3002'

// Uploaded files are served from the API host as relative URLs
// (/uploads/...) and need it added in front; an already-absolute URL is
// passed through unchanged.
const mediaUrl = (url) => (url && /^https?:\/\//.test(url) ? url : `${API}${url}`)

// Mirrors backend/src/siteSettings/defaults.js exactly, so the Website
// Content form and its preview render straight away, before the API loads.
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

// The site's current colours/fonts, for the Website Content preview panel -
// theme editing itself is a separate branch, this just needs to render the
// preview correctly today.
const SITE_THEME = {
  background: '#FFFAF8',
  accent: '#C47A8A',
  navBackground: '#FDF0F3',
  text: '#2C2C2C',
  mutedText: '#7A6670',
  headingFont: 'Cormorant Garamond',
  bodyFont: 'Lato',
}

function AppInner({ user, onLogout, onSessionExpired, onUnsavedChanges }) {
  const confirmDialog = useConfirmDialog()
  const toast = useToast()
  const [activePage, setActivePage] = useState(() => pageForPath(window.location.pathname, user?.role))
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // ── Messaging (WhatsApp/email templates) ─────────────────────────────────
  const [messageTemplates, setMessageTemplates] = useState([])
  const [businessDetails, setBusinessDetails] = useState(null)
  // { entityType: 'order'|'preorder'|'student', entity, course? } or null
  const [messagePanelTarget, setMessagePanelTarget] = useState(null)
  const [expandedTemplateId, setExpandedTemplateId] = useState(null)
  const [templateDrafts, setTemplateDrafts] = useState({}) // { [id]: { body, emailSubject } }
  const [templateStatus, setTemplateStatus] = useState(null) // { id, type, message }
  const [templateSaving, setTemplateSaving] = useState(false)
  const [lastFocusedTemplateField, setLastFocusedTemplateField] = useState('body') // 'body' | 'subject'
  const templateBodyFieldRef = useRef(null)
  const templateSubjectFieldRef = useRef(null)
  const [businessDetailsDraft, setBusinessDetailsDraft] = useState(null)
  const [businessDetailsStatus, setBusinessDetailsStatus] = useState(null)
  const [businessDetailsSaving, setBusinessDetailsSaving] = useState(false)
  const [reminders, setReminders] = useState([])
  const [missingCourseDates, setMissingCourseDates] = useState([])
  const [remindersLoading, setRemindersLoading] = useState(false)
  // The student currently being asked for confirmed start/end dates -
  // either from a Current Students row or from the Dashboard's "Missing
  // course dates" list, which only has a {studentId, classId, studentName}
  // stub to go on.
  const [datesDialogFor, setDatesDialogFor] = useState(null)
  // The student currently being asked for a manual payment amount.
  const [recordPaymentFor, setRecordPaymentFor] = useState(null)
  // Which student's "Payment history" list is expanded, and its rows
  // once fetched (keyed by student id) - fetched on demand rather than
  // alongside the student list itself, since most students' history is
  // never opened.
  const [paymentHistoryOpenFor, setPaymentHistoryOpenFor] = useState(null)
  const [paymentHistories, setPaymentHistories] = useState({})
  const [remindersBusyId, setRemindersBusyId] = useState(null)
  const [imageTab, setImageTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'products')
  const [productImages, setProductImages] = useState({})
  const [classImages, setClassImages] = useState({})
  const [galleryImages, setGalleryImages] = useState([])
  const [uploadStatus, setUploadStatus] = useState({})
  const [productPositions, setProductPositions] = useState({})
  const [classPositions, setClassPositions] = useState({})
  const [categories, setCategories] = useState([])
  const [productCategories, setProductCategories] = useState({})
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryStatus, setCategoryStatus] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [revenueData, setRevenueData] = useState([])
  const [recentOrders, setRecentOrders] = useState([])
  const [archivedNotifications, setArchivedNotifications] = useState([])
  const [notifTab, setNotifTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'all')
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersView, setOrdersView] = useState(() => new URLSearchParams(window.location.search).get('view') || 'active')
  const [orderCounts, setOrderCounts] = useState({ active: 0, archived: 0 })

  // ── Pre-orders ────────────────────────────────────────────────────────────
  const [preorderGroups, setPreorderGroups] = useState([]) // [{ productId, productName, preorders, statusCounts }]
  const [preorderRefundableCount, setPreorderRefundableCount] = useState(0)
  const [preorderLoading, setPreorderLoading] = useState(false)
  const [preorderActionStatus, setPreorderActionStatus] = useState(null) // { id, message } | null
  const [preorderLeadTime, setPreorderLeadTime] = useState({ minDays: 14, maxDays: 21 })
  const [preorderLeadTimeDraft, setPreorderLeadTimeDraft] = useState({ minDays: 14, maxDays: 21 })
  const [preorderSettingsStatus, setPreorderSettingsStatus] = useState(null)
  const [courierTrackingDraft, setCourierTrackingDraft] = useState({}) // preorderId -> text
  const [showTestDataEnabled, setShowTestDataEnabled] = useState(false)
  // "Customer pre-orders" (existing view) vs "Pre-order products" (which
  // products currently accept pre-orders) - kept in the URL like Orders'
  // active/archived view.
  const [preordersTab, setPreordersTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'customers')
  // null, 'add', or the product being edited - the same dialog handles
  // both (see PreorderProductDialog below).
  const [preorderProductDialogFor, setPreorderProductDialogFor] = useState(null)
  const [preorderProductSearch, setPreorderProductSearch] = useState('')
  // Checked rows on the "Pre-order products" list, for "Remove selected".
  const [preorderProductSelection, setPreorderProductSelection] = useState(new Set())

  // ── Business calendar ────────────────────────────────────────────────────
  // Months from the real current month that the dashboard calendar is
  // showing - 0 is this month, 1 is next month, -1 is last month.
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0)
  // Keyed by "YYYY-MM"; a value of 'loading' marks a fetch in flight so the
  // effect below never starts the same request twice.
  const [calendarCache, setCalendarCache] = useState({})
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null)

  const [bPwCurrent, setBPwCurrent] = useState('')
  const [bPwNew, setBPwNew] = useState('')
  const [bPwConfirm, setBPwConfirm] = useState('')
  const [bPwMsg, setBPwMsg] = useState('')
  const [newStaffUser, setNewStaffUser] = useState({ username: '', password: '' })
  const [staffCreateMsg, setStaffCreateMsg] = useState('')

  const [products, setProducts] = useState([])
  const [editingProduct, setEditingProduct] = useState(null)
  // editingProduct shape: { id, name, description, detail, price, badge, lowStockThreshold } or null
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [newProduct, setNewProduct] = useState({ name: '', description: '', detail: '', price: '', badge: '', stockQuantity: '', lowStockThreshold: '', categoryId: '' })
  // Products page/Image Management "grouped by section" state - search and
  // which sections are expanded both live in the URL (?q=, ?open=) so a
  // refresh keeps them. null (not yet initialised) means "work out the
  // default once products have loaded" - see the effect near fetchProducts.
  const [productsSearch, setProductsSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '')
  const [productsOpenSections, setProductsOpenSections] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.has('open') ? new Set(params.get('open').split(',').filter(Boolean)) : null
  })
  const [productsSectionChip, setProductsSectionChip] = useState('All')
  const [highlightedProductId, setHighlightedProductId] = useState(null)
  // Products whose full option-chip list is expanded past the >8 summary
  // ("Show options") - per product id, not persisted anywhere.
  const [expandedOptionsProductIds, setExpandedOptionsProductIds] = useState(new Set())
  const toggleOptionsExpanded = (productId) => setExpandedOptionsProductIds(prev => {
    const next = new Set(prev)
    next.has(productId) ? next.delete(productId) : next.add(productId)
    return next
  })
  const NO_SECTION_SLUG = 'no-section'
  const slugify = (s) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'section'
  const [productFormStatus, setProductFormStatus] = useState(null)
  const [stockAdjustTarget, setStockAdjustTarget] = useState(null)
  const [stockAdjustAmount, setStockAdjustAmount] = useState('')
  const [stockAdjustReason, setStockAdjustReason] = useState('restock')
  const [stockAdjustNote, setStockAdjustNote] = useState('')

  // ── Custom product options (e.g. foundation shades) ─────────────────────
  const [optionsManagerProductId, setOptionsManagerProductId] = useState(null)
  const [optionLabelDraft, setOptionLabelDraft] = useState('')
  const [optionsManagerSearch, setOptionsManagerSearch] = useState('')
  const [newOptionDraft, setNewOptionDraft] = useState({ name: '', swatchHex: '', stockQuantity: '' })
  const [bulkOptionsOpen, setBulkOptionsOpen] = useState(false)
  const [bulkOptionsText, setBulkOptionsText] = useState('')
  const [bulkOptionsStartStock, setBulkOptionsStartStock] = useState('')
  const [optionsManagerStatus, setOptionsManagerStatus] = useState(null)

  // ── Sale pricing ──────────────────────────────────────────────────────────
  const [saleManagerProductId, setSaleManagerProductId] = useState(null)
  // { onSale, salePrice } for the product itself (no options), plus
  // { [optionId]: { onSale, salePrice } } for each of its options.
  const [saleDraft, setSaleDraft] = useState({ onSale: false, salePrice: '', options: {} })
  const [saleManagerStatus, setSaleManagerStatus] = useState(null)

  const [orderConfirmError, setOrderConfirmError] = useState('')
  // Order id currently showing the inline "confirm anyway?" prompt for an
  // Ozow order whose payment hasn't come through yet.
  const [confirmPromptOrderId, setConfirmPromptOrderId] = useState(null)

  const [selectedClass, setSelectedClass] = useState(null)
  const [classStudents, setClassStudents] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [newStudent, setNewStudent] = useState({ name: '', whatsapp: '', paymentStatus: 'unpaid', notes: '' })
  const [studentSaving, setStudentSaving] = useState(false)
  const [studentFormError, setStudentFormError] = useState('')
  const [showAwaitingPayment, setShowAwaitingPayment] = useState(false)
  const [linkCopyStatus, setLinkCopyStatus] = useState({})
  // Live name/price/deposit by course id, merged over CLASSES below -
  // descriptions and curriculum text stay hard-coded here for now.
  const [courseData, setCourseData] = useState({})
  const coursesMerged = CLASSES.map(c => ({ ...c, ...(courseData[c.id] || {}) }))

  // ── Website Content ──────────────────────────────────────────────────────
  const [contentSaved, setContentSaved] = useState(DEFAULT_CONTENT) // last known-saved value, for the dirty check
  const [contentDraft, setContentDraft] = useState(DEFAULT_CONTENT) // what the form is currently showing
  const [contentSpecLimits, setContentSpecLimits] = useState(null)
  const [contentLoading, setContentLoading] = useState(true)
  const [contentSaving, setContentSaving] = useState(false)
  const [contentFieldErrors, setContentFieldErrors] = useState({})
  const [contentSaveNote, setContentSaveNote] = useState('')
  const [contentHistory, setContentHistory] = useState([])
  const [contentHistoryLoading, setContentHistoryLoading] = useState(false)
  // { type: 'restore', historyId } | { type: 'reset' } | { type: 'leave', target } | null
  const [contentConfirm, setContentConfirm] = useState(null)
  const contentDirty = JSON.stringify(contentDraft) !== JSON.stringify(contentSaved)

  // Lets the idle-timeout warning dialog (mounted at the app root, outside
  // this component) know to add "You have unsaved changes." - the only
  // draft-form state in this app that survives a page switch unsaved.
  useEffect(() => {
    onUnsavedChanges?.(contentDirty)
  }, [contentDirty, onUnsavedChanges])

  // The amount of an order that is the business's own revenue - excludes
  // the delivery fee, which is passed straight through to the courier.
  // Falls back to the full total for orders placed before delivery/pickup
  // existed, since those never had a fee to begin with.
  const orderRevenue = (order) => order.subtotal != null ? order.subtotal : (parseFloat(order.total) || 0)

  // Reuses the site's existing badge colour families (green/orange/pink from
  // payment-badge, grey from the order-item qty chip) - no new colours.
  const paymentBadge = (order) => {
    if (order.paymentMethod !== 'ozow' && order.paymentMethod !== 'payflex') {
      return { label: 'EFT', background: '#F0F0F0', color: '#888888' }
    }
    const providerLabel = order.paymentMethod === 'ozow' ? 'Ozow' : 'Payflex'
    if (order.paymentStatus === 'paid') return { label: `Paid (${providerLabel})`, background: '#E8F5E9', color: '#2E7D32' }
    if (order.paymentStatus === 'cancelled') return { label: `${providerLabel} cancelled`, background: '#FDE8EC', color: '#C47A8A' }
    if (order.paymentStatus === 'failed') return { label: `${providerLabel} failed`, background: '#FDE8EC', color: '#C47A8A' }
    return { label: `${providerLabel} pending`, background: '#FFF3E0', color: '#E65100' }
  }

  const onlinePaymentNotPaid = (order) =>
    (order.paymentMethod === 'ozow' || order.paymentMethod === 'payflex') && order.paymentStatus !== 'paid'

  // Attaches the auth token to every request and signs out on a 401.
  // Never sets Content-Type for FormData bodies (file uploads) - the browser
  // must set its own multipart boundary. Pass { background: true } for a
  // request that isn't genuine user activity (none exist yet in this file,
  // but SessionManager's own global fetch interceptor is the real
  // backstop regardless - see SessionManager.jsx).
  const apiFetch = async (path, options = {}) => {
    const token = localStorage.getItem('hbh_token')
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.background ? { 'X-Background': '1' } : {}),
      ...(options.headers || {}),
    }
    const res = await fetch(`${API}${path}`, { ...options, headers })
    if (res.status === 401) {
      try {
        const data = await res.clone().json()
        onSessionExpired?.(data?.code === 'SESSION_EXPIRED' ? data.reason : null)
      } catch {
        onSessionExpired?.(null)
      }
    }
    return res
  }

  const fetchOrders = async (view = ordersView) => {
    setOrdersLoading(true)
    try {
      const res = await apiFetch(`/api/orders?view=${view}`)
      const data = await res.json()
      if (res.ok && Array.isArray(data)) setOrders(data) // GET /api/orders already returns newest first
      else setOrders([])
    } catch {
      // silent fail
    } finally {
      setOrdersLoading(false)
    }
  }

  const switchOrdersView = (view) => {
    setOrdersView(view)
    fetchOrders(view)
  }

  const fetchPreorders = async () => {
    setPreorderLoading(true)
    try {
      const res = await apiFetch('/api/admin/preorders')
      const data = await res.json()
      if (res.ok && data) {
        setPreorderGroups(Array.isArray(data.products) ? data.products : [])
        setPreorderRefundableCount(data.refundableCount || 0)
      }
    } catch {
      // silent fail
    } finally {
      setPreorderLoading(false)
    }
  }

  const fetchPreorderLeadTime = async () => {
    try {
      const res = await fetch(`${API}/api/preorder-settings`)
      const data = await res.json()
      if (res.ok && data) {
        setPreorderLeadTime(data)
        setPreorderLeadTimeDraft(data)
      }
    } catch {
      // silent fail
    }
  }

  // ── Pre-order products (which products currently accept pre-orders) ───────
  // The cheapest a product can currently be bought for, across its own
  // ACTIVE options - recomputed here rather than trusted from the
  // product's own top-level price/effectivePrice fields, since those are
  // meant for display and (on the admin list) aren't guaranteed to only
  // ever reflect active options.
  const lowestActivePriceFor = (product) => {
    if (product.optionsHaveOwnPrices) {
      const opts = (product.hasOptions ? product.options : product.customOptions) || []
      const activePrices = opts.filter(o => o.isActive).map(o => o.price)
      if (activePrices.length > 0) return Math.min(...activePrices)
    }
    return product.price
  }

  // Count of this product's customer pre-orders that haven't been
  // cancelled or refunded - shown on the "Pre-order products" row, and in
  // the Remove confirmation.
  const activePreorderCountFor = (productId) => {
    const group = preorderGroups.find(g => g.productId === productId)
    if (!group) return 0
    return group.preorders.filter(p => !['cancelled', 'refunded'].includes(p.status)).length
  }

  const highestActivePriceFor = (product, lowest) => product.optionsHaveOwnPrices
    ? Math.max(...((product.hasOptions ? product.options : product.customOptions) || []).filter(o => o.isActive).map(o => o.price), lowest)
    : lowest

  const productsOnPreorder = products.filter(p => p.preorderEnabled)
  // Every active product, including ones already on pre-order - the
  // dialog itself greys those out and disables them (see
  // PreorderProductDialog), rather than this list hiding them outright.
  // Inactive/deleted products are excluded (deleted ones never appear in
  // `products` to begin with).
  const productsAvailableForPreorder = products
    .filter(p => p.isActive)
    .map(p => {
      const lowestPrice = lowestActivePriceFor(p)
      return {
        ...p,
        lowestPrice,
        highestPrice: highestActivePriceFor(p, lowestPrice),
        categoryId: productCategories[p.id] ?? null,
        categoryName: categories.find(c => c.id === productCategories[p.id])?.name || 'No section',
        thumbnail: productImages[p.id] ? mediaUrl(productImages[p.id]) : null,
      }
    })

  const openAddToPreorder = () => {
    setPreorderProductSearch('')
    setPreorderProductDialogFor({ mode: 'add', product: null })
  }

  const openEditPreorderProduct = (product) => {
    const lowestPrice = lowestActivePriceFor(product)
    setPreorderProductDialogFor({
      mode: 'edit',
      product: {
        ...product, lowestPrice, highestPrice: highestActivePriceFor(product, lowestPrice),
        thumbnail: productImages[product.id] ? mediaUrl(productImages[product.id]) : null,
      },
    })
  }

  const savePreorderProduct = async (product, deposit, expectedDate) => {
    const res = await apiFetch(`/api/admin/products/${product.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        preorderEnabled: true,
        preorderDeposit: deposit,
        preorderExpectedDate: expectedDate || '',
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to save.')
    setProducts(prev => prev.map(p => p.id === data.id ? { ...p, ...data } : p))
    setPreorderProductDialogFor(null)
    toast(`${product.name} is now available for pre-order.`, 'success')
  }

  // items: [{ id, name, deposit, expectedDate }] - one transaction, all or
  // none (see POST /api/admin/products/preorder/bulk). On a validation
  // failure the error carries `.errors` ({productId: message}) so the
  // dialog's review step can show each one next to its own row, rather
  // than one blocking message that doesn't say which product it's about.
  const saveBulkPreorderProducts = async (items) => {
    const res = await apiFetch('/api/admin/products/preorder/bulk', {
      method: 'POST',
      body: JSON.stringify({
        items: items.map(i => ({ productId: i.id, deposit: i.deposit, expectedDate: i.expectedDate || '' })),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.error || 'Failed to add products to pre-order.')
      err.errors = data.errors || {}
      throw err
    }
    setProducts(prev => prev.map(p => {
      const updated = data.products.find(u => u.id === p.id)
      return updated ? { ...p, ...updated } : p
    }))
    setPreorderProductDialogFor(null)
    toast(`${items.length} product${items.length !== 1 ? 's' : ''} are now available for pre-order.`, 'success')
  }

  const removeOneFromPreorder = async (product) => {
    const res = await apiFetch(`/api/admin/products/${product.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ preorderEnabled: false }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Failed to remove ${product.name} from pre-order.`)
    setProducts(prev => prev.map(p => p.id === data.id ? { ...p, ...data } : p))
  }

  const removeFromPreorder = async (product) => {
    const activeCount = activePreorderCountFor(product.id)
    await confirmDialog({
      variant: 'neutral',
      title: 'Remove from pre-order?',
      subject: { image: productImages[product.id] ? mediaUrl(productImages[product.id]) : null, name: product.name },
      summary: `${product.name} will no longer accept new pre-orders.${activeCount > 0 ? ` The ${activeCount} existing pre-order${activeCount !== 1 ? 's' : ''} will stay active.` : ''}`,
      confirmLabel: 'Remove from pre-order',
      busyLabel: 'Removing…',
      successMessage: `${product.name} removed from pre-order`,
      onConfirm: () => removeOneFromPreorder(product),
    })
  }

  const removeSelectedFromPreorder = async (selectedProducts) => {
    const totalActive = selectedProducts.reduce((sum, p) => sum + activePreorderCountFor(p.id), 0)
    await confirmDialog({
      variant: 'neutral',
      title: 'Remove from pre-order?',
      summary: `${selectedProducts.length} product${selectedProducts.length !== 1 ? 's' : ''} will no longer accept new pre-orders.${totalActive > 0 ? ` The ${totalActive} existing pre-order${totalActive !== 1 ? 's' : ''} will stay active.` : ''}`,
      confirmLabel: 'Remove from pre-order',
      busyLabel: 'Removing…',
      successMessage: `${selectedProducts.length} product${selectedProducts.length !== 1 ? 's' : ''} removed from pre-order`,
      onConfirm: async () => {
        for (const product of selectedProducts) await removeOneFromPreorder(product)
        setPreorderProductSelection(new Set())
      },
    })
  }

  const savePreorderLeadTime = async () => {
    setPreorderSettingsStatus(null)
    try {
      const res = await apiFetch('/api/admin/system/preorders', {
        method: 'PUT',
        body: JSON.stringify({ minDays: parseInt(preorderLeadTimeDraft.minDays), maxDays: parseInt(preorderLeadTimeDraft.maxDays) }),
      })
      const data = await res.json()
      if (res.ok) {
        setPreorderLeadTime(data)
        setPreorderLeadTimeDraft(data)
        setPreorderSettingsStatus({ ok: true, message: 'Lead time saved.' })
      } else {
        setPreorderSettingsStatus({ ok: false, message: data.error || 'Failed to save lead time.' })
      }
    } catch {
      setPreorderSettingsStatus({ ok: false, message: 'Failed to save lead time.' })
    }
  }

  // The confirm dialog's "item summary" for a pre-order - its product's
  // thumbnail and name, with the customer underneath.
  const preorderSubject = (preorder, extraDetails = []) => ({
    image: productImages[preorder.productId] ? mediaUrl(productImages[preorder.productId]) : null,
    name: preorder.productName,
    details: [{ icon: 'person', text: preorder.customerName }, ...extraDetails],
  })

  const markPreorderArrived = async (preorder) => {
    const ok = await confirmDialog({
      variant: 'neutral',
      title: 'Mark as Arrived',
      subject: preorderSubject(preorder),
      summary: 'This marks the pre-order as arrived, ready for collection or delivery.',
      confirmLabel: 'Mark as arrived',
      busyLabel: 'Marking as arrived…',
      successMessage: 'Pre-order marked as arrived',
      onConfirm: async () => {
        const res = await apiFetch('/api/admin/preorders/mark-arrived', { method: 'POST', body: JSON.stringify({ id: preorder.id }) })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to mark as arrived.')
        }
        await fetchPreorders()
      },
    })
    if (ok) {
      promptMessageCustomer('preorder', { ...preorder, status: 'arrived' }, null, `Let ${firstNameOf(preorder.customerName)} know their order has arrived?`)
    }
  }

  const markProductPreordersArrived = async (group) => {
    const count = group.statusCounts.deposit_paid || 0
    if (count === 0) return
    // No per-customer "message them?" prompt for a bulk action (Step 6) -
    // just one plain toast pointing her at messaging them individually.
    await confirmDialog({
      variant: 'neutral',
      title: 'Mark All as Arrived',
      subject: {
        image: productImages[group.productId] ? mediaUrl(productImages[group.productId]) : null,
        name: group.productName,
        details: [{ icon: 'person', text: `${count} deposit-paid pre-order${count !== 1 ? 's' : ''}` }],
      },
      summary: 'All deposit-paid pre-orders for this product will be marked as arrived.',
      confirmLabel: `Mark ${count} as arrived`,
      busyLabel: 'Marking as arrived…',
      successMessage: `${count} pre-order${count !== 1 ? 's' : ''} marked as arrived. Message customers from each pre-order.`,
      onConfirm: async () => {
        const res = await apiFetch('/api/admin/preorders/mark-arrived', { method: 'POST', body: JSON.stringify({ productId: group.productId }) })
        if (!res.ok) throw new Error('Failed to mark pre-orders as arrived.')
        await fetchPreorders()
      },
    })
  }

  const dispatchPreorder = async (preorder) => {
    const tracking = courierTrackingDraft[preorder.id] || ''
    const ok = await confirmDialog({
      variant: 'neutral',
      title: 'Dispatch Pre-order',
      subject: preorderSubject(preorder),
      summary: 'This marks the pre-order as dispatched and also confirms its order.',
      confirmLabel: 'Mark as dispatched',
      busyLabel: 'Marking as dispatched…',
      successMessage: 'Pre-order dispatched',
      onConfirm: async () => {
        const res = await apiFetch(`/api/admin/preorders/${preorder.id}/dispatch`, { method: 'PATCH', body: JSON.stringify({ courierTracking: tracking }) })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to mark as dispatched.')
        }
        await fetchPreorders()
      },
    })
    if (ok) {
      promptMessageCustomer('preorder', { ...preorder, status: 'dispatched' }, null, `Let ${firstNameOf(preorder.customerName)} know their order is on its way?`)
    }
  }

  const collectPreorder = async (preorder) => {
    const ok = await confirmDialog({
      variant: 'neutral',
      title: 'Mark as Collected',
      subject: preorderSubject(preorder),
      summary: 'This marks the pre-order as collected and also confirms its order.',
      confirmLabel: 'Mark as collected',
      busyLabel: 'Marking as collected…',
      successMessage: 'Pre-order collected',
      onConfirm: async () => {
        const res = await apiFetch(`/api/admin/preorders/${preorder.id}/collect`, { method: 'PATCH' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to mark as collected.')
        }
        await fetchPreorders()
      },
    })
    if (ok) {
      promptMessageCustomer('preorder', { ...preorder, status: 'collected' }, null, `Let ${firstNameOf(preorder.customerName)} know their order was collected?`)
    }
  }

  const cancelPreorder = async (preorder) => {
    const ok = await confirmDialog({
      variant: 'danger',
      title: 'Cancel Pre-order',
      subject: preorderSubject(preorder),
      summary: 'This only records a status change - any refund is done separately in the Ozow dashboard.',
      confirmLabel: 'Cancel this pre-order',
      busyLabel: 'Cancelling…',
      successMessage: 'Pre-order cancelled',
      onConfirm: async () => {
        const res = await apiFetch(`/api/admin/preorders/${preorder.id}/cancel`, { method: 'PATCH' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to cancel pre-order.')
        }
        await fetchPreorders()
      },
    })
    if (ok) {
      promptMessageCustomer('preorder', { ...preorder, status: 'cancelled' }, null, `Let ${firstNameOf(preorder.customerName)} know their order was cancelled?`)
    }
  }

  const refundPreorder = async (preorder) => {
    const ok = await confirmDialog({
      variant: 'danger',
      title: 'Mark as Refunded',
      subject: preorderSubject(preorder),
      summary: 'This only records a status change - do the actual refund in the Ozow dashboard first.',
      confirmLabel: 'Mark as refunded',
      busyLabel: 'Marking as refunded…',
      successMessage: 'Pre-order marked as refunded',
      onConfirm: async () => {
        const res = await apiFetch(`/api/admin/preorders/${preorder.id}/refund`, { method: 'PATCH' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to mark as refunded.')
        }
        await fetchPreorders()
      },
    })
    if (ok) {
      promptMessageCustomer('preorder', { ...preorder, status: 'refunded' }, null, `Let ${firstNameOf(preorder.customerName)} know their refund has been processed?`)
    }
  }

  const copyPreorderBalanceLink = async (preorder) => {
    try {
      await navigator.clipboard.writeText(preorder.link)
      setPreorderActionStatus({ id: preorder.id, message: 'Balance link copied.' })
    } catch {
      // silent fail
    }
  }

  const preorderDaysLabel = (preorder) => {
    if (preorder.daysLeft === null || preorder.daysLeft === undefined) return null
    if (preorder.daysLeft > 0) return `${preorder.daysLeft} day${preorder.daysLeft !== 1 ? 's' : ''} left`
    if (preorder.daysLeft === 0) return 'Due today'
    return `${Math.abs(preorder.daysLeft)} day${Math.abs(preorder.daysLeft) !== 1 ? 's' : ''} late`
  }

  const fetchMessageTemplates = async () => {
    try {
      const res = await apiFetch('/api/message-templates')
      const data = await res.json()
      if (res.ok && Array.isArray(data)) {
        setMessageTemplates(data)
        return data
      }
    } catch {}
    return null
  }

  // The full settings object (banking details + reminder-day settings) -
  // not the public GET /api/business-details, which deliberately only
  // exposes the four fields the customer-site EFT screen needs. Any
  // authenticated role can read this (staff need business_name/bank_
  // details/pop_number too, to send messages), same split as templates.
  const fetchBusinessDetails = async () => {
    try {
      const res = await apiFetch('/api/admin/system/messaging')
      const data = await res.json()
      if (res.ok) setBusinessDetails(data)
    } catch {}
  }

  const openMessagePanel = (entityType, entity, course) => setMessagePanelTarget({ entityType, entity, course })

  // Shows a toast with "Send on WhatsApp"/"Preview" after a status change
  // that has a matching template (Step 6) - never for a bulk action, which
  // gets its own single plain toast instead (see markProductPreordersArrived).
  const promptMessageCustomer = (entityType, entity, course, promptText) => {
    if (!businessDetails) return
    const phone = entityType === 'student' ? entity.whatsapp : entity.customerPhone
    const defaultTemplateId = entityType === 'order' ? defaultTemplateIdForOrder(entity)
      : entityType === 'preorder' ? defaultTemplateIdForPreorder(entity)
      : defaultTemplateIdForStudent(entity)
    toast(promptText, 'prompt', {
      duration: 10000,
      actions: [
        {
          label: 'Send on WhatsApp',
          onClick: () => {
            const template = messageTemplates.find((t) => t.id === defaultTemplateId)
            if (!template) return
            const data = entityType === 'order' ? buildOrderTemplateData(entity, businessDetails)
              : entityType === 'preorder' ? buildPreorderTemplateData(entity, businessDetails)
              : buildStudentTemplateData(entity, course, businessDetails)
            const text = renderTemplate(template.body, data, { whatsapp: true })
            const link = whatsappLink(phone, text)
            if (link) window.open(link, '_blank', 'noopener,noreferrer')
            else toast('No phone number on this ' + entityType, 'error')
          },
        },
        { label: 'Preview', onClick: () => openMessagePanel(entityType, entity, course) },
      ],
    })
  }

  const firstNameOf = (fullName) => (fullName || '').trim().split(/\s+/)[0] || 'the customer'

  // Keeps the Settings page's business-details form in sync whenever the
  // real settings load or are re-fetched after a save.
  useEffect(() => {
    if (businessDetails) setBusinessDetailsDraft(businessDetails)
  }, [businessDetails])

  const draftFor = (template) => templateDrafts[template.id] || { body: template.body, emailSubject: template.emailSubject }

  const toggleTemplateExpanded = (template) => {
    setTemplateStatus(null)
    if (expandedTemplateId === template.id) {
      setExpandedTemplateId(null)
      return
    }
    setExpandedTemplateId(template.id)
    setTemplateDrafts(prev => prev[template.id] ? prev : { ...prev, [template.id]: { body: template.body, emailSubject: template.emailSubject } })
  }

  const updateTemplateDraft = (id, patch) => {
    setTemplateDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  // Inserts {placeholder} at the cursor of whichever field (body or
  // subject) was last focused, rather than always appending to the end.
  const insertPlaceholder = (template, placeholder) => {
    const field = lastFocusedTemplateField
    const ref = field === 'subject' ? templateSubjectFieldRef : templateBodyFieldRef
    const el = ref.current
    const draft = draftFor(template)
    const current = field === 'subject' ? draft.emailSubject : draft.body
    const start = el ? el.selectionStart ?? current.length : current.length
    const end = el ? el.selectionEnd ?? current.length : current.length
    const next = `${current.slice(0, start)}{${placeholder}}${current.slice(end)}`
    updateTemplateDraft(template.id, field === 'subject' ? { emailSubject: next } : { body: next })
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const cursor = start + placeholder.length + 2
      el.setSelectionRange(cursor, cursor)
    })
  }

  const saveTemplateEdit = async (template) => {
    const draft = draftFor(template)
    setTemplateSaving(true)
    setTemplateStatus(null)
    try {
      const res = await apiFetch(`/api/message-templates/${template.id}`, {
        method: 'PUT',
        body: JSON.stringify({ body: draft.body, emailSubject: draft.emailSubject }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        await fetchMessageTemplates()
        toast('Template saved', 'success')
        if (data.warning) setTemplateStatus({ id: template.id, type: 'warning', message: data.warning })
      } else {
        setTemplateStatus({ id: template.id, type: 'error', message: data.error || 'Failed to save template.' })
      }
    } catch {
      setTemplateStatus({ id: template.id, type: 'error', message: 'Failed to save template.' })
    } finally {
      setTemplateSaving(false)
    }
  }

  const resetTemplateToDefault = async (template) => {
    await confirmDialog({
      variant: 'neutral',
      title: 'Reset to Default',
      subject: { image: null, name: template.label },
      summary: 'This replaces your edited version with the built-in default message. This cannot be undone.',
      confirmLabel: 'Reset to default',
      busyLabel: 'Resetting…',
      successMessage: 'Template reset to default',
      onConfirm: async () => {
        const res = await apiFetch(`/api/message-templates/${template.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to reset template.')
        const refreshed = await fetchMessageTemplates()
        const updated = refreshed?.find(t => t.id === template.id)
        if (updated) setTemplateDrafts(prev => ({ ...prev, [template.id]: { body: updated.body, emailSubject: updated.emailSubject } }))
        setTemplateStatus(null)
      },
    })
  }

  const saveBusinessDetails = async () => {
    if (!businessDetailsDraft) return

    const doSave = async () => {
      const res = await apiFetch('/api/admin/system/messaging', {
        method: 'PUT',
        body: JSON.stringify(businessDetailsDraft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save business details.')
      setBusinessDetails(data)
    }

    // Money going to the wrong account is the one mistake here that's
    // actually dangerous - double-check before saving a changed number,
    // rather than after a customer has already paid into it.
    const accountNumberChanged = businessDetails && businessDetailsDraft.accountNumber !== businessDetails.accountNumber
    if (accountNumberChanged) {
      await confirmDialog({
        variant: 'danger',
        title: 'Change payment account?',
        summary: `Customers will be asked to pay into this new account. Please double-check the number: ${businessDetailsDraft.accountNumber}`,
        confirmLabel: 'Save new account',
        busyLabel: 'Saving…',
        successMessage: 'Business details saved',
        onConfirm: doSave,
      })
      return
    }

    setBusinessDetailsSaving(true)
    setBusinessDetailsStatus(null)
    try {
      await doSave()
      toast('Business details saved', 'success')
    } catch (err) {
      setBusinessDetailsStatus({ type: 'error', message: err.message })
    } finally {
      setBusinessDetailsSaving(false)
    }
  }

  const fetchReminders = async () => {
    setRemindersLoading(true)
    try {
      const res = await apiFetch('/api/admin/reminders')
      const data = await res.json()
      if (res.ok && Array.isArray(data?.reminders)) {
        setReminders(data.reminders)
        setMissingCourseDates(Array.isArray(data.missingCourseDates) ? data.missingCourseDates : [])
      }
    } catch {
      // silent fail
    } finally {
      setRemindersLoading(false)
    }
  }

  useEffect(() => {
    if (activePage === 'dashboard' && user?.role === 'owner') fetchReminders()
  }, [activePage, user?.role])

  // A reminder row's studentId/courseName etc. come from a flatter summary
  // (see GET /api/admin/reminders) rather than the full student/course
  // shapes elsewhere in this file - reassembled into the same shape
  // buildStudentTemplateData expects, so the Message Customer panel and
  // the WhatsApp quick-send work identically from here.
  const studentFromReminder = (reminder) => ({
    id: reminder.studentId,
    name: reminder.studentName,
    whatsapp: reminder.whatsapp,
    email: reminder.email,
    amountPaid: reminder.amountPaid,
    balance: reminder.amountOutstanding,
    endDate: reminder.endDate,
  })
  const courseFromReminder = (reminder) => ({
    name: reminder.courseName,
    price: reminder.coursePrice,
  })

  const markReminderDone = async (reminder) => {
    setRemindersBusyId(reminder.studentId)
    try {
      const res = await apiFetch(`/api/admin/students/${reminder.studentId}/reminder`, {
        method: 'PATCH',
        body: JSON.stringify({ type: reminder.type }),
      })
      if (res.ok) setReminders(prev => prev.filter(r => r.studentId !== reminder.studentId))
    } catch {
      // silent fail
    } finally {
      setRemindersBusyId(null)
    }
  }

  const sendReminderOnWhatsApp = async (reminder) => {
    const templateId = reminder.type === 'certificate' ? 'training_certificate_warning'
      : reminder.type === 'overdue' ? 'training_overdue'
      : 'training_payment_reminder'
    const template = messageTemplates.find(t => t.id === templateId)
    if (!template || !businessDetails) return
    const data = buildStudentTemplateData(studentFromReminder(reminder), courseFromReminder(reminder), businessDetails)
    const text = renderTemplate(template.body, data, { whatsapp: true })
    const link = whatsappLink(reminder.whatsapp, text)
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
    else { toast('No phone number on this student', 'error'); return }
    await markReminderDone(reminder)
  }

// A manual payment that clears a held certificate (see savePaymentForStudent
  // below) reports it in the same response, so it shows this immediately;
  // the next-load effect just below is only for a gateway payment, which has
  // no such response to react to.
  const showCertificateClearedToast = (student) => {
    const course = coursesMerged.find((c) => c.id === student.classId)
    toast(`Balance paid. ${firstNameOf(student.name)}'s certificate can now be issued.`, 'prompt', {
      duration: 10000,
      actions: [{
        label: 'Send on WhatsApp',
        onClick: () => {
          const template = messageTemplates.find((t) => t.id === 'training_course_completed')
          if (!template || !businessDetails) return
          const data = buildStudentTemplateData(student, course, businessDetails)
          const text = renderTemplate(template.body, data, { whatsapp: true })
          const link = whatsappLink(student.whatsapp, text)
          if (link) window.open(link, '_blank', 'noopener,noreferrer')
        },
      }],
    })
  }

  // "Clears automatically ... with a toast" has no live push to react to
  // the moment a customer pays their own balance link via a gateway - this
  // app has no such infrastructure - so a gateway clearing instead
  // surfaces the next time the owner's dashboard loads a fresh, unread
  // certificate_cleared notification (see ozow.js/payflex.js). Tracked by
  // id in a ref, not state, purely to stop the same toast firing twice
  // while the "mark read" round-trip is in flight.
  const shownCertificateToastIds = useRef(new Set())
  useEffect(() => {
    if (user?.role !== 'owner' || !businessDetails) return
    const pending = notifications.filter(
      (n) => n.type === 'certificate_cleared' && !n.read && !shownCertificateToastIds.current.has(n.id)
    )
    pending.forEach(async (n) => {
      shownCertificateToastIds.current.add(n.id)
      try {
        const res = await apiFetch(`/api/admin/students/${n.studentId}`)
        if (!res.ok) return
        const student = await res.json()
        showCertificateClearedToast(student)
        markOneRead(n.id)
      } catch {
        // leave it unread - it'll be retried on the next load
        shownCertificateToastIds.current.delete(n.id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, user?.role, businessDetails])

  useEffect(() => {
    const token = localStorage.getItem('hbh_token')
    if (!token) return
    // Fetch the product catalog (used by both Image Management and the
    // Products page's catalog panel)
    apiFetch('/api/admin/products')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setProducts(data)
        else setProducts([])
      })
      .catch(() => {})
    // Fetch live course name/price/deposit
    apiFetch('/api/courses')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return
        const byId = {}
        data.forEach(c => { byId[c.id] = c })
        setCourseData(byId)
      })
      .catch(() => {})
    // Fetch class images
    CLASSES.forEach(async c => {
      const res = await apiFetch(`/api/upload/classes/${c.id}`)
      const data = await res.json()
      if (data && data.url) setClassImages(prev => ({ ...prev, [c.id]: data.url }))
      try {
        const posRes = await apiFetch(`/api/position/classes/${c.id}`)
        const posData = await posRes.json()
        if (posData && posData.position) setClassPositions(prev => ({ ...prev, [c.id]: posData.position }))
      } catch {}
    })
    // Fetch gallery
    fetchGallery()
    // Fetch message templates (used by the Message Customer panel and the
    // Settings page's template editor) and business details (banking info,
    // reminder-day settings)
    fetchMessageTemplates()
    fetchBusinessDetails()
    // Fetch categories
    apiFetch('/api/categories')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setCategories(data)
        else setCategories([])
      })
      .catch(() => {})
    // Fetch product category assignments
    apiFetch('/api/categories/products/all')
      .then(r => r.json())
      .then(data => {
        if (data && typeof data === 'object' && !Array.isArray(data)) setProductCategories(data)
        else setProductCategories({})
      })
      .catch(() => {})
    // Fetch notifications (system notifications are sysadmin-only, never shown here)
    apiFetch('/api/notifications')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const visible = data.filter(n => n.type !== 'system')
          setNotifications(visible)
          setUnreadCount(visible.filter(n => !n.read).length)
        } else {
          setNotifications([])
        }
      })
      .catch(() => {})
    // Fetch orders for the dashboard's monthly revenue chart (confirmed only)
    // - view=all so archived orders still count towards revenue and sales.
    apiFetch('/api/orders?view=all')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRecentOrders(data.slice(0, 5))
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
          const monthlyTotals = Array(12).fill(0)
          data.filter(order => order.status === 'confirmed').forEach(order => {
            const month = new Date(order.createdAt).getMonth()
            monthlyTotals[month] += orderRevenue(order)
          })
          setRevenueData(months.map((name, i) => ({ name, revenue: monthlyTotals[i] })))
          setOrderCounts({
            active: data.filter(o => !o.archived).length,
            archived: data.filter(o => o.archived).length,
          })
        } else {
          setRecentOrders([])
        }
      })
      .catch(() => {})
    // Fetch archived notifications (system notifications are sysadmin-only, never shown here)
    apiFetch('/api/notifications/archived')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setArchivedNotifications(data.filter(n => n.type !== 'system'))
        else setArchivedNotifications([])
      })
      .catch(() => {})
    // Website Content - public endpoint, but the spec and history are
    // owner/sysadmin only, same as the page itself.
    fetch(`${API}/api/site-settings`)
      .then(r => r.json())
      .then(data => {
        if (data?.content) {
          setContentSaved(data.content)
          setContentDraft(data.content)
        }
      })
      .catch(() => {})
      .finally(() => setContentLoading(false))
    if (user?.role !== 'staff') {
      apiFetch('/api/admin/site-settings/content/spec')
        .then(r => r.json())
        .then(data => setContentSpecLimits(data))
        .catch(() => {})
      fetchContentHistory()
    }
    fetchOrders()
    if (user?.role !== 'staff') {
      fetchPreorders()
      fetchPreorderLeadTime()
    }
    fetch(`${API}/api/system/status`)
      .then(r => r.json())
      .then(data => setShowTestDataEnabled(!!data?.showTestData?.enabled))
      .catch(() => {})
  }, [])

  // Fetches whatever months the business calendar needs: the one currently
  // in view, plus today's and "today + 14 days"'s so the "Coming up" list
  // always has what it needs even when the grid is showing another month.
  // Skips a month already cached or already being fetched.
  useEffect(() => {
    const now = new Date()
    const viewed = new Date(now.getFullYear(), now.getMonth() + calendarMonthOffset, 1)
    const in14 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14)
    const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const neededKeys = Array.from(new Set([monthKey(viewed), monthKey(now), monthKey(in14)]))

    neededKeys.forEach(key => {
      setCalendarCache(prev => {
        if (prev[key]) return prev
        apiFetch(`/api/dashboard/calendar?month=${key}`)
          .then(r => r.json())
          .then(data => setCalendarCache(p => ({ ...p, [key]: data })))
          .catch(() => setCalendarCache(p => ({ ...p, [key]: { students: [], orders: [] } })))
        return { ...prev, [key]: 'loading' }
      })
    })
  }, [calendarMonthOffset])

  // Warns before closing the tab or refreshing with unsaved Website Content
  // changes - in-app navigation away is instead caught by navigateTo above.
  useEffect(() => {
    if (activePage !== 'content' || !contentDirty) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [activePage, contentDirty])

  // Product images and positions depend on the product catalog having loaded.
  useEffect(() => {
    products.forEach(async p => {
      const res = await apiFetch(`/api/upload/products/${p.id}`)
      const data = await res.json()
      if (data && data.url) setProductImages(prev => ({ ...prev, [p.id]: data.url }))
      try {
        const posRes = await apiFetch(`/api/position/products/${p.id}`)
        const posData = await posRes.json()
        if (posData && posData.position) setProductPositions(prev => ({ ...prev, [p.id]: posData.position }))
      } catch {}
    })
  }, [products])

  const handleUpload = async (type, id, file) => {
    if (!file) return
    const key = id ? `${type}-${id}` : `${type}-${Date.now()}`
    setUploadStatus(prev => ({ ...prev, [key]: 'uploading' }))
    const formData = new FormData()
    formData.append('image', file)
    try {
      const path = type === 'gallery'
        ? `/api/upload/gallery`
        : `/api/upload/${type}/${id}`
      const res = await apiFetch(path, { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok && data.url) {
        if (type === 'products') setProductImages(prev => ({ ...prev, [id]: data.url }))
        if (type === 'classes') setClassImages(prev => ({ ...prev, [id]: data.url }))
        if (type === 'gallery') fetchGallery()
        if (type === 'categories') setCategories(prev => prev.map(c => c.id === id ? { ...c, imageUrl: data.url } : c))
        setUploadStatus(prev => ({ ...prev, [key]: 'success' }))
        setTimeout(() => setUploadStatus(prev => ({ ...prev, [key]: null })), 3000)
      } else {
        setUploadStatus(prev => ({ ...prev, [key]: data.error || 'Upload failed. Please try again.' }))
      }
    } catch {
      setUploadStatus(prev => ({ ...prev, [key]: 'Upload failed. Please try again.' }))
    }
  }

  const fetchGallery = async () => {
    try {
      const res = await apiFetch('/api/gallery')
      const data = await res.json()
      setGalleryImages(Array.isArray(data) ? data : [])
    } catch {
      setGalleryImages([])
    }
  }

  const [deletingGalleryId, setDeletingGalleryId] = useState(null)

  const removeGalleryItem = async (img) => {
    await confirmDialog({
      variant: 'danger',
      title: 'Remove Gallery File',
      subject: {
        image: img.url,
        name: img.filename || (img.type === 'video' ? 'Video' : 'Image'),
        details: [{ text: img.type === 'video' ? 'Video' : 'Image' }],
      },
      summary: "This file will be permanently removed from the gallery. This can't be undone.",
      confirmLabel: 'Remove this file',
      busyLabel: 'Removing…',
      successMessage: 'Gallery file removed',
      onConfirm: async () => {
        setDeletingGalleryId(img.id)
        try {
          const res = await apiFetch(`/api/gallery/${img.id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error('Failed to remove gallery file.')
          setGalleryImages(prev => prev.filter(g => g.id !== img.id))
        } finally {
          setDeletingGalleryId(null)
        }
      },
    })
  }

  const adjustPosition = async (type, id, direction) => {
    const positions = type === 'products' ? productPositions : classPositions
    const setPositions = type === 'products' ? setProductPositions : setClassPositions

    const current = positions[id] || { x: 50, y: 50 }
    const step = 10
    const next = {
      x: direction === 'left' ? Math.max(0, current.x - step)
         : direction === 'right' ? Math.min(100, current.x + step)
         : current.x,
      y: direction === 'up' ? Math.max(0, current.y - step)
         : direction === 'down' ? Math.min(100, current.y + step)
         : current.y,
    }

    try {
      const res = await apiFetch(`/api/position/${type}/${id}`, {
        method: 'POST',
        body: JSON.stringify({ position: next }),
      })
      if (res.ok) setPositions(prev => ({ ...prev, [id]: next }))
    } catch {}
  }

  const createCategory = async () => {
    if (!newCategoryName.trim()) return
    try {
      const res = await apiFetch('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCategoryName.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setCategories(prev => [...prev, data])
        setNewCategoryName('')
        setCategoryStatus({ type: 'success', message: `"${data.name}" section created.` })
        setTimeout(() => setCategoryStatus(null), 3000)
      } else {
        setCategoryStatus({ type: 'error', message: data.error })
        setTimeout(() => setCategoryStatus(null), 3000)
      }
    } catch {
      setCategoryStatus({ type: 'error', message: 'Failed to create section.' })
      setTimeout(() => setCategoryStatus(null), 3000)
    }
  }

  const deleteCategory = async (category, count) => {
    await confirmDialog({
      variant: 'danger',
      title: 'Remove Section',
      subject: {
        image: category.imageUrl,
        name: category.name,
        details: [{ text: `${count} product${count !== 1 ? 's' : ''}` }],
      },
      summary: 'This section will be removed. Products in it will become uncategorised.',
      confirmLabel: 'Remove this section',
      busyLabel: 'Removing…',
      successMessage: `"${category.name}" section removed`,
      onConfirm: async () => {
        const res = await apiFetch(`/api/categories/${category.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to remove section.')
        setCategories(prev => prev.filter(c => c.id !== category.id))
        setProductCategories(prev => {
          const updated = { ...prev }
          Object.keys(updated).forEach(pid => {
            if (updated[pid] === category.id) delete updated[pid]
          })
          return updated
        })
      },
    })
  }

  const moveCategory = async (id, direction) => {
    try {
      const res = await apiFetch(`/api/categories/${id}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ direction }),
      })
      const data = await res.json()
      if (res.ok && Array.isArray(data)) setCategories(data)
    } catch {}
  }

  const removeCategoryImage = async (category) => {
    await confirmDialog({
      variant: 'neutral',
      title: 'Remove Cover Image',
      subject: { image: category.imageUrl, name: category.name },
      summary: "This section's cover image will be removed. You can upload a new one any time.",
      confirmLabel: 'Remove this image',
      busyLabel: 'Removing…',
      successMessage: 'Cover image removed',
      onConfirm: async () => {
        const res = await apiFetch(`/api/categories/${category.id}/image`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to remove cover image.')
        setCategories(prev => prev.map(c => c.id === category.id ? { ...c, imageUrl: null } : c))
      },
    })
  }

  const assignCategory = async (productId, categoryId) => {
    try {
      const res = await apiFetch(`/api/categories/product/${productId}`, {
        method: 'POST',
        body: JSON.stringify({ categoryId: categoryId ? parseInt(categoryId) : null }),
      })
      if (res.ok) {
        const newCategoryId = categoryId ? parseInt(categoryId) : null
        setProductCategories(prev => ({ ...prev, [productId]: newCategoryId }))
        // The card itself just moves to its new group (nothing here scrolls
        // or collapses anything) - the toast is what actually confirms it,
        // since "it moved somewhere in the list" isn't otherwise obvious.
        const sectionName = newCategoryId ? (categories.find(c => c.id === newCategoryId)?.name || 'section') : 'No section'
        toast(`Moved to ${sectionName}`, 'success')
      }
    } catch {}
  }

  const markAllRead = async () => {
    try {
      const res = await apiFetch('/api/notifications/read-all', { method: 'PATCH' })
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
        setUnreadCount(0)
      }
    } catch {}
  }

  const markOneRead = async (id) => {
    try {
      const res = await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch {}
  }

  const confirmOrder = async (id) => {
    setOrderConfirmError('')
    setConfirmPromptOrderId(null)
    try {
      const res = await apiFetch(`/api/orders/${id}/confirm`, { method: 'PATCH' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        let confirmedOrder = null
        setOrders(prev => prev.map(o => {
          if (o.id !== id) return o
          confirmedOrder = { ...o, status: 'confirmed' }
          return confirmedOrder
        }))
        if (confirmedOrder) {
          const action = confirmedOrder.fulfilmentMethod === 'delivery' ? 'know their order is on its way' : 'know their order is ready for collection'
          promptMessageCustomer('order', confirmedOrder, null, `Let ${firstNameOf(confirmedOrder.customerName)} ${action}?`)
        }
      } else {
        setOrderConfirmError(data.error || 'Failed to confirm order.')
      }
    } catch {
      setOrderConfirmError('Failed to confirm order.')
    }
  }

  const fetchProducts = async () => {
    try {
      const res = await apiFetch('/api/admin/products')
      const data = await res.json()
      if (res.ok && Array.isArray(data)) {
        setProducts(data)
        return data
      }
    } catch {}
    return null
  }

  // Groups `list` by section, in the customer site's own section order
  // (categories is already fetched sorted by position) with "No section"
  // last - newest product first within each group. Only groups that
  // actually have a product in `list` are returned, so a search that
  // empties a section just makes it disappear rather than showing an
  // empty header.
  const sectionGroupsForProducts = (list) => {
    const bySlug = {}
    const order = []
    categories.forEach(c => {
      const slug = slugify(c.name)
      bySlug[slug] = { slug, name: c.name, categoryId: c.id, products: [] }
      order.push(slug)
    })
    bySlug[NO_SECTION_SLUG] = { slug: NO_SECTION_SLUG, name: 'No section', categoryId: null, products: [] }
    order.push(NO_SECTION_SLUG)
    list.forEach(p => {
      const catId = productCategories[p.id] ?? null
      const group = (catId != null && Object.values(bySlug).find(g => g.categoryId === catId)) || bySlug[NO_SECTION_SLUG]
      group.products.push(p)
    })
    order.forEach(slug => {
      bySlug[slug].products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    })
    return order.map(slug => bySlug[slug]).filter(g => g.products.length > 0)
  }

  // Auto-expands sections once products have loaded, the first time -
  // only when the URL didn't already say which sections were open (see
  // productsOpenSections' initial state above).
  useEffect(() => {
    if (productsOpenSections !== null || products.length === 0) return
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const recentSlugs = new Set()
    sectionGroupsForProducts(products).forEach(g => {
      if (g.products.some(p => p.createdAt && new Date(p.createdAt).getTime() >= sevenDaysAgo)) recentSlugs.add(g.slug)
    })
    setProductsOpenSections(recentSlugs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, productsOpenSections])

  // Keeps ?q=/&open= in sync with the grouped-by-section product search/
  // expanded sections, shared between the Products page and Image
  // Management's Products tab - the same replaceState-not-pushState
  // pattern as every other page's own cheap sub-state (see Orders'
  // ?view=, Image Management's own ?tab=).
  useEffect(() => {
    const onRelevantPage = activePage === 'products' || (activePage === 'images' && imageTab === 'products')
    if (!onRelevantPage || productsOpenSections === null) return
    const url = new URL(window.location.href)
    if (productsSearch) url.searchParams.set('q', productsSearch); else url.searchParams.delete('q')
    if (productsOpenSections.size > 0) url.searchParams.set('open', Array.from(productsOpenSections).join(',')); else url.searchParams.delete('open')
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [activePage, imageTab, productsSearch, productsOpenSections])

  const toggleProductSection = (slug) => setProductsOpenSections(prev => {
    const next = new Set(prev || [])
    next.has(slug) ? next.delete(slug) : next.add(slug)
    return next
  })

  const createProduct = async () => {
    setProductFormStatus(null)
    if (!newProduct.name.trim() || newProduct.price === '') {
      setProductFormStatus({ type: 'error', message: 'Name and price are required.' })
      return
    }
    try {
      const res = await apiFetch('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify(newProduct),
      })
      const data = await res.json()
      if (res.ok) {
        // The product-creation route doesn't know about sections - same
        // endpoint assignCategory uses, called right after.
        if (newProduct.categoryId) {
          await apiFetch(`/api/categories/product/${data.id}`, {
            method: 'POST',
            body: JSON.stringify({ categoryId: parseInt(newProduct.categoryId) }),
          }).then(r => r.ok && setProductCategories(prev => ({ ...prev, [data.id]: parseInt(newProduct.categoryId) }))).catch(() => {})
        }
        await fetchProducts()
        const chosenCategory = newProduct.categoryId ? categories.find(c => c.id === parseInt(newProduct.categoryId)) : null
        const sectionSlug = chosenCategory ? slugify(chosenCategory.name) : NO_SECTION_SLUG
        setNewProduct({ name: '', description: '', detail: '', price: '', badge: '', stockQuantity: '', lowStockThreshold: '', categoryId: '' })
        setShowAddProduct(false)
        setProductFormStatus({ type: 'success', message: `"${data.name}" was added.` })
        setTimeout(() => setProductFormStatus(null), 3000)
        // Expand the section it was just added to, scroll to the card once
        // it's rendered, and give it a brief highlight.
        setProductsOpenSections(prev => new Set([...(prev || []), sectionSlug]))
        setHighlightedProductId(data.id)
        setTimeout(() => {
          document.getElementById(`product-card-${data.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
        setTimeout(() => setHighlightedProductId(null), 2000)
      } else {
        setProductFormStatus({ type: 'error', message: data.error || 'Failed to add product.' })
      }
    } catch {
      setProductFormStatus({ type: 'error', message: 'Failed to add product.' })
    }
  }

  const saveProductEdit = async () => {
    if (!editingProduct) return
    try {
      const res = await apiFetch(`/api/admin/products/${editingProduct.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editingProduct),
      })
      const data = await res.json()
      if (res.ok) {
        setProducts(prev => prev.map(p => p.id === data.id ? data : p))
        setEditingProduct(null)
      } else {
        setProductFormStatus({ type: 'error', message: data.error || 'Failed to update product.' })
      }
    } catch {
      setProductFormStatus({ type: 'error', message: 'Failed to update product.' })
    }
  }

  // The confirm dialog's "product summary" line - price, then whichever of
  // options/stock/sale actually applies to this product.
  const productSubject = (p) => {
    const details = [{ icon: 'price', text: `R ${Number(p.price).toFixed(2)}` }]
    if (p.hasOptions) {
      details.push({ icon: 'options', text: `${p.options.length} length${p.options.length !== 1 ? 's' : ''}` })
    } else if (p.hasCustomOptions) {
      const label = (p.optionLabel || 'option').toLowerCase()
      details.push({ icon: 'options', text: `${p.customOptions.length} ${label}${p.customOptions.length !== 1 ? 's' : ''}` })
    }
    if (p.stockQuantity != null) details.push({ icon: 'stock', text: `${p.stockQuantity} in stock` })
    if (p.onSale) details.push({ icon: 'sale', text: 'On sale' })
    return {
      image: productImages[p.id] ? mediaUrl(productImages[p.id]) : null,
      name: p.name,
      details,
    }
  }

  const toggleProductActive = async (product) => {
    const activating = !product.isActive
    await confirmDialog({
      variant: 'neutral',
      title: activating ? 'Reactivate Product' : 'Deactivate Product',
      subject: productSubject(product),
      summary: activating
        ? 'This product will be visible in the shop again and customers can order it.'
        : "This product will be hidden from the shop, so customers can't see or order it. It stays in your products list and you can reactivate it any time.",
      confirmLabel: activating ? 'Reactivate this product' : 'Deactivate this product',
      busyLabel: activating ? 'Reactivating…' : 'Deactivating…',
      successMessage: activating ? 'Product reactivated' : 'Product deactivated',
      onConfirm: async () => {
        const res = await apiFetch(`/api/admin/products/${product.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: activating }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to update product.')
        setProducts(prev => prev.map(p => p.id === data.id ? data : p))
      },
    })
  }

  // stockAdjustTarget is either { kind: 'product', id, name, stockQuantity }
  // or { kind: 'variant', productId, variantId, name, stockQuantity }, for
  // adjusting a whole product's stock or one lash length/curl option's.
  const adjustStock = async () => {
    if (!stockAdjustTarget) return
    const amount = parseInt(stockAdjustAmount)
    if (!amount || isNaN(amount)) {
      setProductFormStatus({ type: 'error', message: 'Enter a non-zero amount.' })
      return
    }
    const url = stockAdjustTarget.kind === 'variant'
      ? `/api/admin/products/${stockAdjustTarget.productId}/variants/${stockAdjustTarget.variantId}/stock`
      : stockAdjustTarget.kind === 'customOption'
      ? `/api/admin/products/${stockAdjustTarget.productId}/options/${stockAdjustTarget.optionId}/stock`
      : `/api/admin/products/${stockAdjustTarget.id}/stock`
    try {
      const res = await apiFetch(url, {
        method: 'POST',
        body: JSON.stringify({ change: amount, reason: stockAdjustReason, note: stockAdjustNote }),
      })
      const data = await res.json()
      if (res.ok) {
        if (stockAdjustTarget.kind === 'variant') {
          setProducts(prev => prev.map(p => p.id === stockAdjustTarget.productId
            ? { ...p, options: p.options.map(o => o.id === data.id ? { ...o, stockQuantity: data.stockQuantity } : o) }
            : p))
        } else if (stockAdjustTarget.kind === 'customOption') {
          setProducts(prev => prev.map(p => {
            if (p.id !== stockAdjustTarget.productId) return p
            const customOptions = p.customOptions.map(o => o.id === data.id ? { ...o, stockQuantity: data.stockQuantity } : o)
            return { ...p, customOptions, stockQuantity: customOptions.filter(o => o.isActive).reduce((s, o) => s + o.stockQuantity, 0) }
          }))
        } else {
          setProducts(prev => prev.map(p => p.id === data.id ? { ...p, stockQuantity: data.stockQuantity } : p))
        }
        setStockAdjustTarget(null)
        setStockAdjustAmount('')
        setStockAdjustNote('')
        setStockAdjustReason('restock')
      } else {
        setProductFormStatus({ type: 'error', message: data.error || 'Failed to adjust stock.' })
      }
    } catch {
      setProductFormStatus({ type: 'error', message: 'Failed to adjust stock.' })
    }
  }

  const openOptionsManager = (product) => {
    setOptionsManagerProductId(product.id)
    setOptionLabelDraft(product.optionLabel || '')
    setOptionsManagerSearch('')
    setNewOptionDraft({ name: '', swatchHex: '', stockQuantity: '', price: product.optionsHaveOwnPrices ? String(product.price) : '' })
    setBulkOptionsOpen(false)
    setBulkOptionsText('')
    setBulkOptionsStartStock('')
    setOptionsManagerStatus(null)
  }

  // Turning per-option pricing off is a step back from what's currently
  // shown (every option's own price stops being used), so it's confirmed
  // first - turning it on isn't, since nothing visible changes until
  // prices are actually set differently (every option is pre-filled with
  // the current product price, so nothing can go wrong by switching it
  // on). Prices already typed in are kept either way.
  const toggleOptionsHaveOwnPrices = async (product, turnOn) => {
    if (!turnOn) {
      await confirmDialog({
        variant: 'neutral',
        title: 'Use one price for every option?',
        summary: `All options will go back to the main product price of R ${Number(product.price).toFixed(2)}.`,
        confirmLabel: 'Use one price',
        busyLabel: 'Saving…',
        successMessage: 'Now using one price for every option',
        onConfirm: async () => {
          const res = await apiFetch(`/api/admin/products/${product.id}`, {
            method: 'PATCH', body: JSON.stringify({ optionsHaveOwnPrices: false }),
          })
          if (!res.ok) throw new Error('Failed to update.')
          await fetchProducts()
        },
      })
      return
    }
    try {
      const res = await apiFetch(`/api/admin/products/${product.id}`, {
        method: 'PATCH', body: JSON.stringify({ optionsHaveOwnPrices: true }),
      })
      if (res.ok) {
        await fetchProducts()
        setNewOptionDraft(prev => ({ ...prev, price: String(product.price) }))
      } else {
        setOptionsManagerStatus({ type: 'error', message: 'Failed to turn on per-option pricing.' })
      }
    } catch {
      setOptionsManagerStatus({ type: 'error', message: 'Failed to turn on per-option pricing.' })
    }
  }

  const saveOptionLabel = async () => {
    if (!optionLabelDraft.trim()) {
      setOptionsManagerStatus({ type: 'error', message: 'An option label is required, e.g. Shade.' })
      return
    }
    try {
      const res = await apiFetch(`/api/admin/products/${optionsManagerProductId}`, {
        method: 'PATCH',
        body: JSON.stringify({ optionLabel: optionLabelDraft.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        await fetchProducts()
        setOptionsManagerStatus(null)
      } else {
        setOptionsManagerStatus({ type: 'error', message: data.error || 'Failed to save the option label.' })
      }
    } catch {
      setOptionsManagerStatus({ type: 'error', message: 'Failed to save the option label.' })
    }
  }

  const addCustomOption = async () => {
    if (!newOptionDraft.name.trim()) return
    const addedProduct = products.find(p => p.id === optionsManagerProductId)
    try {
      const res = await apiFetch(`/api/admin/products/${optionsManagerProductId}/options`, {
        method: 'POST',
        body: JSON.stringify({
          name: newOptionDraft.name, swatchHex: newOptionDraft.swatchHex || null, stockQuantity: newOptionDraft.stockQuantity,
          price: newOptionDraft.price,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        await fetchProducts()
        setNewOptionDraft({ name: '', swatchHex: '', stockQuantity: '', price: addedProduct?.optionsHaveOwnPrices ? String(addedProduct.price) : '' })
        setOptionsManagerStatus(null)
      } else {
        setOptionsManagerStatus({ type: 'error', message: data.error || 'Failed to add option.' })
      }
    } catch {
      setOptionsManagerStatus({ type: 'error', message: 'Failed to add option.' })
    }
  }

  const addBulkOptions = async () => {
    const names = bulkOptionsText.split('\n').map(s => s.trim()).filter(Boolean)
    if (names.length === 0) return
    try {
      const res = await apiFetch(`/api/admin/products/${optionsManagerProductId}/options/bulk`, {
        method: 'POST',
        body: JSON.stringify({ names, startStock: bulkOptionsStartStock }),
      })
      const data = await res.json()
      if (res.ok) {
        await fetchProducts()
        setBulkOptionsText('')
        setBulkOptionsStartStock('')
        setBulkOptionsOpen(false)
        setOptionsManagerStatus({
          type: 'success',
          message: `Added ${data.created.length} option${data.created.length !== 1 ? 's' : ''}.` +
            (data.skipped.length > 0 ? ` Skipped as already there: ${data.skipped.join(', ')}.` : ''),
        })
      } else {
        setOptionsManagerStatus({ type: 'error', message: data.error || 'Failed to add options.' })
      }
    } catch {
      setOptionsManagerStatus({ type: 'error', message: 'Failed to add options.' })
    }
  }

  const updateCustomOption = async (optionId, patch) => {
    try {
      const res = await apiFetch(`/api/admin/products/${optionsManagerProductId}/options/${optionId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (res.ok) {
        await fetchProducts()
      } else {
        setOptionsManagerStatus({ type: 'error', message: data.error || 'Failed to update option.' })
      }
    } catch {
      setOptionsManagerStatus({ type: 'error', message: 'Failed to update option.' })
    }
  }

  const moveCustomOption = async (optionId, direction) => {
    try {
      const res = await apiFetch(`/api/admin/products/${optionsManagerProductId}/options/${optionId}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ direction }),
      })
      if (res.ok) await fetchProducts()
    } catch {}
  }

  // ── Sale pricing ──────────────────────────────────────────────────────────
  const openSaleManager = (product) => {
    setSaleManagerProductId(product.id)
    const options = {}
    const optionList = product.options.length > 0 ? product.options : product.customOptions
    optionList.forEach(o => {
      options[o.id] = { onSale: !!o.onSale, salePrice: o.salePrice != null ? String(o.salePrice) : '' }
    })
    setSaleDraft({
      onSale: !!product.onSale,
      salePrice: product.salePrice != null ? String(product.salePrice) : '',
      options,
    })
    setSaleManagerStatus(null)
  }

  const saveSale = async () => {
    const product = products.find(p => p.id === saleManagerProductId)
    if (!product) return
    const hasAnyOptions = product.options.length > 0 || product.customOptions.length > 0
    const body = hasAnyOptions
      ? { options: Object.entries(saleDraft.options).map(([id, v]) => ({ id: parseInt(id), onSale: v.onSale, salePrice: v.salePrice })) }
      : { onSale: saleDraft.onSale, salePrice: saleDraft.salePrice }
    try {
      const res = await apiFetch(`/api/admin/products/${saleManagerProductId}/sale`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        const refreshed = await fetchProducts()
        setSaleManagerStatus({ type: 'success', message: 'Sale updated.' })
        const updated = refreshed?.find(p => p.id === saleManagerProductId)
        if (updated) openSaleManager(updated)
      } else {
        setSaleManagerStatus({ type: 'error', message: data.error || 'Failed to update sale.' })
      }
    } catch {
      setSaleManagerStatus({ type: 'error', message: 'Failed to update sale.' })
    }
  }

  const endSale = async (product) => {
    await confirmDialog({
      variant: 'neutral',
      title: 'End Sale',
      subject: productSubject(product),
      summary: 'All sale prices on this product will be switched off and customers will see the normal price. Your sale prices are saved, so you can turn them on again later.',
      confirmLabel: 'End this sale',
      busyLabel: 'Ending sale…',
      successMessage: 'Sale ended',
      onConfirm: async () => {
        const res = await apiFetch(`/api/admin/products/${product.id}/sale/end`, { method: 'POST' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to end sale.')
        }
        const refreshed = await fetchProducts()
        if (saleManagerProductId === product.id) {
          const updated = refreshed?.find(p => p.id === product.id)
          if (updated) openSaleManager(updated)
        }
      },
    })
  }

  const deleteProduct = async (product) => {
    await confirmDialog({
      variant: 'danger',
      title: 'Delete Product',
      subject: productSubject(product),
      summary: "This product will be removed from your products list and the shop. Past orders and reports will keep their records. This can't be undone.",
      confirmLabel: 'Delete this product',
      busyLabel: 'Deleting…',
      successMessage: 'Product deleted',
      onConfirm: async () => {
        const res = await apiFetch(`/api/admin/products/${product.id}`, { method: 'DELETE' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to delete product.')
        await fetchProducts()
      },
    })
  }

  const openClass = async (cls) => {
    setSelectedClass(cls)
    setStudentsLoading(true)
    setClassStudents([])
    setShowAddStudent(false)
    setStudentFormError('')
    try {
      const res = await apiFetch(`/api/classes/${cls.id}/students`)
      const data = await res.json()
      if (res.ok && Array.isArray(data)) setClassStudents(data)
    } catch {
      // silent fail
    } finally {
      setStudentsLoading(false)
    }
  }

  // From a calendar day panel - staff can't reach the Training page at all,
  // so this is only ever wired up for owner/sysadmin.
  const goToClassStudents = (classId) => {
    const cls = coursesMerged.find(c => c.id === classId)
    if (!cls) return
    setSelectedCalendarDay(null)
    navigateTo('training')
    openClass(cls)
  }

  const addStudent = async () => {
    if (!newStudent.name.trim() || !newStudent.whatsapp.trim()) {
      setStudentFormError('Name and WhatsApp number are required.')
      return
    }
    setStudentFormError('')
    setStudentSaving(true)
    try {
      const res = await apiFetch(`/api/classes/${selectedClass.id}/students`, {
        method: 'POST',
        body: JSON.stringify(newStudent),
      })
      const data = await res.json()
      if (res.ok) {
        setClassStudents(prev => [data, ...prev])
        setNewStudent({ name: '', whatsapp: '', paymentStatus: 'unpaid', notes: '' })
        setShowAddStudent(false)
      } else {
        setStudentFormError(data.error || 'Failed to add student.')
      }
    } catch {
      setStudentFormError('Failed to add student.')
    } finally {
      setStudentSaving(false)
    }
  }

  const updateStudentPayment = async (studentId, paymentStatus) => {
    try {
      const res = await apiFetch(`/api/classes/${selectedClass.id}/students/${studentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentStatus }),
      })
      if (res.ok) {
        let updatedStudent = null
        setClassStudents(prev => prev.map(s => {
          if (s.id !== studentId) return s
          updatedStudent = { ...s, paymentStatus }
          return updatedStudent
        }))
        // Only a genuine step forward (now paid, or newly has something
        // paid) is worth a "let them know?" prompt - reverting to unpaid
        // isn't a status a customer needs to hear about.
        if (updatedStudent && (paymentStatus === 'paid' || paymentStatus === 'partial')) {
          const course = coursesMerged.find(c => c.id === selectedClass.id)
          promptMessageCustomer('student', updatedStudent, course, `Let ${firstNameOf(updatedStudent.name)} know their payment was received?`)
        }
      }
    } catch {
      // silent fail
    }
  }

  const removeStudent = async (studentId, studentName) => {
    await confirmDialog({
      variant: 'danger',
      title: 'Remove Student',
      subject: { image: null, name: studentName, details: selectedClass ? [{ text: selectedClass.name }] : [] },
      summary: "This student will be permanently removed from this class. This can't be undone.",
      confirmLabel: 'Remove this student',
      busyLabel: 'Removing…',
      successMessage: 'Student removed',
      onConfirm: async () => {
        const res = await apiFetch(`/api/classes/${selectedClass.id}/students/${studentId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to remove student.')
        setClassStudents(prev => prev.filter(s => s.id !== studentId))
      },
    })
  }

  const completeStudent = async (student) => {
    const hasBalance = student.balance > 0
    let completedStudent = null
    const ok = await confirmDialog({
      variant: hasBalance ? 'danger' : 'neutral',
      title: hasBalance ? 'Balance still outstanding' : 'Mark as Finished',
      subject: { image: null, name: student.name, details: selectedClass ? [{ text: selectedClass.name }] : [] },
      summary: hasBalance
        ? `${student.name} still owes R ${student.balance.toFixed(2)}. Her certificate should only be issued once this is paid. Mark the course as finished anyway?`
        : 'This student will move to Past students in this class.',
      confirmLabel: hasBalance ? 'Mark as finished, certificate on hold' : 'Mark as finished',
      busyLabel: 'Marking as finished…',
      successMessage: 'Student marked as finished',
      onConfirm: async () => {
        const res = await apiFetch(`/api/classes/${selectedClass.id}/students/${student.id}/complete`, { method: 'PATCH' })
        if (!res.ok) throw new Error('Failed to mark student as finished.')
        const data = await res.json()
        completedStudent = data
        setClassStudents(prev => prev.map(s => s.id === student.id ? data : s))
      },
    })
    if (ok && completedStudent) {
      const course = coursesMerged.find(c => c.id === selectedClass.id)
      promptMessageCustomer('student', completedStudent, course, `Let ${firstNameOf(student.name)} know they've completed the course?`)
    }
  }

  const reactivateStudent = async (studentId) => {
    try {
      const res = await apiFetch(`/api/classes/${selectedClass.id}/students/${studentId}/reactivate`, { method: 'PATCH' })
      if (res.ok) {
        const data = await res.json()
        setClassStudents(prev => prev.map(s => s.id === studentId ? data : s))
      }
    } catch {
      // silent fail
    }
  }

  // Records a manual payment (EFT, cash, anything outside the Ozow/Payflex
  // gateways) for a student in any class - classId comes from the student
  // itself, not selectedClass, so this also works for a student reached
  // from the Dashboard's reminders card. If this is the payment that
  // clears a held-back certificate, that's reported in the SAME response
  // (unlike a gateway payment, which has no response to react to here) -
  // so the toast shows immediately, not on the next load.
  const savePaymentForStudent = async (student, amount, note) => {
    const res = await apiFetch(`/api/classes/${student.classId}/students/${student.id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount, note }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to record payment.')
    setClassStudents(prev => prev.map(s => s.id === data.student.id ? data.student : s))
    setRecordPaymentFor(null)
    toast('Payment recorded', 'success')
    if (data.certificateJustCleared) showCertificateClearedToast(data.student)
  }

  const fetchPaymentHistory = async (student) => {
    if (paymentHistoryOpenFor === student.id) {
      setPaymentHistoryOpenFor(null)
      return
    }
    setPaymentHistoryOpenFor(student.id)
    try {
      const res = await apiFetch(`/api/classes/${student.classId}/students/${student.id}/payments`)
      const data = await res.json()
      if (res.ok && Array.isArray(data)) setPaymentHistories(prev => ({ ...prev, [student.id]: data }))
    } catch {
      // silent fail - the list just stays empty
    }
  }

  const deletePayment = async (student, payment) => {
    const ok = await confirmDialog({
      variant: 'danger',
      title: 'Remove this payment?',
      subject: { image: null, name: `R ${payment.amount.toFixed(2)}${payment.note ? ` - ${payment.note}` : ''}` },
      summary: `${student.name}'s balance will be recalculated without this payment. If they've already finished the course, this may put their certificate back on hold.`,
      confirmLabel: 'Remove payment',
      busyLabel: 'Removing…',
      successMessage: 'Payment removed',
      onConfirm: async () => {
        const res = await apiFetch(`/api/classes/${student.classId}/students/${student.id}/payments/${payment.id}`, { method: 'DELETE' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to remove payment.')
        setClassStudents(prev => prev.map(s => s.id === data.student.id ? data.student : s))
        setPaymentHistories(prev => ({ ...prev, [student.id]: (prev[student.id] || []).filter(p => p.id !== payment.id) }))
        if (data.certificateJustReHeld) {
          toast(`${student.name}'s certificate is on hold again - balance is now R ${data.student.balance.toFixed(2)}.`, 'prompt')
        }
      },
    })
    return ok
  }

  // Admin-added students never get a public_token until first needed -
  // ensure-token creates one on demand, then both actions below copy from it.
  const copyBalanceLink = async (student) => {
    try {
      const res = await apiFetch(`/api/classes/${selectedClass.id}/students/${student.id}/ensure-token`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.link) return
      await navigator.clipboard.writeText(data.link)
      setLinkCopyStatus(prev => ({ ...prev, [student.id]: 'link' }))
      setTimeout(() => setLinkCopyStatus(prev => ({ ...prev, [student.id]: null })), 2000)
    } catch {
      // silent fail
    }
  }

  // ── Website Content ──────────────────────────────────────────────────────
  const fetchContentHistory = async () => {
    setContentHistoryLoading(true)
    try {
      const res = await apiFetch('/api/admin/site-settings/content/history')
      const data = await res.json()
      if (res.ok && Array.isArray(data)) setContentHistory(data)
    } catch {
      // silent fail
    } finally {
      setContentHistoryLoading(false)
    }
  }

  // path is e.g. "hero.heading" or "contact.phone"
  const updateContentField = (path, value) => {
    const [section, field] = path.split('.')
    setContentDraft(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }))
    setContentFieldErrors(prev => {
      if (!prev[path]) return prev
      const next = { ...prev }
      delete next[path]
      return next
    })
  }

  const saveContent = async () => {
    setContentSaving(true)
    setContentSaveNote('')
    setContentFieldErrors({})
    try {
      const res = await apiFetch('/api/admin/site-settings/content', {
        method: 'PUT',
        body: JSON.stringify(contentDraft),
      })
      const data = await res.json()
      if (res.ok) {
        setContentSaved(data)
        setContentDraft(data)
        setContentSaveNote('Saved. Changes show on the website within about a minute.')
        fetchContentHistory()
      } else if (data.field) {
        setContentFieldErrors({ [data.field.replace(/^content\./, '')]: data.error })
      } else {
        setContentSaveNote(data.error || 'Failed to save changes.')
      }
    } catch {
      setContentSaveNote('Failed to save changes.')
    } finally {
      setContentSaving(false)
    }
  }

  const restoreContentVersion = async (historyId) => {
    setContentSaving(true)
    try {
      const res = await apiFetch(`/api/admin/site-settings/content/restore/${historyId}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setContentSaved(data.value)
        setContentDraft(data.value)
        setContentSaveNote('Restored. Changes show on the website within about a minute.')
        fetchContentHistory()
      } else {
        setContentSaveNote(data.error || 'Failed to restore that version.')
      }
    } catch {
      setContentSaveNote('Failed to restore that version.')
    } finally {
      setContentSaving(false)
      setContentConfirm(null)
    }
  }

  const resetContentToDefaults = async () => {
    setContentSaving(true)
    try {
      const res = await apiFetch('/api/admin/site-settings/content/reset', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setContentSaved(data.value)
        setContentDraft(data.value)
        setContentSaveNote('Reset to defaults. Changes show on the website within about a minute.')
        fetchContentHistory()
      } else {
        setContentSaveNote(data.error || 'Failed to reset to defaults.')
      }
    } catch {
      setContentSaveNote('Failed to reset to defaults.')
    } finally {
      setContentSaving(false)
      setContentConfirm(null)
    }
  }

  // Intercepts sidebar navigation away from an unsaved Website Content page -
  // goes through the in-page confirmation below rather than switching pages
  // straight away. Pushes a new history entry (not replace) so back/forward
  // steps between pages the same way clicking the sidebar does.
  const navigateTo = (value) => {
    if (activePage === 'content' && contentDirty && value !== 'content') {
      setContentConfirm({ type: 'leave', target: value })
      return
    }
    const path = pathForPage(value)
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path)
    }
    setActivePage(value)
    setMobileNavOpen(false)
  }

  // Back/forward moves between pages - re-derive both the page and its
  // sub-state from whatever URL the browser just navigated to.
  useEffect(() => {
    const handlePopState = () => {
      const page = pageForPath(window.location.pathname, user?.role)
      setActivePage(page)
      const params = new URLSearchParams(window.location.search)
      if (page === 'images') setImageTab(params.get('tab') || 'products')
      if (page === 'notifications') setNotifTab(params.get('tab') || 'all')
      if (page === 'orders') setOrdersView(params.get('view') || 'active')
      if (page === 'preorders') setPreordersTab(params.get('tab') || 'customers')
      if (page === 'products' || page === 'images') {
        setProductsSearch(params.get('q') || '')
        setProductsOpenSections(params.has('open') ? new Set(params.get('open').split(',').filter(Boolean)) : new Set())
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [user?.role])

  // An unknown path (typo'd, or a bookmark to a page this role can no
  // longer see) already renders Dashboard - this just tidies the address
  // bar to match, once, rather than leaving it pointed at a path that
  // isn't really what's showing.
  useEffect(() => {
    if (!Object.prototype.hasOwnProperty.call(PATH_TO_PAGE, window.location.pathname)) {
      window.history.replaceState(null, '', '/')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tab title per section, e.g. "Products · Hair By Her Admin".
  useEffect(() => {
    document.title = `${PAGE_TITLES[activePage] || 'Dashboard'} · Hair By Her Admin`
  }, [activePage])

  // Keeps each page's own cheap sub-state (filter/tab) in the query string,
  // replacing rather than pushing a new history entry, so switching tabs
  // within a page doesn't clutter the back button - only navigating to a
  // different page does that (see navigateTo above).
  useEffect(() => {
    if (activePage !== 'images') return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', imageTab)
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [activePage, imageTab])

  useEffect(() => {
    if (activePage !== 'notifications') return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', notifTab)
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [activePage, notifTab])

  useEffect(() => {
    if (activePage !== 'orders') return
    const url = new URL(window.location.href)
    url.searchParams.set('view', ordersView)
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [activePage, ordersView])

  useEffect(() => {
    if (activePage !== 'preorders') return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', preordersTab)
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [activePage, preordersTab])

  const changeBusinessPassword = async () => {
    setBPwMsg('')
    if (bPwNew !== bPwConfirm) { setBPwMsg('Passwords do not match.'); return }
    if (bPwNew.length < 6) { setBPwMsg('Password must be at least 6 characters.'); return }
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: bPwCurrent, new_password: bPwNew }),
      })
      const data = await res.json()
      if (res.ok) {
        setBPwMsg('Password changed successfully.')
        setBPwCurrent(''); setBPwNew(''); setBPwConfirm('')
      } else {
        setBPwMsg(data.error || 'Failed to change password.')
      }
    } catch { setBPwMsg('Failed to change password.') }
  }

  const createStaffUser = async () => {
    setStaffCreateMsg('')
    if (!newStaffUser.username.trim() || !newStaffUser.password.trim()) {
      setStaffCreateMsg('Username and password are required.')
      return
    }
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newStaffUser.username.trim(),
          password: newStaffUser.password,
          role_name: 'staff',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setStaffCreateMsg(`Staff user "${newStaffUser.username}" created successfully.`)
        setNewStaffUser({ username: '', password: '' })
      } else {
        setStaffCreateMsg(data.error || 'Failed to create user.')
      }
    } catch { setStaffCreateMsg('Failed to create user.') }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;600;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Lato', sans-serif; background: #FAF6F4; color: #1A1A1A; }

        /* Cards */
        .admin-card {
          border-radius: 12px;
          border: none;
          padding: 18px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 10px;
          box-shadow: 0 2px 6px rgba(44,20,28,0.07);
          transition: box-shadow 0.15s, transform 0.15s;
        }

        .admin-card:hover {
          box-shadow: 0 4px 14px rgba(44,20,28,0.12);
          transform: translateY(-1px);
        }

        /* Card image */
        .card-img {
          width: 88px;
          height: 88px;
          border-radius: 10px;
          background: #F4F4F5;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          color: #BBBBBB;
          font-style: italic;
          overflow: hidden;
          border: 1px solid #EEEEEE;
        }

        .card-img img {
          width: 88px;
          height: 88px;
          border-radius: 10px;
          object-fit: cover;
        }

        /* Buttons */
        .upload-btn {
          background: #C47A8A;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 9px 18px;
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
          font-weight: 600;
          white-space: nowrap;
          transition: background 0.15s;
        }

        .upload-btn:hover { background: #A0566A; }

        .secondary-btn {
          background: #F7EEF0;
          color: #8C5A6A;
          border: 1px solid #EDD5DB;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
          font-weight: 600;
          transition: background 0.15s;
        }

        .secondary-btn:hover { background: #EDD5DB; }

        /* Status messages */
        .success-msg {
          font-size: 12px;
          color: #4CAF50;
          margin-top: 6px;
          font-weight: 600;
        }

        .error-msg {
          font-size: 12px;
          color: #E57373;
          margin-top: 6px;
        }

        /* File input hidden */
        input[type="file"] { display: none; }

        /* Section label above inputs */
        .field-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.2px;
          color: #888888;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        /* Adjust controls */
        .adjust-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          margin-left: 6px;
        }

        .adjust-row {
          display: flex;
          gap: 2px;
        }

        .adj-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid #E8E8E8;
          background: #F9F9F9;
          color: #666666;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          line-height: 1;
          transition: all 0.15s;
        }

        .adj-btn:hover {
          background: #C47A8A;
          color: white;
          border-color: #C47A8A;
        }

        /* Order card header hover */
        .order-card-header:hover { background: #FAFAFA !important; }

        .pos-label {
          font-size: 10px;
          color: #AAAAAA;
          text-align: center;
          margin-top: 2px;
          font-family: monospace;
        }

        /* Category input row */
        .category-input-row {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 16px;
        }

        .category-input {
          flex: 1;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #EDD5DB;
          font-size: 14px;
          font-family: inherit;
          color: #2C1A20;
          background: #FFFFFF;
          outline: none;
        }

        .category-input:focus { border-color: #C47A8A; box-shadow: 0 0 0 3px rgba(196,122,138,0.15); }

        /* Category list */
        .category-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 24px;
        }

        .category-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #F5F2EE;
          border: none;
          border-radius: 12px;
          padding: 14px 18px;
          box-shadow: 0 2px 6px rgba(44,20,28,0.06);
          transition: box-shadow 0.15s;
        }

        .category-item:hover {
          box-shadow: 0 4px 12px rgba(44,20,28,0.10);
        }

        .category-name {
          font-size: 15px;
          font-weight: 700;
          color: #2C1A20;
        }

        .category-count {
          font-size: 12px;
          color: #9A8A8E;
          margin-top: 3px;
        }

        .delete-btn {
          background: none;
          border: 1px solid #E8E8E8;
          color: #BBBBBB;
          border-radius: 6px;
          padding: 7px 14px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
          font-weight: 500;
          transition: all 0.15s;
        }

        .delete-btn:hover {
          border-color: #E57373;
          color: #E57373;
          background: #FFF5F5;
        }

        /* Category select */
        .category-select {
          border: 1px solid #EDD5DB;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 12px;
          font-family: inherit;
          color: #2C1A20;
          background: white;
          cursor: pointer;
          outline: none;
          margin-top: 4px;
        }

        .category-select:focus { border-color: #C47A8A; }

        /* Class detail / students */
        .back-btn {
          background: none;
          border: none;
          color: #C47A8A;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          padding: 0;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 0.3px;
        }

        .back-btn:hover { color: #A0566A; }

        .scope-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }

        .scope-card {
          background: #F7EEF0;
          border-radius: 10px;
          padding: 16px;
        }

        .scope-card-title {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.5px;
          color: #C47A8A;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .scope-item {
          font-size: 13px;
          color: #5A4A50;
          line-height: 1.8;
          padding-left: 10px;
          position: relative;
        }

        .scope-item::before {
          content: '-';
          position: absolute;
          left: 0;
          color: #C47A8A;
        }

        .student-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 0;
          border-bottom: 1px solid #F7EEF0;
          gap: 12px;
        }

        .student-row:last-child { border-bottom: none; }

        .payment-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          white-space: nowrap;
        }

        .payment-paid    { background: #E8F5E9; color: #2E7D32; }
        .payment-partial { background: #FFF3E0; color: #E65100; }
        .payment-unpaid  { background: #FDE8EC; color: #C47A8A; }

        /* Gallery grid */
        .gallery-grid-admin {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .gallery-tile {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          background: #EDD5DB;
          aspect-ratio: 1;
          box-shadow: 0 2px 8px rgba(44,20,28,0.08);
          transition: box-shadow 0.15s, transform 0.15s;
          border: none;
        }

        .gallery-tile:hover {
          box-shadow: 0 4px 16px rgba(44,20,28,0.14);
          transform: translateY(-1px);
        }

        .gallery-tile img,
        .gallery-tile video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .gallery-tile-remove {
          position: absolute;
          top: 6px;
          right: 6px;
          background: rgba(44,20,28,0.65);
          color: #FFFFFF;
          border: none;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.3px;
        }

        .gallery-tile-remove:hover {
          background: #C47A8A;
        }

        .gallery-tile-remove:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Tab section heading */
        .section-heading {
          font-size: 11px;
          font-weight: 700;
          color: #8C5A6A;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 16px;
          padding: 10px 14px;
          background: #EDD5DB;
          border-radius: 8px;
        }

        /* Dashboard stats cards */
        .stat-card {
          background: white;
          border-radius: 12px;
          border: none;
          padding: 22px 24px;
          box-shadow: 0 2px 8px rgba(44,20,28,0.10);
          transition: box-shadow 0.15s, transform 0.15s;
        }

        .stat-card:hover {
          box-shadow: 0 4px 16px rgba(44,20,28,0.15);
          transform: translateY(-1px);
        }

        .stat-value {
          font-size: 30px;
          font-weight: 700;
          line-height: 1;
          margin-bottom: 6px;
          letter-spacing: -0.5px;
        }

        .stat-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          font-weight: 600;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 24px;
          margin-bottom: 24px;
        }

        .dashboard-wide {
          grid-column: 1 / -1;
        }

        .panel {
          background: #FFFFFF;
          border-radius: 12px;
          border: none;
          padding: 0;
          box-shadow: 0 2px 8px rgba(44,20,28,0.08);
          overflow: hidden;
        }

        .panel-heading {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.3px;
          padding: 14px 20px;
          border-bottom: none;
          margin-bottom: 0;
        }

        /* Orders table */
        .orders-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .orders-table th {
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          color: #5A4A50;
          text-transform: uppercase;
          letter-spacing: 1px;
          padding: 0 0 10px 0;
          border-bottom: 1px solid #D5E8DC;
        }

        .orders-table td {
          padding: 10px 0;
          border-bottom: 1px solid #EEF6F1;
          color: #2C1A20;
          vertical-align: middle;
          font-size: 13px;
        }

        .orders-table tbody tr:hover { background: #FAFAFA; cursor: pointer; }

        .status-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          background: #FFF3E0;
          color: #E65100;
        }

        .status-badge.confirmed {
          background: #E8F5E9;
          color: #2E7D32;
        }

        /* Calendar shell */
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }

        .cal-day-label {
          font-size: 11px;
          font-weight: 700;
          color: #AAAAAA;
          text-align: center;
          padding: 4px 0;
          text-transform: uppercase;
        }

        .cal-day {
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          font-size: 13px;
          color: #444444;
          border-radius: 6px;
          cursor: default;
          position: relative;
        }

        .cal-day.today {
          background: #C47A8A;
          color: white;
          font-weight: 700;
        }

        .cal-day.other-month {
          color: #DDDDDD;
        }

        .cal-day.closed {
          background: #F7F2F0;
        }

        .cal-day.today.closed {
          background: #C47A8A;
        }

        .cal-day.has-items {
          cursor: pointer;
        }

        .cal-day.has-items:hover {
          outline: 1px solid #C47A8A;
        }

        .cal-day-dots {
          display: flex;
          align-items: center;
          gap: 2px;
          height: 6px;
        }

        .cal-day-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .cal-day-extra {
          font-size: 8px;
          font-weight: 700;
          color: #8C5A6A;
          line-height: 1;
        }

        .cal-day.today .cal-day-extra {
          color: white;
        }

        .cal-nav-btn {
          background: rgba(255,255,255,0.15);
          border: none;
          color: #FFFFFF;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          font-family: inherit;
        }

        .cal-nav-btn:hover {
          background: rgba(255,255,255,0.28);
        }

        .cal-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 14px;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid #F7EEF0;
        }

        .cal-legend-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: #9A8A8E;
        }

        .cal-legend-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .cal-legend-swatch {
          width: 10px;
          height: 10px;
          border-radius: 2px;
          background: #F7F2F0;
          flex-shrink: 0;
        }

        .cal-day-panel {
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid #F7EEF0;
        }

        @media (max-width: 480px) {
          .cal-day-dot { width: 4px; height: 4px; }
          .cal-day-dots { gap: 1px; }
          .cal-legend { gap: 8px 10px; }
        }

        /* Notification items */
        .notif-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 24px;
          border-bottom: 1px solid #F7EEF0;
        }

        .notif-item.unread {
          background: #FDF0F3;
          border-left: 3px solid #C47A8A;
        }

        .notif-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #C47A8A;
          flex-shrink: 0;
          margin-top: 5px;
        }

        .notif-dot.read {
          background: #E0E0E0;
        }

        .notif-type-badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 3px;
        }

        .notif-type-order    { background: #FFF3E0; color: #E65100; }
        .notif-type-image    { background: #E3F2FD; color: #1565C0; }
        .notif-type-section  { background: #F3E5F5; color: #6A1B9A; }
        .notif-type-system   { background: #E8F5E9; color: #2E7D32; }
        .notif-type-stock    { background: #FDE8EC; color: #A23F51; }

        .notif-title {
          font-size: 13px;
          font-weight: 600;
          color: #1A1A1A;
          margin-bottom: 2px;
        }

        .notif-message {
          font-size: 12px;
          color: #888888;
          line-height: 1.5;
        }

        .notif-time {
          font-size: 11px;
          color: #BBBBBB;
          margin-top: 3px;
        }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          .admin-hamburger { display: flex !important; }
          .admin-nav-close { display: block !important; }

          .admin-nav-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(44,20,28,0.5);
            z-index: 99;
          }

          .admin-sidebar {
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            z-index: 200 !important;
            box-shadow: 4px 0 24px rgba(44,20,28,0.25);
          }

          .admin-sidebar.open {
            transform: translateX(0);
          }

          .admin-main { margin-left: 0 !important; }
          .admin-topbar { padding: 0 16px !important; }
          .admin-content { padding: 16px !important; }

          .admin-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .dashboard-grid { grid-template-columns: 1fr !important; }
          .admin-form-grid { grid-template-columns: 1fr !important; }

          .admin-card {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .admin-card .card-img {
            width: 100% !important;
            height: 160px !important;
          }
          .admin-card .card-img img {
            width: 100% !important;
            height: 160px !important;
          }
          .admin-card > div:last-child {
            flex-direction: row !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            width: 100% !important;
          }

          .category-input-row {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .order-card-header {
            flex-wrap: wrap !important;
            gap: 10px !important;
          }

          .scope-grid { grid-template-columns: 1fr !important; }

          .student-row {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          .student-row > div:last-child {
            flex-wrap: wrap !important;
            width: 100% !important;
          }
        }

      `}</style>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#FAF6F4', fontFamily: "'Lato', sans-serif" }}>

        {/* MOBILE NAV OVERLAY */}
        {mobileNavOpen && (
          <div
            className="admin-nav-overlay"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* SIDEBAR */}
        <div className={`admin-sidebar${mobileNavOpen ? ' open' : ''}`} style={{ position: 'fixed', top: 0, left: 0, width: 240, height: '100vh', background: '#2C1A20', display: 'flex', flexDirection: 'column', zIndex: 100, overflowY: 'auto' }}>

          {/* Logo */}
          <div style={{ padding: '24px 20px', borderBottom: '1px solid #3E2A30', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <img src="/logo.png" alt="Hair By Her" style={{ height: 48, width: 'auto', objectFit: 'contain', display: 'block', mixBlendMode: 'lighten' }} />
              <div style={{ fontSize: 11, color: '#888888', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 8 }}>Admin Dashboard</div>
            </div>
            <button
              className="admin-nav-close"
              onClick={() => setMobileNavOpen(false)}
              style={{ background: 'none', border: 'none', color: '#C4A0A8', fontSize: 22, cursor: 'pointer', display: 'none', lineHeight: 1 }}
            >
              x
            </button>
          </div>

          {/* Nav */}
          <nav style={{ padding: '16px 12px', flex: 1 }}>
            {[
              { label: 'Dashboard', value: 'dashboard' },
              ...(user?.role !== 'staff' ? [
                { label: 'Products', value: 'products' },
                { label: 'Image Management', value: 'images' },
                { label: 'Lash Training', value: 'training' },
                { label: 'Website Content', value: 'content' },
                { label: 'Pre-orders', value: 'preorders' },
              ] : []),
              { label: 'Orders', value: 'orders' },
              { label: 'Notifications', value: 'notifications' },
              { label: 'Settings', value: 'settings' },
            ].map(item => (
              <button
                key={item.value}
                onClick={() => navigateTo(item.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: activePage === item.value ? '#3E2A30' : 'transparent',
                  color: activePage === item.value ? '#FFFFFF' : '#C4A0A8',
                  fontSize: 14,
                  fontWeight: activePage === item.value ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginBottom: 4,
                  fontFamily: 'inherit',
                  position: 'relative',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {activePage === item.value && (
                  <span style={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 20,
                    background: '#C47A8A',
                    borderRadius: 2,
                  }} />
                )}
                <span style={{ marginLeft: activePage === item.value ? 10 : 0 }}>{item.label}</span>
                {item.value === 'notifications' && unreadCount > 0 && (
                  <span style={{
                    background: '#C47A8A',
                    color: 'white',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 10,
                    fontWeight: 700,
                    marginLeft: 8,
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Sidebar footer */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #3E2A30', fontSize: 11, color: '#9A7A80', lineHeight: 1.6 }}>
            <div style={{ fontSize: 12, color: '#C4A0A8', marginBottom: 4 }}>
              Signed in as <strong style={{ color: '#EDD5DB' }}>{user?.username || 'Admin'}</strong>
            </div>
            <div style={{ fontSize: 11, color: '#9A7A80', marginBottom: 10 }}>
              {user?.role || ''}
            </div>
            <button
              onClick={onLogout}
              style={{
                background: 'none',
                border: '1px solid #3E2A30',
                color: '#C4A0A8',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                width: '100%',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="admin-main" style={{ marginLeft: 240, flex: 1, minHeight: '100vh', background: '#FAF6F4' }}>

          {/* Top bar */}
          <div className="admin-topbar" style={{ background: '#2C1A20', borderBottom: 'none', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 8px rgba(44,20,28,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                className="admin-hamburger"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open menu"
                style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexDirection: 'column', gap: 4 }}
              >
                <span style={{ width: 20, height: 2, background: '#FFFFFF', borderRadius: 2 }} />
                <span style={{ width: 20, height: 2, background: '#FFFFFF', borderRadius: 2 }} />
                <span style={{ width: 20, height: 2, background: '#FFFFFF', borderRadius: 2 }} />
              </button>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.3px' }}>
                {{ dashboard: 'Dashboard', products: 'Products', images: 'Image Management', training: 'Lash Training', preorders: 'Pre-orders', orders: 'Orders', notifications: 'Notifications', settings: 'Settings' }[activePage]}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {user?.role === 'staff' ? 'Staff View' : (
                { dashboard: 'Overview', products: `${categories.length} sections`, images: imageTab === 'products' ? '4 products' : imageTab === 'classes' ? '3 classes' : `${galleryImages.length} files`, training: '3 classes', preorders: preorderGroups.length ? `${preorderGroups.length} product${preorderGroups.length !== 1 ? 's' : ''}` : 'No pre-orders', orders: `${orders.length} order${orders.length !== 1 ? 's' : ''}`, notifications: `${unreadCount} unread`, settings: 'Account' }[activePage]
              )}
            </div>
          </div>

          {showTestDataEnabled && (
            <div style={{ background: '#9E9E9E', color: 'white', textAlign: 'center', padding: '6px 12px', fontSize: 12, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
              Test data is showing
            </div>
          )}

          {/* Content */}
          <div className="admin-content" style={{ padding: 32, maxWidth: 1200 }}>

            {activePage === 'dashboard' && (() => {
              const today = new Date()
              const hour = today.getHours()
              const timeGreeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening'
              const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
              const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

              // The calendar grid shows this month (today + the nav offset);
              // "today" markers below still compare against the real date.
              const viewedDate = new Date(today.getFullYear(), today.getMonth() + calendarMonthOffset, 1)
              const year = viewedDate.getFullYear()
              const month = viewedDate.getMonth()
              const isViewingCurrentMonth = year === today.getFullYear() && month === today.getMonth()
              const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
              const monthData = calendarCache[monthKey]
              const monthStudents = (monthData && monthData !== 'loading') ? monthData.students : []
              const monthOrders = (monthData && monthData !== 'loading') ? monthData.orders : []
              const monthPreorders = (monthData && monthData !== 'loading') ? (monthData.preorders || []) : []

              // Build calendar days
              const firstDay = new Date(year, month, 1).getDay()
              const daysInMonth = new Date(year, month + 1, 0).getDate()
              const daysInPrevMonth = new Date(year, month, 0).getDate()

              // Group this month's training starts and orders by day number,
              // so each grid cell can show its own dots without re-scanning
              // the full list 42 times.
              const studentsByDay = {}
              monthStudents.forEach(s => {
                if (!s.preferredStartDate) return
                const day = new Date(s.preferredStartDate).getDate()
                ;(studentsByDay[day] = studentsByDay[day] || []).push(s)
              })
              const ordersByDay = {}
              monthOrders.forEach(o => {
                const day = new Date(o.createdAt).getDate()
                ;(ordersByDay[day] = ordersByDay[day] || []).push(o)
              })
              const preordersByDay = {}
              monthPreorders.forEach(p => {
                if (!p.promisedByDate) return
                const day = new Date(p.promisedByDate).getDate()
                ;(preordersByDay[day] = preordersByDay[day] || []).push(p)
              })
              const itemsForDay = (day) => [
                ...(studentsByDay[day] || []).map(s => ({ kind: 'student', data: s })),
                ...(ordersByDay[day] || []).map(o => ({ kind: 'order', data: o })),
                ...(preordersByDay[day] || []).map(p => ({ kind: 'preorder', data: p })),
              ]
              const dotColor = (item) => item.kind === 'student'
                ? (item.data.hasBalance ? '#C47A8A' : '#7A9E8A')
                : item.kind === 'preorder' ? '#6A1B9A'
                : (item.data.needsConfirmation ? '#E65100' : '#8C5A6A')

              const calDays = []
              // Previous month padding
              for (let i = firstDay - 1; i >= 0; i--) {
                calDays.push({ day: daysInPrevMonth - i, current: false })
              }
              // Current month
              for (let i = 1; i <= daysInMonth; i++) {
                calDays.push({ day: i, current: true, isToday: isViewingCurrentMonth && i === today.getDate(), items: itemsForDay(i) })
              }
              // Next month padding
              const remaining = 42 - calDays.length
              for (let i = 1; i <= remaining; i++) {
                calDays.push({ day: i, current: false })
              }

              // "Coming up": the next 14 days of training starts, regardless
              // of which month the grid above is showing, plus every paid
              // order still awaiting confirmation, however old.
              const in14 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14)
              const todayYmd = today.toLocaleDateString('en-CA')
              const in14Ymd = in14.toLocaleDateString('en-CA')
              const in14Key = `${in14.getFullYear()}-${String(in14.getMonth() + 1).padStart(2, '0')}`
              const in14Data = calendarCache[in14Key]
              const in14Students = (in14Data && in14Data !== 'loading') ? in14Data.students : []
              const upcomingStudentsSource = in14Key === monthKey ? monthStudents : [...monthStudents, ...in14Students]
              const upcomingStudents = upcomingStudentsSource
                .filter(s => {
                  if (!s.preferredStartDate) return false
                  const ymd = new Date(s.preferredStartDate).toLocaleDateString('en-CA')
                  return ymd >= todayYmd && ymd <= in14Ymd
                })
                .sort((a, b) => new Date(a.preferredStartDate) - new Date(b.preferredStartDate))
              const unconfirmedPaidOrders = orders
                .filter(o => o.paymentStatus === 'paid' && o.status !== 'confirmed')
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

              const totalRevenue = orders
                .filter(o => o.status === 'confirmed')
                .reduce((sum, o) => sum + orderRevenue(o), 0)
              const totalOrders = orders.length

              const statCards = [
                {
                  label: 'Total Orders',
                  value: totalOrders,
                  bg: '#C47A8A',
                  textColor: '#FFFFFF',
                  labelColor: 'rgba(255,255,255,0.75)',
                },
                {
                  label: 'Revenue',
                  value: `R ${Number(totalRevenue).toLocaleString('en-ZA')}`,
                  bg: '#8C5A6A',
                  textColor: '#FFFFFF',
                  labelColor: 'rgba(255,255,255,0.75)',
                },
                {
                  label: 'Sections',
                  value: categories.length,
                  bg: '#7A9E8A',
                  textColor: '#FFFFFF',
                  labelColor: 'rgba(255,255,255,0.75)',
                },
                {
                  label: 'Gallery Files',
                  value: galleryImages.length,
                  bg: '#C4A882',
                  textColor: '#FFFFFF',
                  labelColor: 'rgba(255,255,255,0.75)',
                },
                ...(user?.role !== 'staff' ? [{
                  label: 'Pre-order Deposits',
                  value: `R ${preorderGroups.reduce((sum, g) => sum + g.preorders.reduce(
                    (s, p) => s + (p.status !== 'awaiting_deposit' ? p.deposit : 0), 0
                  ), 0).toLocaleString('en-ZA')}`,
                  bg: '#9E5A6A',
                  textColor: '#FFFFFF',
                  labelColor: 'rgba(255,255,255,0.75)',
                }] : []),
              ]

              return (
                <div>
                  {/* Welcome banner */}
                  <div style={{
                    background: 'linear-gradient(135deg, #C47A8A 0%, #2C1A20 100%)',
                    borderRadius: 14,
                    padding: '24px 28px',
                    marginBottom: 24,
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{timeGreeting}, {user?.username || 'there'}</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                        {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                    <img src="/logo.png" alt="Hair By Her" style={{ height: 52, width: 'auto', mixBlendMode: 'lighten', opacity: 0.6 }} />
                  </div>

                  {/* Stats row */}
                  <div className="admin-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
                    {statCards.map(stat => (
                      <div
                        key={stat.label}
                        className="stat-card"
                        style={{
                          background: stat.bg,
                        }}
                      >
                        <div className="stat-value" style={{ color: stat.textColor }}>
                          {stat.value}
                        </div>
                        <div className="stat-label" style={{ color: stat.labelColor }}>
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Revenue chart */}
                  <div className="panel" style={{ marginBottom: 24 }}>
                    <div className="panel-heading" style={{ background: '#C47A8A', color: '#FFFFFF', borderRadius: '12px 12px 0 0' }}>Monthly Revenue (R)</div>
                    <div style={{ padding: '0 20px 20px 20px' }}>
                      {revenueData.every(d => d.revenue === 0) ? (
                        <div style={{ fontSize: 13, color: '#AAAAAA', textAlign: 'center', padding: '32px 0' }}>
                          No order data yet. Revenue will appear here once orders are placed.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={revenueData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#EDD5DB" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5A4A50', fontWeight: 600 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: '#5A4A50', fontWeight: 600 }} axisLine={false} tickLine={false} />
                            <Tooltip
                              contentStyle={{ border: '1px solid #E8E8E8', borderRadius: 8, fontSize: 12 }}
                              formatter={(value) => [`R ${Number(value).toLocaleString('en-ZA')}`, 'Revenue']}
                            />
                            <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                              {revenueData.map((entry, index) => (
                                <Cell
                                  key={index}
                                  fill={index === today.getMonth() ? '#C47A8A' : '#F2D0D8'}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Two column — recent orders + calendar */}
                  <div className="dashboard-grid">
                    {/* Recent orders */}
                    <div className="panel">
                      <div className="panel-heading" style={{ background: '#7A9E8A', color: '#FFFFFF', borderRadius: '12px 12px 0 0' }}>Recent Orders</div>
                      <div style={{ padding: '0 20px 20px 20px', overflowX: 'auto' }}>
                        {recentOrders.length === 0 ? (
                          <div style={{ fontSize: 13, color: '#AAAAAA', padding: '16px 0' }}>
                            No orders yet.
                          </div>
                        ) : (
                          <table className="orders-table">
                            <thead>
                              <tr>
                                <th>Customer</th>
                                <th>Items</th>
                                <th>Total</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentOrders.map(order => (
                                <tr
                                  key={order.id}
                                  onClick={() => navigateTo('orders')}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <td style={{ fontWeight: 600 }}>{order.customerName}</td>
                                  <td style={{ color: '#888888' }}>{order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''}</td>
                                  <td style={{ fontWeight: 600, color: '#C47A8A' }}>R {order.total}</td>
                                  <td>
                                    <span className={`status-badge${order.status === 'confirmed' ? ' confirmed' : ''}`}>
                                      {order.status || 'pending'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* Calendar */}
                    <div className="panel">
                      <div className="panel-heading" style={{ background: '#8C5A6A', color: '#FFFFFF', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div>
                          <div>{monthNames[month]} {year}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 400 }}>Business calendar</div>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button className="cal-nav-btn" onClick={() => setCalendarMonthOffset(prev => prev - 1)} aria-label="Previous month">&lsaquo;</button>
                          <button className="cal-nav-btn" onClick={() => setCalendarMonthOffset(0)}>Today</button>
                          <button className="cal-nav-btn" onClick={() => setCalendarMonthOffset(prev => prev + 1)} aria-label="Next month">&rsaquo;</button>
                        </div>
                      </div>
                      <div style={{ padding: '0 20px 20px 20px' }}>
                        <div className="calendar-grid">
                          {dayNames.map(d => (
                            <div key={d} className="cal-day-label">{d}</div>
                          ))}
                          {calDays.map((d, i) => {
                            const closed = i % 7 === 0 || i % 7 === 1
                            const items = d.current ? (d.items || []) : []
                            const visibleDots = items.slice(0, 3)
                            const extra = items.length - visibleDots.length
                            return (
                              <div
                                key={i}
                                className={[
                                  'cal-day',
                                  !d.current ? 'other-month' : '',
                                  d.isToday ? 'today' : '',
                                  d.current && closed ? 'closed' : '',
                                  items.length > 0 ? 'has-items' : '',
                                ].join(' ').trim()}
                                onClick={() => {
                                  if (items.length === 0) return
                                  setSelectedCalendarDay(prev => prev === d.day ? null : d.day)
                                }}
                              >
                                <span>{d.day}</span>
                                {visibleDots.length > 0 && (
                                  <div className="cal-day-dots">
                                    {visibleDots.map((item, idx) => (
                                      <span key={idx} className="cal-day-dot" style={{ background: dotColor(item) }} />
                                    ))}
                                    {extra > 0 && <span className="cal-day-extra">+{extra}</span>}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        <div className="cal-legend">
                          <span className="cal-legend-item"><span className="cal-legend-dot" style={{ background: '#7A9E8A' }} />Training</span>
                          <span className="cal-legend-item"><span className="cal-legend-dot" style={{ background: '#C47A8A' }} />Training, balance due</span>
                          <span className="cal-legend-item"><span className="cal-legend-dot" style={{ background: '#8C5A6A' }} />Order placed</span>
                          <span className="cal-legend-item"><span className="cal-legend-dot" style={{ background: '#E65100' }} />Paid, needs confirming</span>
                          <span className="cal-legend-item"><span className="cal-legend-swatch" />Closed (Sun/Mon)</span>
                        </div>

                        {selectedCalendarDay && (() => {
                          const items = itemsForDay(selectedCalendarDay)
                          const dayLabel = new Date(year, month, selectedCalendarDay)
                            .toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })
                          return (
                            <div className="cal-day-panel">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#2C1A20' }}>{dayLabel}</div>
                                <button
                                  onClick={() => setSelectedCalendarDay(null)}
                                  style={{ background: 'none', border: 'none', color: '#9A8A8E', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                                  aria-label="Close"
                                >
                                  x
                                </button>
                              </div>
                              {items.map((item, idx) => item.kind === 'preorder' ? (
                                <div
                                  key={`p-${idx}`}
                                  onClick={() => { setSelectedCalendarDay(null); navigateTo('preorders') }}
                                  style={{ padding: '8px 0', borderBottom: '1px solid #F7EEF0', cursor: 'pointer' }}
                                >
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#2C1A20' }}>{item.data.productName}</div>
                                  <div style={{ fontSize: 12, color: '#9A8A8E' }}>
                                    {item.data.customerName} - ready by this date ({item.data.status.replace(/_/g, ' ')})
                                  </div>
                                </div>
                              ) : item.kind === 'student' ? (
                                <div
                                  key={`s-${idx}`}
                                  onClick={user?.role !== 'staff' ? () => goToClassStudents(item.data.classId) : undefined}
                                  style={{ padding: '8px 0', borderBottom: '1px solid #F7EEF0', cursor: user?.role !== 'staff' ? 'pointer' : 'default' }}
                                >
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#2C1A20' }}>{item.data.name}</div>
                                  <div style={{ fontSize: 12, color: '#9A8A8E' }}>
                                    {item.data.courseName || 'Training'}
                                    {' - '}
                                    {item.data.balance != null
                                      ? `Balance R${item.data.balance.toFixed(2)}`
                                      : (item.data.hasBalance ? 'Balance due' : 'Paid in full')}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  key={`o-${idx}`}
                                  onClick={() => { setSelectedCalendarDay(null); navigateTo('orders') }}
                                  style={{ padding: '8px 0', borderBottom: '1px solid #F7EEF0', cursor: 'pointer' }}
                                >
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#2C1A20' }}>{item.data.customerName}</div>
                                  <div style={{ fontSize: 12, color: '#9A8A8E' }}>
                                    R {item.data.total.toFixed(2)}{item.data.needsConfirmation ? ' - paid, needs confirming' : ''}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Coming up - training starts in the next 14 days, plus
                      any paid order still waiting to be confirmed */}
                  <div className="panel" style={{ marginBottom: 24 }}>
                    <div className="panel-heading" style={{ background: '#7A9E8A', color: '#FFFFFF', borderRadius: '12px 12px 0 0' }}>
                      Coming Up
                    </div>
                    <div style={{ padding: '0 20px 20px 20px' }}>
                      {upcomingStudents.length === 0 && unconfirmedPaidOrders.length === 0 && (
                        <div style={{ fontSize: 13, color: '#AAAAAA', padding: '12px 0' }}>Nothing coming up right now.</div>
                      )}
                      {upcomingStudents.map(s => (
                        <div
                          key={`up-s-${s.id}`}
                          onClick={user?.role !== 'staff' ? () => goToClassStudents(s.classId) : undefined}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F9F9F9', cursor: user?.role !== 'staff' ? 'pointer' : 'default' }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{s.name}</div>
                            <div style={{ fontSize: 12, color: '#AAAAAA' }}>
                              {s.courseName || 'Training'} starts {new Date(s.preferredStartDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: s.hasBalance ? '#C47A8A' : '#7A9E8A' }}>
                            {s.balance != null ? `R${s.balance.toFixed(2)}` : (s.hasBalance ? 'Balance due' : 'Paid in full')}
                          </div>
                        </div>
                      ))}
                      {unconfirmedPaidOrders.map(o => (
                        <div
                          key={`up-o-${o.id}`}
                          onClick={() => navigateTo('orders')}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F9F9F9', cursor: 'pointer' }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{o.customerName}</div>
                            <div style={{ fontSize: 12, color: '#E65100' }}>Paid, needs confirming - placed {new Date(o.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#C47A8A' }}>R {o.total.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Reminders Due - owner-only, like the balance figures
                      already hidden from staff elsewhere on this page */}
                  {user?.role === 'owner' && (
                    <div className="panel" style={{ marginBottom: 24 }}>
                      <div className="panel-heading" style={{ background: '#8C5A6A', color: '#FFFFFF', borderRadius: '12px 12px 0 0' }}>
                        Reminders Due
                      </div>
                      <div style={{ padding: '0 20px 20px 20px' }}>
                        {remindersLoading && reminders.length === 0 && missingCourseDates.length === 0 && (
                          <div style={{ fontSize: 13, color: '#AAAAAA', padding: '12px 0' }}>Loading…</div>
                        )}
                        {!remindersLoading && reminders.length === 0 && missingCourseDates.length === 0 && (
                          <div style={{ fontSize: 13, color: '#AAAAAA', padding: '12px 0' }}>No reminders today 🌸</div>
                        )}
                        {reminders.map(r => (
                          <div key={r.studentId} style={{ padding: '10px 0', borderBottom: '1px solid #F9F9F9' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>
                                  {r.studentName}
                                  <span style={{
                                    marginLeft: 8, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                                    color: r.type === 'overdue' ? '#C0392B' : r.type === 'certificate' ? '#A23F51' : '#8C5A6A',
                                  }}>
                                    {r.type === 'overdue' ? 'Overdue' : r.type === 'certificate' ? 'Certificate' : 'Payment'}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, color: '#9A8A8E' }}>{r.courseName} - {r.reason}</div>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#C47A8A', whiteSpace: 'nowrap' }}>
                                R {r.amountOutstanding.toFixed(2)}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                              <button
                                className="secondary-btn"
                                style={{ fontSize: 11, padding: '5px 10px' }}
                                disabled={remindersBusyId === r.studentId}
                                onClick={() => sendReminderOnWhatsApp(r)}
                              >
                                Send on WhatsApp
                              </button>
                              <button
                                className="secondary-btn"
                                style={{ fontSize: 11, padding: '5px 10px' }}
                                onClick={() => openMessagePanel('student', studentFromReminder(r), courseFromReminder(r))}
                              >
                                Preview
                              </button>
                              <button
                                className="secondary-btn"
                                style={{ fontSize: 11, padding: '5px 10px' }}
                                disabled={remindersBusyId === r.studentId}
                                onClick={() => markReminderDone(r)}
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        ))}
                        {missingCourseDates.length > 0 && (
                          <div style={{ marginTop: reminders.length > 0 ? 10 : 0, paddingTop: reminders.length > 0 ? 10 : 0, borderTop: reminders.length > 0 ? '1px solid #F0E8E8' : 'none' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                              Missing course dates
                            </div>
                            {missingCourseDates.map(m => (
                              <div key={m.studentId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{m.studentName}</div>
                                  <div style={{ fontSize: 12, color: '#9A8A8E' }}>{m.courseName || 'Training'}</div>
                                </div>
                                <button
                                  className="secondary-btn"
                                  style={{ fontSize: 11, padding: '5px 10px' }}
                                  onClick={() => setDatesDialogFor({ id: m.studentId, classId: m.classId, name: m.studentName })}
                                >
                                  Set dates
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Low stock - a product with lash length/curl options lists
                      those options individually, not the product as a whole */}
                  {(() => {
                    const lowStockRows = products.filter(p => p.isActive).flatMap(p =>
                      p.hasOptions
                        ? p.options
                            .filter(o => o.isActive && o.stockQuantity <= o.lowStockThreshold)
                            .map(o => ({ key: `${p.id}-${o.id}`, label: `${p.name} ${o.lengthMm}mm ${o.curl} curl`, stock: o.stockQuantity }))
                        : p.stockQuantity <= p.lowStockThreshold
                          ? [{ key: String(p.id), label: p.name, stock: p.stockQuantity }]
                          : []
                    )
                    if (lowStockRows.length === 0) return null
                    return (
                      <div className="panel" style={{ marginBottom: 24 }}>
                        <div className="panel-heading" style={{ background: '#C47A8A', color: '#FFFFFF', borderRadius: '12px 12px 0 0' }}>
                          Low Stock
                        </div>
                        <div style={{ padding: '0 20px 20px 20px' }}>
                          {lowStockRows.map(row => (
                            <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F9F9F9' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{row.label}</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: row.stock === 0 ? '#C47A8A' : '#8C5A6A' }}>
                                {row.stock === 0 ? 'Sold out' : `${row.stock} left`}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Recent notifications preview */}
                  <div className="panel">
                    <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#C4A882', color: '#FFFFFF', borderRadius: '12px 12px 0 0' }}>
                      <span>Recent Activity</span>
                      <button
                        onClick={() => navigateTo('notifications')}
                        style={{ background: 'none', border: 'none', fontSize: 12, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                      >
                        View all
                      </button>
                    </div>
                    <div style={{ padding: '0 20px 20px 20px' }}>
                      {notifications.slice(0, 4).map(n => (
                        <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid #F9F9F9' }}>
                          <span className={`notif-dot${n.read ? ' read' : ''}`} style={{ marginTop: 4 }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{n.title}</div>
                            <div style={{ fontSize: 12, color: '#AAAAAA' }}>{n.message}</div>
                          </div>
                        </div>
                      ))}
                      {notifications.length === 0 && (
                        <div style={{ fontSize: 13, color: '#AAAAAA', padding: '12px 0' }}>No activity yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {activePage === 'products' && user?.role !== 'staff' && (
              <div>
                <div style={{
                  background: 'linear-gradient(135deg, #8C5A6A 0%, #C4A882 100%)',
                  borderRadius: 14,
                  padding: '24px 28px',
                  marginBottom: 20,
                  color: 'white',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Product Sections</div>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>Organise your products into sections for the shop</div>
                  </div>
                  <div style={{ fontSize: 40, fontWeight: 700, opacity: 0.3 }}>{categories.length}</div>
                </div>
                <div className="section-heading">Product Sections</div>
                <p style={{ fontSize: 14, color: '#7A6670', marginBottom: 20, lineHeight: 1.6 }}>
                  Sections group your products on the customer-facing shop as "Shop by category" cards. Create a new section below, give it a cover photo, and use the arrows to set the order they appear in. Products can be assigned to a section from the Products tab.
                </p>

                <div className="category-input-row">
                  <input
                    className="category-input"
                    type="text"
                    placeholder="New section name, e.g. Wigs"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createCategory()}
                  />
                  <button className="upload-btn" onClick={createCategory}>Add Section</button>
                </div>

                {categoryStatus && (
                  <div className={categoryStatus.type === 'success' ? 'success-msg' : 'error-msg'}
                       style={{ marginBottom: 16 }}>
                    {categoryStatus.message}
                  </div>
                )}

                <div className="category-list">
                  {categories.length === 0 && (
                    <p style={{ fontSize: 14, color: '#9A7A82' }}>No sections yet. Add one above.</p>
                  )}
                  {categories.map((c, index) => {
                    const count = Object.values(productCategories).filter(id => id === c.id).length
                    const uploadKey = `categories-${c.id}`
                    return (
                      <div key={c.id} style={{ marginBottom: 8 }}>
                        <div className="category-item">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {c.imageUrl ? (
                              <img src={c.imageUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 44, height: 44, borderRadius: 8, background: '#FADADD', flexShrink: 0 }} />
                            )}
                            <div>
                              <div className="category-name">{c.name}</div>
                              <div className="category-count">{count} product{count !== 1 ? 's' : ''}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button className="adj-btn" disabled={index === 0} onClick={() => moveCategory(c.id, 'up')} title="Move up">^</button>
                            <button className="adj-btn" disabled={index === categories.length - 1} onClick={() => moveCategory(c.id, 'down')} title="Move down">v</button>
                            <label htmlFor={`file-category-${c.id}`} className="upload-btn" style={{ fontSize: 12, padding: '6px 10px' }}>
                              {c.imageUrl ? 'Replace Image' : 'Upload Image'}
                            </label>
                            <input
                              id={`file-category-${c.id}`}
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleUpload('categories', c.id, e.target.files[0])}
                            />
                            {c.imageUrl && (
                              <button className="delete-btn" onClick={() => removeCategoryImage(c)}>Remove Image</button>
                            )}
                            <button className="delete-btn" onClick={() => deleteCategory(c, count)}>
                              Remove
                            </button>
                          </div>
                        </div>
                        {uploadStatus[uploadKey] === 'success' && (
                          <div className="success-msg" style={{ marginTop: 6 }}>Uploaded successfully</div>
                        )}
                        {uploadStatus[uploadKey] && uploadStatus[uploadKey] !== 'uploading' && uploadStatus[uploadKey] !== 'success' && (
                          <div className="error-msg" style={{ marginTop: 6 }}>{uploadStatus[uploadKey]}</div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="section-heading" style={{ marginTop: 32 }}>Product Catalog</div>
                <p style={{ fontSize: 14, color: '#7A6670', marginBottom: 20, lineHeight: 1.6 }}>
                  Manage what is for sale, its price and how much stock you have. Deactivating a product takes it off the shop without losing its order history.
                </p>

                <button
                  className="upload-btn"
                  onClick={() => {
                    if (!showAddProduct) {
                      // Pre-select whichever section chip is active, so
                      // adding a product while filtered to "Wigs" doesn't
                      // default to "No section" for no reason.
                      const activeCategory = categories.find(c => c.name === productsSectionChip)
                      setNewProduct(prev => ({ ...prev, categoryId: activeCategory ? String(activeCategory.id) : '' }))
                    }
                    setShowAddProduct(prev => !prev)
                    setProductFormStatus(null)
                  }}
                  style={{ marginBottom: 16 }}
                >
                  {showAddProduct ? 'Cancel' : 'Add Product'}
                </button>

                {productFormStatus && (
                  <div className={productFormStatus.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 16 }}>
                    {productFormStatus.message}
                  </div>
                )}

                {showAddProduct && (
                  <div className="category-item" style={{ display: 'block', marginBottom: 16 }}>
                    <div className="field-label" style={{ marginBottom: 4 }}>Name</div>
                    <input
                      className="category-input"
                      style={{ width: '100%', marginBottom: 10 }}
                      value={newProduct.name}
                      onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
                      placeholder="Product name"
                    />
                    <div className="field-label" style={{ marginBottom: 4 }}>Description</div>
                    <textarea
                      className="category-input"
                      style={{ width: '100%', marginBottom: 10, resize: 'vertical' }}
                      rows={2}
                      value={newProduct.description}
                      onChange={e => setNewProduct(p => ({ ...p, description: e.target.value }))}
                      placeholder="Shown to customers on the shop"
                    />
                    <div className="field-label" style={{ marginBottom: 4 }}>Detail</div>
                    <input
                      className="category-input"
                      style={{ width: '100%', marginBottom: 10 }}
                      value={newProduct.detail}
                      onChange={e => setNewProduct(p => ({ ...p, detail: e.target.value }))}
                      placeholder="e.g. Diameter: 0.15 | Curl: D"
                    />
                    <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <div className="field-label" style={{ marginBottom: 4 }}>Price (R)</div>
                        <input
                          className="category-input"
                          style={{ width: '100%' }}
                          type="number"
                          value={newProduct.price}
                          onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))}
                        />
                      </div>
                      <div>
                        <div className="field-label" style={{ marginBottom: 4 }}>Badge (optional)</div>
                        <input
                          className="category-input"
                          style={{ width: '100%' }}
                          value={newProduct.badge}
                          onChange={e => setNewProduct(p => ({ ...p, badge: e.target.value }))}
                          placeholder="e.g. Popular"
                        />
                      </div>
                      <div>
                        <div className="field-label" style={{ marginBottom: 4 }}>Starting Stock</div>
                        <input
                          className="category-input"
                          style={{ width: '100%' }}
                          type="number"
                          value={newProduct.stockQuantity}
                          onChange={e => setNewProduct(p => ({ ...p, stockQuantity: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <div className="field-label" style={{ marginBottom: 4 }}>Low Stock Warning At</div>
                        <input
                          className="category-input"
                          style={{ width: '100%' }}
                          type="number"
                          value={newProduct.lowStockThreshold}
                          onChange={e => setNewProduct(p => ({ ...p, lowStockThreshold: e.target.value }))}
                          placeholder="3"
                        />
                      </div>
                      <div>
                        <div className="field-label" style={{ marginBottom: 4 }}>Section</div>
                        <select
                          className="category-select"
                          value={newProduct.categoryId}
                          onChange={e => setNewProduct(p => ({ ...p, categoryId: e.target.value }))}
                        >
                          <option value="">No section</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button className="upload-btn" onClick={createProduct}>Save Product</button>
                  </div>
                )}

                {products.length > 0 && (() => {
                  const allGroups = sectionGroupsForProducts(products)
                  const chipNames = ['All', ...allGroups.map(g => g.name)]
                  const term = productsSearch.trim().toLowerCase()
                  const visibleGroups = allGroups
                    .filter(g => productsSectionChip === 'All' || g.name === productsSectionChip)
                    .map(g => ({ ...g, products: term ? g.products.filter(p => p.name.toLowerCase().includes(term)) : g.products }))
                    .filter(g => g.products.length > 0)
                  const isOpen = (slug) => !!term || (productsOpenSections || new Set()).has(slug)
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ position: 'relative', marginBottom: 10, maxWidth: 360 }}>
                        <IconSearch style={{ position: 'absolute', left: 12, top: 12, color: '#9A8A8E' }} />
                        <input
                          className="category-input"
                          style={{ width: '100%', paddingLeft: 36 }}
                          value={productsSearch}
                          onChange={e => setProductsSearch(e.target.value)}
                          placeholder="Search products…"
                        />
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                        {chipNames.map(name => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setProductsSectionChip(name)}
                            style={{
                              padding: '5px 12px', borderRadius: 14, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                              border: `1px solid ${productsSectionChip === name ? '#C47A8A' : '#EDD5DB'}`,
                              background: productsSectionChip === name ? '#C47A8A' : 'white',
                              color: productsSectionChip === name ? 'white' : '#7A6670',
                            }}
                          >
                            {name}
                          </button>
                        ))}
                        <span style={{ flex: 1 }} />
                        <button type="button" onClick={() => setProductsOpenSections(new Set(allGroups.map(g => g.slug)))} style={{ background: 'none', border: 'none', color: '#C47A8A', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Expand all
                        </button>
                        <button type="button" onClick={() => setProductsOpenSections(new Set())} style={{ background: 'none', border: 'none', color: '#C47A8A', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Collapse all
                        </button>
                      </div>

                      {visibleGroups.length === 0 && (
                        <p style={{ fontSize: 14, color: '#9A7A82' }}>No products match.</p>
                      )}

                      {visibleGroups.map(group => (
                        <div key={group.slug} style={{ marginBottom: 10 }}>
                          <button
                            type="button"
                            onClick={() => toggleProductSection(group.slug)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                              background: '#FAF6F4', border: '1px solid #F0E8E8', borderRadius: 8, padding: '10px 14px',
                              fontSize: 13, fontWeight: 700, color: '#3E2A30', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            <span style={{ transform: isOpen(group.slug) ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>&#9656;</span>
                            {group.name} ({group.products.length})
                          </button>
                          {isOpen(group.slug) && (
                            <div className="category-list" style={{ marginTop: 8 }}>
                              {group.products.map(p => (
                                <div
                                  key={p.id}
                                  id={`product-card-${p.id}`}
                                  className="admin-card"
                                  style={{
                                    background: highlightedProductId === p.id ? '#FADADD' : (p.isActive ? '#FFFFFF' : '#F5F2F2'),
                                    opacity: p.isActive ? 1 : 0.65,
                                    // Snaps to pink instantly, then fades back
                                    // out - a transition on the way IN would
                                    // mean it's barely visible before the
                                    // 2s timer clears it again.
                                    transition: highlightedProductId === p.id ? 'none' : 'background 1.8s ease-out',
                                  }}
                                >
                      <div className="card-img" style={{ overflow: 'hidden' }}>
                        {productImages[p.id] ? (
                          <img
                            src={`${mediaUrl(productImages[p.id])}?t=${Date.now()}`}
                            alt={p.name}
                            style={{ width: '88px', height: '88px', borderRadius: '10px', objectFit: 'cover' }}
                          />
                        ) : (
                          <span>No image</span>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        {editingProduct?.id !== p.id ? (
                          <>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 3 }}>
                              {p.name}
                              {!p.isActive && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', marginLeft: 8 }}>
                                  Inactive
                                </span>
                              )}
                              {p.preorderEnabled && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#C47A8A', textTransform: 'uppercase', marginLeft: 8 }}>
                                  Pre-order
                                </span>
                              )}
                              {p.onSale && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#C4365B', textTransform: 'uppercase', marginLeft: 8 }}>
                                  On Sale
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: '#7A6670', lineHeight: 1.5, marginBottom: 6 }}>
                              {p.description}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#C47A8A', marginBottom: 4 }}>
                              {(() => {
                                if (p.hasCustomOptions && p.optionsHaveOwnPrices) {
                                  const activePrices = p.customOptions.filter(o => o.isActive).map(o => o.price)
                                  if (activePrices.length > 0) {
                                    const min = Math.min(...activePrices)
                                    const max = Math.max(...activePrices)
                                    if (min !== max) return <>R {min.toFixed(2)} &ndash; R {max.toFixed(2)}</>
                                  }
                                }
                                return <>R {p.price}</>
                              })()}
                              {p.onSale && !p.hasOptions && !p.hasCustomOptions && p.effectivePrice && (
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#9A8A8E', marginLeft: 6 }}>
                                  &rarr; sale price R {p.effectivePrice.price.toFixed(2)}
                                </span>
                              )}
                            </div>
                            {!p.hasOptions && !p.hasCustomOptions ? (
                              <div style={{ fontSize: 12, color: p.stockQuantity <= p.lowStockThreshold ? '#C47A8A' : '#9A8A8E' }}>
                                Stock: {p.stockQuantity}{p.stockQuantity <= p.lowStockThreshold ? ' (low)' : ''}
                              </div>
                            ) : p.hasOptions ? (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                                  Lengths &amp; Curls
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {p.options.map(o => (
                                    <div
                                      key={o.id}
                                      onClick={() => { setStockAdjustTarget({ kind: 'variant', productId: p.id, variantId: o.id, name: `${p.name}, ${o.lengthMm}mm, ${o.curl} curl`, stockQuantity: o.stockQuantity }); setProductFormStatus(null) }}
                                      style={{
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        padding: '4px 10px',
                                        borderRadius: 14,
                                        border: `1px solid ${o.stockQuantity <= o.lowStockThreshold ? '#F5C0CC' : '#EDD5DB'}`,
                                        background: o.stockQuantity <= o.lowStockThreshold ? '#FDE8EC' : '#F7EEF0',
                                        color: o.stockQuantity <= o.lowStockThreshold ? '#A23F51' : '#8C5A6A',
                                      }}
                                      title="Click to adjust this option's stock"
                                    >
                                      {o.lengthMm}mm {o.curl}: {o.stockQuantity}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                                  {p.optionLabel}s{p.customOptions.length > 0 ? ` (${p.customOptions.length})` : ''}
                                </div>
                                {p.customOptions.length > 8 && !expandedOptionsProductIds.has(p.id) ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 12, color: '#9A8A8E' }}>
                                      {p.customOptions.length} options · {p.customOptions.filter(o => o.stockQuantity <= 0).length} out of stock
                                    </span>
                                    <button className="secondary-btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => toggleOptionsExpanded(p.id)}>
                                      Show options
                                    </button>
                                  </div>
                                ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {p.customOptions.map(o => (
                                    <div
                                      key={o.id}
                                      onClick={() => { setStockAdjustTarget({ kind: 'customOption', productId: p.id, optionId: o.id, name: `${p.name}, ${p.optionLabel}: ${o.name}`, stockQuantity: o.stockQuantity }); setProductFormStatus(null) }}
                                      style={{
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        padding: '4px 10px',
                                        borderRadius: 14,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        opacity: o.isActive ? 1 : 0.5,
                                        border: `1px solid ${o.stockQuantity <= p.lowStockThreshold ? '#F5C0CC' : '#EDD5DB'}`,
                                        background: o.stockQuantity <= p.lowStockThreshold ? '#FDE8EC' : '#F7EEF0',
                                        color: o.stockQuantity <= p.lowStockThreshold ? '#A23F51' : '#8C5A6A',
                                      }}
                                      title="Click to adjust this option's stock"
                                    >
                                      {o.swatchHex && (
                                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: o.swatchHex, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
                                      )}
                                      {o.name}: {o.stockQuantity}{!o.isActive ? ' (off)' : ''}
                                    </div>
                                  ))}
                                  {p.customOptions.length > 8 && (
                                    <button className="secondary-btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => toggleOptionsExpanded(p.id)}>
                                      Hide options
                                    </button>
                                  )}
                                </div>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="field-label" style={{ marginBottom: 4 }}>Name</div>
                            <input
                              className="category-input"
                              style={{ width: '100%', marginBottom: 8 }}
                              value={editingProduct.name}
                              onChange={e => setEditingProduct(prev => ({ ...prev, name: e.target.value }))}
                            />
                            <div className="field-label" style={{ marginBottom: 4 }}>Description</div>
                            <textarea
                              className="category-input"
                              style={{ width: '100%', marginBottom: 8, resize: 'vertical' }}
                              rows={2}
                              value={editingProduct.description}
                              onChange={e => setEditingProduct(prev => ({ ...prev, description: e.target.value }))}
                            />
                            <div className="field-label" style={{ marginBottom: 4 }}>Short details</div>
                            <input
                              className="category-input"
                              style={{ width: '100%', marginBottom: 8 }}
                              value={editingProduct.detail}
                              onChange={e => setEditingProduct(prev => ({ ...prev, detail: e.target.value }))}
                              placeholder="Detail"
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <div className="field-label" style={{ marginBottom: 4 }}>Price (R)</div>
                                <input
                                  className="category-input"
                                  style={{ width: '100%' }}
                                  type="number"
                                  value={editingProduct.price}
                                  onChange={e => setEditingProduct(prev => ({ ...prev, price: e.target.value }))}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div className="field-label" style={{ marginBottom: 4 }}>Badge</div>
                                <input
                                  className="category-input"
                                  style={{ width: '100%' }}
                                  value={editingProduct.badge || ''}
                                  onChange={e => setEditingProduct(prev => ({ ...prev, badge: e.target.value }))}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div className="field-label" style={{ marginBottom: 4 }}>Stock</div>
                                <input
                                  className="category-input"
                                  style={{ width: '100%' }}
                                  type="number"
                                  value={editingProduct.lowStockThreshold}
                                  onChange={e => setEditingProduct(prev => ({ ...prev, lowStockThreshold: e.target.value }))}
                                  placeholder="Low stock at"
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div className="field-label" style={{ marginBottom: 4 }}>Section</div>
                                <select
                                  className="category-select"
                                  value={productCategories[p.id] || ''}
                                  onChange={e => assignCategory(p.id, e.target.value || null)}
                                >
                                  <option value="">No section</option>
                                  {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div style={{ marginTop: 10, padding: '10px 12px', background: '#FAF6F4', borderRadius: 8 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#3E2A30', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={!!editingProduct.preorderEnabled}
                                  onChange={e => {
                                    const checked = e.target.checked
                                    setEditingProduct(prev => {
                                      const price = parseFloat(prev.price) || 0
                                      const currentDeposit = parseFloat(prev.preorderDeposit)
                                      // The deposit carried over from before (often still the R500
                                      // default) may no longer make sense for this price - suggest a
                                      // better one instead of letting Save fail on a value nobody chose.
                                      const depositStillValid = !isNaN(currentDeposit) && currentDeposit >= 10 && currentDeposit < price
                                      const suggestedDeposit = price > 500 ? 500 : Math.max(10, Math.round(price / 2))
                                      return {
                                        ...prev,
                                        preorderEnabled: checked,
                                        preorderDeposit: (checked && !depositStillValid) ? suggestedDeposit : prev.preorderDeposit,
                                      }
                                    })
                                  }}
                                />
                                Pre-order
                              </label>
                              {editingProduct.preorderEnabled && (
                                <div style={{ marginTop: 8 }}>
                                  <div className="field-label" style={{ marginBottom: 4 }}>Deposit (R)</div>
                                  <input
                                    className="category-input"
                                    type="number"
                                    style={{ width: 140 }}
                                    value={editingProduct.preorderDeposit}
                                    onChange={e => setEditingProduct(prev => ({ ...prev, preorderDeposit: e.target.value }))}
                                  />
                                  <div className="field-label" style={{ marginTop: 8, marginBottom: 4 }}>Expected arrival date (optional)</div>
                                  <input
                                    className="category-input"
                                    type="date"
                                    style={{ width: 160 }}
                                    value={editingProduct.preorderExpectedDate || ''}
                                    onChange={e => setEditingProduct(prev => ({ ...prev, preorderExpectedDate: e.target.value }))}
                                  />
                                  <div style={{ fontSize: 11, color: '#9A8A8E', marginTop: 6 }}>
                                    Pre-orders are ready in {preorderLeadTime.minDays} to {preorderLeadTime.maxDays} days (change this, or the deposit and arrival date, on the Pre-orders page).
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                        {editingProduct?.id !== p.id ? (
                          <>
                            <button
                              className="secondary-btn"
                              onClick={() => setEditingProduct({
                                id: p.id, name: p.name, description: p.description, detail: p.detail,
                                price: p.price, badge: p.badge || '', lowStockThreshold: p.lowStockThreshold,
                                preorderEnabled: p.preorderEnabled, preorderDeposit: p.preorderDeposit,
                                preorderExpectedDate: (p.preorderExpectedDate || '').slice(0, 10),
                              })}
                            >
                              Edit
                            </button>
                            {!p.hasOptions && !p.hasCustomOptions && (
                              <button className="secondary-btn" onClick={() => { setStockAdjustTarget({ kind: 'product', id: p.id, name: p.name, stockQuantity: p.stockQuantity }); setProductFormStatus(null) }}>
                                Adjust Stock
                              </button>
                            )}
                            {!p.hasOptions && (
                              <button className="secondary-btn" onClick={() => openOptionsManager(p)}>
                                Manage Options
                              </button>
                            )}
                            <button className="secondary-btn" onClick={() => openSaleManager(p)}>
                              {p.onSale ? 'Manage Sale' : 'Put on Sale'}
                            </button>
                            <button className="delete-btn" onClick={() => toggleProductActive(p)}>
                              {p.isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                            {/* Separated from the buttons above (extra margin, own divider) so a
                                thumb reaching for Deactivate/Manage Options on mobile can't miss-tap
                                a permanent delete instead. */}
                            <button
                              className="delete-btn"
                              style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #E8C9CE', background: '#A23F51' }}
                              onClick={() => deleteProduct(p)}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="upload-btn" onClick={saveProductEdit}>Save</button>
                            <button className="secondary-btn" onClick={() => setEditingProduct(null)}>Cancel</button>
                          </>
                        )}
                      </div>
                    </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {stockAdjustTarget && (
                  <div
                    style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(44,26,32,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setStockAdjustTarget(null)}
                  >
                    <div
                      style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', boxShadow: '0 8px 40px rgba(44,26,32,0.2)' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#2C1A20', marginBottom: 6 }}>Adjust Stock</div>
                      <div style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20 }}>
                        "{stockAdjustTarget.name}" currently has {stockAdjustTarget.stockQuantity} in stock.
                      </div>
                      <div className="field-label" style={{ marginBottom: 4 }}>Change (use a negative number to reduce)</div>
                      <input
                        className="category-input"
                        style={{ width: '100%', marginBottom: 10 }}
                        type="number"
                        value={stockAdjustAmount}
                        onChange={e => setStockAdjustAmount(e.target.value)}
                        placeholder="e.g. 20 or -5"
                      />
                      <div className="field-label" style={{ marginBottom: 4 }}>Reason</div>
                      <select
                        className="category-select"
                        style={{ width: '100%', marginBottom: 10 }}
                        value={stockAdjustReason}
                        onChange={e => setStockAdjustReason(e.target.value)}
                      >
                        <option value="restock">Restock</option>
                        <option value="adjustment">Correction</option>
                      </select>
                      <div className="field-label" style={{ marginBottom: 4 }}>Note (optional)</div>
                      <input
                        className="category-input"
                        style={{ width: '100%', marginBottom: 16 }}
                        value={stockAdjustNote}
                        onChange={e => setStockAdjustNote(e.target.value)}
                        placeholder="e.g. New supplier delivery"
                      />
                      {productFormStatus && productFormStatus.type === 'error' && (
                        <div className="error-msg" style={{ marginBottom: 12 }}>{productFormStatus.message}</div>
                      )}
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="upload-btn" onClick={adjustStock}>Save</button>
                        <button className="secondary-btn" onClick={() => setStockAdjustTarget(null)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                {optionsManagerProductId != null && (() => {
                  const optProduct = products.find(p => p.id === optionsManagerProductId)
                  if (!optProduct) return null
                  const allOptions = optProduct.customOptions || []
                  const filteredOptions = optionsManagerSearch.trim()
                    ? allOptions.filter(o => o.name.toLowerCase().includes(optionsManagerSearch.trim().toLowerCase()))
                    : allOptions
                  return (
                    <div
                      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(44,26,32,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                      onClick={() => setOptionsManagerProductId(null)}
                    >
                      <div
                        style={{ background: 'white', borderRadius: 16, padding: '20px 16px', maxWidth: 520, width: '100%', maxHeight: '88vh', boxSizing: 'border-box', overflowX: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(44,26,32,0.2)' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#2C1A20', marginBottom: 4 }}>
                          Options for "{optProduct.name}"
                        </div>
                        <div style={{ fontSize: 12, color: '#9A8A8E', marginBottom: 16 }}>
                          A product has either lash length/curl options or custom options like this, never both.
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
                          <div style={{ flex: 1 }}>
                            <div className="field-label" style={{ marginBottom: 4 }}>Option label</div>
                            <input
                              className="category-input"
                              style={{ width: '100%' }}
                              list="option-label-suggestions"
                              value={optionLabelDraft}
                              onChange={e => setOptionLabelDraft(e.target.value)}
                              placeholder="e.g. Shade"
                            />
                            <datalist id="option-label-suggestions">
                              <option value="Shade" />
                              <option value="Colour" />
                              <option value="Size" />
                            </datalist>
                          </div>
                          <button className="secondary-btn" onClick={saveOptionLabel}>Save Label</button>
                        </div>

                        {optProduct.optionLabel && (
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              style={{ marginTop: 2 }}
                              checked={!!optProduct.optionsHaveOwnPrices}
                              onChange={e => toggleOptionsHaveOwnPrices(optProduct, e.target.checked)}
                            />
                            <span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#3E2A30', display: 'block' }}>
                                Different price per option
                              </span>
                              <span style={{ fontSize: 11, color: '#9A8A8E' }}>
                                Use this when lengths cost different amounts, e.g. wigs.
                              </span>
                            </span>
                          </label>
                        )}

                        {optionsManagerStatus && (
                          <div className={optionsManagerStatus.type === 'error' ? 'error-msg' : 'success-msg'} style={{ marginBottom: 12 }}>
                            {optionsManagerStatus.message}
                          </div>
                        )}

                        {optProduct.optionLabel && (
                          <>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                              <input
                                className="category-input"
                                style={{ flex: 1, minWidth: 140 }}
                                value={newOptionDraft.name}
                                onChange={e => setNewOptionDraft(prev => ({ ...prev, name: e.target.value }))}
                                placeholder={`New ${optProduct.optionLabel.toLowerCase()} name`}
                              />
                              <input
                                type="color"
                                value={newOptionDraft.swatchHex || '#C47A8A'}
                                onChange={e => setNewOptionDraft(prev => ({ ...prev, swatchHex: e.target.value }))}
                                title="Colour swatch (optional)"
                                style={{ width: 36, height: 36, padding: 0, border: '1px solid #EDD5DB', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
                              />
                              <input
                                className="category-input"
                                type="number"
                                style={{ width: 80 }}
                                value={newOptionDraft.stockQuantity}
                                onChange={e => setNewOptionDraft(prev => ({ ...prev, stockQuantity: e.target.value }))}
                                placeholder="Stock"
                              />
                              {optProduct.optionsHaveOwnPrices && (
                                <input
                                  className="category-input"
                                  type="number"
                                  style={{ width: 100 }}
                                  value={newOptionDraft.price}
                                  onChange={e => setNewOptionDraft(prev => ({ ...prev, price: e.target.value }))}
                                  placeholder="Price (R)"
                                />
                              )}
                              <button className="upload-btn" onClick={addCustomOption}>Add</button>
                            </div>

                            <button
                              className="secondary-btn"
                              style={{ marginBottom: 12 }}
                              onClick={() => setBulkOptionsOpen(prev => !prev)}
                            >
                              {bulkOptionsOpen ? 'Close' : 'Add several'}
                            </button>

                            {bulkOptionsOpen && (
                              <div style={{ background: '#FAF6F4', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                                <div className="field-label" style={{ marginBottom: 4 }}>One name per line</div>
                                <textarea
                                  className="category-input"
                                  style={{ width: '100%', resize: 'vertical', marginBottom: 8 }}
                                  rows={6}
                                  value={bulkOptionsText}
                                  onChange={e => setBulkOptionsText(e.target.value)}
                                  placeholder={'apple pie\ncashew\nchocolate pie'}
                                />
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <input
                                    className="category-input"
                                    type="number"
                                    style={{ width: 140 }}
                                    value={bulkOptionsStartStock}
                                    onChange={e => setBulkOptionsStartStock(e.target.value)}
                                    placeholder="Starting stock"
                                  />
                                  <button className="upload-btn" onClick={addBulkOptions}>Add All</button>
                                </div>
                              </div>
                            )}

                            {allOptions.length > 10 && (
                              <input
                                className="category-input"
                                style={{ width: '100%', marginBottom: 10 }}
                                value={optionsManagerSearch}
                                onChange={e => setOptionsManagerSearch(e.target.value)}
                                placeholder={`Search ${optProduct.optionLabel.toLowerCase()}s...`}
                              />
                            )}

                            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #F0E8E8', borderRadius: 8 }}>
                              {filteredOptions.length === 0 && (
                                <div style={{ padding: 16, fontSize: 13, color: '#9A8A8E', textAlign: 'center' }}>
                                  {allOptions.length === 0 ? 'No options yet - add one above.' : 'No options match your search.'}
                                </div>
                              )}
                              {filteredOptions.map((o, idx) => (
                                <div
                                  key={o.id}
                                  style={{
                                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 10px',
                                    borderBottom: idx < filteredOptions.length - 1 ? '1px solid #F7F0F0' : 'none',
                                    opacity: o.isActive ? 1 : 0.55,
                                  }}
                                >
                                  {o.swatchHex ? (
                                    <span style={{ width: 16, height: 16, borderRadius: '50%', background: o.swatchHex, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
                                  ) : (
                                    <span style={{ width: 16, height: 16, flexShrink: 0 }} />
                                  )}
                                  <input
                                    className="category-input"
                                    style={{ flex: '1 1 100px', minWidth: 90, padding: '4px 8px', fontSize: 13 }}
                                    defaultValue={o.name}
                                    onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== o.name) updateCustomOption(o.id, { name: e.target.value.trim() }) }}
                                  />
                                  <input
                                    type="color"
                                    value={o.swatchHex || '#FFFFFF'}
                                    onChange={e => updateCustomOption(o.id, { swatchHex: e.target.value })}
                                    style={{ width: 28, height: 28, padding: 0, border: '1px solid #EDD5DB', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
                                  />
                                  {optProduct.optionsHaveOwnPrices && (
                                    <input
                                      className="category-input"
                                      type="number"
                                      style={{ width: 90, padding: '4px 8px', fontSize: 13 }}
                                      defaultValue={o.price ?? ''}
                                      title="Price (R)"
                                      onBlur={e => {
                                        const next = e.target.value === '' ? '' : e.target.value
                                        if (parseFloat(next) !== o.price) updateCustomOption(o.id, { price: next })
                                      }}
                                    />
                                  )}
                                  <span
                                    onClick={() => { setStockAdjustTarget({ kind: 'customOption', productId: optProduct.id, optionId: o.id, name: `${optProduct.name}, ${optProduct.optionLabel}: ${o.name}`, stockQuantity: o.stockQuantity }); setProductFormStatus(null) }}
                                    style={{ fontSize: 12, fontWeight: 600, color: '#8C5A6A', cursor: 'pointer', minWidth: 46, textAlign: 'right' }}
                                    title="Click to adjust stock"
                                  >
                                    {o.stockQuantity}
                                  </span>
                                  <button className="secondary-btn" style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => moveCustomOption(o.id, 'up')}>&uarr;</button>
                                  <button className="secondary-btn" style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => moveCustomOption(o.id, 'down')}>&darr;</button>
                                  <button
                                    className={o.isActive ? 'delete-btn' : 'secondary-btn'}
                                    style={{ padding: '3px 9px', fontSize: 11 }}
                                    onClick={() => updateCustomOption(o.id, { isActive: !o.isActive })}
                                  >
                                    {o.isActive ? 'Off' : 'On'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        <button className="secondary-btn" style={{ marginTop: 16, alignSelf: 'flex-start' }} onClick={() => setOptionsManagerProductId(null)}>
                          Close
                        </button>
                      </div>
                    </div>
                  )
                })()}

                {saleManagerProductId != null && (() => {
                  const saleProduct = products.find(p => p.id === saleManagerProductId)
                  if (!saleProduct) return null
                  const optionList = saleProduct.options.length > 0 ? saleProduct.options : saleProduct.customOptions
                  const optionLabel = saleProduct.options.length > 0 ? null : saleProduct.optionLabel
                  const normalPrice = parseFloat(saleProduct.price)

                  const setOptionDraft = (id, patch) => setSaleDraft(prev => ({
                    ...prev,
                    options: { ...prev.options, [id]: { ...prev.options[id], ...patch } },
                  }))
                  const previewSave = (salePriceStr, basePrice) => {
                    const salePrice = parseFloat(salePriceStr)
                    if (isNaN(salePrice) || salePrice <= 0 || salePrice >= basePrice) return null
                    return basePrice - salePrice
                  }
                  // With options_have_own_prices on, each row's own price is
                  // the discount base, not the product's (e.g. a wig costing
                  // more at 14 inches) - falls back to the product price for
                  // any option that doesn't have its own.
                  const optionBasePrice = (o) => (saleProduct.optionsHaveOwnPrices && o.price != null) ? o.price : normalPrice

                  return (
                    <div
                      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(44,26,32,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                      onClick={() => setSaleManagerProductId(null)}
                    >
                      <div
                        style={{ background: 'white', borderRadius: 16, padding: '20px 16px', maxWidth: 520, width: '100%', maxHeight: '88vh', boxSizing: 'border-box', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(44,26,32,0.2)' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#2C1A20', marginBottom: 4 }}>
                          Sale for "{saleProduct.name}"
                        </div>
                        <div style={{ fontSize: 12, color: '#9A8A8E', marginBottom: 16 }}>
                          No start or end date - you switch it on and off yourself.
                          {saleProduct.optionsHaveOwnPrices
                            ? ' Each option below has its own price - the sale discounts that, not the main product price.'
                            : ` Normal price: R ${normalPrice.toFixed(2)}.`}
                        </div>

                        {saleManagerStatus && (
                          <div className={saleManagerStatus.type === 'error' ? 'error-msg' : 'success-msg'} style={{ marginBottom: 12 }}>
                            {saleManagerStatus.message}
                          </div>
                        )}

                        {optionList.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                            {optionList.map(o => {
                              const draft = saleDraft.options[o.id] || { onSale: false, salePrice: '' }
                              const basePrice = optionBasePrice(o)
                              const save = previewSave(draft.salePrice, basePrice)
                              const name = optionLabel ? o.name : `${o.lengthMm}mm, ${o.curl} curl`
                              return (
                                <div key={o.id} style={{ border: '1px solid #F0E8E8', borderRadius: 8, padding: 10 }}>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#3E2A30', cursor: 'pointer', flex: '1 1 140px' }}>
                                      <input
                                        type="checkbox"
                                        checked={!!draft.onSale}
                                        onChange={e => setOptionDraft(o.id, { onSale: e.target.checked })}
                                      />
                                      {name}
                                      {saleProduct.optionsHaveOwnPrices && (
                                        <span style={{ color: '#9A8A8E', fontWeight: 400 }}>· R {basePrice.toFixed(2)}</span>
                                      )}
                                    </label>
                                    <input
                                      className="category-input"
                                      type="number"
                                      style={{ width: 110 }}
                                      value={draft.salePrice}
                                      onChange={e => setOptionDraft(o.id, { salePrice: e.target.value })}
                                      placeholder="Sale price"
                                    />
                                  </div>
                                  {draft.onSale && (
                                    <div style={{ fontSize: 11, color: save != null ? '#8C5A6A' : '#A23F51', marginTop: 6 }}>
                                      {save != null
                                        ? `Customers save R ${save.toFixed(2)}`
                                        : 'Enter a sale price greater than R0 and less than the normal price.'}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div style={{ border: '1px solid #F0E8E8', borderRadius: 8, padding: 10, marginBottom: 16 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#3E2A30', cursor: 'pointer', marginBottom: 8 }}>
                              <input
                                type="checkbox"
                                checked={!!saleDraft.onSale}
                                onChange={e => setSaleDraft(prev => ({ ...prev, onSale: e.target.checked }))}
                              />
                              On sale
                            </label>
                            <input
                              className="category-input"
                              type="number"
                              style={{ width: 140 }}
                              value={saleDraft.salePrice}
                              onChange={e => setSaleDraft(prev => ({ ...prev, salePrice: e.target.value }))}
                              placeholder="Sale price (R)"
                            />
                            {saleDraft.onSale && (() => {
                              const save = previewSave(saleDraft.salePrice)
                              return (
                                <div style={{ fontSize: 11, color: save != null ? '#8C5A6A' : '#A23F51', marginTop: 6 }}>
                                  {save != null
                                    ? `Customers save R ${save.toFixed(2)}`
                                    : 'Enter a sale price greater than R0 and less than the normal price.'}
                                </div>
                              )
                            })()}
                          </div>
                        )}

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="upload-btn" onClick={saveSale}>Save</button>
                            <button className="secondary-btn" onClick={() => setSaleManagerProductId(null)}>Close</button>
                          </div>
                          {saleProduct.onSale && (
                            <button className="delete-btn" onClick={() => endSale(saleProduct)}>End Sale</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {activePage === 'images' && user?.role !== 'staff' && (
              <div>
                <div style={{
                  background: 'linear-gradient(135deg, #C4A882 0%, #8C5A6A 100%)',
                  borderRadius: 14,
                  padding: '20px 24px',
                  marginBottom: 20,
                  color: 'white',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Image Management</div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>Upload and position images for products, classes and the gallery</div>
                </div>
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #EDD5DB', marginBottom: 24 }}>
                  {[
                    { label: 'Products', value: 'products' },
                    { label: 'Classes', value: 'classes' },
                    { label: 'Gallery', value: 'gallery' },
                  ].map(tab => (
                    <button
                      key={tab.value}
                      onClick={() => setImageTab(tab.value)}
                      style={{
                        padding: '10px 20px',
                        border: 'none',
                        background: 'transparent',
                        fontSize: 14,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        color: imageTab === tab.value ? '#C47A8A' : '#9A8A8E',
                        borderBottom: imageTab === tab.value ? '2px solid #C47A8A' : '2px solid transparent',
                        fontWeight: imageTab === tab.value ? 700 : 500,
                        transition: 'all 0.15s',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {imageTab === 'products' && (
                  <div>
                    <div className="section-heading">Product Images</div>
                    {products.length > 0 && (() => {
                      const allGroups = sectionGroupsForProducts(products)
                      const chipNames = ['All', ...allGroups.map(g => g.name)]
                      const term = productsSearch.trim().toLowerCase()
                      const visibleGroups = allGroups
                        .filter(g => productsSectionChip === 'All' || g.name === productsSectionChip)
                        .map(g => ({ ...g, products: term ? g.products.filter(p => p.name.toLowerCase().includes(term)) : g.products }))
                        .filter(g => g.products.length > 0)
                      const isOpen = (slug) => !!term || (productsOpenSections || new Set()).has(slug)
                      return (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ position: 'relative', marginBottom: 10, maxWidth: 360 }}>
                            <IconSearch style={{ position: 'absolute', left: 12, top: 12, color: '#9A8A8E' }} />
                            <input
                              className="category-input"
                              style={{ width: '100%', paddingLeft: 36 }}
                              value={productsSearch}
                              onChange={e => setProductsSearch(e.target.value)}
                              placeholder="Search products…"
                            />
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                            {chipNames.map(name => (
                              <button
                                key={name}
                                type="button"
                                onClick={() => setProductsSectionChip(name)}
                                style={{
                                  padding: '5px 12px', borderRadius: 14, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                                  border: `1px solid ${productsSectionChip === name ? '#C47A8A' : '#EDD5DB'}`,
                                  background: productsSectionChip === name ? '#C47A8A' : 'white',
                                  color: productsSectionChip === name ? 'white' : '#7A6670',
                                }}
                              >
                                {name}
                              </button>
                            ))}
                            <span style={{ flex: 1 }} />
                            <button type="button" onClick={() => setProductsOpenSections(new Set(allGroups.map(g => g.slug)))} style={{ background: 'none', border: 'none', color: '#C47A8A', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Expand all
                            </button>
                            <button type="button" onClick={() => setProductsOpenSections(new Set())} style={{ background: 'none', border: 'none', color: '#C47A8A', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Collapse all
                            </button>
                          </div>

                          {visibleGroups.length === 0 && (
                            <p style={{ fontSize: 14, color: '#9A7A82' }}>No products match.</p>
                          )}

                          {visibleGroups.map(group => (
                            <div key={group.slug} style={{ marginBottom: 10 }}>
                              <button
                                type="button"
                                onClick={() => toggleProductSection(group.slug)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                                  background: '#FAF6F4', border: '1px solid #F0E8E8', borderRadius: 8, padding: '10px 14px',
                                  fontSize: 13, fontWeight: 700, color: '#3E2A30', cursor: 'pointer', fontFamily: 'inherit',
                                }}
                              >
                                <span style={{ transform: isOpen(group.slug) ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>&#9656;</span>
                                {group.name} ({group.products.length})
                              </button>
                              {isOpen(group.slug) && group.products.map(p => (
                      <div
                        key={p.id}
                        id={`product-card-${p.id}`}
                        className="admin-card"
                        style={{ background: highlightedProductId === p.id ? '#FADADD' : (p.id % 2 === 0 ? '#F7EEF0' : '#F5F2F8'), transition: highlightedProductId === p.id ? 'none' : 'background 1.8s ease-out' }}
                      >
                        <div className="card-img" style={{ overflow: 'hidden' }}>
                          {productImages[p.id] ? (
                            <img
                              src={`${mediaUrl(productImages[p.id])}?t=${Date.now()}`}
                              alt={p.name}
                              style={{
                                width: '88px',
                                height: '88px',
                                borderRadius: '10px',
                                objectFit: 'cover',
                                objectPosition: productPositions[p.id]
                                  ? `${productPositions[p.id].x}% ${productPositions[p.id].y}%`
                                  : '50% 50%',
                              }}
                            />
                          ) : (
                            <span>No image</span>
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A', marginBottom: '3px' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#AAAAAA', marginBottom: '6px', letterSpacing: '0.2px' }}>
                            {p.detail}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginBottom: '8px' }}>
                            R {p.price}
                          </div>
                          {uploadStatus[`products-${p.id}`] === 'uploading' && (
                            <div className="success-msg">Uploading...</div>
                          )}
                          {uploadStatus[`products-${p.id}`] === 'success' && (
                            <div className="success-msg">Uploaded successfully</div>
                          )}
                          {uploadStatus[`products-${p.id}`] && uploadStatus[`products-${p.id}`] !== 'uploading' && uploadStatus[`products-${p.id}`] !== 'success' && (
                            <div className="error-msg">{uploadStatus[`products-${p.id}`]}</div>
                          )}
                          <div style={{ marginTop: '8px' }}>
                            <div className="field-label" style={{ marginBottom: '4px' }}>
                              Section
                            </div>
                            <select
                              className="category-select"
                              value={productCategories[p.id] || ''}
                              onChange={(e) => assignCategory(p.id, e.target.value || null)}
                            >
                              <option value="">Uncategorised</option>
                              {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px', flexShrink: 0 }}>
                          <label htmlFor={`file-product-${p.id}`} className="upload-btn" style={{ whiteSpace: 'nowrap' }}>
                            {productImages[p.id] ? 'Replace Image' : 'Upload Image'}
                          </label>
                          <input
                            id={`file-product-${p.id}`}
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleUpload('products', p.id, e.target.files[0])}
                          />
                          {productImages[p.id] && (
                            <div className="adjust-controls">
                              <button className="adj-btn" onClick={() => adjustPosition('products', p.id, 'up')}>^</button>
                              <div className="adjust-row">
                                <button className="adj-btn" onClick={() => adjustPosition('products', p.id, 'left')}>&lt;</button>
                                <button className="adj-btn" onClick={() => adjustPosition('products', p.id, 'right')}>&gt;</button>
                              </div>
                              <button className="adj-btn" onClick={() => adjustPosition('products', p.id, 'down')}>v</button>
                              <div className="pos-label">
                                {productPositions[p.id] ? `${productPositions[p.id].x}% ${productPositions[p.id].y}%` : '50% 50%'}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {imageTab === 'classes' && (
                  <div>
                    <div className="section-heading">Class Images</div>
                    {/* No categories for classes, so just newest first - CLASSES
                        is defined oldest to newest, so reversed here. */}
                    {[...coursesMerged].reverse().map((c, index) => (
                      <div
                        key={c.id}
                        className="admin-card"
                        style={{ background: index % 2 === 0 ? '#F7EEF0' : '#F5F2F8' }}
                      >
                        <div className="card-img" style={{ overflow: 'hidden' }}>
                          {classImages[c.id] ? (
                            <img
                              src={`${mediaUrl(classImages[c.id])}?t=${Date.now()}`}
                              alt={c.name}
                              style={{
                                width: '88px',
                                height: '88px',
                                borderRadius: '10px',
                                objectFit: 'cover',
                                objectPosition: classPositions[c.id]
                                  ? `${classPositions[c.id].x}% ${classPositions[c.id].y}%`
                                  : '50% 50%',
                              }}
                            />
                          ) : (
                            <span>No image</span>
                          )}
                        </div>
                        {classImages[c.id] && (
                          <div className="adjust-controls">
                            <button className="adj-btn" onClick={() => adjustPosition('classes', c.id, 'up')}>^</button>
                            <div className="adjust-row">
                              <button className="adj-btn" onClick={() => adjustPosition('classes', c.id, 'left')}>&lt;</button>
                              <button className="adj-btn" onClick={() => adjustPosition('classes', c.id, 'right')}>&gt;</button>
                            </div>
                            <button className="adj-btn" onClick={() => adjustPosition('classes', c.id, 'down')}>v</button>
                            <div className="pos-label">
                              {classPositions[c.id] ? `${classPositions[c.id].x}% ${classPositions[c.id].y}%` : '50% 50%'}
                            </div>
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#2C2C2C', marginBottom: '2px' }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#9A7A82', marginBottom: '2px' }}>
                            {c.duration}
                          </div>
                          <div style={{ fontSize: '13px', color: '#C47A8A', fontWeight: 600 }}>
                            R {c.price}
                          </div>
                          {uploadStatus[`classes-${c.id}`] === 'uploading' && (
                            <div className="success-msg">Uploading...</div>
                          )}
                          {uploadStatus[`classes-${c.id}`] === 'success' && (
                            <div className="success-msg">Uploaded successfully</div>
                          )}
                          {uploadStatus[`classes-${c.id}`] && uploadStatus[`classes-${c.id}`] !== 'uploading' && uploadStatus[`classes-${c.id}`] !== 'success' && (
                            <div className="error-msg">{uploadStatus[`classes-${c.id}`]}</div>
                          )}
                        </div>
                        <div>
                          <label htmlFor={`file-class-${c.id}`} className="upload-btn">
                            {classImages[c.id] ? 'Replace Image' : 'Upload Image'}
                          </label>
                          <input
                            id={`file-class-${c.id}`}
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleUpload('classes', c.id, e.target.files[0])}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {imageTab === 'gallery' && (
                  <div>
                    <div className="section-heading">Gallery</div>
                    <label htmlFor="file-gallery-new" className="upload-btn" style={{ marginBottom: '20px', display: 'inline-block' }}>
                      Add Photo or Video
                    </label>
                    <input
                      id="file-gallery-new"
                      type="file"
                      accept="image/*,video/*"
                      onChange={(e) => handleUpload('gallery', null, e.target.files[0])}
                    />
                    {Object.keys(uploadStatus).filter(k => k.startsWith('gallery-')).map(key => {
                      const status = uploadStatus[key]
                      if (!status) return null
                      if (status === 'uploading') return <div className="success-msg" key={key}>Uploading...</div>
                      if (status === 'success') return <div className="success-msg" key={key}>Uploaded successfully</div>
                      return <div className="error-msg" key={key}>{status}</div>
                    })}

                    {galleryImages.length > 0 ? (
                      <div className="gallery-grid-admin">
                        {galleryImages.map(img => (
                          <div key={img.filename} className="gallery-tile">
                            {img.type === 'video' ? (
                              <video
                                src={mediaUrl(img.url)}
                                muted
                                autoPlay
                                loop
                                playsInline
                              />
                            ) : (
                              <img
                                src={mediaUrl(img.url)}
                                alt={img.filename}
                              />
                            )}
                            {img.id && (
                              <button
                                className="gallery-tile-remove"
                                onClick={() => removeGalleryItem(img)}
                                disabled={deletingGalleryId === img.id}
                              >
                                {deletingGalleryId === img.id ? 'Removing...' : 'Remove'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '14px', color: '#7A6670', marginTop: '20px' }}>
                        No gallery images yet. Upload your first one above.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {activePage === 'training' && user?.role !== 'staff' && (() => {
              if (selectedClass === null) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{
                      background: 'linear-gradient(135deg, #C47A8A 0%, #8C5A6A 100%)',
                      borderRadius: 14,
                      padding: '28px 32px',
                      color: 'white',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Lash Training</div>
                        <div style={{ fontSize: 13, opacity: 0.8 }}>3 courses available on the customer-facing site</div>
                      </div>
                      <div style={{ fontSize: 48, fontWeight: 700, opacity: 0.3, lineHeight: 1 }}>3</div>
                    </div>
                    {coursesMerged.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => openClass(c)}
                        style={{
                          background: '#FFFFFF',
                          borderRadius: 12,
                          border: 'none',
                          boxShadow: '0 2px 8px rgba(44,20,28,0.08)',
                          overflow: 'hidden',
                          padding: '18px 20px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 3 }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: 12, color: '#9A8A8E' }}>
                            {c.duration}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#C47A8A' }}>
                            R{c.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4A0A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }

              const currentStudents = classStudents.filter(s => s.status !== 'completed' && s.status !== 'awaiting_payment')
              const pastStudents = classStudents
                .filter(s => s.status === 'completed')
                .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
              const awaitingPaymentStudents = classStudents
                .filter(s => s.status === 'awaiting_payment')
                .sort((a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt))

              return (
                <div>
                  <button className="back-btn" onClick={() => { setSelectedClass(null); setClassStudents([]) }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    Back to Classes
                  </button>

                  <div style={{
                    background: 'linear-gradient(135deg, #C47A8A 0%, #8C5A6A 100%)',
                    borderRadius: 14,
                    padding: '24px 28px',
                    marginBottom: 20,
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.7, textTransform: 'uppercase', marginBottom: 6 }}>{selectedClass.duration}</div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedClass.name}</div>
                      <div style={{ fontSize: 15, opacity: 0.8, marginTop: 4 }}>R {selectedClass.price}</div>
                    </div>
                    <div style={{ fontSize: 40, fontWeight: 700, opacity: 0.2 }}>R{selectedClass.price}</div>
                  </div>

                  <div className="panel" style={{ marginBottom: 20, padding: 20 }}>
                    <div style={{ background: '#EDD5DB', color: '#2C1A20', borderRadius: '10px 10px 0 0', padding: '12px 20px', margin: '-20px -20px 16px -20px', fontSize: 13, fontWeight: 700 }}>
                      Course Scope
                    </div>
                    <div className="scope-grid">
                      <div className="scope-card">
                        <div className="scope-card-title">What You Will Learn</div>
                        {selectedClass.learns.map((item, i) => (
                          <div key={i} className="scope-item">{item}</div>
                        ))}
                      </div>
                      <div className="scope-card">
                        <div className="scope-card-title">What Is Included</div>
                        {selectedClass.includes.map((item, i) => (
                          <div key={i} className="scope-item">{item}</div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#EDD5DB', padding: '12px 20px', color: '#2C1A20' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Current Students</div>
                      <div style={{ fontSize: 11, color: '#8C5A6A', fontWeight: 600 }}>{currentStudents.length} enrolled</div>
                    </div>

                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #F7EEF0' }}>
                      <button className="upload-btn" onClick={() => { setShowAddStudent(prev => !prev); setStudentFormError('') }}>
                        {showAddStudent ? 'Cancel' : 'Add Student'}
                      </button>
                    </div>

                    {showAddStudent && (
                      <div style={{ padding: '16px 20px', background: '#FAF6F4', borderBottom: '1px solid #F7EEF0' }}>
                        <input
                          className="category-input"
                          style={{ width: '100%', marginBottom: 10 }}
                          placeholder="Student name"
                          value={newStudent.name}
                          onChange={e => setNewStudent(prev => ({ ...prev, name: e.target.value }))}
                        />
                        <input
                          className="category-input"
                          style={{ width: '100%', marginBottom: 10 }}
                          placeholder="WhatsApp number"
                          value={newStudent.whatsapp}
                          onChange={e => setNewStudent(prev => ({ ...prev, whatsapp: e.target.value }))}
                        />
                        <select
                          className="category-select"
                          style={{ width: '100%', marginBottom: 10, padding: '9px 12px' }}
                          value={newStudent.paymentStatus}
                          onChange={e => setNewStudent(prev => ({ ...prev, paymentStatus: e.target.value }))}
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="partial">Partially Paid</option>
                          <option value="paid">Paid</option>
                        </select>
                        <input
                          className="category-input"
                          style={{ width: '100%', marginBottom: 10 }}
                          placeholder="Notes (optional)"
                          value={newStudent.notes}
                          onChange={e => setNewStudent(prev => ({ ...prev, notes: e.target.value }))}
                        />
                        {studentFormError && (
                          <div className="error-msg" style={{ marginBottom: 10 }}>{studentFormError}</div>
                        )}
                        <button className="upload-btn" onClick={addStudent} disabled={studentSaving}>
                          {studentSaving ? 'Saving...' : 'Save Student'}
                        </button>
                      </div>
                    )}

                    <div style={{ padding: '0 20px' }}>
                      {studentsLoading && (
                        <div style={{ padding: 20, fontSize: 13, color: '#9A8A8E' }}>Loading students...</div>
                      )}
                      {!studentsLoading && currentStudents.length === 0 && (
                        <div style={{ padding: '24px 0', fontSize: 13, color: '#9A8A8E', textAlign: 'center' }}>
                          No students enrolled yet.
                        </div>
                      )}
                      {!studentsLoading && currentStudents.map(student => (
                        <div key={student.id}>
                        <div className="student-row">
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {student.name}
                              {student.source === 'website' && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#8C5A6A', background: '#F5EDEF', borderRadius: 4, padding: '2px 6px' }}>
                                  Website
                                </span>
                              )}
                              {student.isTest && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#9E9E9E', background: '#F5F5F5', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase' }}>Test</span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: '#9A8A8E' }}>
                              {student.whatsapp}{student.email ? ` · ${student.email}` : ''}
                            </div>
                            {student.preferredStartDate && !student.startDate && (
                              <div style={{ fontSize: 11, color: '#9A8A8E', marginTop: 2 }}>
                                Preferred start: {new Date(student.preferredStartDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            )}
                            {student.startDate && student.endDate && (
                              <div style={{ fontSize: 11, color: '#9A8A8E', marginTop: 2 }}>
                                {new Date(student.startDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {' – '}
                                {new Date(student.endDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            )}
                            {student.balance != null && (
                              <div style={{ fontSize: 11, color: '#9A8A8E', marginTop: 2 }}>
                                Paid R{student.amountPaid.toFixed(2)} · Balance R{student.balance.toFixed(2)}
                              </div>
                            )}
                            {student.notes && (
                              <div style={{ fontSize: 11, color: '#C4A0A8', fontStyle: 'italic', marginTop: 2 }}>
                                {student.notes}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select
                              className="category-select"
                              value={student.paymentStatus}
                              onChange={e => updateStudentPayment(student.id, e.target.value)}
                            >
                              <option value="unpaid">Unpaid</option>
                              <option value="partial">Partially Paid</option>
                              <option value="paid">Paid</option>
                            </select>
                            <span className={`payment-badge payment-${student.paymentStatus === 'partial' ? 'partial' : student.paymentStatus === 'paid' ? 'paid' : 'unpaid'}`}>
                              {student.paymentStatus === 'paid' ? 'Paid' : student.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'}
                            </span>
                            <button
                              className="secondary-btn"
                              onClick={() => openMessagePanel('student', student, coursesMerged.find(c => c.id === selectedClass.id))}
                            >
                              Message Customer
                            </button>
                            {student.balance > 0 && (
                              <button className="secondary-btn" onClick={() => copyBalanceLink(student)}>
                                {linkCopyStatus[student.id] === 'link' ? 'Copied!' : 'Copy balance link'}
                              </button>
                            )}
                            <button className="secondary-btn" onClick={() => setRecordPaymentFor(student)}>
                              Record Payment
                            </button>
                            <button
                              className="secondary-btn"
                              onClick={() => setDatesDialogFor({ id: student.id, classId: student.classId, name: student.name, startDate: student.startDate, endDate: student.endDate, preferredStartDate: student.preferredStartDate })}
                            >
                              {student.startDate ? 'Edit dates' : 'Set course dates'}
                            </button>
                            <button className="secondary-btn" onClick={() => fetchPaymentHistory(student)}>
                              {paymentHistoryOpenFor === student.id ? 'Hide payments' : 'Payment history'}
                            </button>
                            <button className="secondary-btn" onClick={() => completeStudent(student)}>
                              Finished course
                            </button>
                          </div>
                        </div>
                        {paymentHistoryOpenFor === student.id && (
                          <div style={{ padding: '8px 0 14px', borderBottom: '1px solid #F7EEF0' }}>
                            {(paymentHistories[student.id] || []).length === 0 ? (
                              <div style={{ fontSize: 12, color: '#9A8A8E' }}>No payments recorded yet.</div>
                            ) : (
                              (paymentHistories[student.id] || []).map(p => (
                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                                  <span style={{ color: '#2C1A20' }}>
                                    R {p.amount.toFixed(2)} · {p.source} · {new Date(p.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    {p.note ? ` - ${p.note}` : ''}
                                  </span>
                                  <button
                                    className="delete-btn"
                                    style={{ fontSize: 11, padding: '3px 8px' }}
                                    onClick={() => deletePayment(student, p)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="panel" style={{ padding: 0, overflow: 'hidden', marginTop: 20 }}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F7EEF0', padding: '12px 20px', color: '#2C1A20', cursor: 'pointer' }}
                      onClick={() => setShowAwaitingPayment(prev => !prev)}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Awaiting Payment {showAwaitingPayment ? '▾' : '▸'}</div>
                      <div style={{ fontSize: 11, color: '#8C5A6A', fontWeight: 600 }}>{awaitingPaymentStudents.length} not yet enrolled</div>
                    </div>

                    {showAwaitingPayment && (
                      <div style={{ padding: '0 20px' }}>
                        {awaitingPaymentStudents.length === 0 && (
                          <div style={{ padding: '24px 0', fontSize: 13, color: '#9A8A8E', textAlign: 'center' }}>
                            No enrolments waiting on payment.
                          </div>
                        )}
                        {awaitingPaymentStudents.map(student => (
                          <div key={student.id} className="student-row">
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {student.name}
                                {student.isTest && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#9E9E9E', background: '#F5F5F5', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase' }}>Test</span>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: '#9A8A8E' }}>
                                {student.whatsapp}{student.email ? ` · ${student.email}` : ''}
                              </div>
                              {student.preferredStartDate && (
                                <div style={{ fontSize: 11, color: '#9A8A8E', marginTop: 2 }}>
                                  Preferred start: {new Date(student.preferredStartDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span className="payment-badge payment-unpaid">Not yet enrolled</span>
                              <button className="delete-btn" onClick={() => removeStudent(student.id, student.name)}>
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="panel" style={{ padding: 0, overflow: 'hidden', marginTop: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F7EEF0', padding: '12px 20px', color: '#2C1A20' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Past Students</div>
                      <div style={{ fontSize: 11, color: '#8C5A6A', fontWeight: 600 }}>{pastStudents.length} finished</div>
                    </div>

                    <div style={{ padding: '0 20px' }}>
                      {!studentsLoading && pastStudents.length === 0 && (
                        <div style={{ padding: '24px 0', fontSize: 13, color: '#9A8A8E', textAlign: 'center' }}>
                          No past students yet.
                        </div>
                      )}
                      {!studentsLoading && pastStudents.map(student => (
                        <div key={student.id}>
                        <div className="student-row">
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {student.name}
                              {student.certificateOnHold && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#A23F51', background: '#FDF0F3', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase' }}>
                                  Certificate on hold
                                </span>
                              )}
                              {student.isTest && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#9E9E9E', background: '#F5F5F5', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase' }}>Test</span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: '#9A8A8E' }}>
                              {student.whatsapp}
                            </div>
                            <div style={{ fontSize: 11, color: '#C4A0A8', marginTop: 2 }}>
                              Finished {new Date(student.completedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            {student.balance != null && student.balance > 0 && (
                              <div style={{ fontSize: 11, color: '#9A8A8E', marginTop: 2 }}>
                                Paid R{student.amountPaid.toFixed(2)} · Balance R{student.balance.toFixed(2)}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span className={`payment-badge payment-${student.paymentStatus === 'partial' ? 'partial' : student.paymentStatus === 'paid' ? 'paid' : 'unpaid'}`}>
                              {student.paymentStatus === 'paid' ? 'Paid' : student.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'}
                            </span>
                            {student.balance > 0 && (
                              <button className="secondary-btn" onClick={() => copyBalanceLink(student)}>
                                {linkCopyStatus[student.id] === 'link' ? 'Copied!' : 'Copy balance link'}
                              </button>
                            )}
                            <button
                              className="secondary-btn"
                              onClick={() => openMessagePanel('student', student, coursesMerged.find(c => c.id === student.classId))}
                            >
                              Message Customer
                            </button>
                            <button className="secondary-btn" onClick={() => setRecordPaymentFor(student)}>
                              Record Payment
                            </button>
                            <button className="secondary-btn" onClick={() => fetchPaymentHistory(student)}>
                              {paymentHistoryOpenFor === student.id ? 'Hide payments' : 'Payment history'}
                            </button>
                            <button className="secondary-btn" onClick={() => reactivateStudent(student.id)}>
                              Move back
                            </button>
                            <button className="delete-btn" onClick={() => removeStudent(student.id, student.name)}>
                              Delete
                            </button>
                          </div>
                        </div>
                        {paymentHistoryOpenFor === student.id && (
                          <div style={{ padding: '8px 0 14px', borderBottom: '1px solid #F7EEF0' }}>
                            {(paymentHistories[student.id] || []).length === 0 ? (
                              <div style={{ fontSize: 12, color: '#9A8A8E' }}>No payments recorded yet.</div>
                            ) : (
                              (paymentHistories[student.id] || []).map(p => (
                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                                  <span style={{ color: '#2C1A20' }}>
                                    R {p.amount.toFixed(2)} · {p.source} · {new Date(p.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    {p.note ? ` - ${p.note}` : ''}
                                  </span>
                                  <button
                                    className="delete-btn"
                                    style={{ fontSize: 11, padding: '3px 8px' }}
                                    onClick={() => deletePayment(student, p)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}

            {activePage === 'preorders' && user?.role !== 'staff' && (() => {
              const totalPreorders = preorderGroups.reduce((sum, g) => sum + g.preorders.length, 0)
              const statusColors = {
                awaiting_deposit: { bg: '#FFF3E0', color: '#E65100' },
                deposit_paid: { bg: '#E3F2FD', color: '#1565C0' },
                arrived: { bg: '#F3E5F5', color: '#6A1B9A' },
                paid_in_full: { bg: '#E8F5E9', color: '#2E7D32' },
                dispatched: { bg: '#E8F5E9', color: '#2E7D32' },
                collected: { bg: '#E8F5E9', color: '#2E7D32' },
                cancelled: { bg: '#F0F0F0', color: '#888888' },
                refunded: { bg: '#FDE8EC', color: '#C47A8A' },
              }
              const cancellable = (status) => !['dispatched', 'collected', 'cancelled', 'refunded'].includes(status)
              return (
                <div>
                  <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #EDD5DB', marginBottom: 24 }}>
                    {[
                      { label: 'Customer pre-orders', value: 'customers' },
                      { label: 'Pre-order products', value: 'products' },
                    ].map(tab => (
                      <button
                        key={tab.value}
                        onClick={() => setPreordersTab(tab.value)}
                        style={{
                          padding: '10px 20px',
                          border: 'none',
                          background: 'transparent',
                          fontSize: 14,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          color: preordersTab === tab.value ? '#C47A8A' : '#9A8A8E',
                          borderBottom: preordersTab === tab.value ? '2px solid #C47A8A' : '2px solid transparent',
                          fontWeight: preordersTab === tab.value ? 700 : 500,
                          transition: 'all 0.15s',
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {preordersTab === 'products' && (() => {
                    const priceRangeFor = (p) => {
                      const lowest = lowestActivePriceFor(p)
                      const highest = p.optionsHaveOwnPrices
                        ? Math.max(...((p.hasOptions ? p.options : p.customOptions) || []).filter(o => o.isActive).map(o => o.price), lowest)
                        : lowest
                      return highest > lowest ? `R ${lowest.toFixed(2)} – R ${highest.toFixed(2)}` : `R ${lowest.toFixed(2)}`
                    }
                    const sectionNameFor = (p) => categories.find(c => c.id === productCategories[p.id])?.name || 'No section'
                    const groups = {}
                    productsOnPreorder.forEach(p => {
                      const name = sectionNameFor(p)
                      if (!groups[name]) groups[name] = []
                      groups[name].push(p)
                    })
                    const sectionNames = Object.keys(groups).sort((a, b) => a.localeCompare(b))
                    const toggleSelected = (id) => setPreorderProductSelection(prev => {
                      const next = new Set(prev)
                      next.has(id) ? next.delete(id) : next.add(id)
                      return next
                    })
                    const selectedProducts = productsOnPreorder.filter(p => preorderProductSelection.has(p.id))

                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                          <div style={{ fontSize: 13, color: '#9A8A8E' }}>
                            {productsOnPreorder.length} product{productsOnPreorder.length !== 1 ? 's' : ''} on pre-order
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {selectedProducts.length > 0 && (
                              <button className="delete-btn" onClick={() => removeSelectedFromPreorder(selectedProducts)}>
                                Remove selected ({selectedProducts.length})
                              </button>
                            )}
                            <button className="upload-btn" onClick={openAddToPreorder}>Add products to pre-order</button>
                          </div>
                        </div>

                        {productsOnPreorder.length === 0 ? (
                          <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
                            <div style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 14 }}>No products on pre-order yet.</div>
                            <button className="upload-btn" onClick={openAddToPreorder}>Add products to pre-order</button>
                          </div>
                        ) : (
                          sectionNames.map(sectionName => (
                            <div key={sectionName} style={{ marginBottom: 20 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                {sectionName}
                              </div>
                              <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
                                {groups[sectionName].map(p => {
                                  const activeCount = activePreorderCountFor(p.id)
                                  return (
                                    <div key={p.id} className="student-row">
                                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={preorderProductSelection.has(p.id)}
                                          onChange={() => toggleSelected(p.id)}
                                        />
                                        <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', background: '#F7EEF0', flexShrink: 0 }}>
                                          {productImages[p.id] && (
                                            <img src={mediaUrl(productImages[p.id])} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                          )}
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20' }}>{p.name}</div>
                                          <div style={{ fontSize: 12, color: '#9A8A8E' }}>
                                            {priceRangeFor(p)}
                                            {' · Deposit R '}{parseFloat(p.preorderDeposit).toFixed(2)}
                                            {p.preorderExpectedDate && ` · Expected ${new Date(p.preorderExpectedDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                            {` · ${activeCount} active pre-order${activeCount !== 1 ? 's' : ''}`}
                                          </div>
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="secondary-btn" onClick={() => openEditPreorderProduct(p)}>Edit</button>
                                        <button className="delete-btn" onClick={() => removeFromPreorder(p)}>Remove</button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )
                  })()}

                  {preordersTab === 'customers' && (
                  <>
                  <div style={{
                    background: 'linear-gradient(135deg, #C47A8A 0%, #9E5A6A 100%)',
                    borderRadius: 14,
                    padding: '20px 24px',
                    marginBottom: 20,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 4 }}>
                        {totalPreorders} pre-order{totalPreorders !== 1 ? 's' : ''}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                        Grouped by product
                      </div>
                    </div>
                    <button
                      onClick={() => fetchPreorders()}
                      style={{
                        background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white',
                        borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                      }}
                    >
                      Refresh
                    </button>
                  </div>

                  {preorderRefundableCount > 0 && (
                    <div style={{ background: '#FDE8EC', border: '1px solid #C47A8A', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#9E3A50', fontSize: 13, fontWeight: 600 }}>
                      Past {preorderLeadTime.maxDays} days: {preorderRefundableCount} pre-order{preorderRefundableCount !== 1 ? 's' : ''} may be eligible for a refund.
                    </div>
                  )}

                  <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#3E2A30', marginBottom: 10 }}>Pre-order settings</div>
                    <div style={{ fontSize: 12, color: '#9A8A8E', marginBottom: 12 }}>
                      Pre-orders are ready in {preorderLeadTime.minDays} to {preorderLeadTime.maxDays} days from when the deposit is paid.
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 12, color: '#9A8A8E' }}>
                        Minimum days
                        <input
                          type="number" min="1" max="120" value={preorderLeadTimeDraft.minDays}
                          onChange={e => setPreorderLeadTimeDraft(prev => ({ ...prev, minDays: e.target.value }))}
                          style={{ display: 'block', marginTop: 4, width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #E8E8E8', fontFamily: 'inherit' }}
                        />
                      </label>
                      <label style={{ fontSize: 12, color: '#9A8A8E' }}>
                        Maximum days
                        <input
                          type="number" min="1" max="120" value={preorderLeadTimeDraft.maxDays}
                          onChange={e => setPreorderLeadTimeDraft(prev => ({ ...prev, maxDays: e.target.value }))}
                          style={{ display: 'block', marginTop: 4, width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #E8E8E8', fontFamily: 'inherit' }}
                        />
                      </label>
                      <button className="secondary-btn" onClick={savePreorderLeadTime}>Save</button>
                    </div>
                    {preorderSettingsStatus && (
                      <div style={{ marginTop: 10, fontSize: 12, color: preorderSettingsStatus.ok ? '#2E7D32' : '#C0392B' }}>
                        {preorderSettingsStatus.message}
                      </div>
                    )}
                  </div>

                  {preorderLoading && <div style={{ color: '#9A8A8E', fontSize: 13 }}>Loading...</div>}
                  {!preorderLoading && preorderGroups.length === 0 && (
                    <div style={{ color: '#9A8A8E', fontSize: 13 }}>No pre-orders yet.</div>
                  )}

                  {preorderGroups.map(group => (
                    <div key={group.productId} className="panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0F0F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#3E2A30' }}>{group.productName}</div>
                          <div style={{ fontSize: 12, color: '#9A8A8E', marginTop: 2 }}>
                            {Object.entries(group.statusCounts).map(([status, count]) => `${count} ${status.replace(/_/g, ' ')}`).join(' · ')}
                          </div>
                        </div>
                        {(group.statusCounts.deposit_paid || 0) > 0 && (
                          <button className="secondary-btn" onClick={() => markProductPreordersArrived(group)}>
                            Mark all deposit-paid as arrived ({group.statusCounts.deposit_paid})
                          </button>
                        )}
                      </div>
                      <div>
                        {group.preorders.map(preorder => (
                          <div key={preorder.id} style={{ padding: '14px 20px', borderBottom: '1px solid #F5F5F5', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                            <div style={{ minWidth: 220 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#3E2A30' }}>
                                {preorder.customerName} <span style={{ color: '#9A8A8E', fontWeight: 400 }}>· {preorder.quantity}x{preorder.optionName ? ` · ${preorder.optionName}` : ''}</span>
                                {preorder.isTest && (
                                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#9E9E9E', background: '#F5F5F5', borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase' }}>Test</span>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: '#9A8A8E', marginTop: 2 }}>
                                Deposit R{preorder.deposit.toFixed(2)} · Paid R{preorder.amountPaid.toFixed(2)} · Balance R{preorder.balance.toFixed(2)}
                              </div>
                              <div style={{ fontSize: 12, color: '#9A8A8E', marginTop: 2 }}>
                                {new Date(preorder.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {preorder.promisedByDate && ` · Ready by ${new Date(preorder.promisedByDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                {preorderDaysLabel(preorder) && ` · ${preorderDaysLabel(preorder)}`}
                              </div>
                              {preorder.refundable && (
                                <div style={{ fontSize: 11, color: '#C0392B', fontWeight: 700, marginTop: 4 }}>
                                  Past {preorderLeadTime.maxDays} days: customer may request a refund
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                              <span style={{
                                background: (statusColors[preorder.status] || {}).bg || '#F0F0F0',
                                color: (statusColors[preorder.status] || {}).color || '#888888',
                                borderRadius: 10, padding: '3px 10px', fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
                              }}>
                                {preorder.status.replace(/_/g, ' ')}
                              </span>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <button className="secondary-btn" onClick={() => openMessagePanel('preorder', preorder, null)}>Message Customer</button>
                                {preorder.status === 'deposit_paid' && (
                                  <button className="secondary-btn" onClick={() => markPreorderArrived(preorder)}>Mark arrived</button>
                                )}
                                {preorder.status === 'arrived' && preorder.balance > 0 && (
                                  <button className="secondary-btn" onClick={() => copyPreorderBalanceLink(preorder)}>Copy balance link</button>
                                )}
                                {preorder.status === 'paid_in_full' && (
                                  <>
                                    <input
                                      placeholder="Courier tracking (optional)"
                                      value={courierTrackingDraft[preorder.id] || ''}
                                      onChange={e => setCourierTrackingDraft(prev => ({ ...prev, [preorder.id]: e.target.value }))}
                                      style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #E8E8E8', width: 150, fontFamily: 'inherit' }}
                                    />
                                    <button className="secondary-btn" onClick={() => dispatchPreorder(preorder)}>Mark dispatched</button>
                                    <button className="secondary-btn" onClick={() => collectPreorder(preorder)}>Mark collected</button>
                                  </>
                                )}
                                {cancellable(preorder.status) && (
                                  <>
                                    <button className="secondary-btn" onClick={() => cancelPreorder(preorder)}>Cancel</button>
                                    <button className="secondary-btn" onClick={() => refundPreorder(preorder)}>Mark refunded</button>
                                  </>
                                )}
                              </div>
                              {preorderActionStatus?.id === preorder.id && (
                                <div style={{ fontSize: 11, color: '#9A8A8E' }}>{preorderActionStatus.message}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div style={{ fontSize: 11, color: '#9A8A8E', marginTop: 10 }}>
                    Refunds are done in the Ozow dashboard - Cancel and Mark refunded here only record the status change.
                  </div>
                  </>
                  )}
                </div>
              )
            })()}

            {activePage === 'content' && user?.role !== 'staff' && (() => {
              const errorFor = (path) => contentFieldErrors[path]
              const maxLenFor = (section, field) => contentSpecLimits?.[section]?.[field]?.maxLength

              const fieldRow = (label, section, field, { multiline } = {}) => {
                const path = `${section}.${field}`
                const value = contentDraft[section][field]
                const maxLen = maxLenFor(section, field)
                const error = errorFor(path)
                const inputStyle = {
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: `1px solid ${error ? '#C47A8A' : '#EDD5DB'}`, fontSize: 13, fontFamily: 'inherit',
                  color: '#2C1A20', background: 'white', outline: 'none', boxSizing: 'border-box',
                }
                return (
                  <div key={path} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</label>
                      {maxLen != null && (
                        <span style={{ fontSize: 11, color: value.length > maxLen ? '#C47A8A' : '#C4A0A8' }}>
                          {value.length}/{maxLen}
                        </span>
                      )}
                    </div>
                    {multiline ? (
                      <textarea
                        value={value}
                        onChange={e => updateContentField(path, e.target.value)}
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    ) : (
                      <input type="text" value={value} onChange={e => updateContentField(path, e.target.value)} style={inputStyle} />
                    )}
                    {error && <div style={{ fontSize: 12, color: '#C47A8A', marginTop: 4 }}>{error}</div>}
                  </div>
                )
              }

              const panelStyle = { background: 'white', borderRadius: 12, padding: 28, boxShadow: '0 2px 8px rgba(44,20,28,0.08)', marginBottom: 20 }
              const groupTitleStyle = { fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 20 }

              return (
                <div>
                  <div style={{
                    background: 'linear-gradient(135deg, #C47A8A 0%, #8C5A6A 100%)',
                    borderRadius: 14, padding: '24px 28px', marginBottom: 20, color: 'white',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Website Content</div>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>Changes show on the website within about a minute.</div>
                  </div>

                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ flex: '1 1 420px', minWidth: 320 }}>
                      <div style={panelStyle}>
                        <div style={groupTitleStyle}>Hero</div>
                        {fieldRow('Heading', 'hero', 'heading')}
                        {fieldRow('Subtext', 'hero', 'subtext', { multiline: true })}
                        {fieldRow('Tagline', 'hero', 'tagline')}
                        {fieldRow('Book Button Label', 'hero', 'bookButtonLabel')}
                        {fieldRow('Shop Button Label', 'hero', 'shopButtonLabel')}
                      </div>

                      <div style={panelStyle}>
                        <div style={groupTitleStyle}>Contact</div>
                        {fieldRow('Address Line 1', 'contact', 'addressLine1')}
                        {fieldRow('Address Line 2', 'contact', 'addressLine2')}
                        {fieldRow('Phone', 'contact', 'phone')}
                        {fieldRow('Email', 'contact', 'email')}
                        {fieldRow('Hours Label', 'contact', 'hoursLabel')}
                        {fieldRow('Hours Line 1', 'contact', 'hoursLine1')}
                        {fieldRow('Hours Line 2', 'contact', 'hoursLine2')}
                        {fieldRow('WhatsApp Label', 'contact', 'whatsappLabel')}
                        {fieldRow('WhatsApp Text', 'contact', 'whatsappText')}
                      </div>

                      <div style={panelStyle}>
                        <div style={groupTitleStyle}>Section Headings</div>
                        {fieldRow('Products', 'sectionHeadings', 'products')}
                        {fieldRow('Classes', 'sectionHeadings', 'classes')}
                        {fieldRow('Gallery', 'sectionHeadings', 'gallery')}
                        {fieldRow('Contact', 'sectionHeadings', 'contact')}
                      </div>

                      <div style={panelStyle}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 6 }}>Footer</div>
                        <div style={{ fontSize: 12, color: '#9A8A8E', marginBottom: 16 }}>Optional - only shows on the site if it isn't empty.</div>
                        {fieldRow('Footer Text', 'footer', 'text', { multiline: true })}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                        <button
                          onClick={saveContent}
                          disabled={!contentDirty || contentSaving}
                          style={{
                            background: '#C47A8A', color: 'white', border: 'none', borderRadius: 8,
                            padding: '10px 22px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                            cursor: (!contentDirty || contentSaving) ? 'not-allowed' : 'pointer',
                            opacity: (!contentDirty || contentSaving) ? 0.5 : 1,
                          }}
                        >
                          {contentSaving ? 'Saving...' : 'Save changes'}
                        </button>
                        {contentDirty && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#C47A8A' }}>Unsaved changes</span>
                        )}
                      </div>
                      {contentSaveNote && (
                        <div style={{
                          fontSize: 13, fontWeight: 600, marginBottom: 20,
                          color: contentSaveNote.startsWith('Failed') ? '#C47A8A' : '#2E7D32',
                        }}>
                          {contentSaveNote}
                        </div>
                      )}

                      <div style={panelStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20' }}>History</div>
                          <button className="secondary-btn" onClick={() => setContentConfirm({ type: 'reset' })}>
                            Reset to defaults
                          </button>
                        </div>
                        {contentHistoryLoading && (
                          <div style={{ fontSize: 13, color: '#9A8A8E' }}>Loading history...</div>
                        )}
                        {!contentHistoryLoading && contentHistory.length === 0 && (
                          <div style={{ fontSize: 13, color: '#9A8A8E' }}>No earlier versions yet.</div>
                        )}
                        {contentHistory.map(h => (
                          <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F7EEF0' }}>
                            <div style={{ fontSize: 13, color: '#2C1A20' }}>
                              {new Date(h.saved_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              <span style={{ color: '#9A8A8E' }}> &middot; {h.saved_by || 'system'}</span>
                            </div>
                            <button className="secondary-btn" onClick={() => setContentConfirm({ type: 'restore', historyId: h.id })}>
                              Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ flex: '1 1 320px', minWidth: 280 }}>
                      <div style={{ position: 'sticky', top: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                          Preview
                        </div>
                        <div style={{ background: SITE_THEME.background, borderRadius: 16, padding: 28, border: `1px solid ${SITE_THEME.navBackground}` }}>
                          <div style={{ fontFamily: `'${SITE_THEME.headingFont}', serif`, fontSize: 26, fontWeight: 700, color: SITE_THEME.text, marginBottom: 8, lineHeight: 1.2 }}>
                            {contentDraft.hero.heading}
                          </div>
                          <div style={{ fontFamily: `'${SITE_THEME.bodyFont}', sans-serif`, fontSize: 14, color: SITE_THEME.mutedText, marginBottom: 6 }}>
                            {contentDraft.hero.subtext}
                          </div>
                          <div style={{ fontFamily: `'${SITE_THEME.headingFont}', serif`, fontStyle: 'italic', fontSize: 14, color: SITE_THEME.accent, marginBottom: 20 }}>
                            {contentDraft.hero.tagline}
                          </div>
                          <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
                            <span style={{ background: SITE_THEME.accent, color: 'white', padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                              {contentDraft.hero.bookButtonLabel}
                            </span>
                            <span style={{ border: `1px solid ${SITE_THEME.accent}`, color: SITE_THEME.accent, padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                              {contentDraft.hero.shopButtonLabel}
                            </span>
                          </div>

                          <div style={{ background: 'white', borderRadius: 12, padding: 20, border: `1px solid ${SITE_THEME.navBackground}` }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: SITE_THEME.accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
                              Get in Touch
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase' }}>Address</div>
                              <div style={{ fontSize: 13, color: SITE_THEME.text }}>{contentDraft.contact.addressLine1}<br />{contentDraft.contact.addressLine2}</div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase' }}>Phone</div>
                              <div style={{ fontSize: 13, color: SITE_THEME.text }}>{contentDraft.contact.phone}</div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase' }}>{contentDraft.contact.hoursLabel}</div>
                              <div style={{ fontSize: 13, color: SITE_THEME.text }}>{contentDraft.contact.hoursLine1}<br />{contentDraft.contact.hoursLine2}</div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase' }}>{contentDraft.contact.whatsappLabel}</div>
                              <div style={{ fontSize: 13, color: SITE_THEME.accent, fontWeight: 600 }}>{contentDraft.contact.whatsappText}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase' }}>Email</div>
                              <div style={{ fontSize: 13, color: SITE_THEME.accent, fontWeight: 600 }}>{contentDraft.contact.email}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {contentConfirm && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,20,28,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                      <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 380, width: '100%' }}>
                        {contentConfirm.type === 'leave' ? (
                          <>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#2C1A20', marginBottom: 10 }}>Leave without saving?</div>
                            <p style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20, lineHeight: 1.6 }}>
                              You have unsaved changes to the website content. If you leave now, they'll be lost.
                            </p>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                              <button className="secondary-btn" onClick={() => setContentConfirm(null)}>Keep editing</button>
                              <button
                                className="delete-btn"
                                onClick={() => {
                                  const target = contentConfirm.target
                                  setContentDraft(contentSaved)
                                  setContentFieldErrors({})
                                  setContentConfirm(null)
                                  // Not navigateTo() - contentDirty is still true in this
                                  // closure, which would just reopen this same confirm.
                                  const path = pathForPage(target)
                                  if (window.location.pathname !== path) window.history.pushState(null, '', path)
                                  setActivePage(target)
                                  setMobileNavOpen(false)
                                }}
                              >
                                Discard changes
                              </button>
                            </div>
                          </>
                        ) : contentConfirm.type === 'restore' ? (
                          <>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#2C1A20', marginBottom: 10 }}>Restore this version?</div>
                            <p style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20, lineHeight: 1.6 }}>
                              This replaces the current website content with this earlier version. The version it replaces is saved to history too, so you can always restore it back.
                            </p>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                              <button className="secondary-btn" onClick={() => setContentConfirm(null)}>Cancel</button>
                              <button className="upload-btn" onClick={() => restoreContentVersion(contentConfirm.historyId)}>Restore</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#2C1A20', marginBottom: 10 }}>Reset to defaults?</div>
                            <p style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20, lineHeight: 1.6 }}>
                              This replaces all website content with the original defaults. The current version is saved to history first, so you can restore it back if needed.
                            </p>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                              <button className="secondary-btn" onClick={() => setContentConfirm(null)}>Cancel</button>
                              <button className="delete-btn" onClick={resetContentToDefaults}>Reset</button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {activePage === 'orders' && (
              <div>
                <div style={{
                  background: 'linear-gradient(135deg, #7A9E8A 0%, #4A7A62 100%)',
                  borderRadius: 14,
                  padding: '20px 24px',
                  marginBottom: 20,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 4 }}>
                      {orders.length} order{orders.length !== 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                      Click an order to expand details
                    </div>
                  </div>
                  <button
                    onClick={() => fetchOrders()}
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      color: 'white',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: 13,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontWeight: 600,
                    }}
                  >
                    Refresh
                  </button>
                </div>

                <div style={{ fontSize: 12, color: '#9A8A8E', marginBottom: 16 }}>
                  Orders auto-archive after 7 days.
                </div>

                {/* Active / Archive tabs */}
                <div style={{
                  display: 'flex',
                  gap: 0,
                  borderBottom: '1px solid #E8E8E8',
                  marginBottom: 20,
                  overflowX: 'auto',
                }}>
                  {[{ label: 'Active', value: 'active', count: orderCounts.active }, { label: 'Archive', value: 'archived', count: orderCounts.archived }].map(tab => (
                    <button
                      key={tab.value}
                      onClick={() => switchOrdersView(tab.value)}
                      style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontSize: 13,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        color: ordersView === tab.value ? '#C47A8A' : '#888888',
                        borderBottom: ordersView === tab.value ? '2px solid #C47A8A' : '2px solid transparent',
                        fontWeight: ordersView === tab.value ? 700 : 500,
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {tab.label}
                      {tab.count > 0 && (
                        <span style={{
                          background: ordersView === tab.value ? '#C47A8A' : '#E8E8E8',
                          color: ordersView === tab.value ? 'white' : '#888888',
                          borderRadius: 10,
                          padding: '1px 7px',
                          fontSize: 10,
                          fontWeight: 700,
                        }}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {orderConfirmError && (
                  <div className="error-msg" style={{ marginBottom: 16 }}>
                    {orderConfirmError}
                  </div>
                )}

                {ordersLoading && (
                  <div style={{ fontSize: 13, color: '#AAAAAA', padding: '20px 0' }}>Loading orders...</div>
                )}

                {!ordersLoading && orders.length === 0 && (
                  <div className="panel" style={{ fontSize: 13, color: '#AAAAAA', padding: '20px 24px' }}>
                    {ordersView === 'archived'
                      ? 'No archived orders yet. Orders older than 7 days will appear here.'
                      : 'No orders yet. When customers place orders on the website they will appear here.'}
                  </div>
                )}

                {!ordersLoading && orders.map(order => (
                  <div
                    key={order.id}
                    className="panel"
                    style={{
                      background: order.status === 'confirmed' ? '#F0F5F2' : '#FDF0F3',
                      border: 'none',
                      marginBottom: 12,
                      padding: 0,
                      overflow: 'hidden',
                      borderRadius: 12,
                      boxShadow: '0 2px 8px rgba(44,20,28,0.08)',
                    }}
                  >

                    {/* Order header */}
                    <div
                      className="order-card-header"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '18px 24px',
                        borderBottom: order.expanded ? '1px solid #F4F4F5' : 'none',
                        cursor: 'pointer',
                        background: order.expanded ? '#FAFAFA' : 'white',
                        transition: 'background 0.15s',
                      }}
                      onClick={() => setOrders(prev => prev.map(o =>
                        o.id === order.id ? { ...o, expanded: !o.expanded } : o
                      ))}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', marginBottom: 4 }}>
                            {order.customerName}
                            {order.isTest && (
                              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#9E9E9E', background: '#F5F5F5', borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase' }}>Test</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#AAAAAA' }}>{order.customerPhone}</span>
                            <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#DDDDDD', display: 'inline-block' }} />
                            <span style={{ fontSize: 12, color: '#AAAAAA' }}>
                              {new Date(order.createdAt).toLocaleDateString('en-ZA', {
                                day: 'numeric', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>R {order.total}</div>
                        {order.fulfilmentMethod && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                            padding: '3px 8px', borderRadius: 10,
                            background: order.fulfilmentMethod === 'delivery' ? '#E3F2FD' : '#F3E5F5',
                            color: order.fulfilmentMethod === 'delivery' ? '#1565C0' : '#6A1B9A',
                          }}>
                            {order.fulfilmentMethod}
                          </span>
                        )}
                        <span className="payment-badge" style={{
                          background: paymentBadge(order).background, color: paymentBadge(order).color,
                        }}>
                          {paymentBadge(order).label}
                        </span>
                        <span className={`status-badge${order.status === 'confirmed' ? ' confirmed' : ''}`}>
                          {order.status || 'pending'}
                        </span>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transition: 'transform 0.2s ease',
                            transform: order.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            color: '#AAAAAA',
                            flexShrink: 0,
                          }}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded order details */}
                    {order.expanded && (
                      <div style={{
                        padding: '20px 24px',
                        background: order.status === 'confirmed' ? '#E8F2EC' : '#F7EEF0',
                        borderTop: `1px solid ${order.status === 'confirmed' ? '#C8E0D0' : '#EDD5DB'}`,
                      }}>

                        {/* Items list */}
                        <div style={{ marginBottom: 16 }}>
                          <div className="field-label" style={{ marginBottom: 10 }}>Items Ordered</div>
                          {order.items?.map((item, i) => (
                            <div key={i} style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '10px 0',
                              borderBottom: '1px solid #F0F0F0',
                            }}>
                              <div>
                                <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>{item.name}</span>
                                <span style={{
                                  display: 'inline-block',
                                  marginLeft: 8,
                                  background: '#F0F0F0',
                                  color: '#888888',
                                  borderRadius: 10,
                                  padding: '2px 8px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}>
                                  x{item.qty}
                                </span>
                                {item.lengthMm != null && (
                                  <div style={{ fontSize: 12, color: '#9A8A8E', marginTop: 2 }}>
                                    {item.lengthMm}mm, {item.curl} curl
                                  </div>
                                )}
                                {item.optionName && (
                                  <div style={{ fontSize: 12, color: '#9A8A8E', marginTop: 2 }}>
                                    {item.optionLabel || 'Option'}: {item.optionName}
                                  </div>
                                )}
                              </div>
                              <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>R {item.price * item.qty}</span>
                            </div>
                          ))}
                          {order.subtotal != null && (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: '#7A6670' }}>
                                <span>Subtotal</span>
                                <span>R {order.subtotal}</span>
                              </div>
                              {order.fulfilmentMethod === 'delivery' && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: '#7A6670' }}>
                                  <span>Delivery fee</span>
                                  <span>R {order.deliveryFee}</span>
                                </div>
                              )}
                            </>
                          )}
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '14px 0 0 0',
                            borderTop: '2px solid #E8E8E8',
                            marginTop: 4,
                          }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Order Total
                            </span>
                            <span style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A' }}>R {order.total}</span>
                          </div>
                        </div>

                        {/* Customer details */}
                        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #F0F0F0' }}>
                          <div className="field-label" style={{ marginBottom: 10 }}>Customer</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: '#AAAAAA', minWidth: 70 }}>Name</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{order.customerName}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: '#AAAAAA', minWidth: 70 }}>WhatsApp</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{order.customerPhone}</span>
                          </div>
                        </div>

                        {/* Fulfilment details */}
                        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #F0F0F0' }}>
                          <div className="field-label" style={{ marginBottom: 10 }}>Fulfilment</div>
                          {!order.fulfilmentMethod ? (
                            <div style={{ fontSize: 13, color: '#AAAAAA', fontStyle: 'italic' }}>Not recorded</div>
                          ) : (
                            <>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                <span style={{ fontSize: 12, color: '#AAAAAA', minWidth: 70 }}>Method</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', textTransform: 'capitalize' }}>{order.fulfilmentMethod}</span>
                              </div>
                              {order.fulfilmentMethod === 'delivery' && (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                  <span style={{ fontSize: 12, color: '#AAAAAA', minWidth: 70 }}>Address</span>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>
                                    {order.deliveryAddress}, {order.deliverySuburb}, {order.deliveryCity}, {order.deliveryPostalCode}
                                    {order.deliveryNotes && (
                                      <div style={{ fontSize: 12, color: '#9A8A8E', marginTop: 4, fontWeight: 400 }}>
                                        {order.deliveryNotes}
                                      </div>
                                    )}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Payment details */}
                        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #F0F0F0' }}>
                          <div className="field-label" style={{ marginBottom: 10 }}>Payment</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: '#AAAAAA', minWidth: 70 }}>Method</span>
                            <span className="payment-badge" style={{
                              background: paymentBadge(order).background, color: paymentBadge(order).color,
                            }}>
                              {paymentBadge(order).label}
                            </span>
                          </div>
                          {order.ozowTransactionId && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, color: '#AAAAAA', minWidth: 70 }}>Ozow Txn</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{order.ozowTransactionId}</span>
                            </div>
                          )}
                          {order.payflexOrderId && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, color: '#AAAAAA', minWidth: 70 }}>Payflex Id</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{order.payflexOrderId}</span>
                            </div>
                          )}
                          {order.customerEmail && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: '#AAAAAA', minWidth: 70 }}>Email</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{order.customerEmail}</span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #F0F0F0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          {order.status !== 'confirmed' && (
                            <div>
                              {onlinePaymentNotPaid(order) && (
                                <div style={{ fontSize: 12, color: '#C47A8A', marginBottom: 6 }}>
                                  This {order.paymentMethod === 'ozow' ? 'Ozow' : 'Payflex'} payment has not come through yet.
                                </div>
                              )}
                              {onlinePaymentNotPaid(order) && confirmPromptOrderId === order.id ? (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span style={{ fontSize: 12, color: '#888888' }}>Confirm anyway?</span>
                                  <button className="upload-btn" onClick={() => confirmOrder(order.id)}>
                                    Yes, confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmPromptOrderId(null)}
                                    style={{
                                      background: 'none', border: '1px solid #DDDDDD', borderRadius: 6,
                                      padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="upload-btn"
                                  onClick={() => onlinePaymentNotPaid(order) ? setConfirmPromptOrderId(order.id) : confirmOrder(order.id)}
                                >
                                  Confirm Payment Received
                                </button>
                              )}
                            </div>
                          )}
                          <button
                            className="secondary-btn"
                            onClick={() => openMessagePanel('order', order, null)}
                          >
                            Message Customer
                          </button>
                          {order.status === 'confirmed' && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#4CAF50', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#4CAF50"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 12 4 16" />
                              </svg>
                              Payment confirmed
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activePage === 'notifications' && (() => {
              const tabs = [
                { label: 'All',      value: 'all' },
                { label: 'Orders',   value: 'order' },
                { label: 'Images',   value: 'image' },
                { label: 'Sections', value: 'section' },
                { label: 'Archive',  value: 'archive' },
              ]

              const activeNotifs = notifTab === 'archive'
                ? archivedNotifications
                : notifTab === 'all'
                  ? notifications
                  : notifications.filter(n => n.type === notifTab)

              return (
                <div>
                  {/* Header row */}
                  <div style={{
                    background: 'linear-gradient(135deg, #C47A8A 0%, #8C5A6A 100%)',
                    borderRadius: 14,
                    padding: '20px 24px',
                    marginBottom: 20,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 4 }}>
                        {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                        Notifications auto-archive after 7 days
                      </div>
                    </div>
                    {unreadCount > 0 && notifTab !== 'archive' && (
                      <button
                        onClick={markAllRead}
                        style={{
                          background: 'rgba(255,255,255,0.15)',
                          border: '1px solid rgba(255,255,255,0.3)',
                          color: 'white',
                          borderRadius: 8,
                          padding: '8px 16px',
                          fontSize: 13,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontWeight: 600,
                        }}
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  {/* Type tabs */}
                  <div style={{
                    display: 'flex',
                    gap: 0,
                    borderBottom: '1px solid #E8E8E8',
                    marginBottom: 20,
                    overflowX: 'auto',
                  }}>
                    {tabs.map(tab => {
                      const count = tab.value === 'archive'
                        ? archivedNotifications.length
                        : tab.value === 'all'
                          ? notifications.length
                          : notifications.filter(n => n.type === tab.value).length
                      return (
                        <button
                          key={tab.value}
                          onClick={() => setNotifTab(tab.value)}
                          style={{
                            padding: '10px 18px',
                            border: 'none',
                            background: 'transparent',
                            fontSize: 13,
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            color: notifTab === tab.value ? '#C47A8A' : '#888888',
                            borderBottom: notifTab === tab.value ? '2px solid #C47A8A' : '2px solid transparent',
                            fontWeight: notifTab === tab.value ? 700 : 500,
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {tab.label}
                          {count > 0 && (
                            <span style={{
                              background: notifTab === tab.value ? '#C47A8A' : '#E8E8E8',
                              color: notifTab === tab.value ? 'white' : '#888888',
                              borderRadius: 10,
                              padding: '1px 7px',
                              fontSize: 10,
                              fontWeight: 700,
                            }}>
                              {count}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Notification list */}
                  <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
                    {activeNotifs.length === 0 && (
                      <div style={{ padding: 24, fontSize: 13, color: '#AAAAAA' }}>
                        {notifTab === 'archive'
                          ? 'No archived notifications yet. Notifications older than 7 days will appear here.'
                          : 'No notifications in this category.'}
                      </div>
                    )}
                    {activeNotifs.map(n => (
                      <div
                        key={n.id}
                        className={`notif-item${!n.read && notifTab !== 'archive' ? ' unread' : ''}`}
                        onClick={() => !n.read && notifTab !== 'archive' && markOneRead(n.id)}
                        style={{ cursor: !n.read && notifTab !== 'archive' ? 'pointer' : 'default' }}
                      >
                        <span className={`notif-dot${n.read || notifTab === 'archive' ? ' read' : ''}`} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span className={`notif-type-badge notif-type-${n.type}`}>{n.type}</span>
                            {notifTab === 'archive' && (
                              <span style={{ fontSize: 10, color: '#BBBBBB', fontStyle: 'italic' }}>Archived</span>
                            )}
                          </div>
                          <div className="notif-title">{n.title}</div>
                          <div className="notif-message">{n.message}</div>
                          <div className="notif-time">
                            {new Date(n.createdAt).toLocaleDateString('en-ZA', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {activePage === 'settings' && (
              <div>
                <div style={{
                  background: 'linear-gradient(135deg, #8C5A6A 0%, #C4A882 100%)',
                  borderRadius: 14,
                  padding: '24px 28px',
                  marginBottom: 24,
                  color: 'white',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Settings</div>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>Manage your account preferences</div>
                  </div>
                </div>

                <div style={{ background: 'white', borderRadius: 12, padding: 28, boxShadow: '0 2px 8px rgba(44,20,28,0.08)', maxWidth: 480 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 20 }}>Change Password</div>

                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Current Password</label>
                  <input
                    type="password"
                    placeholder="Current password"
                    value={bPwCurrent}
                    onChange={e => setBPwCurrent(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #EDD5DB', fontSize: 13, fontFamily: 'inherit', color: '#2C1A20', background: 'white', outline: 'none', marginBottom: 12 }}
                  />

                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>New Password</label>
                  <input
                    type="password"
                    placeholder="New password (min 6 characters)"
                    value={bPwNew}
                    onChange={e => setBPwNew(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #EDD5DB', fontSize: 13, fontFamily: 'inherit', color: '#2C1A20', background: 'white', outline: 'none', marginBottom: 12 }}
                  />

                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Confirm New Password</label>
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={bPwConfirm}
                    onChange={e => setBPwConfirm(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #EDD5DB', fontSize: 13, fontFamily: 'inherit', color: '#2C1A20', background: 'white', outline: 'none', marginBottom: 12 }}
                  />

                  {bPwMsg && (
                    <div style={{
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: 14,
                      color: bPwMsg.includes('successfully') ? '#2E7D32' : '#C47A8A',
                    }}>
                      {bPwMsg}
                    </div>
                  )}

                  <button
                    onClick={changeBusinessPassword}
                    style={{ background: '#C47A8A', color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Change Password
                  </button>
                </div>

                {user?.role === 'owner' && (
                  <div style={{ background: 'white', borderRadius: 12, padding: 28, boxShadow: '0 2px 8px rgba(44,20,28,0.08)', maxWidth: 480, marginTop: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 6 }}>Create Staff User</div>
                    <div style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20 }}>Add a staff member who can view orders and the dashboard.</div>

                    <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Username</label>
                    <input
                      type="text"
                      placeholder="Staff username"
                      value={newStaffUser.username}
                      onChange={e => setNewStaffUser(p => ({ ...p, username: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #EDD5DB', fontSize: 13, fontFamily: 'inherit', color: '#2C1A20', background: 'white', outline: 'none', marginBottom: 12 }}
                    />

                    <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Temporary Password</label>
                    <input
                      type="password"
                      placeholder="Set a temporary password"
                      value={newStaffUser.password}
                      onChange={e => setNewStaffUser(p => ({ ...p, password: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #EDD5DB', fontSize: 13, fontFamily: 'inherit', color: '#2C1A20', background: 'white', outline: 'none', marginBottom: 12 }}
                    />

                    {staffCreateMsg && (
                      <div style={{
                        fontSize: 13, fontWeight: 600, marginBottom: 14,
                        color: staffCreateMsg.includes('created') ? '#2E7D32' : '#C47A8A',
                      }}>
                        {staffCreateMsg}
                      </div>
                    )}

                    <button
                      onClick={createStaffUser}
                      style={{ background: '#C47A8A', color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Create Staff User
                    </button>
                  </div>
                )}

                {user?.role === 'owner' && (
                  <div style={{ background: 'white', borderRadius: 12, padding: 28, boxShadow: '0 2px 8px rgba(44,20,28,0.08)', maxWidth: 640, marginTop: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 6 }}>Message Templates</div>
                    <div style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20 }}>
                      The WhatsApp/email messages used by "Message Customer" buttons throughout the app. Editing one here only changes it for you - everyone else still sees the built-in default until you edit it too.
                    </div>

                    {['orders', 'preorders', 'training'].map(group => (
                      <div key={group} style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#8C5A6A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                          {group === 'orders' ? 'Orders' : group === 'preorders' ? 'Pre-orders' : 'Lash Training'}
                        </div>
                        {messageTemplates.filter(t => t.group === group).map(template => {
                          const expanded = expandedTemplateId === template.id
                          const draft = draftFor(template)
                          const status = templateStatus?.id === template.id ? templateStatus : null
                          const previewData = SAMPLE_DATA[group]
                          return (
                            <div key={template.id} style={{ border: '1px solid #F0E8E8', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                              <button
                                onClick={() => toggleTemplateExpanded(template)}
                                style={{
                                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  padding: '10px 14px', background: expanded ? '#FAF6F4' : 'white', border: 'none', cursor: 'pointer',
                                  fontFamily: 'inherit', textAlign: 'left',
                                }}
                              >
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#2C1A20' }}>{template.label}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {template.isOverridden && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#C47A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Edited</span>
                                  )}
                                  <span style={{ color: '#9A8A8E' }}>{expanded ? '▾' : '▸'}</span>
                                </span>
                              </button>

                              {expanded && (
                                <div style={{ padding: 16, borderTop: '1px solid #F0E8E8' }}>
                                  <div className="field-label" style={{ marginBottom: 4 }}>Email subject</div>
                                  <input
                                    ref={templateSubjectFieldRef}
                                    className="category-input"
                                    style={{ width: '100%', marginBottom: 12 }}
                                    value={draft.emailSubject}
                                    onFocus={() => setLastFocusedTemplateField('subject')}
                                    onChange={e => updateTemplateDraft(template.id, { emailSubject: e.target.value })}
                                  />

                                  <div className="field-label" style={{ marginBottom: 4 }}>WhatsApp/email text</div>
                                  <textarea
                                    ref={templateBodyFieldRef}
                                    className="category-input"
                                    style={{ width: '100%', resize: 'vertical', marginBottom: 10, fontFamily: 'inherit' }}
                                    rows={10}
                                    value={draft.body}
                                    onFocus={() => setLastFocusedTemplateField('body')}
                                    onChange={e => updateTemplateDraft(template.id, { body: e.target.value })}
                                  />

                                  <div className="field-label" style={{ marginBottom: 6 }}>Insert placeholder</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                                    {PLACEHOLDERS_BY_GROUP[group].map(p => (
                                      <button
                                        key={p}
                                        type="button"
                                        className="secondary-btn"
                                        style={{ fontSize: 11, padding: '4px 9px' }}
                                        onClick={() => insertPlaceholder(template, p)}
                                      >
                                        {`{${p}}`}
                                      </button>
                                    ))}
                                  </div>

                                  {(() => {
                                    const unknown = [...new Set([...findUnknownPlaceholders(draft.body), ...findUnknownPlaceholders(draft.emailSubject)])]
                                    if (unknown.length === 0) return null
                                    return (
                                      <div className="error-msg" style={{ marginBottom: 12 }}>
                                        Unknown placeholder{unknown.length > 1 ? 's' : ''}: {unknown.map(p => `{${p}}`).join(', ')} - will show as blank text, never as sent.
                                      </div>
                                    )
                                  })()}

                                  <div className="field-label" style={{ marginBottom: 6 }}>Live preview (sample data, as sent on WhatsApp)</div>
                                  <div style={{ background: '#FAF6F4', borderRadius: 8, padding: 14, fontSize: 13, color: '#2C1A20', whiteSpace: 'pre-wrap', lineHeight: 1.6, marginBottom: 16 }}>
                                    {renderTemplate(draft.body, previewData, { whatsapp: true }) || '—'}
                                  </div>

                                  {status && (
                                    <div className={status.type === 'error' ? 'error-msg' : 'success-msg'} style={{ marginBottom: 12 }}>
                                      {status.message}
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button className="upload-btn" disabled={templateSaving} onClick={() => saveTemplateEdit(template)}>
                                      {templateSaving ? 'Saving…' : 'Save'}
                                    </button>
                                    {template.isOverridden && (
                                      <button className="delete-btn" onClick={() => resetTemplateToDefault(template)}>
                                        Reset to Default
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {user?.role === 'owner' && businessDetailsDraft && (
                  <div style={{ background: 'white', borderRadius: 12, padding: 28, boxShadow: '0 2px 8px rgba(44,20,28,0.08)', maxWidth: 480, marginTop: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 6 }}>Business Details & Reminders</div>
                    <div style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20 }}>
                      Used in message templates (bank details, proof-of-payment number) and to time the Dashboard's Reminders Due card.
                    </div>

                    {[
                      { key: 'businessName', label: 'Business Name' },
                      { key: 'bankName', label: 'Bank' },
                      { key: 'accountName', label: 'Account Name' },
                      { key: 'accountNumber', label: 'Account Number' },
                      { key: 'proofOfPaymentNumber', label: 'Proof-of-Payment WhatsApp Number' },
                    ].map(field => (
                      <div key={field.key} style={{ marginBottom: 12 }}>
                        <label className="field-label" style={{ marginBottom: 4, display: 'block' }}>{field.label}</label>
                        <input
                          className="category-input"
                          style={{ width: '100%' }}
                          value={businessDetailsDraft[field.key] || ''}
                          onChange={e => setBusinessDetailsDraft(prev => ({ ...prev, [field.key]: e.target.value }))}
                        />
                      </div>
                    ))}

                    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                      {[
                        { key: 'paymentReminderDays', label: 'Payment reminder (days before course ends)' },
                        { key: 'certificateWarningDays', label: 'Certificate warning (days before course ends)' },
                        { key: 'reminderSnoozeDays', label: 'Remind again after (days)' },
                      ].map(field => (
                        <div key={field.key} style={{ flex: 1 }}>
                          <label className="field-label" style={{ marginBottom: 4, display: 'block', fontSize: 10 }}>{field.label}</label>
                          <input
                            className="category-input"
                            type="number"
                            style={{ width: '100%' }}
                            value={businessDetailsDraft[field.key] ?? ''}
                            onChange={e => setBusinessDetailsDraft(prev => ({ ...prev, [field.key]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>

                    {businessDetailsStatus && (
                      <div className="error-msg" style={{ marginBottom: 12 }}>{businessDetailsStatus.message}</div>
                    )}

                    <button
                      onClick={saveBusinessDetails}
                      disabled={businessDetailsSaving}
                      style={{ background: '#C47A8A', color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      {businessDetailsSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {messagePanelTarget && (
        <MessageCustomerPanel
          entityType={messagePanelTarget.entityType}
          entity={messagePanelTarget.entity}
          course={messagePanelTarget.course}
          templates={messageTemplates}
          businessDetails={businessDetails || {}}
          onClose={() => setMessagePanelTarget(null)}
        />
      )}

      {datesDialogFor && (
        <StudentDatesDialog
          student={datesDialogFor}
          durationDays={coursesMerged.find(c => c.id === datesDialogFor.classId)?.durationDays}
          onClose={() => setDatesDialogFor(null)}
          onSave={async (startDate, endDate) => {
            const res = await apiFetch(`/api/classes/${datesDialogFor.classId}/students/${datesDialogFor.id}/dates`, {
              method: 'PATCH',
              body: JSON.stringify({ startDate, endDate }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Failed to save course dates.')
            setClassStudents(prev => prev.map(s => s.id === data.id ? data : s))
            setMissingCourseDates(prev => prev.filter(m => m.studentId !== data.id))
            setDatesDialogFor(null)
            toast('Course dates saved', 'success')
          }}
        />
      )}

      {recordPaymentFor && (
        <RecordPaymentDialog
          student={recordPaymentFor}
          onClose={() => setRecordPaymentFor(null)}
          onSave={(amount, note) => savePaymentForStudent(recordPaymentFor, amount, note)}
        />
      )}

      {preorderProductDialogFor && (
        <PreorderProductDialog
          mode={preorderProductDialogFor.mode}
          product={preorderProductDialogFor.product}
          productsAvailable={productsAvailableForPreorder}
          search={preorderProductSearch}
          onSearchChange={setPreorderProductSearch}
          onClose={() => setPreorderProductDialogFor(null)}
          onSaveSingle={savePreorderProduct}
          onSaveBulk={saveBulkPreorderProducts}
        />
      )}
    </>
  )
}

export default function App(props) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppInner {...props} />
      </ConfirmProvider>
    </ToastProvider>
  )
}
