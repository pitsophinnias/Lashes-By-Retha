import { useEffect, useId, useRef } from 'react'

const formatCountdown = (totalSeconds) => {
  const safe = Math.max(0, totalSeconds)
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// Purpose-built rather than going through ConfirmDialog - it needs a live
// countdown (re-rendered every second from the parent) and two real,
// non-"cancel" actions, which doesn't fit ConfirmDialog's one-shot
// confirm/cancel promise. Styled to match it closely regardless (same
// overlay, card, header and button look).
export default function IdleWarningDialog({ secondsLeft, hasUnsavedChanges, onStaySignedIn, onSignOut, busy }) {
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef(null)
  const stayBtnRef = useRef(null)

  useEffect(() => {
    stayBtnRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (busy) return
      // Esc is treated the same as "Stay signed in" - interacting with the
      // dialog at all, even to dismiss it, is itself activity, and signing
      // out on a reflex Esc press would be a nasty surprise.
      if (e.key === 'Escape') {
        e.preventDefault()
        onStaySignedIn()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = Array.from(
        dialogRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || []
      ).filter((el) => !el.disabled && el.offsetParent !== null)
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
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [busy, onStaySignedIn])

  return (
    <div className="idle-overlay" onClick={() => !busy && onStaySignedIn()}>
      <div
        ref={dialogRef}
        className="idle-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="idle-header">
          <h2 id={titleId} className="idle-title">Are you still there?</h2>
        </div>

        <p id={descId} className="idle-summary">
          For your security, you'll be signed out in {formatCountdown(secondsLeft)} if there's no activity.
          {hasUnsavedChanges && <><br />You have unsaved changes.</>}
        </p>

        <div className="idle-actions">
          <button ref={stayBtnRef} type="button" className="idle-stay-btn" onClick={onStaySignedIn} disabled={busy}>
            {busy ? 'Staying signed in…' : 'Stay signed in'}
          </button>
          <button type="button" className="idle-signout-link" onClick={onSignOut} disabled={busy}>
            Sign out
          </button>
        </div>
      </div>

      <style>{`
        .idle-overlay {
          position: fixed;
          inset: 0;
          background: rgba(44,26,32,0.5);
          z-index: 400;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: idle-fade 0.15s ease-out;
        }
        .idle-card {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 400px;
          box-sizing: border-box;
          padding: 20px;
          box-shadow: 0 8px 40px rgba(44,26,32,0.25);
          animation: idle-scale-in 0.18s ease-out;
          font-family: 'Lato', sans-serif;
        }
        @media (prefers-reduced-motion: reduce) {
          .idle-overlay, .idle-card { animation: none; }
        }
        @keyframes idle-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes idle-scale-in {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .idle-header {
          padding-bottom: 14px;
          margin-bottom: 16px;
          border-bottom: 1px solid #F0E8E8;
        }
        .idle-title { font-size: 16px; font-weight: 700; color: #2C1A20; margin: 0; }
        .idle-summary { font-size: 13px; color: #7A6670; line-height: 1.6; margin: 0 0 20px; text-align: center; }
        .idle-actions {
          border-top: 1px solid #F0E8E8;
          padding-top: 18px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .idle-stay-btn {
          width: 100%;
          padding: 13px 16px;
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          background: #C47A8A;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .idle-stay-btn:hover:not(:disabled) { background: #A0566A; }
        .idle-stay-btn:disabled { opacity: 0.75; cursor: default; }
        .idle-signout-link {
          background: none;
          border: none;
          color: #9A8A8E;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          padding: 4px 8px;
        }
        .idle-signout-link:hover:not(:disabled) { color: #A23F51; }
        .idle-signout-link:disabled { cursor: default; opacity: 0.6; }
        @media (max-width: 480px) {
          .idle-overlay { padding: 12px; }
          .idle-stay-btn { padding: 15px 16px; font-size: 15px; }
          .idle-signout-link { padding: 10px 12px; font-size: 14px; }
        }
      `}</style>
    </div>
  )
}
