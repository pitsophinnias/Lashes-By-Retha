// Shared, plain-JS session storage + cross-tab signalling - used by
// main.jsx (login/logout/bootstrap) and SessionManager.jsx (idle/max-age
// timers). Kept framework-free so either side can read/write it without
// needing to be inside the same component tree.
const TOKEN_KEY = 'hbh_token'
const USER_KEY = 'hbh_user'
const ISSUED_AT_KEY = 'hbh_session_issued_at'
const LAST_ACTIVITY_KEY = 'hbh_session_last_activity'
const EVENT_KEY = 'hbh_session_event'

export const SESSION_KEYS = [TOKEN_KEY, USER_KEY, ISSUED_AT_KEY, LAST_ACTIVITY_KEY]

export const getToken = () => localStorage.getItem(TOKEN_KEY)

export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const getTimestamp = (key) => {
  const raw = localStorage.getItem(key)
  const value = raw ? Number(raw) : NaN
  return isNaN(value) ? null : value
}

export const getIssuedAt = () => getTimestamp(ISSUED_AT_KEY)
export const getLastActivity = () => getTimestamp(LAST_ACTIVITY_KEY)

// Called once, right after login or a successful session restore on page
// load - issuedAt comes from the server (the sessions row's own
// timestamp); last activity starts as "now", since loading the page at
// all is itself a sign of use.
export const setSession = ({ token, user, issuedAt }) => {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.setItem(ISSUED_AT_KEY, String(issuedAt ? new Date(issuedAt).getTime() : Date.now()))
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
}

// Cheap, synchronous, called on every real mouse/key/touch/scroll event -
// the network heartbeat that actually tells the server is throttled
// separately (see SessionManager); this just keeps the local idle clock
// accurate, and - because it's the same localStorage key every tab reads -
// is also what makes activity in one tab keep every tab's timer alive.
export const touchLastActivity = () => {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
}

export const clearSession = () => {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key))
}

let channel = null
const getChannel = () => {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel('hbh-admin-session')
  return channel
}

// BroadcastChannel where available; a one-shot localStorage write (which
// fires the native 'storage' event in every other tab on this origin)
// everywhere else, and alongside it even when BroadcastChannel exists, as
// a belt-and-braces second path.
export const broadcastSessionEvent = (type, payload = {}) => {
  const data = { type, ...payload, at: Date.now() }
  try {
    getChannel()?.postMessage(data)
  } catch {}
  try {
    localStorage.setItem(EVENT_KEY, JSON.stringify(data))
  } catch {}
}

export const subscribeSessionEvents = (handler) => {
  const ch = getChannel()
  const onMessage = (e) => handler(e.data)
  ch?.addEventListener('message', onMessage)

  const onStorage = (e) => {
    if (e.key !== EVENT_KEY || !e.newValue) return
    try {
      handler(JSON.parse(e.newValue))
    } catch {}
  }
  window.addEventListener('storage', onStorage)

  return () => {
    ch?.removeEventListener('message', onMessage)
    window.removeEventListener('storage', onStorage)
  }
}
