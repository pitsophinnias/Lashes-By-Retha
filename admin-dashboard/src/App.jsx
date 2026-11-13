import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

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

// Cloudinary URLs are already absolute; local-disk URLs are relative and
// need the API host in front of them.
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

// WCAG 2.x relative luminance / contrast ratio, for the Theme page's
// pass/fail readout - mirrors backend/src/siteSettings/schema.js exactly.
const hexToRgb = (hex) => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const srgbToLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const relativeLuminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => srgbToLinear(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrastRatio = (hexA, hexB) => {
  const a = relativeLuminance(hexA), b = relativeLuminance(hexB)
  const lighter = Math.max(a, b), darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}
const MIN_CONTRAST_RATIO = 4.5

// Shared by the Website Content and Theme admin pages - a leave/restore/
// reset confirmation, in-page rather than a browser alert/confirm.
function SettingsConfirmModal({ confirm, itemLabel, onCancel, onDiscard, onRestore, onReset }) {
  if (!confirm) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,20,28,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 380, width: '100%' }}>
        {confirm.type === 'leave' ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#2C1A20', marginBottom: 10 }}>Leave without saving?</div>
            <p style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20, lineHeight: 1.6 }}>
              You have unsaved changes to the {itemLabel}. If you leave now, they'll be lost.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="secondary-btn" onClick={onCancel}>Keep editing</button>
              <button className="delete-btn" onClick={() => onDiscard(confirm.target)}>Discard changes</button>
            </div>
          </>
        ) : confirm.type === 'restore' ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#2C1A20', marginBottom: 10 }}>Restore this version?</div>
            <p style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20, lineHeight: 1.6 }}>
              This replaces the current {itemLabel} with this earlier version. The version it replaces is saved to history too, so you can always restore it back.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="secondary-btn" onClick={onCancel}>Cancel</button>
              <button className="upload-btn" onClick={() => onRestore(confirm.historyId)}>Restore</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#2C1A20', marginBottom: 10 }}>Reset to defaults?</div>
            <p style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20, lineHeight: 1.6 }}>
              This replaces the {itemLabel} with the original defaults. The current version is saved to history first, so you can restore it back if needed.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="secondary-btn" onClick={onCancel}>Cancel</button>
              <button className="delete-btn" onClick={onReset}>Reset</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Shared history list + "Reset to defaults" button.
function SettingsHistoryPanel({ history, loading, onReset, onRestore }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: 28, boxShadow: '0 2px 8px rgba(44,20,28,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20' }}>History</div>
        <button className="secondary-btn" onClick={onReset}>Reset to defaults</button>
      </div>
      {loading && <div style={{ fontSize: 13, color: '#9A8A8E' }}>Loading history...</div>}
      {!loading && history.length === 0 && <div style={{ fontSize: 13, color: '#9A8A8E' }}>No earlier versions yet.</div>}
      {history.map(h => (
        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F7EEF0' }}>
          <div style={{ fontSize: 13, color: '#2C1A20' }}>
            {new Date(h.saved_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            <span style={{ color: '#9A8A8E' }}> &middot; {h.saved_by || 'system'}</span>
          </div>
          <button className="secondary-btn" onClick={() => onRestore(h.id)}>Restore</button>
        </div>
      ))}
    </div>
  )
}

// Shared "Save changes" button + "Unsaved changes" note + save result note.
function SettingsSaveBar({ onSave, dirty, saving, note }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          style={{
            background: '#C47A8A', color: 'white', border: 'none', borderRadius: 8,
            padding: '10px 22px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
            opacity: (!dirty || saving) ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {dirty && <span style={{ fontSize: 12, fontWeight: 700, color: '#C47A8A' }}>Unsaved changes</span>}
      </div>
      {note && (
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 20, color: note.startsWith('Failed') ? '#C47A8A' : '#2E7D32' }}>
          {note}
        </div>
      )}
    </>
  )
}

export default function App({ user, onLogout }) {
  const [activePage, setActivePage] = useState('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [imageTab, setImageTab] = useState('products')
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
  const [notifTab, setNotifTab] = useState('all')
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersView, setOrdersView] = useState('active')
  const [orderCounts, setOrderCounts] = useState({ active: 0, archived: 0 })

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
  const [newProduct, setNewProduct] = useState({ name: '', description: '', detail: '', price: '', badge: '', stockQuantity: '', lowStockThreshold: '' })
  const [productFormStatus, setProductFormStatus] = useState(null)
  const [stockAdjustTarget, setStockAdjustTarget] = useState(null)
  const [stockAdjustAmount, setStockAdjustAmount] = useState('')
  const [stockAdjustReason, setStockAdjustReason] = useState('restock')
  const [stockAdjustNote, setStockAdjustNote] = useState('')

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

  // ── Theme ─────────────────────────────────────────────────────────────────
  const [themeSaved, setThemeSaved] = useState(DEFAULT_THEME) // also used by the Website Content preview above
  const [themeDraft, setThemeDraft] = useState(DEFAULT_THEME)
  const [themeSpec, setThemeSpec] = useState(null) // { headingFonts, bodyFonts, presets }
  const [themeSaving, setThemeSaving] = useState(false)
  const [themeFieldErrors, setThemeFieldErrors] = useState({})
  const [themeSaveNote, setThemeSaveNote] = useState('')
  const [themeHistory, setThemeHistory] = useState([])
  const [themeHistoryLoading, setThemeHistoryLoading] = useState(false)
  const [themeConfirm, setThemeConfirm] = useState(null)
  const themeDirty = JSON.stringify(themeDraft) !== JSON.stringify(themeSaved)

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

  // Attaches the auth token to every request and logs the user out on a 401.
  // Never sets Content-Type for FormData bodies (file uploads) - the browser
  // must set its own multipart boundary.
  const apiFetch = async (path, options = {}) => {
    const token = localStorage.getItem('hbh_token')
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    }
    const res = await fetch(`${API}${path}`, { ...options, headers })
    if (res.status === 401) {
      onLogout()
    }
    return res
  }

  const fetchOrders = async (view = ordersView) => {
    setOrdersLoading(true)
    try {
      const res = await apiFetch(`/api/orders?view=${view}`)
      const data = await res.json()
      if (res.ok && Array.isArray(data)) setOrders(data.reverse()) // newest first
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
    // Website Content and Theme - public endpoint, but each page's own spec
    // and history are owner/sysadmin (content) or sysadmin (theme) only.
    fetch(`${API}/api/site-settings`)
      .then(r => r.json())
      .then(data => {
        if (data?.content) {
          setContentSaved(data.content)
          setContentDraft(data.content)
        }
        if (data?.theme) {
          setThemeSaved(data.theme)
          setThemeDraft(data.theme)
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
    if (user?.role === 'sysadmin') {
      apiFetch('/api/admin/site-settings/theme/spec')
        .then(r => r.json())
        .then(data => setThemeSpec(data))
        .catch(() => {})
      fetchThemeHistory()
    }
    fetchOrders()
  }, [])

  // Warns before closing the tab or refreshing with unsaved Website Content
  // or Theme changes - in-app navigation away is instead caught by
  // navigateTo above.
  useEffect(() => {
    const dirty = (activePage === 'content' && contentDirty) || (activePage === 'theme' && themeDirty)
    if (!dirty) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [activePage, contentDirty, themeDirty])

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
    if (!window.confirm('Remove this file from the gallery?')) return
    setDeletingGalleryId(img.id)
    try {
      const res = await apiFetch(`/api/gallery/${img.id}`, { method: 'DELETE' })
      if (res.ok) setGalleryImages(prev => prev.filter(g => g.id !== img.id))
    } catch {
      // silent fail - the item simply stays in the grid
    } finally {
      setDeletingGalleryId(null)
    }
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

  const deleteCategory = async (id, name) => {
    if (!window.confirm(`Remove the "${name}" section? Products in this section will become uncategorised.`)) return
    try {
      const res = await apiFetch(`/api/categories/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setCategories(prev => prev.filter(c => c.id !== id))
        setProductCategories(prev => {
          const updated = { ...prev }
          Object.keys(updated).forEach(pid => {
            if (updated[pid] === id) delete updated[pid]
          })
          return updated
        })
        setCategoryStatus({ type: 'success', message: `"${name}" section removed.` })
        setTimeout(() => setCategoryStatus(null), 3000)
      } else {
        setCategoryStatus({ type: 'error', message: 'Failed to remove section.' })
        setTimeout(() => setCategoryStatus(null), 3000)
      }
    } catch {
      setCategoryStatus({ type: 'error', message: 'Failed to remove section.' })
    }
  }

  const assignCategory = async (productId, categoryId) => {
    try {
      const res = await apiFetch(`/api/categories/product/${productId}`, {
        method: 'POST',
        body: JSON.stringify({ categoryId: categoryId ? parseInt(categoryId) : null }),
      })
      if (res.ok) {
        setProductCategories(prev => ({
          ...prev,
          [productId]: categoryId ? parseInt(categoryId) : null,
        }))
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
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'confirmed' } : o))
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
      if (res.ok && Array.isArray(data)) setProducts(data)
    } catch {}
  }

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
        await fetchProducts()
        setNewProduct({ name: '', description: '', detail: '', price: '', badge: '', stockQuantity: '', lowStockThreshold: '' })
        setShowAddProduct(false)
        setProductFormStatus({ type: 'success', message: `"${data.name}" was added.` })
        setTimeout(() => setProductFormStatus(null), 3000)
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

  const toggleProductActive = async (product) => {
    const action = product.isActive ? 'deactivate' : 'reactivate'
    if (!window.confirm(`Are you sure you want to ${action} "${product.name}"?`)) return
    try {
      const res = await apiFetch(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !product.isActive }),
      })
      const data = await res.json()
      if (res.ok) {
        setProducts(prev => prev.map(p => p.id === data.id ? data : p))
      }
    } catch {}
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
        setClassStudents(prev => prev.map(s => s.id === studentId ? { ...s, paymentStatus } : s))
      }
    } catch {
      // silent fail
    }
  }

  const removeStudent = async (studentId, studentName) => {
    if (!window.confirm(`Remove ${studentName} from this class?`)) return
    try {
      const res = await apiFetch(`/api/classes/${selectedClass.id}/students/${studentId}`, { method: 'DELETE' })
      if (res.ok) setClassStudents(prev => prev.filter(s => s.id !== studentId))
    } catch {
      // silent fail
    }
  }

  const completeStudent = async (studentId, studentName) => {
    if (!window.confirm(`Mark ${studentName} as finished? They'll move to Past students.`)) return
    try {
      const res = await apiFetch(`/api/classes/${selectedClass.id}/students/${studentId}/complete`, { method: 'PATCH' })
      if (res.ok) {
        const data = await res.json()
        setClassStudents(prev => prev.map(s => s.id === studentId ? data : s))
      }
    } catch {
      // silent fail
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

  const copyWhatsAppMessage = async (student) => {
    try {
      const res = await apiFetch(`/api/classes/${selectedClass.id}/students/${student.id}/ensure-token`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.link) return
      const firstName = student.name.split(' ')[0]
      const message = `Hi ${firstName}, thank you for enrolling for ${selectedClass.name}. Your balance of R${(student.balance ?? 0).toFixed(2)} is due before your course starts. You can pay it securely here: ${data.link}`
      await navigator.clipboard.writeText(message)
      setLinkCopyStatus(prev => ({ ...prev, [student.id]: 'message' }))
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

  // Intercepts sidebar navigation away from an unsaved Website Content or
  // Theme page - goes through the in-page confirmation rather than
  // switching pages straight away.
  const navigateTo = (value) => {
    if (activePage === 'content' && contentDirty && value !== 'content') {
      setContentConfirm({ type: 'leave', target: value })
      return
    }
    if (activePage === 'theme' && themeDirty && value !== 'theme') {
      setThemeConfirm({ type: 'leave', target: value })
      return
    }
    setActivePage(value)
    setMobileNavOpen(false)
  }

  // ── Theme ─────────────────────────────────────────────────────────────────
  const fetchThemeHistory = async () => {
    setThemeHistoryLoading(true)
    try {
      const res = await apiFetch('/api/admin/site-settings/theme/history')
      const data = await res.json()
      if (res.ok && Array.isArray(data)) setThemeHistory(data)
    } catch {
      // silent fail
    } finally {
      setThemeHistoryLoading(false)
    }
  }

  const updateThemeColor = (key, value) => {
    setThemeDraft(prev => ({ ...prev, colors: { ...prev.colors, [key]: value } }))
    setThemeFieldErrors(prev => {
      const field = `colors.${key}`
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const updateThemeFont = (key, value) => {
    setThemeDraft(prev => ({ ...prev, fonts: { ...prev.fonts, [key]: value } }))
  }

  // Fills the form from a preset - not saved until "Save changes".
  const applyThemePreset = (preset) => {
    setThemeDraft(prev => ({ ...prev, colors: { ...preset.colors }, fonts: { ...preset.fonts }, preset: preset.name }))
    setThemeFieldErrors({})
  }

  const saveTheme = async () => {
    setThemeSaving(true)
    setThemeSaveNote('')
    setThemeFieldErrors({})
    try {
      const res = await apiFetch('/api/admin/site-settings/theme', {
        method: 'PUT',
        body: JSON.stringify(themeDraft),
      })
      const data = await res.json()
      if (res.ok) {
        setThemeSaved(data)
        setThemeDraft(data)
        setThemeSaveNote('Saved. Changes show on the website within about a minute.')
        fetchThemeHistory()
      } else if (data.field) {
        setThemeFieldErrors({ [data.field.replace(/^theme\./, '')]: data.error })
      } else {
        setThemeSaveNote(data.error || 'Failed to save changes.')
      }
    } catch {
      setThemeSaveNote('Failed to save changes.')
    } finally {
      setThemeSaving(false)
    }
  }

  const restoreThemeVersion = async (historyId) => {
    setThemeSaving(true)
    try {
      const res = await apiFetch(`/api/admin/site-settings/theme/restore/${historyId}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setThemeSaved(data.value)
        setThemeDraft(data.value)
        setThemeSaveNote('Restored. Changes show on the website within about a minute.')
        fetchThemeHistory()
      } else {
        setThemeSaveNote(data.error || 'Failed to restore that version.')
      }
    } catch {
      setThemeSaveNote('Failed to restore that version.')
    } finally {
      setThemeSaving(false)
      setThemeConfirm(null)
    }
  }

  const resetThemeToDefaults = async () => {
    setThemeSaving(true)
    try {
      const res = await apiFetch('/api/admin/site-settings/theme/reset', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setThemeSaved(data.value)
        setThemeDraft(data.value)
        setThemeSaveNote('Reset to defaults. Changes show on the website within about a minute.')
        fetchThemeHistory()
      } else {
        setThemeSaveNote(data.error || 'Failed to reset to defaults.')
      }
    } catch {
      setThemeSaveNote('Failed to reset to defaults.')
    } finally {
      setThemeSaving(false)
      setThemeConfirm(null)
    }
  }

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
          align-items: center;
          justify-content: center;
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

        .cal-day.has-booking::after {
          content: '';
          position: absolute;
          bottom: 3px;
          left: 50%;
          transform: translateX(-50%);
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #C47A8A;
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
              ] : []),
              ...(user?.role === 'sysadmin' ? [{ label: 'Theme', value: 'theme' }] : []),
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
                {{ dashboard: 'Dashboard', products: 'Products', images: 'Image Management', training: 'Lash Training', orders: 'Orders', notifications: 'Notifications', settings: 'Settings' }[activePage]}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {user?.role === 'staff' ? 'Staff View' : (
                { dashboard: 'Overview', products: `${categories.length} sections`, images: imageTab === 'products' ? '4 products' : imageTab === 'classes' ? '3 classes' : `${galleryImages.length} files`, training: '3 classes', orders: `${orders.length} order${orders.length !== 1 ? 's' : ''}`, notifications: `${unreadCount} unread`, settings: 'Account' }[activePage]
              )}
            </div>
          </div>

          {/* Content */}
          <div className="admin-content" style={{ padding: 32, maxWidth: 1200 }}>

            {activePage === 'dashboard' && (() => {
              const today = new Date()
              const hour = today.getHours()
              const timeGreeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening'
              const year = today.getFullYear()
              const month = today.getMonth()
              const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
              const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

              // Build calendar days
              const firstDay = new Date(year, month, 1).getDay()
              const daysInMonth = new Date(year, month + 1, 0).getDate()
              const daysInPrevMonth = new Date(year, month, 0).getDate()

              const calDays = []
              // Previous month padding
              for (let i = firstDay - 1; i >= 0; i--) {
                calDays.push({ day: daysInPrevMonth - i, current: false })
              }
              // Current month
              for (let i = 1; i <= daysInMonth; i++) {
                calDays.push({ day: i, current: true, isToday: i === today.getDate() })
              }
              // Next month padding
              const remaining = 42 - calDays.length
              for (let i = 1; i <= remaining; i++) {
                calDays.push({ day: i, current: false })
              }

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
                  <div className="admin-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
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
                                  onClick={() => setActivePage('orders')}
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
                      <div className="panel-heading" style={{ background: '#8C5A6A', color: '#FFFFFF', borderRadius: '12px 12px 0 0' }}>
                        {monthNames[month]} {year}
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 400, marginLeft: 8 }}>
                          Setmore bookings — coming soon
                        </span>
                      </div>
                      <div style={{ padding: '0 20px 20px 20px' }}>
                        <div className="calendar-grid">
                          {dayNames.map(d => (
                            <div key={d} className="cal-day-label">{d}</div>
                          ))}
                          {calDays.map((d, i) => (
                            <div
                              key={i}
                              className={[
                                'cal-day',
                                !d.current ? 'other-month' : '',
                                d.isToday ? 'today' : '',
                              ].join(' ').trim()}
                            >
                              {d.day}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

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
                        onClick={() => setActivePage('notifications')}
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
                  Sections group your products on the customer-facing shop. Create a new section below or remove one you no longer need. Products can be assigned to a section from the Products tab.
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
                  {categories.map(c => {
                    const count = Object.values(productCategories).filter(id => id === c.id).length
                    return (
                      <div key={c.id} className="category-item">
                        <div>
                          <div className="category-name">{c.name}</div>
                          <div className="category-count">{count} product{count !== 1 ? 's' : ''}</div>
                        </div>
                        <button className="delete-btn" onClick={() => deleteCategory(c.id, c.name)}>
                          Remove
                        </button>
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
                  onClick={() => { setShowAddProduct(prev => !prev); setProductFormStatus(null) }}
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
                    </div>
                    <button className="upload-btn" onClick={createProduct}>Save Product</button>
                  </div>
                )}

                <div className="category-list">
                  {products.length === 0 && (
                    <p style={{ fontSize: 14, color: '#9A7A82' }}>No products yet. Add one above.</p>
                  )}
                  {products.map(p => (
                    <div
                      key={p.id}
                      className="admin-card"
                      style={{ background: p.isActive ? '#FFFFFF' : '#F5F2F2', opacity: p.isActive ? 1 : 0.65 }}
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
                            </div>
                            <div style={{ fontSize: 12, color: '#7A6670', lineHeight: 1.5, marginBottom: 6 }}>
                              {p.description}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#C47A8A', marginBottom: 4 }}>
                              R {p.price}
                            </div>
                            {!p.hasOptions ? (
                              <div style={{ fontSize: 12, color: p.stockQuantity <= p.lowStockThreshold ? '#C47A8A' : '#9A8A8E' }}>
                                Stock: {p.stockQuantity}{p.stockQuantity <= p.lowStockThreshold ? ' (low)' : ''}
                              </div>
                            ) : (
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
                            )}
                          </>
                        ) : (
                          <>
                            <input
                              className="category-input"
                              style={{ width: '100%', marginBottom: 8 }}
                              value={editingProduct.name}
                              onChange={e => setEditingProduct(prev => ({ ...prev, name: e.target.value }))}
                            />
                            <textarea
                              className="category-input"
                              style={{ width: '100%', marginBottom: 8, resize: 'vertical' }}
                              rows={2}
                              value={editingProduct.description}
                              onChange={e => setEditingProduct(prev => ({ ...prev, description: e.target.value }))}
                            />
                            <input
                              className="category-input"
                              style={{ width: '100%', marginBottom: 8 }}
                              value={editingProduct.detail}
                              onChange={e => setEditingProduct(prev => ({ ...prev, detail: e.target.value }))}
                              placeholder="Detail"
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input
                                className="category-input"
                                type="number"
                                value={editingProduct.price}
                                onChange={e => setEditingProduct(prev => ({ ...prev, price: e.target.value }))}
                                placeholder="Price (R)"
                              />
                              <input
                                className="category-input"
                                value={editingProduct.badge || ''}
                                onChange={e => setEditingProduct(prev => ({ ...prev, badge: e.target.value }))}
                                placeholder="Badge"
                              />
                              <input
                                className="category-input"
                                type="number"
                                value={editingProduct.lowStockThreshold}
                                onChange={e => setEditingProduct(prev => ({ ...prev, lowStockThreshold: e.target.value }))}
                                placeholder="Low stock at"
                              />
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
                              })}
                            >
                              Edit
                            </button>
                            {!p.hasOptions && (
                              <button className="secondary-btn" onClick={() => { setStockAdjustTarget({ kind: 'product', id: p.id, name: p.name, stockQuantity: p.stockQuantity }); setProductFormStatus(null) }}>
                                Adjust Stock
                              </button>
                            )}
                            <button className="delete-btn" onClick={() => toggleProductActive(p)}>
                              {p.isActive ? 'Deactivate' : 'Reactivate'}
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
                    {products.map((p, index) => (
                      <div
                        key={p.id}
                        className="admin-card"
                        style={{ background: index % 2 === 0 ? '#F7EEF0' : '#F5F2F8' }}
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
                )}

                {imageTab === 'classes' && (
                  <div>
                    <div className="section-heading">Class Images</div>
                    {coursesMerged.map((c, index) => (
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
                        <div key={student.id} className="student-row">
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {student.name}
                              {student.source === 'website' && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#8C5A6A', background: '#F5EDEF', borderRadius: 4, padding: '2px 6px' }}>
                                  Website
                                </span>
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
                            <a
                              href={`https://wa.me/${student.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${student.name}, this is a message from Hair By Her regarding your enrolment.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, background: '#25D366', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}
                            >
                              W
                            </a>
                            {student.balance > 0 && (
                              <>
                                <button className="secondary-btn" onClick={() => copyBalanceLink(student)}>
                                  {linkCopyStatus[student.id] === 'link' ? 'Copied!' : 'Copy balance link'}
                                </button>
                                <button className="secondary-btn" onClick={() => copyWhatsAppMessage(student)}>
                                  {linkCopyStatus[student.id] === 'message' ? 'Copied!' : 'Copy WhatsApp message'}
                                </button>
                              </>
                            )}
                            <button className="secondary-btn" onClick={() => completeStudent(student.id, student.name)}>
                              Finished course
                            </button>
                          </div>
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
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20', marginBottom: 2 }}>
                                {student.name}
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
                        <div key={student.id} className="student-row">
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20', marginBottom: 2 }}>
                              {student.name}
                            </div>
                            <div style={{ fontSize: 12, color: '#9A8A8E' }}>
                              {student.whatsapp}
                            </div>
                            <div style={{ fontSize: 11, color: '#C4A0A8', marginTop: 2 }}>
                              Finished {new Date(student.completedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span className={`payment-badge payment-${student.paymentStatus === 'partial' ? 'partial' : student.paymentStatus === 'paid' ? 'paid' : 'unpaid'}`}>
                              {student.paymentStatus === 'paid' ? 'Paid' : student.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'}
                            </span>
                            <button className="secondary-btn" onClick={() => reactivateStudent(student.id)}>
                              Move back
                            </button>
                            <button className="delete-btn" onClick={() => removeStudent(student.id, student.name)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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

                      <SettingsSaveBar onSave={saveContent} dirty={contentDirty} saving={contentSaving} note={contentSaveNote} />

                      <SettingsHistoryPanel
                        history={contentHistory}
                        loading={contentHistoryLoading}
                        onReset={() => setContentConfirm({ type: 'reset' })}
                        onRestore={(historyId) => setContentConfirm({ type: 'restore', historyId })}
                      />
                    </div>

                    <div style={{ flex: '1 1 320px', minWidth: 280 }}>
                      <div style={{ position: 'sticky', top: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                          Preview
                        </div>
                        <div style={{ background: themeSaved.colors.background, borderRadius: 16, padding: 28, border: `1px solid ${themeSaved.colors.navBackground}` }}>
                          <div style={{ fontFamily: `'${themeSaved.fonts.heading}', serif`, fontSize: 26, fontWeight: 700, color: themeSaved.colors.text, marginBottom: 8, lineHeight: 1.2 }}>
                            {contentDraft.hero.heading}
                          </div>
                          <div style={{ fontFamily: `'${themeSaved.fonts.body}', sans-serif`, fontSize: 14, color: themeSaved.colors.mutedText, marginBottom: 6 }}>
                            {contentDraft.hero.subtext}
                          </div>
                          <div style={{ fontFamily: `'${themeSaved.fonts.heading}', serif`, fontStyle: 'italic', fontSize: 14, color: themeSaved.colors.accent, marginBottom: 20 }}>
                            {contentDraft.hero.tagline}
                          </div>
                          <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
                            <span style={{ background: themeSaved.colors.accent, color: 'white', padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                              {contentDraft.hero.bookButtonLabel}
                            </span>
                            <span style={{ border: `1px solid ${themeSaved.colors.accent}`, color: themeSaved.colors.accent, padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                              {contentDraft.hero.shopButtonLabel}
                            </span>
                          </div>

                          <div style={{ background: 'white', borderRadius: 12, padding: 20, border: `1px solid ${themeSaved.colors.navBackground}` }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: themeSaved.colors.accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
                              Get in Touch
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase' }}>Address</div>
                              <div style={{ fontSize: 13, color: themeSaved.colors.text }}>{contentDraft.contact.addressLine1}<br />{contentDraft.contact.addressLine2}</div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase' }}>Phone</div>
                              <div style={{ fontSize: 13, color: themeSaved.colors.text }}>{contentDraft.contact.phone}</div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase' }}>{contentDraft.contact.hoursLabel}</div>
                              <div style={{ fontSize: 13, color: themeSaved.colors.text }}>{contentDraft.contact.hoursLine1}<br />{contentDraft.contact.hoursLine2}</div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase' }}>{contentDraft.contact.whatsappLabel}</div>
                              <div style={{ fontSize: 13, color: themeSaved.colors.accent, fontWeight: 600 }}>{contentDraft.contact.whatsappText}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase' }}>Email</div>
                              <div style={{ fontSize: 13, color: themeSaved.colors.accent, fontWeight: 600 }}>{contentDraft.contact.email}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <SettingsConfirmModal
                    confirm={contentConfirm}
                    itemLabel="website content"
                    onCancel={() => setContentConfirm(null)}
                    onDiscard={(target) => {
                      setContentDraft(contentSaved)
                      setContentFieldErrors({})
                      setContentConfirm(null)
                      setActivePage(target)
                      setMobileNavOpen(false)
                    }}
                    onRestore={restoreContentVersion}
                    onReset={resetContentToDefaults}
                  />
                </div>
              )
            })()}

            {activePage === 'theme' && user?.role === 'sysadmin' && (() => {
              const colors = themeDraft.colors
              const fonts = themeDraft.fonts
              const headingFonts = themeSpec?.headingFonts || [fonts.heading]
              const bodyFonts = themeSpec?.bodyFonts || [fonts.body]
              const presets = themeSpec?.presets || []

              const colorRow = (label, key) => {
                const path = `colors.${key}`
                const error = themeFieldErrors[path]
                return (
                  <div key={key} style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
                      {label}
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="color"
                        value={colors[key]}
                        onChange={e => updateThemeColor(key, e.target.value.toUpperCase())}
                        style={{ width: 40, height: 36, padding: 0, border: `1px solid ${error ? '#C47A8A' : '#EDD5DB'}`, borderRadius: 8, cursor: 'pointer', background: 'none' }}
                      />
                      <input
                        type="text"
                        value={colors[key]}
                        onChange={e => updateThemeColor(key, e.target.value.toUpperCase())}
                        style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: `1px solid ${error ? '#C47A8A' : '#EDD5DB'}`, fontSize: 13, fontFamily: 'inherit', color: '#2C1A20', background: 'white', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    {error && <div style={{ fontSize: 12, color: '#C47A8A', marginTop: 4 }}>{error}</div>}
                  </div>
                )
              }

              const fontRow = (label, key, options) => (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
                    {label}
                  </label>
                  <select
                    value={fonts[key]}
                    onChange={e => updateThemeFont(key, e.target.value)}
                    className="category-select"
                    style={{ width: '100%', padding: '10px 14px' }}
                  >
                    {options.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              )

              const textBgRatio = contrastRatio(colors.text, colors.background)
              const whiteAccentRatio = contrastRatio('#FFFFFF', colors.accent)
              const contrastRow = (label, ratio) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: '#9A8A8E' }}>{label}</span>
                  <span style={{ fontWeight: 700, color: ratio >= MIN_CONTRAST_RATIO ? '#2E7D32' : '#C47A8A' }}>
                    {ratio.toFixed(2)}:1 {ratio >= MIN_CONTRAST_RATIO ? '(pass)' : '(fail)'}
                  </span>
                </div>
              )

              const panelStyle = { background: 'white', borderRadius: 12, padding: 28, boxShadow: '0 2px 8px rgba(44,20,28,0.08)', marginBottom: 20 }
              const groupTitleStyle = { fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 20 }

              return (
                <div>
                  <div style={{
                    background: 'linear-gradient(135deg, #C47A8A 0%, #8C5A6A 100%)',
                    borderRadius: 14, padding: '24px 28px', marginBottom: 20, color: 'white',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Theme</div>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>Changes show on the website within about a minute.</div>
                  </div>

                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ flex: '1 1 420px', minWidth: 320 }}>
                      <div style={panelStyle}>
                        <div style={groupTitleStyle}>Presets</div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {presets.map(preset => (
                            <button
                              key={preset.name}
                              className="secondary-btn"
                              onClick={() => applyThemePreset(preset)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                              <span style={{ width: 14, height: 14, borderRadius: '50%', background: preset.colors.accent, display: 'inline-block', border: '1px solid rgba(0,0,0,0.1)' }} />
                              {preset.name}
                            </button>
                          ))}
                          {presets.length === 0 && (
                            <div style={{ fontSize: 13, color: '#9A8A8E' }}>Loading presets...</div>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#9A8A8E', marginTop: 10 }}>
                          Choosing a preset fills the form below - nothing is saved until "Save changes".
                        </div>
                      </div>

                      <div style={panelStyle}>
                        <div style={groupTitleStyle}>Colours</div>
                        {colorRow('Background', 'background')}
                        {colorRow('Accent', 'accent')}
                        {colorRow('Nav Background', 'navBackground')}
                        {colorRow('Text', 'text')}
                        {colorRow('Muted Text', 'mutedText')}
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F7EEF0' }}>
                          {contrastRow('Text on background', textBgRatio)}
                          {contrastRow('White button text on accent', whiteAccentRatio)}
                        </div>
                      </div>

                      <div style={panelStyle}>
                        <div style={groupTitleStyle}>Fonts</div>
                        {fontRow('Heading Font', 'heading', headingFonts)}
                        {fontRow('Body Font', 'body', bodyFonts)}
                      </div>

                      <SettingsSaveBar onSave={saveTheme} dirty={themeDirty} saving={themeSaving} note={themeSaveNote} />

                      <SettingsHistoryPanel
                        history={themeHistory}
                        loading={themeHistoryLoading}
                        onReset={() => setThemeConfirm({ type: 'reset' })}
                        onRestore={(historyId) => setThemeConfirm({ type: 'restore', historyId })}
                      />
                    </div>

                    <div style={{ flex: '1 1 320px', minWidth: 280 }}>
                      <div style={{ position: 'sticky', top: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                          Preview
                        </div>
                        <div style={{ background: colors.background, borderRadius: 16, overflow: 'hidden', border: `1px solid ${colors.navBackground}` }}>
                          <div style={{ background: colors.navBackground, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontFamily: `'${fonts.heading}', serif`, fontSize: 16, fontWeight: 700, color: colors.text }}>Hair By Her</span>
                            <span style={{ background: colors.accent, color: 'white', padding: '6px 14px', borderRadius: 16, fontSize: 12, fontWeight: 700 }}>Book Now</span>
                          </div>

                          <div style={{ padding: 24 }}>
                            <div style={{ fontFamily: `'${fonts.heading}', serif`, fontSize: 24, fontWeight: 700, color: colors.text, marginBottom: 8, lineHeight: 1.2 }}>
                              {contentSaved.hero.heading}
                            </div>
                            <div style={{ fontFamily: `'${fonts.body}', sans-serif`, fontSize: 13, color: colors.mutedText, marginBottom: 16 }}>
                              {contentSaved.hero.subtext}
                            </div>
                            <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
                              <span style={{ background: colors.accent, color: 'white', padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                                {contentSaved.hero.bookButtonLabel}
                              </span>
                              <span style={{ border: `1px solid ${colors.accent}`, color: colors.accent, padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                                {contentSaved.hero.shopButtonLabel}
                              </span>
                            </div>

                            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                              <div style={{ flex: '1 1 140px', background: 'white', borderRadius: 12, overflow: 'hidden', border: `1px solid ${colors.navBackground}` }}>
                                <div style={{ height: 80, background: colors.navBackground }} />
                                <div style={{ padding: 12 }}>
                                  <div style={{ fontFamily: `'${fonts.body}', sans-serif`, fontSize: 12, fontWeight: 700, color: colors.text, marginBottom: 4 }}>Classic Lash Trays</div>
                                  <div style={{ fontFamily: `'${fonts.heading}', serif`, fontSize: 16, fontWeight: 700, color: colors.accent }}>R 150</div>
                                </div>
                              </div>
                              <div style={{ flex: '1 1 140px', background: 'white', borderRadius: 12, overflow: 'hidden', border: `1px solid ${colors.navBackground}` }}>
                                <div style={{ height: 80, background: colors.navBackground }} />
                                <div style={{ padding: 12 }}>
                                  <div style={{ fontFamily: `'${fonts.body}', sans-serif`, fontSize: 12, fontWeight: 700, color: colors.text, marginBottom: 4 }}>Classic Lash Training</div>
                                  <div style={{ fontFamily: `'${fonts.heading}', serif`, fontSize: 16, fontWeight: 700, color: colors.accent }}>R 2 500</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div style={{ background: '#2C1A20', padding: '18px 20px', textAlign: 'center' }}>
                            <div style={{ fontFamily: `'${fonts.body}', sans-serif`, fontSize: 11, color: colors.mutedText }}>
                              &copy; {new Date().getFullYear()} Hair By Her. All rights reserved.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <SettingsConfirmModal
                    confirm={themeConfirm}
                    itemLabel="theme"
                    onCancel={() => setThemeConfirm(null)}
                    onDiscard={(target) => {
                      setThemeDraft(themeSaved)
                      setThemeFieldErrors({})
                      setThemeConfirm(null)
                      setActivePage(target)
                      setMobileNavOpen(false)
                    }}
                    onRestore={restoreThemeVersion}
                    onReset={resetThemeToDefaults}
                  />
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
                          <a
                            href={`https://wa.me/${order.customerPhone.replace(/\D/g,'')}?text=${encodeURIComponent(`Hi ${order.customerName}, thank you for your order with Hair By Her. We have received your payment and will be in touch shortly to arrange delivery.`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-block',
                              background: '#25D366',
                              color: 'white',
                              borderRadius: 6,
                              padding: '8px 16px',
                              fontSize: 13,
                              fontWeight: 600,
                              textDecoration: 'none',
                            }}
                          >
                            WhatsApp Customer
                          </a>
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
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
