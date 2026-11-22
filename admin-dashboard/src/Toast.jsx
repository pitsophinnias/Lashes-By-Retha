import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

let nextToastId = 1

// Bottom-centred on mobile, top-right on desktop; auto-dismisses after ~4s,
// or sooner on click. Reused by ConfirmDialog for its "on success" toast,
// and by anything else that wants brief success/error feedback instead of
// a persistent inline message.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const toast = useCallback((message, type = 'success') => {
    const id = nextToastId++
    setToasts((prev) => [...prev, { id, message, type }])
    timers.current[id] = setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            onClick={() => dismiss(t.id)}
          >
            {t.message}
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
          cursor: pointer;
          animation: toast-in 0.2s ease-out;
        }

        @media (prefers-reduced-motion: reduce) {
          .toast { animation: none; }
        }

        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .toast-success { background: #4CAF50; }
        .toast-error { background: #C0392B; }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
