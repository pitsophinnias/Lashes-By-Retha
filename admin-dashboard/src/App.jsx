import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

const PRODUCTS = [
  { id: 1, name: 'Classic Lash Trays', detail: 'Diameter: 0.15 | Curl: D', price: 130 },
  { id: 2, name: 'YY Lash Trays', detail: 'Diameter: 0.07 | Curl: D', price: 150 },
  { id: 3, name: 'Volume Lash Trays', detail: 'Diameter: 0.05 | Curl: Cc & D', price: 150 },
  { id: 4, name: 'Lash Shampoo and Cleansing Brush Combo', detail: 'Recommended for daily use', price: 100 },
]

const CLASSES = [
  { id: 1, name: 'Classic Individual Lash Training', duration: '1-day course', price: 2500 },
  { id: 2, name: 'Classic Individual Lash Training', duration: '2-day course', price: 4000 },
  { id: 3, name: 'Advanced Individual Lash Training', duration: '4-day intensive course', price: 6000 },
]

const API = 'http://localhost:3002'

function App() {
  const [activePage, setActivePage] = useState('dashboard')
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

  const fetchOrders = async () => {
    setOrdersLoading(true)
    try {
      const res = await fetch(`${API}/api/orders`)
      const data = await res.json()
      setOrders(data.reverse()) // newest first
    } catch {
      // silent fail
    } finally {
      setOrdersLoading(false)
    }
  }

  useEffect(() => {
    // Fetch product images
    PRODUCTS.forEach(async p => {
      const res = await fetch(`${API}/api/upload/products/${p.id}`)
      const data = await res.json()
      if (data.url) setProductImages(prev => ({ ...prev, [p.id]: data.url }))
      try {
        const posRes = await fetch(`${API}/api/position/products/${p.id}`)
        const posData = await posRes.json()
        if (posData.position) setProductPositions(prev => ({ ...prev, [p.id]: posData.position }))
      } catch {}
    })
    // Fetch class images
    CLASSES.forEach(async c => {
      const res = await fetch(`${API}/api/upload/classes/${c.id}`)
      const data = await res.json()
      if (data.url) setClassImages(prev => ({ ...prev, [c.id]: data.url }))
      try {
        const posRes = await fetch(`${API}/api/position/classes/${c.id}`)
        const posData = await posRes.json()
        if (posData.position) setClassPositions(prev => ({ ...prev, [c.id]: posData.position }))
      } catch {}
    })
    // Fetch gallery
    fetch(`${API}/api/gallery`)
      .then(r => r.json())
      .then(data => setGalleryImages(data))
      .catch(() => {})
    // Fetch categories
    fetch(`${API}/api/categories`)
      .then(r => r.json())
      .then(data => setCategories(data))
      .catch(() => {})
    // Fetch product category assignments
    fetch(`${API}/api/categories/products/all`)
      .then(r => r.json())
      .then(data => setProductCategories(data))
      .catch(() => {})
    // Fetch notifications
    fetch(`${API}/api/notifications`)
      .then(r => r.json())
      .then(data => {
        setNotifications(data)
        setUnreadCount(data.filter(n => !n.read).length)
      })
      .catch(() => {})
    // Fetch orders for dashboard
    fetch(`${API}/api/orders`)
      .then(r => r.json())
      .then(data => {
        setRecentOrders(data.slice(0, 5))
        // Build monthly revenue data from orders
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const monthlyTotals = Array(12).fill(0)
        data.forEach(order => {
          const month = new Date(order.createdAt).getMonth()
          monthlyTotals[month] += order.total || 0
        })
        setRevenueData(months.map((name, i) => ({ name, revenue: monthlyTotals[i] })))
      })
      .catch(() => {})
    // Fetch archived notifications
    fetch(`${API}/api/notifications/archived`)
      .then(r => r.json())
      .then(data => setArchivedNotifications(data))
      .catch(() => {})
    fetchOrders()
  }, [])

  const handleUpload = async (type, id, file) => {
    if (!file) return
    const key = id ? `${type}-${id}` : `${type}-${Date.now()}`
    setUploadStatus(prev => ({ ...prev, [key]: 'uploading' }))
    const formData = new FormData()
    formData.append('image', file)
    try {
      const endpoint = type === 'gallery'
        ? `${API}/api/upload/gallery`
        : `${API}/api/upload/${type}/${id}`
      const res = await fetch(endpoint, { method: 'POST', body: formData })
      const data = await res.json()
      if (data.url) {
        if (type === 'products') setProductImages(prev => ({ ...prev, [id]: data.url }))
        if (type === 'classes') setClassImages(prev => ({ ...prev, [id]: data.url }))
        if (type === 'gallery') setGalleryImages(prev => [...prev, { url: data.url, filename: data.url.split('/').pop() }])
        setUploadStatus(prev => ({ ...prev, [key]: 'success' }))
        setTimeout(() => setUploadStatus(prev => ({ ...prev, [key]: null })), 3000)
      }
    } catch {
      setUploadStatus(prev => ({ ...prev, [key]: 'error' }))
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

    setPositions(prev => ({ ...prev, [id]: next }))

    try {
      await fetch(`${API}/api/position/${type}/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: next }),
      })
    } catch {}
  }

  const createCategory = async () => {
    if (!newCategoryName.trim()) return
    try {
      const res = await fetch(`${API}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`${API}/api/categories/${id}`, { method: 'DELETE' })
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
      }
    } catch {
      setCategoryStatus({ type: 'error', message: 'Failed to remove section.' })
    }
  }

  const assignCategory = async (productId, categoryId) => {
    try {
      const res = await fetch(`${API}/api/categories/product/${productId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      await fetch(`${API}/api/notifications/read-all`, { method: 'PATCH' })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {}
  }

  const markOneRead = async (id) => {
    try {
      await fetch(`${API}/api/notifications/${id}/read`, { method: 'PATCH' })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {}
  }

  const confirmOrder = async (id) => {
    try {
      await fetch(`${API}/api/orders/${id}/confirm`, { method: 'PATCH' })
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'confirmed' } : o))
    } catch {}
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;600;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Lato', sans-serif; background: #F4F4F5; color: #1A1A1A; }

        /* Cards */
        .admin-card {
          background: #FFFFFF;
          border-radius: 10px;
          border: 1px solid #E8E8E8;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        /* Card image */
        .card-img {
          width: 80px;
          height: 80px;
          border-radius: 8px;
          background: #F4F4F5;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          color: #AAAAAA;
          font-style: italic;
          overflow: hidden;
        }

        .card-img img {
          width: 80px;
          height: 80px;
          border-radius: 8px;
          object-fit: cover;
        }

        /* Buttons */
        .upload-btn {
          background: #C47A8A;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
          font-weight: 600;
          white-space: nowrap;
        }

        .upload-btn:hover { background: #A8606F; }

        .secondary-btn {
          background: #F4F4F5;
          color: #444444;
          border: 1px solid #E0E0E0;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
          font-weight: 500;
        }

        .secondary-btn:hover { background: #EBEBEB; }

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
          width: 26px;
          height: 26px;
          border-radius: 5px;
          border: 1px solid #E0E0E0;
          background: #F9F9F9;
          color: #444444;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          line-height: 1;
        }

        .adj-btn:hover { background: #C47A8A; color: white; border-color: #C47A8A; }

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
          border-radius: 6px;
          border: 1px solid #E0E0E0;
          font-size: 14px;
          font-family: inherit;
          color: #1A1A1A;
          background: white;
          outline: none;
        }

        .category-input:focus { border-color: #C47A8A; }

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
          background: white;
          border: 1px solid #E8E8E8;
          border-radius: 8px;
          padding: 12px 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .category-name {
          font-size: 15px;
          font-weight: 600;
          color: #1A1A1A;
        }

        .category-count {
          font-size: 12px;
          color: #AAAAAA;
          margin-top: 2px;
        }

        .delete-btn {
          background: none;
          border: 1px solid #E0E0E0;
          color: #AAAAAA;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }

        .delete-btn:hover { border-color: #E57373; color: #E57373; }

        /* Category select */
        .category-select {
          border: 1px solid #E0E0E0;
          border-radius: 6px;
          padding: 5px 8px;
          font-size: 12px;
          font-family: inherit;
          color: #1A1A1A;
          background: white;
          cursor: pointer;
          outline: none;
          margin-top: 4px;
        }

        .category-select:focus { border-color: #C47A8A; }

        /* Gallery grid */
        .gallery-grid-admin {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 10px;
          margin-top: 16px;
        }

        .gallery-tile {
          border-radius: 8px;
          overflow: hidden;
          background: #F4F4F5;
          aspect-ratio: 1;
        }

        .gallery-tile img,
        .gallery-tile video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        /* Tab section heading */
        .section-heading {
          font-size: 13px;
          font-weight: 700;
          color: #888888;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid #E8E8E8;
        }

        /* Dashboard stats cards */
        .stat-card {
          background: white;
          border-radius: 10px;
          border: 1px solid #E8E8E8;
          padding: 20px 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        .stat-value {
          font-size: 28px;
          font-weight: 700;
          color: #1A1A1A;
          line-height: 1;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 12px;
          color: #AAAAAA;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 600;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 24px;
        }

        .dashboard-wide {
          grid-column: 1 / -1;
        }

        .panel {
          background: white;
          border-radius: 10px;
          border: 1px solid #E8E8E8;
          padding: 20px 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        .panel-heading {
          font-size: 14px;
          font-weight: 700;
          color: #1A1A1A;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #F4F4F5;
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
          color: #AAAAAA;
          text-transform: uppercase;
          letter-spacing: 1px;
          padding: 0 0 10px 0;
          border-bottom: 1px solid #F4F4F5;
        }

        .orders-table td {
          padding: 10px 0;
          border-bottom: 1px solid #F9F9F9;
          color: #1A1A1A;
          vertical-align: middle;
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
          padding: 14px 0;
          border-bottom: 1px solid #F4F4F5;
        }

        .notif-item.unread {
          background: #FAFAFA;
          margin: 0 -24px;
          padding: 14px 24px;
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

      `}</style>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#F4F4F5', fontFamily: "'Lato', sans-serif" }}>

        {/* SIDEBAR */}
        <div style={{ position: 'fixed', top: 0, left: 0, width: 240, height: '100vh', background: '#1A1A1A', display: 'flex', flexDirection: 'column', zIndex: 100, overflowY: 'auto' }}>

          {/* Logo */}
          <div style={{ padding: '24px 20px', borderBottom: '1px solid #2E2E2E' }}>
            <img src="/logo.png" alt="Hair By Her" style={{ height: 48, width: 'auto', objectFit: 'contain', display: 'block', mixBlendMode: 'lighten' }} />
            <div style={{ fontSize: 11, color: '#888888', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 8 }}>Admin Dashboard</div>
          </div>

          {/* Nav */}
          <nav style={{ padding: '16px 12px', flex: 1 }}>
            {[
              { label: 'Dashboard', value: 'dashboard', icon: 'D' },
              { label: 'Products', value: 'products', icon: 'P' },
              { label: 'Image Management', value: 'images', icon: 'I' },
              { label: 'Lash Training', value: 'training', icon: 'T' },
              { label: 'Orders', value: 'orders', icon: 'O' },
              { label: 'Notifications', value: 'notifications', icon: 'N' },
            ].map(item => (
              <button
                key={item.value}
                onClick={() => setActivePage(item.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: activePage === item.value ? '#2E2E2E' : 'transparent',
                  color: activePage === item.value ? '#FFFFFF' : '#AAAAAA',
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
          <div style={{ padding: '16px 20px', borderTop: '1px solid #2E2E2E', fontSize: 11, color: '#666666', lineHeight: 1.6 }}>
            <div>Hair By Her</div>
            <div>082 685 5399</div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ marginLeft: 240, flex: 1, minHeight: '100vh', background: '#F4F4F5' }}>

          {/* Top bar */}
          <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E5E5', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A' }}>
              {{ dashboard: 'Dashboard', products: 'Products', images: 'Image Management', training: 'Lash Training', orders: 'Orders', notifications: 'Notifications' }[activePage]}
            </div>
            <div style={{ fontSize: 12, color: '#888888', background: '#F4F4F5', padding: '4px 12px', borderRadius: 20 }}>
              {activePage === 'dashboard' && 'Overview'}
              {activePage === 'products' && `${categories.length} sections`}
              {activePage === 'images' && imageTab === 'products' && '4 products'}
              {activePage === 'images' && imageTab === 'classes' && '3 classes'}
              {activePage === 'images' && imageTab === 'gallery' && `${galleryImages.length} files`}
              {activePage === 'training' && '3 classes'}
              {activePage === 'orders' && `${orders.length} order${orders.length !== 1 ? 's' : ''}`}
              {activePage === 'notifications' && `${unreadCount} unread`}
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: 32, maxWidth: 900 }}>

            {activePage === 'dashboard' && (() => {
              const today = new Date()
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

              const totalRevenue = recentOrders.reduce((sum, o) => sum + (o.total || 0), 0)
              const totalOrders = recentOrders.length

              return (
                <div>
                  {/* Stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                    {[
                      { label: 'Total Orders', value: totalOrders },
                      { label: 'Revenue (R)', value: `R ${totalRevenue}` },
                      { label: 'Sections', value: categories.length },
                      { label: 'Gallery Files', value: galleryImages.length },
                    ].map(stat => (
                      <div key={stat.label} className="stat-card">
                        <div className="stat-value">{stat.value}</div>
                        <div className="stat-label">{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Revenue chart */}
                  <div className="panel" style={{ marginBottom: 24 }}>
                    <div className="panel-heading">Monthly Revenue (R)</div>
                    {revenueData.every(d => d.revenue === 0) ? (
                      <div style={{ fontSize: 13, color: '#AAAAAA', textAlign: 'center', padding: '32px 0' }}>
                        No order data yet. Revenue will appear here once orders are placed.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={revenueData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#AAAAAA' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: '#AAAAAA' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ border: '1px solid #E8E8E8', borderRadius: 8, fontSize: 12 }}
                            formatter={(value) => [`R ${value}`, 'Revenue']}
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

                  {/* Two column — recent orders + calendar */}
                  <div className="dashboard-grid">
                    {/* Recent orders */}
                    <div className="panel">
                      <div className="panel-heading">Recent Orders</div>
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

                    {/* Calendar */}
                    <div className="panel">
                      <div className="panel-heading">
                        {monthNames[month]} {year}
                        <span style={{ fontSize: 11, color: '#AAAAAA', fontWeight: 400, marginLeft: 8 }}>
                          Setmore bookings — coming soon
                        </span>
                      </div>
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

                  {/* Recent notifications preview */}
                  <div className="panel">
                    <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Recent Activity</span>
                      <button
                        onClick={() => setActivePage('notifications')}
                        style={{ background: 'none', border: 'none', fontSize: 12, color: '#C47A8A', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                      >
                        View all
                      </button>
                    </div>
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
              )
            })()}

            {activePage === 'products' && (
              <div>
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
              </div>
            )}

            {activePage === 'images' && (
              <div>
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E8E8E8', marginBottom: 24 }}>
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
                        color: imageTab === tab.value ? '#C47A8A' : '#888888',
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
                    {PRODUCTS.map(p => (
                      <div className="admin-card" key={p.id}>
                        <div className="card-img" style={{ overflow: 'hidden' }}>
                          {productImages[p.id] ? (
                            <img
                              src={`${API}${productImages[p.id]}?t=${Date.now()}`}
                              alt={p.name}
                              style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '8px',
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
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#2C2C2C', marginBottom: '2px' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#9A7A82', marginBottom: '2px' }}>
                            {p.detail}
                          </div>
                          <div style={{ fontSize: '13px', color: '#C47A8A', fontWeight: 600 }}>
                            R {p.price}
                          </div>
                          {uploadStatus[`products-${p.id}`] === 'uploading' && (
                            <div className="success-msg">Uploading...</div>
                          )}
                          {uploadStatus[`products-${p.id}`] === 'success' && (
                            <div className="success-msg">Uploaded successfully</div>
                          )}
                          {uploadStatus[`products-${p.id}`] === 'error' && (
                            <div className="error-msg">Upload failed. Please try again.</div>
                          )}
                          <div style={{ marginTop: '8px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#C47A8A', textTransform: 'uppercase', marginBottom: '4px' }}>
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
                        <div>
                          <label htmlFor={`file-product-${p.id}`} className="upload-btn">
                            {productImages[p.id] ? 'Replace Image' : 'Upload Image'}
                          </label>
                          <input
                            id={`file-product-${p.id}`}
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleUpload('products', p.id, e.target.files[0])}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {imageTab === 'classes' && (
                  <div>
                    <div className="section-heading">Class Images</div>
                    {CLASSES.map(c => (
                      <div className="admin-card" key={c.id}>
                        <div className="card-img" style={{ overflow: 'hidden' }}>
                          {classImages[c.id] ? (
                            <img
                              src={`${API}${classImages[c.id]}?t=${Date.now()}`}
                              alt={c.name}
                              style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '8px',
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
                          {uploadStatus[`classes-${c.id}`] === 'error' && (
                            <div className="error-msg">Upload failed. Please try again.</div>
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
                      if (status === 'error') return <div className="error-msg" key={key}>Upload failed. Please try again.</div>
                      return null
                    })}

                    {galleryImages.length > 0 ? (
                      <div className="gallery-grid-admin">
                        {galleryImages.map(img => (
                          <div key={img.filename} className="gallery-tile">
                            {img.type === 'video' ? (
                              <video
                                src={`${API}${img.url}`}
                                muted
                                autoPlay
                                loop
                                playsInline
                              />
                            ) : (
                              <img
                                src={`${API}${img.url}`}
                                alt={img.filename}
                              />
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

            {activePage === 'training' && (
              <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E8E8E8', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', marginBottom: '8px' }}>
                  Lash Training Classes
                </div>
                <p style={{ fontSize: '14px', color: '#888888', lineHeight: 1.6 }}>
                  Class management — including enrolment tracking and payment recording — is coming soon. For now, your three training courses are listed on the customer-facing site.
                </p>
                <div style={{ marginTop: '8px' }}>
                  {CLASSES.map(c => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 0',
                        borderBottom: '1px solid #F4F4F5',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1A1A1A' }}>
                          {c.name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#AAAAAA', marginTop: '2px' }}>
                          {c.duration}
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#C47A8A' }}>
                        R{c.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activePage === 'orders' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>
                      {orders.length} order{orders.length !== 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#AAAAAA', marginTop: 2 }}>
                      Click an order to expand details
                    </div>
                  </div>
                  <button className="secondary-btn" onClick={fetchOrders}>
                    Refresh
                  </button>
                </div>

                {ordersLoading && (
                  <div style={{ fontSize: 13, color: '#AAAAAA', padding: '20px 0' }}>Loading orders...</div>
                )}

                {!ordersLoading && orders.length === 0 && (
                  <div className="panel" style={{ fontSize: 13, color: '#AAAAAA' }}>
                    No orders yet. When customers place orders on the website they will appear here.
                  </div>
                )}

                {!ordersLoading && orders.map(order => (
                  <div key={order.id} className="panel" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>

                    {/* Order header */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px 20px',
                      borderBottom: order.expanded ? '1px solid #F4F4F5' : 'none',
                      cursor: 'pointer',
                      background: order.expanded ? '#FAFAFA' : 'white',
                    }}
                      onClick={() => setOrders(prev => prev.map(o =>
                        o.id === order.id ? { ...o, expanded: !o.expanded } : o
                      ))}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>
                            {order.customerName}
                          </div>
                          <div style={{ fontSize: 12, color: '#AAAAAA', marginTop: 2 }}>
                            {order.customerPhone} · {new Date(order.createdAt).toLocaleDateString('en-ZA', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#C47A8A' }}>R {order.total}</div>
                        <span className={`status-badge${order.status === 'confirmed' ? ' confirmed' : ''}`}>
                          {order.status || 'pending'}
                        </span>
                        <div style={{ fontSize: 12, color: '#CCCCCC' }}>{order.expanded ? 'v' : '>'}</div>
                      </div>
                    </div>

                    {/* Expanded order details */}
                    {order.expanded && (
                      <div style={{ padding: '16px 20px' }}>

                        {/* Items list */}
                        <div style={{ marginBottom: 16 }}>
                          <div className="field-label" style={{ marginBottom: 8 }}>Items Ordered</div>
                          {order.items?.map((item, i) => (
                            <div key={i} style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 0',
                              borderBottom: '1px solid #F9F9F9',
                              fontSize: 13,
                            }}>
                              <div>
                                <span style={{ fontWeight: 600, color: '#1A1A1A' }}>{item.name}</span>
                                <span style={{ color: '#AAAAAA', marginLeft: 8 }}>x{item.qty}</span>
                              </div>
                              <span style={{ color: '#C47A8A', fontWeight: 600 }}>R {item.price * item.qty}</span>
                            </div>
                          ))}
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '10px 0 0 0',
                            fontSize: 14,
                            fontWeight: 700,
                          }}>
                            <span>Total</span>
                            <span style={{ color: '#C47A8A' }}>R {order.total}</span>
                          </div>
                        </div>

                        {/* Customer details */}
                        <div style={{ marginBottom: 16 }}>
                          <div className="field-label" style={{ marginBottom: 8 }}>Customer Details</div>
                          <div style={{ fontSize: 13, color: '#444444', lineHeight: 1.8 }}>
                            <div>Name: <strong>{order.customerName}</strong></div>
                            <div>WhatsApp: <strong>{order.customerPhone}</strong></div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {order.status !== 'confirmed' && (
                            <button
                              className="upload-btn"
                              onClick={() => confirmOrder(order.id)}
                            >
                              Confirm Payment Received
                            </button>
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
                            <div style={{ fontSize: 13, color: '#4CAF50', fontWeight: 600 }}>
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
                { label: 'System',   value: 'system' },
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>
                        {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                      </div>
                      <div style={{ fontSize: 12, color: '#AAAAAA', marginTop: 2 }}>
                        Notifications auto-archive after 7 days
                      </div>
                    </div>
                    {unreadCount > 0 && notifTab !== 'archive' && (
                      <button className="secondary-btn" onClick={markAllRead}>
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

          </div>
        </div>
      </div>
    </>
  )
}

export default App
