import React, { useState, useEffect } from 'react'

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

const policies = [
  {
    label: 'Deposit',
    heading: 'Securing Your Appointment',
    body: 'To secure your booking, we kindly ask for a non-refundable deposit of R100, payable immediately after your appointment is confirmed. Please make payment to FNB account 63093932440 and send your proof of payment via WhatsApp to 082 685 5399. Your slot is only secured once your deposit has been received.',
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
]

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

function App() {
  const [showPolicies, setShowPolicies] = useState(false)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState(false)
  const [orderName, setOrderName] = useState('')
  const [orderPhone, setOrderPhone] = useState('')
  const [orderSubmitted, setOrderSubmitted] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [fulfilmentMethod, setFulfilmentMethod] = useState(null)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliverySuburb, setDeliverySuburb] = useState('')
  const [deliveryCity, setDeliveryCity] = useState('')
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [lastOrder, setLastOrder] = useState(null)
  const [copied, setCopied] = useState(false)
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
  }, [backendStatus])

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
          <a href="https://wa.me/27826855399" target="_blank" rel="noopener noreferrer">WhatsApp at 082 685 5399</a>.
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
  const canPlaceOrder = !!(orderName.trim() && orderPhone.trim() && fulfilmentMethod &&
    (fulfilmentMethod === 'pickup' || deliveryAddressComplete))

  const copyPaymentDetails = () => {
    navigator.clipboard.writeText('63093932440')
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const submitOrder = async () => {
    if (!canPlaceOrder) return
    setOrderError('')
    try {
      const res = await fetch(`${API}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: orderName,
          customerPhone: orderPhone,
          items: cart.map(i => ({ id: i.id, variantId: i.variantId, name: i.name, qty: i.qty, price: i.price })),
          fulfilmentMethod,
          deliveryAddress: fulfilmentMethod === 'delivery' ? deliveryAddress : undefined,
          deliverySuburb: fulfilmentMethod === 'delivery' ? deliverySuburb : undefined,
          deliveryCity: fulfilmentMethod === 'delivery' ? deliveryCity : undefined,
          deliveryPostalCode: fulfilmentMethod === 'delivery' ? deliveryPostalCode : undefined,
          deliveryNotes: fulfilmentMethod === 'delivery' ? deliveryNotes : undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setLastOrder({ id: data.orderId, total: orderTotal, fulfilmentMethod })
        setOrderSubmitted(true)
        setCart([])
      } else {
        setOrderError(data?.error || "I couldn't get your order through just now, but don't worry, your cart is still here. Please try again in a moment, or message me on WhatsApp and I'll sort it out for you.")
      }
    } catch (err) {
      console.error('Order submission failed:', err)
      setOrderError("I couldn't reach the shop just now, but your cart is safe. Please check your connection and try again, or message me on WhatsApp and I'll help right away.")
    }
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

    const pillStyle = (active, disabled) => ({
      padding: '6px 10px',
      borderRadius: '16px',
      fontSize: '12px',
      fontWeight: 600,
      border: `1px solid ${active ? '#C47A8A' : '#F5DDE2'}`,
      background: active ? '#C47A8A' : '#FFFFFF',
      color: disabled ? '#C8B8BC' : active ? '#FFFFFF' : '#2C2C2C',
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
        <div style={{ padding: '16px 18px 20px 18px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {product.badge && <span className="product-badge" style={{ marginBottom: '8px' }}>{product.badge}</span>}
          <h3 className="product-name">{product.name}</h3>
          <p className="product-description">{product.description}</p>
          <div style={{ fontSize: '11px', color: '#C4A0A8', letterSpacing: '0.3px', marginBottom: '10px', fontStyle: 'italic', textTransform: 'uppercase' }}>
            {product.detail}
          </div>
          <p className="product-price">R {product.price}</p>

          {hasOptions && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#7A6670', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
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
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#7A6670', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
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
            </div>
          )}

          <div style={{ fontSize: '12px', marginBottom: '10px', fontWeight: 600 }}>
            {!choiceComplete ? (
              <span style={{ color: '#9A7A82', fontStyle: 'italic', fontWeight: 400 }}>
                Choose a length{showCurlPicker ? ' and curl' : ''} to see availability
              </span>
            ) : effectiveStock <= 0 ? (
              <span style={{ color: '#9A7A82', fontStyle: 'italic', fontWeight: 400 }}>Sold out for now</span>
            ) : effectiveStock <= effectiveLowThreshold ? (
              <span style={{ color: '#C47A8A' }}>Only {effectiveStock} left</span>
            ) : (
              <span style={{ color: '#9A7A82', fontWeight: 400 }}>In stock</span>
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

  return (
    <div className="page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700&display=swap');

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          font-family: 'Lato', sans-serif;
          background: #FFFAF8;
          color: #2C2C2C;
        }

        .page {
          font-family: 'Lato', sans-serif;
          color: #2C2C2C;
          background-color: #FFFAF8;
          min-height: 100vh;
        }

        /* Nav */
        .nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background-color: #FDF0F3;
          color: #2C2C2C;
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
          color: #2C2C2C;
          text-decoration: none;
          font-size: 0.95rem;
          transition: color 0.2s ease;
        }

        .nav-links a:hover {
          color: #C47A8A;
        }

        .nav-links .book-now-link {
          background-color: #C47A8A;
          color: #FFFFFF;
          padding: 8px 20px;
          border-radius: 24px;
          transition: background-color 0.2s ease;
        }

        .nav-links .book-now-link:hover {
          background-color: #A8606F;
          color: #FFFFFF;
        }

        /* Hero */
        .hero {
          width: 100%;
          background: radial-gradient(ellipse at 60% 40%, #FADADD 0%, #FFFAF8 70%);
          padding-top: 6rem;
          padding-bottom: 48px;
          padding-left: 2rem;
          padding-right: 2rem;
          text-align: center;
        }

        .hero-headline {
          font-family: 'Cormorant Garamond', serif;
          font-size: 52px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 1rem;
          color: #2C2C2C;
        }

        .hero-subtext {
          font-family: 'Lato', sans-serif;
          font-size: 16px;
          font-weight: 300;
          letter-spacing: 0.3px;
          color: #7A6670;
          max-width: 600px;
          margin: 0 auto 2.5rem auto;
          line-height: 1.6;
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
          background-color: #C47A8A;
          color: #FFFFFF;
        }

        .btn-primary:hover {
          background-color: #A8606F;
        }

        .btn-secondary {
          background-color: transparent;
          color: #C47A8A;
          border: 2px solid #C47A8A;
        }

        .btn-secondary:hover {
          background-color: #C47A8A;
          color: #FFFFFF;
        }

        /* Generic section */
        .section {
          padding: 5rem 2rem;
          text-align: center;
        }

        .section-alt {
          background-color: #FDF0F3;
        }

        #shop {
          background-color: #FFFAF8;
        }

        #classes {
          background-color: #FDF0F3;
        }

        #gallery {
          background-color: #FFFAF8;
        }

        #contact {
          background-color: #FDF0F3;
        }

        .section-heading {
          font-family: 'Cormorant Garamond', serif;
          font-size: 38px;
          font-weight: 700;
          margin-bottom: 0;
          color: #2C2C2C;
        }

        .section-heading::after {
          content: '';
          display: block;
          width: 48px;
          height: 2px;
          background: #C47A8A;
          margin: 8px auto 24px auto;
        }

        .section-text {
          font-size: 1.05rem;
          color: #7A6670;
        }

        /* Backend wake-up / unreachable states */
        .backend-status-message {
          max-width: 480px;
          margin: 0 auto;
          padding: 48px 20px;
          text-align: center;
          font-size: 1.05rem;
          color: #7A6670;
        }

        .backend-status-message.is-loading {
          animation: backendStatusPulse 1.6s ease-in-out infinite;
        }

        .backend-status-message.is-error {
          color: #A0566A;
          font-weight: 600;
        }

        .backend-status-message a {
          color: #C47A8A;
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
          background: #FFFFFF;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 2px 16px rgba(196, 122, 138, 0.10);
          border: 1px solid #F5DDE2;
          display: flex;
          flex-direction: column;
        }

        .product-card:hover .product-img {
          transform: scale(1.04);
        }

        .product-image-placeholder {
          height: 240px;
          background-color: #FADADD;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #C47A8A;
          font-size: 13px;
          font-style: italic;
        }

        .product-badge {
          display: inline-block;
          background-color: #C47A8A;
          color: #FFFFFF;
          font-size: 11px;
          padding: 3px 10px;
          border-radius: 20px;
          margin-bottom: 8px;
          width: fit-content;
        }

        .product-name {
          font-family: 'Cormorant Garamond', serif;
          font-weight: 700;
          font-size: 18px;
          color: #2C2C2C;
          margin-bottom: 6px;
          line-height: 1.2;
        }

        .product-description {
          font-size: 13px;
          color: #7A6670;
          line-height: 1.6;
          margin-bottom: 8px;
          flex: 1;
        }

        .product-price {
          font-size: 20px;
          font-weight: 700;
          color: #C47A8A;
          margin-bottom: 14px;
        }

        .btn-add-cart {
          width: 100%;
          background-color: #C47A8A;
          color: #FFFFFF;
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
          background-color: #A8606F;
        }

        .add-to-cart-btn:hover {
          background: #A0566A !important;
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
          background-color: #FFFFFF;
          box-shadow: 0 2px 16px rgba(196, 122, 138, 0.10);
          border-radius: 16px;
          border: 1px solid #F5DDE2;
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
          font-family: 'Cormorant Garamond', serif;
          font-weight: 700;
          font-size: 20px;
          color: #2C2C2C;
          margin-bottom: 4px;
        }

        .class-level-badge {
          background-color: #FADADD;
          color: #C47A8A;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 12px;
          border-radius: 20px;
          white-space: nowrap;
        }

        .class-duration {
          font-size: 13px;
          color: #9A8A8E;
          margin-top: 4px;
          margin-bottom: 12px;
        }

        .class-description {
          font-size: 13px;
          color: #5A4A50;
          line-height: 1.7;
          margin-bottom: 16px;
        }

        .class-price {
          font-size: 24px;
          font-weight: 700;
          color: #C47A8A;
          margin-bottom: 4px;
        }

        .class-seats {
          font-size: 12px;
          color: #9A8A8E;
          margin-top: 4px;
          margin-bottom: 18px;
          font-style: italic;
        }

        .class-certification {
          font-size: 13px;
          color: #7A6670;
          font-style: italic;
          margin-bottom: 16px;
        }

        .btn-enquire {
          width: 100%;
          border: 2px solid #C47A8A;
          background-color: transparent;
          color: #C47A8A;
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
          background-color: #C47A8A;
          color: #FFFFFF;
        }

        .enquire-btn:hover {
          background: #C47A8A !important;
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
          background-color: #2C1A20;
          color: #C4A0A8;
          text-align: center;
          padding: 32px 20px;
          font-size: 13px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .social-icon-link:hover {
          background: #C47A8A !important;
          border-color: #C47A8A !important;
        }

        .social-icon-link:hover svg {
          color: #FFFFFF;
          fill: #FFFFFF;
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
          color: #C47A8A;
        }

        .class-item::before {
          content: '-';
          position: absolute;
          left: 0;
          color: #C47A8A;
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
          .hero-buttons { flex-direction: column !important; align-items: center !important; gap: 12px !important; }
          .hero-btn { width: 100% !important; max-width: 280px !important; }

          /* Products */
          .product-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
          .products-section { padding: 60px 16px !important; }

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
          color: #2C2C2C;
          line-height: 1;
        }

        @media (max-width: 768px) {
          .desktop-nav-links { display: none !important; }
          .hamburger-btn { display: block !important; }
        }

        @media (max-width: 480px) {
          .hero-heading { font-size: 28px !important; }

          .policies-nav { padding: 0 16px !important; height: auto !important; min-height: 60px !important; flex-wrap: wrap !important; gap: 8px !important; padding-top: 10px !important; padding-bottom: 10px !important; }
          .policies-content { padding: 40px 16px !important; }
        }
      `}</style>

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
            color: '#2C2C2C',
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
              color: '#2C2C2C',
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
                  background: '#C47A8A',
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
          background: '#FDF0F3',
          borderBottom: '1px solid #F5DDE2',
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
                color: '#2C2C2C',
                textDecoration: 'none',
                borderBottom: '1px solid #F5DDE2',
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
              background: '#C47A8A',
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
        <h1 className="hero-headline hero-heading">Beautiful Lashes. Effortless Booking.</h1>
        <p className="hero-subtext">
          Extension sets, refills, brow lamination and beauty classes in Vanderbijlpark.
        </p>
        <div className="hero-buttons">
          <a
            className="btn btn-primary hero-btn"
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Book Now
          </a>
          <button className="btn btn-secondary hero-btn" onClick={scrollToShop}>
            Shop Products
          </button>
        </div>
      </section>

      <section id="shop" className="section products-section">
        <h2 className="section-heading">Our Products</h2>
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
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: '24px',
                    fontWeight: '700',
                    color: '#2C2C2C',
                    marginBottom: '6px',
                    letterSpacing: '0.3px',
                  }}>{group.name}</h3>
                  <div style={{ width: '28px', height: '2px', background: '#C47A8A', marginLeft: '2px' }} />
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
        <h2 className="section-heading">Lash Training</h2>
        <div className="classes-grid">
          {CLASSES.map((cls) => (
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
                background: 'radial-gradient(circle at top right, #F7EEF0 0%, transparent 70%)',
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
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: '#C47A8A', textTransform: 'uppercase', marginBottom: '8px' }}>
                      What you will learn
                    </div>
                    {cls.learns.map((item) => (
                      <div
                        className="class-item"
                        key={item}
                        style={{ fontSize: '13px', color: '#5A4A50', lineHeight: 1.7, paddingLeft: '12px', position: 'relative' }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: '#C47A8A', textTransform: 'uppercase', marginBottom: '8px' }}>
                      What is included
                    </div>
                    {cls.includes.map((item) => (
                      <div
                        className="class-item"
                        key={item}
                        style={{ fontSize: '13px', color: '#5A4A50', lineHeight: 1.7, paddingLeft: '12px', position: 'relative' }}
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
                <p style={{ fontSize: '11px', color: '#C47A8A', fontWeight: 600, textAlign: 'center', marginTop: '4px' }}>
                  Tap to view full details
                </p>
              )}
              {!isMobile && (
                <a
                  className="btn-enquire enquire-btn"
                  href={`https://wa.me/27826855399?text=Hi%20Retha%2C%20I%20am%20interested%20in%20the%20${encodeURIComponent(cls.name)}%20(${encodeURIComponent(cls.duration)})`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
                >
                  Enquire Now
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {expandedClassId && isMobile && (() => {
        const cls = CLASSES.find((c) => c.id === expandedClassId)
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
                background: '#FFFAF8',
                borderRadius: '16px',
                zIndex: 900,
                padding: '40px 24px 24px 24px',
                boxShadow: '0 12px 40px rgba(44,44,44,0.25)',
              }}
            >
              <button
                onClick={() => setExpandedClassId(null)}
                style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#7A6670' }}
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
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: '#C47A8A', textTransform: 'uppercase', marginBottom: '8px' }}>
                    What you will learn
                  </div>
                  {cls.learns.map((item) => (
                    <div
                      className="class-item"
                      key={item}
                      style={{ fontSize: '13px', color: '#5A4A50', lineHeight: 1.7, paddingLeft: '12px', position: 'relative' }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: '#C47A8A', textTransform: 'uppercase', marginBottom: '8px' }}>
                    What is included
                  </div>
                  {cls.includes.map((item) => (
                    <div
                      className="class-item"
                      key={item}
                      style={{ fontSize: '13px', color: '#5A4A50', lineHeight: 1.7, paddingLeft: '12px', position: 'relative' }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <p className="class-price">R {cls.price}</p>
              <p className="class-seats">Non-refundable deposit of R{cls.deposit} to secure your spot</p>
              <a
                className="btn-enquire enquire-btn"
                href={`https://wa.me/27826855399?text=Hi%20Retha%2C%20I%20am%20interested%20in%20the%20${encodeURIComponent(cls.name)}%20(${encodeURIComponent(cls.duration)})`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
              >
                Enquire Now
              </a>
            </div>
          </>
        )
      })()}

      <section id="gallery" className="section section-alt gallery-section">
        <h2 className="section-heading">Our Work</h2>
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
              { height: 220, background: '#F7EEF0' },
              { height: 280, background: '#EDD5DB' },
              { height: 200, background: '#F2E4E8' },
              { height: 260, background: '#EDD5DB' },
              { height: 240, background: '#F7EEF0' },
              { height: 300, background: '#F7EEF0' },
              { height: 210, background: '#F2E4E8' },
              { height: 270, background: '#F5EDF0' },
              { height: 230, background: '#EDD5DB' },
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
                <span style={{ fontSize: '11px', fontStyle: 'italic', color: '#C4A0A8', letterSpacing: '1px', textTransform: 'uppercase' }}>Lash Work</span>
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
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: '38px',
              fontWeight: '700',
              color: '#2C2C2C',
              marginBottom: '8px',
            }}>
              Contact Us
            </h2>
            <div style={{ width: '48px', height: '2px', background: '#C47A8A', margin: '8px auto 0 auto' }} />
          </div>

          <div className="contact-card" style={{ background: '#FFFFFF', borderRadius: '16px', padding: '32px', boxShadow: '0 2px 16px rgba(196,122,138,0.10)', border: '1px solid #F5DDE2', maxWidth: '560px', margin: '0 auto' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: '#C47A8A', textTransform: 'uppercase', marginBottom: '20px', display: 'block' }}>
              Get in Touch
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #F7EEF0' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Address</span>
              <span style={{ fontSize: '14px', color: '#2C2C2C', lineHeight: 1.6 }}>125 Piet Retief Boulevard, Vanderbijlpark Se1, Gauteng 1911</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #F7EEF0' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Phone</span>
              <span style={{ fontSize: '14px', color: '#2C2C2C' }}>+27 82 685 5399</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #F7EEF0' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Hours</span>
              <span style={{ fontSize: '14px', color: '#2C2C2C' }}>Tuesday to Saturday, 8:00 AM to 7:00 PM</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#C4A0A8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>WhatsApp</span>
              <a href="https://wa.me/27826855399" target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: '#C47A8A', fontWeight: 600, textDecoration: 'none' }}>
                Chat with us on WhatsApp
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
              color: '#C4A0A8',
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
              color: '#C4A0A8',
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
              color: '#C4A0A8',
              transition: 'background 0.2s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
            </svg>
          </a>
        </div>
        <button
          className="footer-policies-link"
          onClick={() => {
            setShowPolicies(true)
            window.scrollTo(0, 0)
          }}
        >
          Policies
        </button>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>&copy; 2026 Hair By Her. All rights reserved.</p>
        </div>
      </footer>
      </>
      )}

      {showPolicies && (
        <div style={{ minHeight: '100vh', background: '#FFFAF8', fontFamily: "'Lato', sans-serif" }}>
          <div
            className="policies-nav"
            style={{
              background: '#FDF0F3',
              borderBottom: '1px solid #F5DDE2',
              padding: '0 40px',
              height: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: '20px',
                fontWeight: 700,
                color: '#C47A8A',
              }}
            >
              Hair By Her
            </span>
            <button
              onClick={() => setShowPolicies(false)}
              style={{
                background: 'none',
                border: '1px solid #C47A8A',
                color: '#C47A8A',
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
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: '42px',
                fontWeight: 700,
                color: '#2C2C2C',
                marginBottom: '8px',
              }}
            >
              Our Policies
            </h1>
            <p style={{ fontSize: '15px', color: '#7A6670', lineHeight: 1.6, marginBottom: '8px' }}>
              We want every visit to be a wonderful experience for you. These policies help us make sure things run smoothly for everyone — we truly appreciate your understanding and cooperation.
            </p>
            <div style={{ width: '48px', height: '2px', background: '#C47A8A', margin: '16px 0 48px 0' }} />

            <div
              style={{
                display: 'flex',
                gap: 0,
                marginBottom: '32px',
                borderRadius: '24px',
                border: '1px solid #F5DDE2',
                overflow: 'hidden',
                width: 'fit-content',
              }}
            >
              <button
                onClick={() => setPolicyTab('booking')}
                style={{
                  padding: '10px 24px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s',
                  background: policyTab === 'booking' ? '#C47A8A' : '#FFFFFF',
                  color: policyTab === 'booking' ? '#FFFFFF' : '#7A6670',
                }}
              >
                Booking Policy
              </button>
              <button
                onClick={() => setPolicyTab('product')}
                style={{
                  padding: '10px 24px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s',
                  background: policyTab === 'product' ? '#C47A8A' : '#FFFFFF',
                  color: policyTab === 'product' ? '#FFFFFF' : '#7A6670',
                }}
              >
                Product Policy
              </button>
            </div>

            {policyTab === 'booking' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {policies.map((policy) => (
                  <div
                    key={policy.label}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '12px',
                      borderLeft: '4px solid #C47A8A',
                      padding: '24px 28px',
                      boxShadow: '0 2px 12px rgba(196, 122, 138, 0.08)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '2px',
                        color: '#C47A8A',
                        textTransform: 'uppercase',
                        marginBottom: '10px',
                      }}
                    >
                      {policy.label}
                    </div>
                    <div
                      style={{
                        fontFamily: "'Cormorant Garamond', serif",
                        fontSize: '20px',
                        fontWeight: 600,
                        color: '#2C2C2C',
                        marginBottom: '10px',
                      }}
                    >
                      {policy.heading}
                    </div>
                    <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#4A4A4A' }}>
                      {policy.body}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {policyTab === 'product' && (
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  borderLeft: '4px solid #C47A8A',
                  padding: '24px 28px',
                  boxShadow: '0 2px 12px rgba(196, 122, 138, 0.08)',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '2px',
                    color: '#C47A8A',
                    textTransform: 'uppercase',
                    marginBottom: '10px',
                  }}
                >
                  Coming Soon
                </div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: '20px',
                    fontWeight: 600,
                    color: '#2C2C2C',
                    marginBottom: '10px',
                  }}
                >
                  Product Policies
                </div>
                <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#4A4A4A' }}>
                  Our product policies are currently being finalised. Please check back soon or reach out to us on WhatsApp at 082 685 5399 if you have any questions about a purchase.
                </div>
              </div>
            )}

            <div
              style={{
                marginTop: '48px',
                paddingTop: '32px',
                borderTop: '1px solid #F5DDE2',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: '22px',
                  fontWeight: 600,
                  color: '#2C2C2C',
                  marginBottom: '8px',
                }}
              >
                Download Our Policies
              </div>
              <p style={{ fontSize: '13px', color: '#7A6670', marginBottom: '20px' }}>
                Prefer to save a copy? Download our policies summary below.
              </p>
              <a
                href="/Hair-By-Her-Policies.pdf"
                download="Hair-By-Her-Policies.pdf"
                style={{
                  display: 'inline-block',
                  background: '#C47A8A',
                  color: '#FFFFFF',
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
              background: '#C47A8A',
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
                background: '#2C2C2C',
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
                setOrderSubmitted(false)
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
              background: '#FFFAF8',
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
                borderBottom: '1px solid #F5DDE2',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '22px', fontWeight: 700, color: '#2C2C2C' }}>
                Your Cart
              </div>
              <button
                onClick={() => {
                  setCartOpen(false)
                  setCheckoutStep(false)
                  setOrderSubmitted(false)
                  setOrderError('')
                }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#7A6670' }}
              >
                x
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {orderSubmitted ? (
                <div style={{ textAlign: 'center', paddingTop: '40px' }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '22px', color: '#2C2C2C', marginBottom: '12px' }}>
                    Thank you, your order has been placed!
                  </div>
                  <p style={{ fontSize: '14px', color: '#7A6670', lineHeight: 1.7, marginBottom: '16px' }}>
                    {lastOrder?.fulfilmentMethod === 'delivery'
                      ? "We'll be in touch on WhatsApp to confirm your payment and arrange delivery. We appreciate your support!"
                      : "We'll let you know on WhatsApp as soon as your order is ready to collect. We appreciate your support!"}
                  </p>
                  {lastOrder && (
                    <p style={{ fontSize: '14px', color: '#2C2C2C', fontWeight: 600, lineHeight: 1.7, marginBottom: '24px' }}>
                      Your total is R {lastOrder.total}. Please use HBH-{lastOrder.id} as your payment reference.
                    </p>
                  )}
                  <button
                    onClick={() => {
                      setCartOpen(false)
                      setOrderSubmitted(false)
                      setCheckoutStep(false)
                      setOrderError('')
                      setFulfilmentMethod(null)
                      setDeliveryAddress('')
                      setDeliverySuburb('')
                      setDeliveryCity('')
                      setDeliveryPostalCode('')
                      setDeliveryNotes('')
                      setLastOrder(null)
                    }}
                    style={{
                      background: '#C47A8A',
                      color: 'white',
                      border: 'none',
                      borderRadius: '24px',
                      padding: '12px 28px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Continue Shopping
                  </button>
                </div>
              ) : !checkoutStep ? (
                cart.length === 0 ? (
                  <p style={{ fontSize: '14px', color: '#7A6670', textAlign: 'center', marginTop: '40px' }}>
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
                          borderBottom: '1px solid #F5DDE2',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#2C2C2C', marginBottom: '4px' }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: '13px', color: '#9A7A82' }}>R {item.price}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <button
                            onClick={() => updateQty(item.cartKey, -1)}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              border: '1px solid #F5DDE2',
                              background: 'white',
                              cursor: 'pointer',
                              fontSize: '16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#2C2C2C',
                            }}
                          >
                            -
                          </button>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#2C2C2C', minWidth: '16px', textAlign: 'center' }}>
                            {item.qty}
                          </span>
                          <button
                            onClick={() => addToCart(item)}
                            disabled={item.qty >= item.stockQuantity}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              border: '1px solid #F5DDE2',
                              background: 'white',
                              cursor: item.qty >= item.stockQuantity ? 'not-allowed' : 'pointer',
                              opacity: item.qty >= item.stockQuantity ? 0.4 : 1,
                              fontSize: '16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#2C2C2C',
                            }}
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeFromCart(item.cartKey)}
                            style={{ background: 'none', border: 'none', color: '#C8A8B0', fontSize: '14px', cursor: 'pointer', marginLeft: '4px' }}
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
                        borderTop: '2px solid #F5DDE2',
                      }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#2C2C2C' }}>Subtotal</span>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: '#C47A8A' }}>R {cartTotal}</span>
                    </div>

                    <button
                      onClick={() => setCheckoutStep(true)}
                      style={{
                        width: '100%',
                        background: '#C47A8A',
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
                      color: '#C47A8A',
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

                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '20px', fontWeight: 700, color: '#2C2C2C', marginBottom: '16px' }}>
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
                      border: '1px solid #F5DDE2',
                      fontSize: '14px',
                      marginBottom: '12px',
                      background: 'white',
                      color: '#2C2C2C',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />

                  <input
                    type="text"
                    placeholder="Your WhatsApp number"
                    value={orderPhone}
                    onChange={(e) => setOrderPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #F5DDE2',
                      fontSize: '14px',
                      marginBottom: '12px',
                      background: 'white',
                      color: '#2C2C2C',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />

                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '20px', fontWeight: 700, color: '#2C2C2C', marginBottom: '12px' }}>
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
                          border: `1px solid ${fulfilmentMethod === method ? '#C47A8A' : '#F5DDE2'}`,
                          background: fulfilmentMethod === method ? '#C47A8A' : 'white',
                          color: fulfilmentMethod === method ? 'white' : '#2C2C2C',
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
                          width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #F5DDE2',
                          fontSize: '14px', marginBottom: '10px', background: 'white', color: '#2C2C2C',
                          fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Suburb"
                        value={deliverySuburb}
                        onChange={(e) => setDeliverySuburb(e.target.value)}
                        style={{
                          width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #F5DDE2',
                          fontSize: '14px', marginBottom: '10px', background: 'white', color: '#2C2C2C',
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
                            flex: 1, padding: '12px 14px', borderRadius: '10px', border: '1px solid #F5DDE2',
                            fontSize: '14px', background: 'white', color: '#2C2C2C',
                            fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Postal code"
                          value={deliveryPostalCode}
                          onChange={(e) => setDeliveryPostalCode(e.target.value)}
                          style={{
                            width: '120px', padding: '12px 14px', borderRadius: '10px', border: '1px solid #F5DDE2',
                            fontSize: '14px', background: 'white', color: '#2C2C2C',
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
                          width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #F5DDE2',
                          fontSize: '14px', background: 'white', color: '#2C2C2C',
                          fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
                        }}
                      />
                    </div>
                  )}

                  {fulfilmentMethod === 'pickup' && (
                    <div
                      style={{
                        background: '#FDF0F3',
                        borderRadius: '12px',
                        padding: '14px 18px',
                        marginBottom: '16px',
                        border: '1px solid #F5DDE2',
                      }}
                    >
                      <div style={{ fontSize: '13px', color: '#2C2C2C', lineHeight: 1.7 }}>
                        Pickup from {PICKUP_ADDRESS}
                      </div>
                      <div style={{ fontSize: '13px', color: '#2C2C2C', lineHeight: 1.7 }}>
                        {PICKUP_HOURS}
                      </div>
                      <div style={{ fontSize: '12px', color: '#7A6670', marginTop: '6px', lineHeight: 1.6 }}>
                        We'll let you know on WhatsApp when your order is ready to collect.
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      background: '#FDF0F3',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      marginTop: '8px',
                      marginBottom: '20px',
                      border: '1px solid #F5DDE2',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', color: '#C47A8A', textTransform: 'uppercase', marginBottom: '10px' }}>
                      Payment Details
                    </div>
                    <div style={{ fontSize: '13px', color: '#2C2C2C', lineHeight: 1.8 }}>Bank: FNB</div>
                    <div style={{ fontSize: '13px', color: '#2C2C2C', lineHeight: 1.8 }}>Account name: Hair By Her</div>
                    <div style={{ fontSize: '13px', color: '#2C2C2C', lineHeight: 1.8 }}>Account number: 63093932440</div>
                    <button
                      onClick={copyPaymentDetails}
                      style={{
                        marginTop: '10px',
                        background: 'none',
                        border: '1px solid #C47A8A',
                        color: '#C47A8A',
                        borderRadius: '20px',
                        padding: '6px 16px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {copied ? 'Copied!' : 'Copy payment details'}
                    </button>
                    <p style={{ fontSize: '12px', color: '#7A6670', marginTop: '8px', lineHeight: 1.6 }}>
                      Please send your proof of payment via WhatsApp to 082 685 5399 after making payment.
                    </p>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#7A6670', marginBottom: '4px' }}>
                      <span>Subtotal</span>
                      <span>R {cartTotal}</span>
                    </div>
                    {fulfilmentMethod === 'delivery' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#7A6670', marginBottom: '4px' }}>
                        <span>Delivery fee</span>
                        <span>R {DELIVERY_FEE}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, color: '#2C2C2C', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #F5DDE2' }}>
                      <span>Total</span>
                      <span>R {orderTotal}</span>
                    </div>
                  </div>

                  {orderError && (
                    <div style={{
                      background: '#FDF0F3',
                      border: '1px solid #F5C0CC',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      marginBottom: '16px',
                      fontSize: '13px',
                      color: '#A0566A',
                      lineHeight: 1.6,
                    }}>
                      {orderError}
                    </div>
                  )}

                  <button
                    onClick={submitOrder}
                    disabled={!canPlaceOrder}
                    style={{
                      width: '100%',
                      background: '#C47A8A',
                      color: 'white',
                      border: 'none',
                      borderRadius: '24px',
                      padding: '14px',
                      fontSize: '15px',
                      fontWeight: 700,
                      cursor: !canPlaceOrder ? 'not-allowed' : 'pointer',
                      opacity: !canPlaceOrder ? 0.5 : 1,
                    }}
                  >
                    Place Order
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default App
