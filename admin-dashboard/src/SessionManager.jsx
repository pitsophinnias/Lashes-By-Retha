import { useCallback, useEffect, useRef, useState } from 'react'
import IdleWarningDialog from './IdleWarningDialog.jsx'
import {
  getToken, getIssuedAt, getLastActivity, touchLastActivity, subscribeSessionEvents,
} from './session.js'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3002'
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll']
const PING_THROTTLE_MS = 30000
const MAX_CHECK_INTERVAL_MS = 60000
const FALLBACK_CONFIG = { idleTimeoutMinutes: 5, idleWarningSeconds: 60, maxSessionHours: 12, graceSeconds: 30 }

// Mounted once at the app root, for as long as someone is signed in to
// EITHER dashboard - runs the idle/max-session timers against the shared
// localStorage timestamps in session.js (so every tab sees the same
// clock), shows the "are you still there?" warning, and installs a
// global fetch interceptor so a SESSION_EXPIRED 401 from literally any
// request (App.jsx's own apiFetch, or SysAdminDashboard's ad-hoc fetches)
// triggers the same sign-out, without having to rewire every call site.
//
// onSessionExpired(reason) - this tab detected expiry/logout itself,
//   should broadcast to the others.
// onRemoteSignOut(reason) - another tab already broadcast a sign-out;
//   just follow it locally, no need to broadcast again.
export default function SessionManager({ onSessionExpired, onRemoteSignOut, hasUnsavedChanges }) {
  const [config, setConfig] = useState(null)
  const [warning, setWarning] = useState(null) // { secondsLeft } | null
  const [staying, setStaying] = useState(false)

  const configRef = useRef(null)
  const timerRef = useRef(null)
  const doneRef = useRef(false)
  const lastPingRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/api/auth/session-config`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setConfig(data) })
      .catch(() => { if (!cancelled) setConfig(FALLBACK_CONFIG) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { configRef.current = config }, [config])

  // This tab detected the expiry itself (idle/max-age timer, a
  // SESSION_EXPIRED 401 from any request, or the warning dialog's own
  // "Sign out") - onSessionExpired (Root's signOut) is what actually
  // broadcasts that to the other tabs.
  const finish = useCallback((reason) => {
    if (doneRef.current) return
    doneRef.current = true
    clearTimeout(timerRef.current)
    onSessionExpired(reason)
  }, [onSessionExpired])

  // The one place that decides "are we still within limits" - re-reads the
  // shared timestamps fresh every time (so another tab's activity, a
  // sleep/wake gap, or a clock jump are all picked up), rather than
  // trusting a single long-lived setTimeout to still mean what it meant
  // when it was scheduled.
  const check = useCallback(() => {
    if (doneRef.current || !configRef.current) return
    clearTimeout(timerRef.current)

    const now = Date.now()
    const cfg = configRef.current
    const issuedAt = getIssuedAt() ?? now
    const lastActivity = getLastActivity() ?? now

    const idleDeadline = lastActivity + cfg.idleTimeoutMinutes * 60000
    const maxDeadline = issuedAt + cfg.maxSessionHours * 3600000
    const warnAt = idleDeadline - cfg.idleWarningSeconds * 1000

    if (now >= maxDeadline) {
      finish('max_age')
      return
    }
    if (now >= idleDeadline) {
      finish('idle')
      return
    }
    if (now >= warnAt) {
      setWarning({ secondsLeft: Math.max(0, Math.ceil((idleDeadline - now) / 1000)) })
      timerRef.current = setTimeout(check, 1000)
      return
    }
    setWarning(null)
    const nextCheckIn = Math.min(warnAt, maxDeadline) - now
    timerRef.current = setTimeout(check, Math.max(1000, Math.min(nextCheckIn, MAX_CHECK_INTERVAL_MS)))
  }, [finish])

  // Real activity: update the local clock immediately (cheap), and ping
  // the server at most once every 30s so it knows too - a background
  // poll would never call this at all, so it can never look like activity.
  const pingServer = useCallback(() => {
    const token = getToken()
    if (!token) return Promise.resolve()
    return fetch(`${API}/api/auth/activity`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
  }, [])

  const handleActivity = useCallback(() => {
    if (doneRef.current) return
    touchLastActivity()
    const now = Date.now()
    if (now - lastPingRef.current >= PING_THROTTLE_MS) {
      lastPingRef.current = now
      pingServer()
    }
    check()
  }, [check, pingServer])

  useEffect(() => {
    if (!config) return
    check()
    ACTIVITY_EVENTS.forEach((evt) => document.addEventListener(evt, handleActivity, { passive: true }))

    // Catches up immediately on wake/focus/reconnect instead of waiting
    // for whatever setTimeout was scheduled before - a delayed timer
    // still fires eventually, but "immediately" matters more here.
    const recheck = () => check()
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    window.addEventListener('online', recheck)

    // Another tab's activity (or sign-out - see clearSession) touches the
    // same keys; react the moment it happens rather than at this tab's
    // own next scheduled check.
    const onStorage = (e) => {
      if (e.key === 'hbh_session_last_activity' || e.key === 'hbh_token') check()
    }
    window.addEventListener('storage', onStorage)

    const unsubscribe = subscribeSessionEvents((data) => {
      if (data?.type === 'signout' && !doneRef.current) {
        doneRef.current = true
        clearTimeout(timerRef.current)
        onRemoteSignOut(data.reason)
      }
    })

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, handleActivity))
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
      window.removeEventListener('online', recheck)
      window.removeEventListener('storage', onStorage)
      unsubscribe()
      clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  // A global fetch interceptor, scoped to this component's lifetime, so
  // every request gets the same SESSION_EXPIRED handling without having
  // to rewire App.jsx's apiFetch and SysAdminDashboard's 23 separate ad-hoc
  // fetch calls individually. Restored on unmount (sign-out).
  useEffect(() => {
    const originalFetch = window.fetch
    window.fetch = (...args) => originalFetch(...args).then((res) => {
      if (res.status === 401 && !doneRef.current) {
        res.clone().json().then((data) => {
          if (data?.code === 'SESSION_EXPIRED') finish(data.reason)
        }).catch(() => {})
      }
      return res
    })
    return () => { window.fetch = originalFetch }
  }, [finish])

  const handleStaySignedIn = async () => {
    setStaying(true)
    touchLastActivity()
    lastPingRef.current = Date.now()
    await pingServer()
    setWarning(null)
    setStaying(false)
    check()
  }

  const handleSignOutClick = () => finish('manual')

  return warning ? (
    <IdleWarningDialog
      secondsLeft={warning.secondsLeft}
      hasUnsavedChanges={hasUnsavedChanges}
      onStaySignedIn={handleStaySignedIn}
      onSignOut={handleSignOutClick}
      busy={staying}
    />
  ) : null
}
