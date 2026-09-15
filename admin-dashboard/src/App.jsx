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
  const [activeTab, setActiveTab] = useState('products')
  const [productImages, setProductImages] = useState({})
  const [classImages, setClassImages] = useState({})
  const [galleryImages, setGalleryImages] = useState([])
  const [uploadStatus, setUploadStatus] = useState({})
  const [productPositions, setProductPositions] = useState({})
  const [classPositions, setClassPositions] = useState({})

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

  return (
    <div className="page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Lato:wght@300;400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Lato', sans-serif; background: #FFFAF8; color: #2C2C2C; }
        .tab-btn { background: none; border: none; padding: 10px 24px; font-size: 14px; font-family: inherit; cursor: pointer; color: #7A6670; border-bottom: 2px solid transparent; transition: all 0.2s; }
        .tab-btn.active { color: #C47A8A; border-bottom-color: #C47A8A; font-weight: 700; }
        .upload-btn { background: #C47A8A; color: white; border: none; border-radius: 20px; padding: 8px 18px; font-size: 13px; font-family: inherit; cursor: pointer; font-weight: 600; }
        .upload-btn:hover { background: #A8606F; }
        .card { background: white; border-radius: 12px; border: 1px solid #F5DDE2; padding: 16px; display: flex; align-items: center; gap: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(196,122,138,0.07); }
        .card-img { width: 80px; height: 80px; border-radius: 8px; object-fit: cover; background: #FADADD; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #C47A8A; font-style: italic; }
        .card-img img { width: 80px; height: 80px; border-radius: 8px; object-fit: cover; }
        .success-msg { font-size: 12px; color: #4CAF50; margin-top: 6px; font-weight: 600; }
        .error-msg { font-size: 12px; color: #e57373; margin-top: 6px; }
        input[type="file"] { display: none; }

        .adjust-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          margin-left: 8px;
        }

        .adjust-row {
          display: flex;
          gap: 2px;
        }

        .adj-btn {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          border: 1px solid #F5DDE2;
          background: white;
          color: #C47A8A;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          line-height: 1;
        }

        .adj-btn:hover {
          background: #FDF0F3;
        }

        .pos-label {
          font-size: 10px;
          color: #9A7A82;
          text-align: center;
          margin-top: 3px;
          letter-spacing: 0.3px;
        }
      `}</style>

      <nav
        style={{
          background: '#FDF0F3',
          borderBottom: '1px solid #F5DDE2',
          padding: '0 32px',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <img src="/logo.png" alt="Lashes By Retha" style={{ height: '48px', width: 'auto', objectFit: 'contain', display: 'block' }} />
        <span style={{ fontSize: '13px', color: '#7A6670' }}>Admin Dashboard</span>
      </nav>

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '32px', fontWeight: 700, color: '#2C2C2C', marginBottom: '4px' }}>
          Image Management
        </div>
        <p style={{ fontSize: '14px', color: '#7A6670', marginBottom: '32px' }}>
          Upload images for products, classes and the gallery. Images appear on the customer site immediately.
        </p>

        <div style={{ borderBottom: '1px solid #F5DDE2', marginBottom: '28px', display: 'flex' }}>
          <button
            className={`tab-btn${activeTab === 'products' ? ' active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            Products
          </button>
          <button
            className={`tab-btn${activeTab === 'classes' ? ' active' : ''}`}
            onClick={() => setActiveTab('classes')}
          >
            Classes
          </button>
          <button
            className={`tab-btn${activeTab === 'gallery' ? ' active' : ''}`}
            onClick={() => setActiveTab('gallery')}
          >
            Gallery
          </button>
        </div>

        {activeTab === 'products' && (
          <div>
            {PRODUCTS.map(p => (
              <div className="card" key={p.id}>
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

        {activeTab === 'classes' && (
          <div>
            {CLASSES.map(c => (
              <div className="card" key={c.id}>
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

        {activeTab === 'gallery' && (
          <div>
            <label htmlFor="file-gallery-new" className="upload-btn" style={{ marginBottom: '20px', display: 'inline-block' }}>
              Add Gallery Image
            </label>
            <input
              id="file-gallery-new"
              type="file"
              accept="image/*"
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
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: '12px',
                  marginTop: '20px',
                }}
              >
                {galleryImages.map(img => (
                  <div key={img.filename} style={{ borderRadius: '10px', overflow: 'hidden', position: 'relative' }}>
                    <img
                      src={`${API}${img.url}`}
                      alt={img.filename}
                      style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }}
                    />
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
    </div>
  )
}

export default App
