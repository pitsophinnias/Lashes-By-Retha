import React, { useCallback, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Login from './Login.jsx'
import SysAdminDashboard from './SysAdminDashboard.jsx'
import SessionManager from './SessionManager.jsx'
import { isKnownAdminPath, isSysadminPath, homeForRole, resolveNextForRole } from './router.js'
import { getToken, getStoredUser, clearSession, touchLastActivity, broadcastSessionEvent } from './session.js'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3002'

const SIGNOUT_MESSAGES = {
  idle: "You were signed out after a period of inactivity. Please sign in again.",
  max_age: 'Your session has ended for security. Please sign in again.',
}

// Rewrites the address bar to "/" (+ ?next=<path> when path is somewhere
// worth coming back to) right before Login renders - used both for a cold
// visit to a deep link while logged out, and for a live sign-out while on
// some other page. Validated against the known admin paths, never an
// arbitrary string, so this can't be turned into an open redirect.
const redirectToLoginFrom = (path) => {
  const nextPath = isKnownAdminPath(path) && path !== '/' ? path : null
  const url = new URL(window.location.origin + '/')
  if (nextPath) url.searchParams.set('next', nextPath)
  window.history.replaceState(null, '', url.pathname + url.search)
}

// A session restored on page load (not a fresh login, so there's no
// ?next= to resolve) might be sitting on a URL that belongs to the OTHER
// role's namespace entirely - e.g. a sysadmin with an owner page
// bookmarked, or vice versa. Corrects it to that role's own home, before
// the dashboard component for this role ever mounts, so there's no flash
// of the wrong one.
const correctPathForRole = (role) => {
  const currentPath = window.location.pathname
  const wrongNamespace = role === 'sysadmin' ? !isSysadminPath(currentPath) : isSysadminPath(currentPath)
  if (wrongNamespace) {
    window.history.replaceState(null, '', homeForRole(role))
  }
}

// Deliberately plain - shown only while an existing session is being
// validated against the server, so it never reads as either the login
// screen or a loaded dashboard flashing by.
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#FAF6F4', fontFamily: "'Lato', sans-serif", color: '#9A8A8E', fontSize: 13,
    }}>
      Loading…
    </div>
  )
}

function Root() {
  const [status, setStatus] = useState('loading') // 'loading' | 'authed' | 'guest'
  const [user, setUser] = useState(null)
  const [loginMessage, setLoginMessage] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) {
      redirectToLoginFrom(window.location.pathname)
      setStatus('guest')
      return
    }
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          // Reopening/reloading the tab is itself a sign of use.
          touchLastActivity()
          correctPathForRole(data.role)
          setUser({ ...(getStoredUser() || {}), ...data })
          setStatus('authed')
        } else {
          clearSession()
          redirectToLoginFrom(window.location.pathname)
          setStatus('guest')
        }
      })
      .catch(() => {
        if (cancelled) return
        clearSession()
        redirectToLoginFrom(window.location.pathname)
        setStatus('guest')
      })
    return () => { cancelled = true }
  }, [])

  const handleLogin = (loggedInUser) => {
    setLoginMessage('')
    setUser(loggedInUser)
    setStatus('authed')
    const next = new URLSearchParams(window.location.search).get('next')
    window.history.replaceState(null, '', resolveNextForRole(next, loggedInUser.role))
  }

  // The one place a session actually ends, whatever the reason: a manual
  // "Log Out" click, the idle/max-session timers in SessionManager, or any
  // request anywhere coming back with a SESSION_EXPIRED 401. Always tries
  // to revoke the session server-side, always clears local state, and
  // always lands back on Login with the right message and ?next=.
  const signOut = useCallback((reason, { broadcast = true } = {}) => {
    const token = getToken()
    const currentPath = window.location.pathname
    if (token) {
      fetch(`${API}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    }
    if (broadcast) broadcastSessionEvent('signout', { reason })
    clearSession()
    setHasUnsavedChanges(false)
    redirectToLoginFrom(currentPath)
    setUser(null)
    setLoginMessage(SIGNOUT_MESSAGES[reason] || '')
    setStatus('guest')
  }, [])

  if (status === 'loading') return <LoadingScreen />
  if (status === 'guest') return <Login onLogin={handleLogin} message={loginMessage} />

  return (
    <>
      {user.role === 'sysadmin' ? (
        <SysAdminDashboard user={user} onLogout={() => signOut('manual')} />
      ) : (
        <App
          user={user}
          onLogout={() => signOut('manual')}
          onSessionExpired={(reason) => signOut(reason || 'session_expired')}
          onUnsavedChanges={setHasUnsavedChanges}
        />
      )}
      <SessionManager
        onSessionExpired={(reason) => signOut(reason)}
        onRemoteSignOut={(reason) => signOut(reason, { broadcast: false })}
        hasUnsavedChanges={hasUnsavedChanges}
      />
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
