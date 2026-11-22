import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

let nextToastId = 1
const DEFAULT_DURATION_MS = 4000

// Bottom-centred on mobile, top-right on desktop; auto-dismisses after ~4s
// (or a custom duration - the proactive "message customer?" prompts stay
// up ~10s, see Step 6), or sooner on click. Reused by ConfirmDialog for
// its "on success" toast, and by anything else that wants brief feedback
// instead of a persistent inline message.
//
// toast(message, type, { duration, actions }) - actions is an optional
// array of { label, onClick } buttons (e.g. "Send on WhatsApp" / "Preview")
// for a prompt-style toast; clicking one dismisses the toast after running
// onClick.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const toast = useCallback((message, type = 'success', { duration = DEFAULT_DURATION_MS, actions = [] } = {}) => {
    const id = nextToastId++
    setToasts((prev) => [...prev, { id, message, type, actions }])
    timers.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <div className="toast-message" onClick={() => dismiss(t.id)}>{t.message}</div>
            {t.actions.length > 0 && (
              <div className="toast-actions">
                {t.actions.map((action, i) => (
                  <button
                    key={i}
                    type="button"
                    className="toast-action-btn"
                    onClick={() => { action.onClick?.(); dismiss(t.id) }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <style>{`
        .toast-stack {
          position: fixed;
          z-index: 500;
          display: flex;
          flex-direction: column;
          gap: 8px;
          left: 16px;
          right: 16px;
          bottom: 20px;
          align-items: center;
          pointer-events: none;
        }

        @media (min-width: 768px) {
          .toast-stack {
            left: auto;
            bottom: auto;
            top: 20px;
            right: 20px;
            align-items: flex-end;
          }
        }

        .toast {
          pointer-events: auto;
          max-width: 360px;
          width: 100%;
          padding: 12px 18px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Lato', sans-serif;
          color: white;
          box-shadow: 0 6px 24px rgba(44,20,28,0.25);
          animation: toast-in 0.2s ease-out;
        }

        @media (prefers-reduced-motion: reduce) {
          .toast { animation: none; }
        }

        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .toast-message { cursor: pointer; }

        .toast-success { background: #4CAF50; }
        .toast-error { background: #C0392B; }
        .toast-prompt { background: #8C5A6A; }

        .toast-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }

        .toast-action-btn {
          flex: 1;
          background: rgba(255,255,255,0.18);
          color: white;
          border: 1px solid rgba(255,255,255,0.4);
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s;
        }
        .toast-action-btn:hover { background: rgba(255,255,255,0.3); }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
