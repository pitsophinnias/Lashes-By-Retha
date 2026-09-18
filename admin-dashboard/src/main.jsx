import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Login from './Login.jsx'
import SysAdminDashboard from './SysAdminDashboard.jsx'

function Root() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('hbh_user')
      const token = localStorage.getItem('hbh_token')
      if (!stored || !token) return null
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('hbh_token')
        localStorage.removeItem('hbh_user')
        return null
      }
      return JSON.parse(stored)
    } catch {
      localStorage.removeItem('hbh_token')
      localStorage.removeItem('hbh_user')
      return null
    }
  })

  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser)
  }

  const handleLogout = () => {
    localStorage.removeItem('hbh_token')
    localStorage.removeItem('hbh_user')
    setUser(null)
  }

  if (!user) return <Login onLogin={handleLogin} />
  if (user.role === 'sysadmin') return <SysAdminDashboard user={user} onLogout={handleLogout} />
  return <App user={user} onLogout={handleLogout} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
