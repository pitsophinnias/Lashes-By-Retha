import { useState } from 'react'

const products = [
  {
    name: 'Lash Cleanser',
    description:
      'Gentle, oil-free foam cleanser that keeps your lash extensions clean and extends retention. Safe for daily use.',
    price: 'R 120',
    badge: 'Best Seller',
  },
  {
    name: 'Lash Sealant',
    description:
      'Protective coating that bonds to your extensions, adds shine and locks in moisture for longer-lasting lashes.',
    price: 'R 95',
    badge: null,
  },
  {
    name: 'Lash Brush Set (5 pack)',
    description:
      'Soft spoolie brushes for daily grooming. Keep your lashes fluffy, separated and perfectly fanned.',
    price: 'R 65',
    badge: 'New',
  },
  {
    name: 'Under-Eye Gel Patches',
    description:
      'Cooling hydrogel patches that protect the under-eye area during lash application. Soothing and refreshing.',
    price: 'R 80',
    badge: null,
  },
  {
    name: 'Lash Extension Adhesive',
    description:
      'Professional-grade bonding adhesive for long-lasting lash sets. Low fume formula with strong retention.',
    price: 'R 180',
    badge: 'Pro Pick',
  },
  {
    name: 'Aftercare Kit',
    description:
      'Complete starter kit including cleanser, sealant and a brush set. Everything you need to maintain your lashes at home.',
    price: 'R 299',
    badge: 'Bundle',
  },
]

const classes = [
  {
    name: 'Classic Lash Application',
    duration: '2-day course',
    level: 'Beginner',
    description:
      'Learn the fundamentals of classic lash extensions from prep and isolation to application and aftercare advice.',
    price: 'R 2 500',
    seats: '6 seats available',
    certification: 'Certificate of Completion included',
  },
  {
    name: 'Volume and Mega Volume',
    duration: '3-day course',
    level: 'Intermediate',
    description:
      'Master the art of handmade fans, Russian volume and mega volume techniques for a full, dramatic look.',
    price: 'R 3 800',
    seats: '4 seats available',
    certification: 'Certificate of Completion included',
  },
  {
    name: 'Brow Lamination and Tint',
    duration: '1-day course',
    level: 'Beginner',
    description:
      'Full brow lamination and tinting course covering product knowledge, mapping, processing times and aftercare.',
    price: 'R 1 800',
    seats: '8 seats available',
    certification: 'Certificate of Completion included',
  },
  {
    name: 'Lash Removal and Refills',
    duration: '1-day course',
    level: 'Beginner',
    description:
      'Covers safe lash removal techniques and refill application to maintain density and client retention.',
    price: 'R 1 200',
    seats: '6 seats available',
    certification: 'Certificate of Completion included',
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

function App() {
  const [showPolicies, setShowPolicies] = useState(false)
  const bookingUrl = 'https://lashesbyretha.setmore.com'

  const scrollToShop = () => {
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })
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
          padding: 1.25rem 2rem;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 1px 8px rgba(196, 122, 138, 0.12);
        }

        .nav-logo {
          font-family: 'Cormorant Garamond', serif;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #C47A8A;
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
          padding: 6rem 2rem;
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
          background-color: #FFFFFF;
          box-shadow: 0 2px 16px rgba(196, 122, 138, 0.10);
          border-radius: 14px;
          border: 1px solid #F5DDE2;
          padding: 20px;
          display: flex;
          flex-direction: column;
        }

        .product-image-placeholder {
          height: 180px;
          background-color: #FADADD;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #C47A8A;
          font-size: 13px;
          font-style: italic;
          border-radius: 8px;
          margin-bottom: 14px;
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
          font-weight: 600;
          font-size: 17px;
          margin-bottom: 6px;
        }

        .product-description {
          font-size: 14px;
          color: #7A6670;
          line-height: 1.5;
          margin-bottom: 12px;
        }

        .product-price {
          font-size: 18px;
          font-weight: 700;
          color: #C47A8A;
          margin-bottom: 14px;
        }

        .btn-add-cart {
          width: 100%;
          background-color: #C47A8A;
          color: #FFFFFF;
          border: none;
          padding: 10px;
          border-radius: 24px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: auto;
          transition: background-color 0.2s ease;
        }

        .btn-add-cart:hover {
          background-color: #A8606F;
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
          border-radius: 14px;
          border: 1px solid #F5DDE2;
          padding: 24px;
          display: flex;
          flex-direction: column;
        }

        .class-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .class-name {
          font-family: 'Cormorant Garamond', serif;
          font-weight: 600;
          font-size: 20px;
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
          color: #7A6670;
          margin-top: 4px;
          margin-bottom: 10px;
        }

        .class-description {
          font-size: 14px;
          color: #7A6670;
          line-height: 1.5;
          margin-bottom: 14px;
        }

        .class-price {
          font-size: 22px;
          font-weight: 700;
          color: #C47A8A;
        }

        .class-seats {
          font-size: 13px;
          color: #7A6670;
          margin-top: 4px;
          margin-bottom: 16px;
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
          padding: 10px;
          border-radius: 24px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: auto;
          transition: background-color 0.2s ease, color 0.2s ease;
        }

        .btn-enquire:hover {
          background-color: #C47A8A;
          color: #FFFFFF;
        }

        /* Gallery */
        .gallery-subheading {
          margin-bottom: 0;
        }

        .gallery-grid {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          max-width: 1100px;
          margin: 0 auto;
        }

        @media (max-width: 768px) {
          .gallery-grid {
            flex-direction: column;
          }
        }

        @media (max-width: 768px) {
          .products-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .classes-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 480px) {
          .products-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Contact */
        .contact-details {
          max-width: 500px;
          margin: 2rem auto 0 auto;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          font-size: 1.05rem;
          color: #7A6670;
        }

        .contact-details a {
          color: #C47A8A;
          text-decoration: none;
          font-weight: 600;
        }

        .contact-details a:hover {
          color: #A8606F;
        }

        /* Footer */
        .footer {
          background-color: #FDF0F3;
          color: #7A6670;
          text-align: center;
          padding: 1.5rem 2rem;
          font-size: 13px;
          border-top: 1px solid #F5DDE2;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .social-icon-link:hover {
          background: #C47A8A !important;
        }

        .social-icon-link:hover svg {
          color: #FFFFFF;
          fill: #FFFFFF;
        }

        .footer-policies-link {
          background: none;
          border: none;
          color: #7A6670;
          font-size: 13px;
          text-decoration: underline;
          cursor: pointer;
          font-family: inherit;
          padding: 0;
          transition: color 0.2s ease;
        }

        .footer-policies-link:hover {
          color: #C47A8A;
        }

        @media (max-width: 640px) {
          .nav {
            flex-direction: column;
            gap: 1rem;
          }

          .nav-links {
            flex-wrap: wrap;
            justify-content: center;
            gap: 1rem;
          }

          .hero-headline {
            font-size: 2rem;
          }
        }
      `}</style>

      {!showPolicies && (
      <>
      <nav className="nav">
        <div className="nav-logo">Lashes By Retha</div>
        <ul className="nav-links">
          <li><a href="#home">Home</a></li>
          <li><a href="#shop">Shop</a></li>
          <li><a href="#classes">Classes</a></li>
          <li>
            <a
              className="book-now-link"
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Book Now
            </a>
          </li>
        </ul>
      </nav>

      <section id="home" className="hero">
        <h1 className="hero-headline">Beautiful Lashes. Effortless Booking.</h1>
        <p className="hero-subtext">
          Extension sets, refills, brow lamination and beauty classes in Vanderbijlpark.
        </p>
        <div className="hero-buttons">
          <a
            className="btn btn-primary"
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Book Now
          </a>
          <button className="btn btn-secondary" onClick={scrollToShop}>
            Shop Products
          </button>
        </div>
      </section>

      <section id="shop" className="section">
        <h2 className="section-heading">Our Products</h2>
        <div className="products-grid">
          {products.map((product) => (
            <div className="product-card" key={product.name}>
              <div className="product-image-placeholder">Product Image</div>
              {product.badge && <span className="product-badge">{product.badge}</span>}
              <h3 className="product-name">{product.name}</h3>
              <p className="product-description">{product.description}</p>
              <p className="product-price">{product.price}</p>
              <button className="btn-add-cart">Add to Cart</button>
            </div>
          ))}
        </div>
      </section>

      <section id="classes" className="section section-alt">
        <h2 className="section-heading">Beauty Classes</h2>
        <div className="classes-grid">
          {classes.map((cls) => (
            <div className="class-card" key={cls.name}>
              <div className="class-card-top">
                <span className="class-name">{cls.name}</span>
                <span className="class-level-badge">{cls.level}</span>
              </div>
              <p className="class-duration">{cls.duration}</p>
              <p className="class-description">{cls.description}</p>
              <p className="class-price">{cls.price}</p>
              <p className="class-seats">{cls.seats}</p>
              <p className="class-certification">{cls.certification}</p>
              <button className="btn-enquire">Enquire Now</button>
            </div>
          ))}
        </div>
      </section>

      <section id="gallery" className="section section-alt">
        <h2 className="section-heading">Our Work</h2>
        <p className="section-text gallery-subheading">A glimpse of the sets we create</p>
        <div className="gallery-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            <div style={{ height: '220px', background: '#FADADD', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#C47A8A' }}>Lash Work</span>
            </div>
            <div style={{ height: '260px', background: '#FADADD', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#C47A8A' }}>Lash Work</span>
            </div>
            <div style={{ height: '210px', background: '#FADADD', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#C47A8A' }}>Lash Work</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            <div style={{ height: '280px', background: '#FADADD', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#C47A8A' }}>Lash Work</span>
            </div>
            <div style={{ height: '240px', background: '#FADADD', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#C47A8A' }}>Lash Work</span>
            </div>
            <div style={{ height: '270px', background: '#FADADD', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#C47A8A' }}>Lash Work</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            <div style={{ height: '200px', background: '#FADADD', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#C47A8A' }}>Lash Work</span>
            </div>
            <div style={{ height: '300px', background: '#FADADD', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#C47A8A' }}>Lash Work</span>
            </div>
            <div style={{ height: '230px', background: '#FADADD', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#C47A8A' }}>Lash Work</span>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="section">
        <h2 className="section-heading">Contact Us</h2>
        <div className="contact-details">
          <span>125 Piet Retief Boulevard, Vanderbijlpark Se1, Gauteng 1911</span>
          <span>+27 82 685 5399</span>
          <span>Appointments: 90-minute slots, Tuesday to Saturday, 8:00 AM to 5:00 PM</span>
          <a href="https://wa.me/27826855399" target="_blank" rel="noopener noreferrer">
            Chat on WhatsApp
          </a>
        </div>
      </section>

      <footer className="footer">
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
              background: '#FDF0F3',
              border: '1px solid #F5DDE2',
              color: '#C47A8A',
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
              background: '#FDF0F3',
              border: '1px solid #F5DDE2',
              color: '#C47A8A',
              transition: 'background 0.2s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
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
        <p>&copy; 2026 Lashes By Retha. All rights reserved.</p>
      </footer>
      </>
      )}

      {showPolicies && (
        <div style={{ minHeight: '100vh', background: '#FFFAF8', fontFamily: "'Lato', sans-serif" }}>
          <div
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
              Lashes By Retha
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

          <div style={{ maxWidth: '720px', margin: '0 auto', padding: '60px 24px' }}>
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
                href="/policies-summary.pdf"
                download="Lashes-By-Retha-Policies.pdf"
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
    </div>
  )
}

export default App
