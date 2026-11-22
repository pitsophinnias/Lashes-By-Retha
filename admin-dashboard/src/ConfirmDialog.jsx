import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { useToast } from './Toast.jsx'

const ConfirmContext = createContext(null)

const IconClose = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const IconWarning = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
)

const IconSpinner = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="confirm-spinner" {...props}>
    <circle cx="12" cy="12" r="9" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" />
  </svg>
)

const IconPlaceholderImage = (props) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="9" cy="9" r="1.6" />
    <path d="M21 15l-5-5-5 5-3-3-5 5" />
  </svg>
)

const IconPrice = (props) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)

const IconOptions = (props) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

const IconStock = (props) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 8l-9-5-9 5 9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
  </svg>
)

const IconSale = (props) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" />
  </svg>
)

const IconPerson = (props) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
)

const DETAIL_ICONS = { price: IconPrice, options: IconOptions, stock: IconStock, sale: IconSale, person: IconPerson }

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// One reusable confirmation dialog, modelled on GitHub's "Delete repository"
// dialog: header with title + close, a centred summary of what's being
// acted on, a plain-language explanation of what confirming does, and one
// full-width action button. confirmDialog() resolves true once onConfirm
// has actually succeeded (not just once the button was clicked), false if
// the person cancelled - callers await it and have nothing further to do,
// since onConfirm is expected to perform the real action itself.
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  const dialogRef = useRef(null)
  const closeBtnRef = useRef(null)
  const triggerRef = useRef(null)
  const busyRef = useRef(false)

  useEffect(() => { busyRef.current = busy }, [busy])

  const confirmDialog = (options) => new Promise((resolve) => {
    triggerRef.current = document.activeElement
    setError(null)
    setBusy(false)
    setRequest({ ...options, resolve })
  })

  const finish = (result) => {
    const el = triggerRef.current
    setRequest((current) => {
      current?.resolve(result)
      return null
    })
    setError(null)
    if (el?.focus) el.focus()
  }

  const handleCancel = () => {
    if (!request || busy) return
    finish(false)
  }

  const handleConfirm = async () => {
    if (!request || busy) return
    setBusy(true)
    setError(null)
    try {
      await request.onConfirm()
      toast(request.successMessage || 'Done', 'success')
      finish(true)
    } catch (err) {
      setError(err?.message || 'Something went wrong, please try again.')
      setBusy(false)
    }
  }

  // Scroll lock, initial focus (always the close button, even for a
  // neutral action, so Enter never fires the confirm button by accident),
  // Escape-to-cancel and a Tab focus trap confined to the dialog.
  useEffect(() => {
    if (!request) return
    const previouslyFocused = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtnRef.current?.focus()

    const cancelNow = () => {
      if (busyRef.current) return
      finish(false)
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelNow()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])
        .filter((el) => !el.disabled && el.offsetParent !== null)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
      // Returning focus here too covers the case where the dialog was torn
      // down some other way than finish() (e.g. a parent re-render).
      if (document.body.contains(previouslyFocused)) previouslyFocused?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  const titleId = useId()
  const descId = useId()

  return (
    <ConfirmContext.Provider value={confirmDialog}>
      {children}
      {request && (
        <div className="confirm-overlay" onClick={handleCancel}>
          <div
            ref={dialogRef}
            className="confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-header">
              <h2 id={titleId} className="confirm-title">{request.title}</h2>
              <button
                ref={closeBtnRef}
                type="button"
                className="confirm-close-btn"
                onClick={handleCancel}
                disabled={busy}
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>

            {request.subject && (
              <div className="confirm-subject">
                <div className="confirm-thumb">
                  {request.subject.image ? (
                    <img src={request.subject.image} alt="" />
                  ) : (
                    <IconPlaceholderImage />
                  )}
                </div>
                <div className="confirm-subject-name">{request.subject.name}</div>
                {request.subject.details?.length > 0 && (
                  <div className="confirm-subject-details">
                    {request.subject.details.map((d, i) => {
                      const Icon = DETAIL_ICONS[d.icon]
                      return (
                        <span key={i} className="confirm-detail">
                          {Icon && <Icon />}
                          {d.text}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {request.variant === 'danger' ? (
              <div className="confirm-warning-box">
                <IconWarning className="confirm-warning-icon" />
                <p id={descId} className="confirm-summary">{request.summary}</p>
              </div>
            ) : (
              <p id={descId} className="confirm-summary confirm-summary-plain">{request.summary}</p>
            )}

            {error && <div className="error-msg confirm-error">{error}</div>}

            <div className="confirm-actions">
              <button
                type="button"
                className={request.variant === 'danger' ? 'confirm-danger-btn' : 'upload-btn confirm-action-btn'}
                onClick={handleConfirm}
                disabled={busy}
              >
                {busy && <IconSpinner />}
                {busy ? (request.busyLabel || 'Working…') : request.confirmLabel}
              </button>
              <button
                type="button"
                className="confirm-cancel-link"
                onClick={handleCancel}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .confirm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(44,26,32,0.5);
          z-index: 300;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: confirm-fade 0.15s ease-out;
        }

        .confirm-card {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 480px;
          max-height: 88vh;
          overflow-y: auto;
          box-sizing: border-box;
          padding: 20px;
          box-shadow: 0 8px 40px rgba(44,26,32,0.25);
          animation: confirm-scale-in 0.18s ease-out;
          font-family: 'Lato', sans-serif;
        }

        @media (prefers-reduced-motion: reduce) {
          .confirm-overlay, .confirm-card { animation: none; }
        }

        @keyframes confirm-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes confirm-scale-in {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .confirm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 14px;
          margin-bottom: 18px;
          border-bottom: 1px solid #F0E8E8;
        }

        .confirm-title {
          font-size: 16px;
          font-weight: 700;
          color: #2C1A20;
          margin: 0;
        }

        .confirm-close-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #9A8A8E;
          padding: 4px;
          display: flex;
          border-radius: 6px;
          transition: color 0.15s, background 0.15s;
        }
        .confirm-close-btn:hover:not(:disabled) { color: #2C1A20; background: #F7EEF0; }
        .confirm-close-btn:disabled { cursor: default; opacity: 0.5; }

        .confirm-subject {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 2px 8px 18px;
        }

        .confirm-thumb {
          width: 64px;
          height: 64px;
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 12px;
          background: #F7EEF0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #C4A0A8;
          flex-shrink: 0;
        }

        .confirm-thumb img { width: 100%; height: 100%; object-fit: cover; }

        .confirm-subject-name {
          font-size: 16px;
          font-weight: 700;
          color: #2C1A20;
        }

        .confirm-subject-details {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 4px 12px;
          margin-top: 6px;
        }

        .confirm-detail {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #9A8A8E;
          font-weight: 600;
        }

        .confirm-warning-box {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          background: #FDF0F3;
          border: 1px solid #F5C0CC;
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 20px;
        }

        .confirm-warning-icon { color: #A23F51; flex-shrink: 0; margin-top: 1px; }

        .confirm-summary {
          font-size: 13px;
          color: #6B3A44;
          line-height: 1.5;
          margin: 0;
        }

        .confirm-summary-plain {
          color: #7A6670;
          line-height: 1.6;
          margin-bottom: 20px;
          text-align: center;
        }

        .confirm-error { text-align: center; margin-bottom: 14px; }

        .confirm-actions {
          border-top: 1px solid #F0E8E8;
          padding-top: 18px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .confirm-action-btn {
          width: 100%;
          padding: 13px 16px;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .confirm-action-btn:disabled { opacity: 0.75; cursor: default; }

        .confirm-danger-btn {
          width: 100%;
          padding: 13px 16px;
          font-size: 14px;
          background: white;
          border: 1.5px solid #D9707F;
          color: #A23F51;
          border-radius: 8px;
          font-family: inherit;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .confirm-danger-btn:hover:not(:disabled) { background: #A23F51; border-color: #A23F51; color: white; }
        .confirm-danger-btn:disabled { opacity: 0.75; cursor: default; }

        .confirm-cancel-link {
          background: none;
          border: none;
          color: #9A8A8E;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          padding: 4px 8px;
        }
        .confirm-cancel-link:hover:not(:disabled) { color: #2C1A20; }
        .confirm-cancel-link:disabled { cursor: default; opacity: 0.6; }

        .confirm-spinner { animation: confirm-spin 0.8s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .confirm-spinner { animation: none; } }
        @keyframes confirm-spin { to { transform: rotate(360deg); } }

        @media (max-width: 480px) {
          .confirm-overlay { padding: 12px; }
          .confirm-card { max-height: 85vh; }
          .confirm-action-btn, .confirm-danger-btn { padding: 15px 16px; font-size: 15px; }
          .confirm-cancel-link { padding: 10px 12px; font-size: 14px; }
        }
      `}</style>
    </ConfirmContext.Provider>
  )
}

export function useConfirmDialog() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirmDialog must be used within a ConfirmProvider')
  return ctx
}
