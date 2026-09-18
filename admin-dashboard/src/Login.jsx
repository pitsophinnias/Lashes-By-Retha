import React, { useState } from 'react'

const API = 'http://localhost:3002'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login failed. Please try again.')
        return
      }
      localStorage.setItem('hbh_token', data.token)
      localStorage.setItem('hbh_user', JSON.stringify(data.user))
      onLogin(data.user)
    } catch {
      setError('Unable to connect to the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Lato:wght@300;400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Lato', sans-serif; background: #FAF6F4; }
        .login-input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 10px;
          border: 1px solid #EDD5DB;
          font-size: 14px;
          font-family: inherit;
          color: #2C1A20;
          background: white;
          outline: none;
          margin-bottom: 14px;
          transition: border-color 0.2s;
        }
        .login-input:focus { border-color: #C47A8A; box-shadow: 0 0 0 3px rgba(196,122,138,0.12); }
        .login-btn {
          width: 100%;
          background: #C47A8A;
          color: white;
          border: none;
          border-radius: 10px;
          padding: 14px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          letter-spacing: 0.5px;
          transition: background 0.2s;
          margin-top: 4px;
        }
        .login-btn:hover { background: #A0566A; }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #FAF6F4 0%, #F7EEF0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <img
              src="/logo.png"
              alt="Hair By Her"
              style={{ height: 80, width: 'auto', objectFit: 'contain' }}
            />
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              color: '#C4A0A8',
              textTransform: 'uppercase',
              marginTop: 12,
            }}>
              Admin Portal
            </div>
          </div>

          {/* Card */}
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: '36px 32px',
            boxShadow: '0 4px 32px rgba(44,26,32,0.12)',
          }}>
            <h1 style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 26,
              fontWeight: 700,
              color: '#2C1A20',
              marginBottom: 6,
            }}>
              Welcome back
            </h1>
            <p style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 28 }}>
              Sign in to the Hair By Her admin dashboard.
            </p>

            <form onSubmit={handleSubmit}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#C4A0A8', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Username
              </label>
              <input
                className="login-input"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
              />

              <label style={{ fontSize: 11, fontWeight: 700, color: '#C4A0A8', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Password
              </label>
              <input
                className="login-input"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />

              {error && (
                <div style={{
                  background: '#FDE8EC',
                  color: '#C47A8A',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 13,
                  marginBottom: 14,
                  fontWeight: 600,
                }}>
                  {error}
                </div>
              )}

              <button className="login-btn" type="submit" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>

          <p style={{ textAlign: 'center', fontSize: 11, color: '#C4A0A8', marginTop: 20 }}>
            Hair By Her Business Platform
          </p>
        </div>
      </div>
    </>
  )
}
