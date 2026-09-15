import React, { useState, useEffect } from 'react'

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
  const [activePage, setActivePage] = useState('products')
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
              { label: 'Products', value: 'products' },
              { label: 'Image Management', value: 'images' },
              { label: 'Lash Training', value: 'training' },
              { label: 'Orders', value: 'orders' },
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
              {{ products: 'Products', images: 'Image Management', training: 'Lash Training', orders: 'Orders' }[activePage]}
            </div>
            <div style={{ fontSize: 12, color: '#888888', background: '#F4F4F5', padding: '4px 12px', borderRadius: 20 }}>
              {activePage === 'products' && `${categories.length} sections`}
              {activePage === 'images' && imageTab === 'products' && '4 products'}
              {activePage === 'images' && imageTab === 'classes' && '3 classes'}
              {activePage === 'images' && imageTab === 'gallery' && `${galleryImages.length} files`}
              {activePage === 'training' && '3 classes'}
              {activePage === 'orders' && '0 orders'}
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: 32, maxWidth: 900 }}>

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
              <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E8E8E8', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A1A', marginBottom: '8px' }}>
                  Orders
                </div>
                <p style={{ fontSize: '14px', color: '#888888', lineHeight: 1.6, marginBottom: '20px' }}>
                  Order management is coming soon. When customers submit orders through the website, they will appear here for you to confirm payment and arrange delivery.
                </p>
                <div style={{ display: 'inline-block', background: '#F4F4F5', color: '#AAAAAA', borderRadius: '20px', padding: '6px 16px', fontSize: '13px', fontWeight: 600 }}>
                  No orders yet
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}

export default App
