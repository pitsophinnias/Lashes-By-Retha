import React, { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3002'

export default function SysAdminDashboard({ user, onLogout }) {
  const [activePage, setActivePage] = useState('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [systemNotifications, setSystemNotifications] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [auditPage, setAuditPage] = useState(1)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditPages, setAuditPages] = useState(1)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role_name: 'owner' })
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwMsg, setPwMsg] = useState('')

  // System Controls (maintenance mode + payment switches)
  const [systemSettings, setSystemSettings] = useState(null)
  const [maintenanceDraft, setMaintenanceDraft] = useState({ enabled: false, message: '' })
  const [maintenanceConfirming, setMaintenanceConfirming] = useState(false)
  const [maintenanceSaving, setMaintenanceSaving] = useState(false)
  const [maintenanceMsg, setMaintenanceMsg] = useState('')
  const [paymentsDraft, setPaymentsDraft] = useState({ ozowEnabled: true, payflexEnabled: true })
  const [paymentSwitchesSaving, setPaymentSwitchesSaving] = useState(false)
  const [paymentSwitchesMsg, setPaymentSwitchesMsg] = useState('')

  // Payments monitor
  const [paymentRows, setPaymentRows] = useState([])
  const [paymentsSummary, setPaymentsSummary] = useState({ stuckCount: 0, lastOzowNotifyAt: null, lastPayflexCallbackAt: null })
  const [paymentFilters, setPaymentFilters] = useState({ provider: '', status: '', mode: '', days: '' })
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [rechecking, setRechecking] = useState({})
  const [paymentEvents, setPaymentEvents] = useState([])

  // System Health
  const [health, setHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)

  // Errors
  const [errorGroups, setErrorGroups] = useState([])
  const [errorFilters, setErrorFilters] = useState({ resolved: 'unresolved', days: '' })
  const [errorsLoading, setErrorsLoading] = useState(false)
  const [selectedErrorIds, setSelectedErrorIds] = useState([])
  const [resolvingErrors, setResolvingErrors] = useState(false)

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('hbh_token')}`,
  })

  useEffect(() => {
    fetchUsers()
    fetchRoles()
    fetchSystemNotifications()
    fetchSystemSettings()
  }, [])

  useEffect(() => {
    if (activePage === 'audit') fetchAuditLogs(auditPage)
  }, [activePage, auditPage])

  useEffect(() => {
    if (activePage === 'payments') {
      fetchPayments()
      fetchPaymentEvents()
    }
  }, [activePage, paymentFilters])

  useEffect(() => {
    if (activePage === 'health') fetchHealth()
  }, [activePage])

  useEffect(() => {
    if (activePage === 'errors') fetchErrors()
  }, [activePage, errorFilters])

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API}/api/users`, { headers: getHeaders() })
      const data = await res.json()
      if (Array.isArray(data)) setUsers(data)
      else setUsers([])
    } catch {}
  }

  const fetchRoles = async () => {
    try {
      const res = await fetch(`${API}/api/roles`, { headers: getHeaders() })
      const data = await res.json()
      if (Array.isArray(data)) setRoles(data)
      else setRoles([])
    } catch {}
  }

  const fetchSystemNotifications = async () => {
    try {
      const res = await fetch(`${API}/api/notifications`, { headers: getHeaders() })
      const data = await res.json()
      if (Array.isArray(data)) setSystemNotifications(data.filter(n => n.type === 'system'))
      else setSystemNotifications([])
    } catch {}
  }

  const fetchAuditLogs = async (page) => {
    try {
      const res = await fetch(`${API}/api/audit-logs?page=${page}`, { headers: getHeaders() })
      const data = await res.json()
      if (data && Array.isArray(data.logs)) {
        setAuditLogs(data.logs)
        setAuditTotal(data.total)
        setAuditPages(data.pages)
      } else {
        setAuditLogs([])
      }
    } catch {}
  }

  const createUser = async () => {
    setCreateError('')
    setCreateSuccess('')
    if (!newUser.username || !newUser.password || !newUser.role_name) {
      setCreateError('Username, password and role are required.')
      return
    }
    try {
      const res = await fetch(`${API}/api/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(newUser),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.error); return }
      setCreateSuccess(`User "${newUser.username}" created successfully.`)
      setNewUser({ username: '', email: '', password: '', role_name: 'owner' })
      setShowCreateUser(false)
      fetchUsers()
    } catch { setCreateError('Failed to create user.') }
  }

  const toggleUserActive = async (u) => {
    try {
      await fetch(`${API}/api/users/${u.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ is_active: !u.is_active }),
      })
      fetchUsers()
    } catch {}
  }

  const resetUserPassword = async () => {
    setResetMsg('')
    if (!resetPassword || resetPassword.length < 6) {
      setResetMsg('Password must be at least 6 characters.')
      return
    }
    try {
      const res = await fetch(`${API}/api/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ new_password: resetPassword }),
      })
      if (res.ok) {
        setResetMsg('Password reset successfully.')
        setTimeout(() => { setResetTarget(null); setResetPassword(''); setResetMsg('') }, 2000)
      }
    } catch { setResetMsg('Failed to reset password.') }
  }

  const changeOwnPassword = async () => {
    setPwMsg('')
    if (newPassword !== confirmPassword) { setPwMsg('Passwords do not match.'); return }
    if (newPassword.length < 6) { setPwMsg('Password must be at least 6 characters.'); return }
    try {
      const res = await fetch(`${API}/api/auth/change-password`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      const data = await res.json()
      if (res.ok) {
        setPwMsg('Password changed successfully.')
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      } else {
        setPwMsg(data.error || 'Failed to change password.')
      }
    } catch { setPwMsg('Failed to change password.') }
  }

  const fetchSystemSettings = async () => {
    try {
      const res = await fetch(`${API}/api/admin/system/settings`, { headers: getHeaders() })
      const data = await res.json()
      if (data && data.maintenance) {
        setSystemSettings(data)
        setMaintenanceDraft({ enabled: data.maintenance.enabled, message: data.maintenance.message })
        setPaymentsDraft({ ozowEnabled: data.payments.ozow.enabled, payflexEnabled: data.payments.payflex.enabled })
      }
    } catch {}
  }

  const saveMaintenance = async (enabled, message) => {
    setMaintenanceSaving(true)
    setMaintenanceMsg('')
    try {
      const res = await fetch(`${API}/api/admin/system/maintenance`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ enabled, message }),
      })
      const data = await res.json()
      if (!res.ok) { setMaintenanceMsg(data.error || 'Failed to update maintenance mode.'); return }
      setMaintenanceConfirming(false)
      setMaintenanceMsg(`Maintenance mode is now ${enabled ? 'ON' : 'OFF'}.`)
      fetchSystemSettings()
    } catch {
      setMaintenanceMsg('Failed to update maintenance mode.')
    } finally {
      setMaintenanceSaving(false)
    }
  }

  const savePaymentSwitches = async () => {
    setPaymentSwitchesSaving(true)
    setPaymentSwitchesMsg('')
    try {
      const res = await fetch(`${API}/api/admin/system/payments`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(paymentsDraft),
      })
      const data = await res.json()
      if (!res.ok) { setPaymentSwitchesMsg(data.error || 'Failed to update payment switches.'); return }
      setPaymentSwitchesMsg('Payment switches saved.')
      fetchSystemSettings()
    } catch {
      setPaymentSwitchesMsg('Failed to update payment switches.')
    } finally {
      setPaymentSwitchesSaving(false)
    }
  }

  const fetchPayments = async () => {
    setPaymentsLoading(true)
    try {
      const params = new URLSearchParams()
      if (paymentFilters.provider) params.set('provider', paymentFilters.provider)
      if (paymentFilters.status) params.set('status', paymentFilters.status)
      if (paymentFilters.mode) params.set('mode', paymentFilters.mode)
      if (paymentFilters.days) params.set('days', paymentFilters.days)
      const res = await fetch(`${API}/api/admin/payments?${params.toString()}`, { headers: getHeaders() })
      const data = await res.json()
      if (data && Array.isArray(data.payments)) {
        setPaymentRows(data.payments)
        setPaymentsSummary(data.summary)
      }
    } catch {}
    setPaymentsLoading(false)
  }

  const fetchPaymentEvents = async () => {
    try {
      const res = await fetch(`${API}/api/admin/payment-events`, { headers: getHeaders() })
      const data = await res.json()
      if (Array.isArray(data)) setPaymentEvents(data)
    } catch {}
  }

  const recheckPayment = async (row) => {
    setRechecking(prev => ({ ...prev, [`${row.provider}-${row.id}`]: true }))
    try {
      await fetch(`${API}/api/admin/payments/${row.provider}/${row.id}/recheck`, {
        method: 'POST',
        headers: getHeaders(),
      })
      await fetchPayments()
    } catch {}
    setRechecking(prev => ({ ...prev, [`${row.provider}-${row.id}`]: false }))
  }

  const fetchHealth = async () => {
    setHealthLoading(true)
    try {
      const res = await fetch(`${API}/api/admin/system/health`, { headers: getHeaders() })
      const data = await res.json()
      if (data && data.backend) setHealth(data)
    } catch {}
    setHealthLoading(false)
  }

  const fetchErrors = async () => {
    setErrorsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('resolved', errorFilters.resolved)
      if (errorFilters.days) params.set('days', errorFilters.days)
      const res = await fetch(`${API}/api/admin/errors?${params.toString()}`, { headers: getHeaders() })
      const data = await res.json()
      if (Array.isArray(data)) setErrorGroups(data)
      setSelectedErrorIds([])
    } catch {}
    setErrorsLoading(false)
  }

  const resolveErrors = async (ids) => {
    if (ids.length === 0) return
    setResolvingErrors(true)
    try {
      await fetch(`${API}/api/admin/errors/resolve`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ids }),
      })
      await fetchErrors()
    } catch {}
    setResolvingErrors(false)
  }

  const toggleErrorGroupSelected = (group) => {
    setSelectedErrorIds(prev => {
      const allSelected = group.ids.every(id => prev.includes(id))
      if (allSelected) return prev.filter(id => !group.ids.includes(id))
      return [...new Set([...prev, ...group.ids])]
    })
  }

  const roleColour = (role) => {
    if (role === 'sysadmin') return { bg: '#FDE8EC', color: '#C47A8A' }
    if (role === 'owner') return { bg: '#E8F0FA', color: '#3A5A8A' }
    return { bg: '#F0FAF4', color: '#2C6E52' }
  }

  const navItems = [
    { label: 'Overview', value: 'overview' },
    { label: 'Users', value: 'users' },
    { label: 'Roles', value: 'roles' },
    { label: 'Audit Log', value: 'audit' },
    { label: 'System Controls', value: 'controls' },
    { label: 'Payments', value: 'payments' },
    { label: 'System Health', value: 'health' },
    { label: 'Errors', value: 'errors' },
    { label: 'Settings', value: 'settings' },
  ]

  const pageTitles = {
    overview: 'System Overview',
    users: 'User Management',
    roles: 'Roles and Permissions',
    audit: 'Audit Log',
    controls: 'System Controls',
    payments: 'Payments',
    health: 'System Health',
    errors: 'Errors',
    settings: 'Settings',
  }

  const statusColour = (status) => {
    if (status === 'paid') return { background: '#E8F5E9', color: '#2E7D32' }
    if (status === 'failed') return { background: '#FDE8EC', color: '#C47A8A' }
    if (status === 'cancelled') return { background: '#F5F5F5', color: '#9E9E9E' }
    return { background: '#FFF3E0', color: '#E65100' } // started / pending
  }

  const formatUptime = (seconds) => {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d}d ${h}h ${m}m`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Lato', sans-serif; background: #FAF6F4; color: #2C1A20; }
        .sa-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .sa-table th { text-align: left; font-size: 11px; font-weight: 700; color: #9A8A8E; text-transform: uppercase; letter-spacing: 1px; padding: 0 0 10px 0; border-bottom: 1px solid #F0E8EA; }
        .sa-table td { padding: 12px 0; border-bottom: 1px solid #F7F0F2; vertical-align: middle; }
        .sa-table tr:last-child td { border-bottom: none; }
        .sa-input { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid #EDD5DB; font-size: 13px; font-family: inherit; color: #2C1A20; background: white; outline: none; margin-bottom: 12px; }
        .sa-input:focus { border-color: #C47A8A; }
        .sa-btn { background: #C47A8A; color: white; border: none; border-radius: 8px; padding: 9px 18px; font-size: 13px; font-family: inherit; cursor: pointer; font-weight: 600; }
        .sa-btn:hover { background: #A0566A; }
        .sa-btn-secondary { background: #F7EEF0; color: #8C5A6A; border: 1px solid #EDD5DB; border-radius: 8px; padding: 9px 18px; font-size: 13px; font-family: inherit; cursor: pointer; font-weight: 600; }
        .sa-btn-secondary:hover { background: #EDD5DB; }
        .sa-btn-danger { background: #FDE8EC; color: #C47A8A; border: 1px solid #F5C0CC; border-radius: 8px; padding: 7px 14px; font-size: 12px; font-family: inherit; cursor: pointer; font-weight: 600; }
        .sa-btn-danger:hover { background: #C47A8A; color: white; }
        .sa-panel { background: white; border-radius: 12px; border: none; padding: 24px; box-shadow: 0 2px 8px rgba(44,20,28,0.08); margin-bottom: 16px; }
        .sa-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          .admin-hamburger { display: flex !important; }
          .admin-nav-close { display: block !important; }

          .admin-nav-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(44,20,28,0.5);
            z-index: 99;
          }

          .admin-sidebar {
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            z-index: 200 !important;
            box-shadow: 4px 0 24px rgba(44,20,28,0.25);
          }

          .admin-sidebar.open {
            transform: translateX(0);
          }

          .admin-main { margin-left: 0 !important; }
          .admin-topbar { padding: 0 16px !important; }
          .admin-content { padding: 16px !important; }

          .admin-stat-grid { grid-template-columns: 1fr !important; }
          .admin-form-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: '#FAF6F4', fontFamily: "'Lato', sans-serif" }}>

        {/* Mobile nav overlay */}
        {mobileNavOpen && (
          <div
            className="admin-nav-overlay"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`admin-sidebar${mobileNavOpen ? ' open' : ''}`} style={{ position: 'fixed', top: 0, left: 0, width: 240, height: '100vh', background: '#2C1A20', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
          <div style={{ padding: '24px 20px', borderBottom: '1px solid #3E2A30', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <img src="/logo.png" alt="Hair By Her" style={{ height: 48, width: 'auto', objectFit: 'contain', display: 'block', mixBlendMode: 'lighten' }} />
              <div style={{ fontSize: 10, color: '#C4A0A8', letterSpacing: 2, textTransform: 'uppercase', marginTop: 8 }}>System Admin</div>
            </div>
            <button
              className="admin-nav-close"
              onClick={() => setMobileNavOpen(false)}
              style={{ background: 'none', border: 'none', color: '#C4A0A8', fontSize: 22, cursor: 'pointer', display: 'none', lineHeight: 1 }}
            >
              x
            </button>
          </div>

          <nav style={{ padding: '16px 12px', flex: 1 }}>
            {navItems.map(item => (
              <button
                key={item.value}
                onClick={() => { setActivePage(item.value); setMobileNavOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%',
                  padding: '10px 14px', borderRadius: 8, border: 'none',
                  background: activePage === item.value ? '#3E2A30' : 'transparent',
                  color: activePage === item.value ? '#FFFFFF' : '#C4A0A8',
                  fontSize: 14, fontWeight: activePage === item.value ? 700 : 500,
                  cursor: 'pointer', textAlign: 'left', marginBottom: 4,
                  fontFamily: 'inherit', position: 'relative',
                }}
              >
                {activePage === item.value && (
                  <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: '#C47A8A', borderRadius: 2 }} />
                )}
                <span style={{ marginLeft: activePage === item.value ? 10 : 0 }}>{item.label}</span>
              </button>
            ))}
          </nav>

          <div style={{ padding: '16px 20px', borderTop: '1px solid #3E2A30' }}>
            <div style={{ fontSize: 12, color: '#C4A0A8', marginBottom: 8 }}>
              Signed in as <strong style={{ color: '#EDD5DB' }}>{user.username}</strong>
            </div>
            <button
              onClick={onLogout}
              style={{ background: 'none', border: '1px solid #3E2A30', color: '#C4A0A8', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="admin-main" style={{ marginLeft: 240, flex: 1, minHeight: '100vh' }}>

          {/* Top bar (and, while maintenance is on, a banner above it) - both
              sticky together as one header so the banner never scrolls out
              from under a non-sticky top bar. */}
          <div style={{ position: 'sticky', top: 0, zIndex: 50 }}>
            {systemSettings?.maintenance?.enabled && (
              <div style={{ background: '#E65100', color: 'white', textAlign: 'center', padding: '8px 16px', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
                Maintenance mode is ON - the customer site is showing a maintenance screen and new payments are blocked.
              </div>
            )}
            <div className="admin-topbar" style={{ background: '#2C1A20', borderBottom: 'none', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(44,20,28,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                className="admin-hamburger"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open menu"
                style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexDirection: 'column', gap: 4 }}
              >
                <span style={{ width: 20, height: 2, background: '#FFFFFF', borderRadius: 2 }} />
                <span style={{ width: 20, height: 2, background: '#FFFFFF', borderRadius: 2 }} />
                <span style={{ width: 20, height: 2, background: '#FFFFFF', borderRadius: 2 }} />
              </button>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF' }}>{pageTitles[activePage]}</div>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)', padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>System Admin Portal</div>
            </div>
          </div>

          <div className="admin-content" style={{ padding: 32, maxWidth: 1100 }}>

            {/* Overview */}
            {activePage === 'overview' && (
              <div>
                <div className="admin-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                  {[
                    { label: 'Total Users', value: users.length, bg: '#C47A8A' },
                    { label: 'Active Users', value: users.filter(u => u.is_active).length, bg: '#7A9E8A' },
                    { label: 'Roles Defined', value: roles.length, bg: '#8C5A6A' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: stat.bg, borderRadius: 12, padding: '22px 24px', boxShadow: '0 2px 8px rgba(44,20,28,0.1)' }}>
                      <div style={{ fontSize: 30, fontWeight: 700, color: 'white', marginBottom: 4 }}>{stat.value}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div className="sa-panel" style={{ overflowX: 'auto' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#2C1A20', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #F0E8EA' }}>Recent Users</div>
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.slice(0, 5).map(u => (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 600 }}>{u.username}</td>
                          <td>
                            <span className="sa-badge" style={roleColour(u.role)}>{u.role}</span>
                          </td>
                          <td>
                            <span className="sa-badge" style={{ bg: u.is_active ? '#E8F5E9' : '#F5F5F5', background: u.is_active ? '#E8F5E9' : '#F5F5F5', color: u.is_active ? '#2E7D32' : '#9E9E9E' }}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ color: '#9A8A8E' }}>{new Date(u.created_at).toLocaleDateString('en-ZA')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="sa-panel">
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#2C1A20', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #F0E8EA' }}>System Notifications</div>
                  {systemNotifications.length === 0 && (
                    <div style={{ fontSize: 13, color: '#AAAAAA' }}>No system notifications.</div>
                  )}
                  {systemNotifications.map((n, i) => (
                    <div key={n.id} style={{ padding: '10px 0', borderBottom: i === systemNotifications.length - 1 ? 'none' : '1px solid #F7F0F2' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#2C1A20' }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: '#9A8A8E', marginTop: 2 }}>{n.message}</div>
                      <div style={{ fontSize: 11, color: '#C4A0A8', marginTop: 4 }}>
                        {new Date(n.createdAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Users */}
            {activePage === 'users' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20' }}>{users.length} users</div>
                    <div style={{ fontSize: 12, color: '#9A8A8E', marginTop: 2 }}>Manage all system users and their access</div>
                  </div>
                  <button className="sa-btn" onClick={() => { setShowCreateUser(true); setCreateError(''); setCreateSuccess('') }}>
                    Create User
                  </button>
                </div>

                {createSuccess && (
                  <div style={{ background: '#E8F5E9', color: '#2E7D32', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                    {createSuccess}
                  </div>
                )}

                {showCreateUser && (
                  <div className="sa-panel" style={{ marginBottom: 20, background: '#FDF6F4' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20', marginBottom: 16 }}>New User</div>
                    <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Username</label>
                        <input className="sa-input" placeholder="Username" value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Email (optional)</label>
                        <input className="sa-input" placeholder="Email address" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Default Password</label>
                        <input className="sa-input" type="password" placeholder="Temporary password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Role</label>
                        <select className="sa-input" value={newUser.role_name} onChange={e => setNewUser(p => ({ ...p, role_name: e.target.value }))}>
                          <option value="owner">Owner</option>
                          <option value="staff">Staff</option>
                          <option value="sysadmin">System Admin</option>
                        </select>
                      </div>
                    </div>
                    {createError && <div style={{ color: '#C47A8A', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{createError}</div>}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="sa-btn" onClick={createUser}>Create User</button>
                      <button className="sa-btn-secondary" onClick={() => { setShowCreateUser(false); setCreateError('') }}>Cancel</button>
                    </div>
                  </div>
                )}

                <div className="sa-panel" style={{ overflowX: 'auto' }}>
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Password</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 600 }}>{u.username}</td>
                          <td style={{ color: '#9A8A8E' }}>{u.email || '-'}</td>
                          <td><span className="sa-badge" style={roleColour(u.role)}>{u.role}</span></td>
                          <td>
                            <span className="sa-badge" style={{ background: u.is_active ? '#E8F5E9' : '#F5F5F5', color: u.is_active ? '#2E7D32' : '#9E9E9E' }}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            {u.must_change_password && (
                              <span className="sa-badge" style={{ background: '#FFF3E0', color: '#E65100' }}>Must change</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="sa-btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }}
                                onClick={() => toggleUserActive(u)}>
                                {u.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                              <button className="sa-btn-danger"
                                onClick={() => { setResetTarget(u); setResetPassword(''); setResetMsg('') }}>
                                Reset PW
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {resetTarget && (
                  <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(44,26,32,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setResetTarget(null)}>
                    <div style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', boxShadow: '0 8px 40px rgba(44,26,32,0.2)' }}
                      onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#2C1A20', marginBottom: 6 }}>Reset Password</div>
                      <div style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20 }}>Set a new temporary password for <strong>{resetTarget.username}</strong>. They will be required to change it on next login.</div>
                      <input className="sa-input" type="password" placeholder="New temporary password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
                      {resetMsg && <div style={{ fontSize: 13, color: '#C47A8A', fontWeight: 600, marginBottom: 12 }}>{resetMsg}</div>}
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="sa-btn" onClick={resetUserPassword}>Reset Password</button>
                        <button className="sa-btn-secondary" onClick={() => setResetTarget(null)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Roles */}
            {activePage === 'roles' && (
              <div>
                {[
                  { name: 'sysadmin', label: 'System Admin', description: 'Full system access.', perms: ['User management', 'Role management', 'Audit log access', 'All business features', 'System settings', 'Image management'] },
                  { name: 'owner', label: 'Business Owner', description: 'Full business operations access.', perms: ['Dashboard and analytics', 'Order management', 'Product and section management', 'Image management', 'Lash training and students', 'Business notifications', 'Create staff users'] },
                  { name: 'staff', label: 'Staff', description: 'Read-only operational access.', perms: ['View dashboard', 'View and confirm orders', 'View products and classes'] },
                ].map(role => (
                  <div key={role.name} className="sa-panel">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <span className="sa-badge" style={roleColour(role.name)}>{role.name}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20' }}>{role.label}</span>
                    </div>
                    <p style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 14 }}>{role.description}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {role.perms.map(p => (
                        <span key={p} style={{ background: '#F7EEF0', color: '#8C5A6A', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>{p}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Audit Log */}
            {activePage === 'audit' && (
              <div>
                <div style={{ marginBottom: 16, fontSize: 13, color: '#9A8A8E' }}>{auditTotal} total events</div>
                <div className="sa-panel" style={{ padding: 0, overflowY: 'hidden', overflowX: 'auto' }}>
                  <table className="sa-table" style={{ padding: '0 24px' }}>
                    <thead>
                      <tr style={{ background: '#F7EEF0' }}>
                        <th style={{ padding: '12px 20px' }}>Time</th>
                        <th style={{ padding: '12px 20px' }}>User</th>
                        <th style={{ padding: '12px 20px' }}>Action</th>
                        <th style={{ padding: '12px 20px' }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id}>
                          <td style={{ padding: '10px 20px', color: '#9A8A8E', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {new Date(log.created_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '10px 20px', fontWeight: 600 }}>{log.username || '-'}</td>
                          <td style={{ padding: '10px 20px' }}>
                            <span className="sa-badge" style={{ background: '#F7EEF0', color: '#8C5A6A' }}>{log.action}</span>
                          </td>
                          <td style={{ padding: '10px 20px', color: '#9A8A8E', fontSize: 12 }}>{log.details || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {auditPages > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
                    {Array.from({ length: auditPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setAuditPage(p)}
                        style={{ background: p === auditPage ? '#C47A8A' : '#F7EEF0', color: p === auditPage ? 'white' : '#8C5A6A', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* System Controls */}
            {activePage === 'controls' && (
              <div>
                <div className="sa-panel" style={{ maxWidth: 560 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 6 }}>Maintenance Mode</div>
                  <div style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20 }}>
                    While on, the customer site shows a maintenance screen instead of the shop, and new orders, enrolments and payments are turned away. The admin dashboard and payments already in progress are never affected.
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2C1A20' }}>
                      Maintenance mode is currently {systemSettings?.maintenance?.enabled ? 'ON' : 'OFF'}
                    </div>
                    <button
                      className={systemSettings?.maintenance?.enabled ? 'sa-btn-danger' : 'sa-btn'}
                      onClick={() => {
                        if (maintenanceDraft.enabled) {
                          saveMaintenance(false, maintenanceDraft.message)
                        } else {
                          setMaintenanceConfirming(true)
                        }
                      }}
                    >
                      {maintenanceDraft.enabled ? 'Turn Off' : 'Turn On'}
                    </button>
                  </div>

                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
                    Message shown to visitors ({maintenanceDraft.message.length}/200)
                  </label>
                  <textarea
                    className="sa-input"
                    rows={3}
                    maxLength={200}
                    value={maintenanceDraft.message}
                    onChange={e => setMaintenanceDraft(p => ({ ...p, message: e.target.value }))}
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  />

                  {maintenanceConfirming && (
                    <div style={{ background: '#FFF3E0', border: '1px solid #FFD591', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ fontSize: 13, color: '#8C5A00', fontWeight: 600, marginBottom: 10 }}>
                        Turn maintenance mode on? The customer site will immediately show the maintenance screen, and new orders, enrolments and payments will be turned away.
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="sa-btn" disabled={maintenanceSaving} onClick={() => saveMaintenance(true, maintenanceDraft.message)}>
                          Yes, turn it on
                        </button>
                        <button className="sa-btn-secondary" onClick={() => setMaintenanceConfirming(false)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {!maintenanceConfirming && (
                    <button
                      className="sa-btn-secondary"
                      disabled={maintenanceSaving}
                      onClick={() => saveMaintenance(maintenanceDraft.enabled, maintenanceDraft.message)}
                    >
                      Save Message
                    </button>
                  )}

                  {maintenanceMsg && (
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 12, color: maintenanceMsg.includes('now') ? '#2E7D32' : '#C47A8A' }}>{maintenanceMsg}</div>
                  )}
                </div>

                <div className="sa-panel" style={{ maxWidth: 560 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 6 }}>Payment Switches</div>
                  <div style={{ fontSize: 13, color: '#9A8A8E', marginBottom: 20 }}>
                    A payment method is only offered at checkout when it's both configured and switched on here. If both are off, checkout falls back to the WhatsApp message.
                  </div>

                  {['ozow', 'payflex'].map(key => {
                    const info = systemSettings?.payments?.[key]
                    const label = key === 'ozow' ? 'Ozow' : 'Payflex'
                    const draftKey = key === 'ozow' ? 'ozowEnabled' : 'payflexEnabled'
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #F7F0F2' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#2C1A20' }}>{label}</div>
                          <div style={{ fontSize: 12, color: '#9A8A8E', marginTop: 2 }}>
                            {info?.configured ? `Configured - ${info.isTest ? 'test mode' : 'live mode'}` : 'Not configured'}
                          </div>
                        </div>
                        <button
                          className={paymentsDraft[draftKey] ? 'sa-btn' : 'sa-btn-secondary'}
                          onClick={() => setPaymentsDraft(p => ({ ...p, [draftKey]: !p[draftKey] }))}
                        >
                          {paymentsDraft[draftKey] ? 'On' : 'Off'}
                        </button>
                      </div>
                    )
                  })}

                  <button className="sa-btn" style={{ marginTop: 16 }} disabled={paymentSwitchesSaving} onClick={savePaymentSwitches}>
                    Save Switches
                  </button>
                  {paymentSwitchesMsg && (
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 12, color: paymentSwitchesMsg.includes('saved') ? '#2E7D32' : '#C47A8A' }}>{paymentSwitchesMsg}</div>
                  )}
                </div>
              </div>
            )}

            {/* Payments monitor */}
            {activePage === 'payments' && (
              <div>
                <div className="admin-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                  <div style={{ background: paymentsSummary.stuckCount > 0 ? '#E65100' : '#7A9E8A', borderRadius: 12, padding: '22px 24px', boxShadow: '0 2px 8px rgba(44,20,28,0.1)' }}>
                    <div style={{ fontSize: 30, fontWeight: 700, color: 'white', marginBottom: 4 }}>{paymentsSummary.stuckCount}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600 }}>Stuck Over 1 Hour</div>
                  </div>
                  <div style={{ background: '#8C5A6A', borderRadius: 12, padding: '22px 24px', boxShadow: '0 2px 8px rgba(44,20,28,0.1)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 4 }}>
                      {paymentsSummary.lastOzowNotifyAt ? new Date(paymentsSummary.lastOzowNotifyAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'None yet'}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600 }}>Last Ozow Notify</div>
                  </div>
                  <div style={{ background: '#C47A8A', borderRadius: 12, padding: '22px 24px', boxShadow: '0 2px 8px rgba(44,20,28,0.1)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 4 }}>
                      {paymentsSummary.lastPayflexCallbackAt ? new Date(paymentsSummary.lastPayflexCallbackAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'None yet'}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600 }}>Last Payflex Callback</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                  <select className="sa-input" style={{ marginBottom: 0, width: 150 }} value={paymentFilters.provider} onChange={e => setPaymentFilters(p => ({ ...p, provider: e.target.value }))}>
                    <option value="">All providers</option>
                    <option value="ozow">Ozow</option>
                    <option value="payflex">Payflex</option>
                  </select>
                  <select className="sa-input" style={{ marginBottom: 0, width: 150 }} value={paymentFilters.status} onChange={e => setPaymentFilters(p => ({ ...p, status: e.target.value }))}>
                    <option value="">All statuses</option>
                    <option value="started">Started</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select className="sa-input" style={{ marginBottom: 0, width: 150 }} value={paymentFilters.mode} onChange={e => setPaymentFilters(p => ({ ...p, mode: e.target.value }))}>
                    <option value="">Test and live</option>
                    <option value="test">Test only</option>
                    <option value="live">Live only</option>
                  </select>
                  <select className="sa-input" style={{ marginBottom: 0, width: 150 }} value={paymentFilters.days} onChange={e => setPaymentFilters(p => ({ ...p, days: e.target.value }))}>
                    <option value="">All time</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                  </select>
                </div>

                <div className="sa-panel" style={{ overflowX: 'auto' }}>
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Purpose</th>
                        <th>Order / Student</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Mode</th>
                        <th>Created</th>
                        <th>Updated</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRows.map(row => (
                        <tr key={`${row.provider}-${row.id}`}>
                          <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{row.provider}</td>
                          <td style={{ textTransform: 'capitalize' }}>{row.purpose}</td>
                          <td>{row.identifier}</td>
                          <td>R{row.amount.toFixed(2)}</td>
                          <td>
                            <span className="sa-badge" style={statusColour(row.status)}>{row.status}</span>
                            {row.stuck && <span className="sa-badge" style={{ background: '#E65100', color: 'white', marginLeft: 6 }}>Stuck</span>}
                          </td>
                          <td>{row.isTest ? 'Test' : 'Live'}</td>
                          <td style={{ color: '#9A8A8E', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {new Date(row.createdAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ color: '#9A8A8E', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {new Date(row.updatedAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <button
                              className="sa-btn-secondary"
                              style={{ padding: '5px 10px', fontSize: 11 }}
                              disabled={!!rechecking[`${row.provider}-${row.id}`]}
                              onClick={() => recheckPayment(row)}
                            >
                              {rechecking[`${row.provider}-${row.id}`] ? 'Checking...' : 'Check again'}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!paymentsLoading && paymentRows.length === 0 && (
                        <tr><td colSpan={9} style={{ color: '#AAAAAA', padding: '16px 0' }}>No payment attempts match these filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="sa-panel" style={{ overflowX: 'auto' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#2C1A20', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #F0E8EA' }}>
                    Rejected Notifications
                  </div>
                  {paymentEvents.length === 0 && (
                    <div style={{ fontSize: 13, color: '#AAAAAA' }}>No rejected notifications or callbacks.</div>
                  )}
                  {paymentEvents.length > 0 && (
                    <table className="sa-table">
                      <thead>
                        <tr>
                          <th>Provider</th>
                          <th>Reason</th>
                          <th>Reference</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentEvents.map(ev => (
                          <tr key={ev.id}>
                            <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{ev.provider}</td>
                            <td>{ev.reason.replace(/_/g, ' ')}</td>
                            <td style={{ color: '#9A8A8E' }}>{ev.reference || '-'}</td>
                            <td style={{ color: '#9A8A8E', fontSize: 12 }}>
                              {new Date(ev.created_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* System Health */}
            {activePage === 'health' && (
              <div>
                {health && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, padding: '14px 18px', marginBottom: 20,
                    background: health.status === 'ok' ? '#E8F5E9' : '#FFF3E0',
                  }}>
                    <span className="sa-badge" style={{ background: health.status === 'ok' ? '#2E7D32' : '#E65100', color: 'white' }}>
                      {health.status === 'ok' ? 'All Good' : 'Warning'}
                    </span>
                    {health.status === 'ok' ? (
                      <span style={{ fontSize: 13, color: '#2E7D32', fontWeight: 600 }}>Everything looks healthy.</span>
                    ) : (
                      <span style={{ fontSize: 13, color: '#8C5A00', fontWeight: 600 }}>{health.warnings.join(' ')}</span>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <button className="sa-btn-secondary" disabled={healthLoading} onClick={fetchHealth}>
                    {healthLoading ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>

                {health && (
                  <>
                    <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div className="sa-panel">
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20', marginBottom: 14 }}>Backend</div>
                        {[
                          ['Uptime', formatUptime(health.backend.uptimeSeconds)],
                          ['Node version', health.backend.nodeVersion],
                          ['Memory (RSS)', `${health.backend.memory.rssMb} MB`],
                          ['Heap used / total', `${health.backend.memory.heapUsedMb} / ${health.backend.memory.heapTotalMb} MB`],
                          ['Version', health.backend.version],
                        ].map(([label, value]) => (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F7F0F2', fontSize: 13 }}>
                            <span style={{ color: '#9A8A8E' }}>{label}</span>
                            <span style={{ fontWeight: 600, color: '#2C1A20' }}>{value}</span>
                          </div>
                        ))}
                      </div>

                      <div className="sa-panel">
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20', marginBottom: 14 }}>Database</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F7F0F2', fontSize: 13 }}>
                          <span style={{ color: '#9A8A8E' }}>Reachable</span>
                          <span className="sa-badge" style={{ background: health.database.reachable ? '#E8F5E9' : '#FDE8EC', color: health.database.reachable ? '#2E7D32' : '#C47A8A' }}>
                            {health.database.reachable ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F7F0F2', fontSize: 13 }}>
                          <span style={{ color: '#9A8A8E' }}>Response time</span>
                          <span style={{ fontWeight: 600, color: '#2C1A20' }}>{health.database.responseTimeMs ?? '-'} ms</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F7F0F2', fontSize: 13 }}>
                          <span style={{ color: '#9A8A8E' }}>Size (of 1GB free plan)</span>
                          <span style={{ fontWeight: 600, color: health.database.sizePercent > 80 ? '#C47A8A' : '#2C1A20' }}>
                            {health.database.sizePercent ?? '-'}%
                          </span>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 8px' }}>Row Counts</div>
                        {Object.entries(health.database.rowCounts).map(([table, count]) => (
                          <div key={table} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                            <span style={{ color: '#9A8A8E', textTransform: 'capitalize' }}>{table.replace(/([A-Z])/g, ' $1')}</span>
                            <span style={{ fontWeight: 600, color: '#2C1A20' }}>{count}</span>
                          </div>
                        ))}
                      </div>

                      <div className="sa-panel">
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20', marginBottom: 14 }}>Services</div>
                        {[
                          ['Ozow', health.services.ozow],
                          ['Payflex', health.services.payflex],
                          ['Cloudinary', health.services.cloudinary],
                        ].map(([label, info]) => (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F7F0F2', fontSize: 13 }}>
                            <span style={{ color: '#9A8A8E' }}>{label}</span>
                            <span style={{ display: 'flex', gap: 6 }}>
                              <span className="sa-badge" style={{ background: info.configured ? '#E8F5E9' : '#F5F5F5', color: info.configured ? '#2E7D32' : '#9E9E9E' }}>
                                {info.configured ? 'Configured' : 'Not configured'}
                              </span>
                              {info.configured && 'isTest' in info && (
                                <span className="sa-badge" style={{ background: '#F7EEF0', color: '#8C5A6A' }}>{info.isTest ? 'Test' : 'Live'}</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="sa-panel">
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20', marginBottom: 14 }}>System Settings</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F7F0F2', fontSize: 13 }}>
                          <span style={{ color: '#9A8A8E' }}>Maintenance mode</span>
                          <span className="sa-badge" style={{ background: health.systemSettings.maintenance.enabled ? '#E65100' : '#E8F5E9', color: health.systemSettings.maintenance.enabled ? 'white' : '#2E7D32' }}>
                            {health.systemSettings.maintenance.enabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F7F0F2', fontSize: 13 }}>
                          <span style={{ color: '#9A8A8E' }}>Ozow switch</span>
                          <span style={{ fontWeight: 600, color: '#2C1A20' }}>{health.systemSettings.payments.ozowEnabled ? 'On' : 'Off'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
                          <span style={{ color: '#9A8A8E' }}>Payflex switch</span>
                          <span style={{ fontWeight: 600, color: '#2C1A20' }}>{health.systemSettings.payments.payflexEnabled ? 'On' : 'Off'}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Errors */}
            {activePage === 'errors' && (
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <select className="sa-input" style={{ marginBottom: 0, width: 150 }} value={errorFilters.resolved} onChange={e => setErrorFilters(p => ({ ...p, resolved: e.target.value }))}>
                      <option value="unresolved">Unresolved</option>
                      <option value="all">All</option>
                    </select>
                    <select className="sa-input" style={{ marginBottom: 0, width: 150 }} value={errorFilters.days} onChange={e => setErrorFilters(p => ({ ...p, days: e.target.value }))}>
                      <option value="">All time</option>
                      <option value="1">Last 24 hours</option>
                      <option value="7">Last 7 days</option>
                      <option value="30">Last 30 days</option>
                    </select>
                  </div>
                  <button
                    className="sa-btn"
                    disabled={selectedErrorIds.length === 0 || resolvingErrors}
                    onClick={() => resolveErrors(selectedErrorIds)}
                  >
                    {resolvingErrors ? 'Resolving...' : `Mark Resolved (${selectedErrorIds.length})`}
                  </button>
                </div>

                <div className="sa-panel" style={{ overflowX: 'auto' }}>
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Context</th>
                        <th>Message</th>
                        <th>Route</th>
                        <th>Status</th>
                        <th>Count</th>
                        <th>Last Seen</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorGroups.map(group => {
                        const groupSelected = group.ids.every(id => selectedErrorIds.includes(id))
                        return (
                          <tr key={`${group.context}-${group.message}-${group.route}-${group.status}`}>
                            <td>
                              <input type="checkbox" checked={groupSelected} onChange={() => toggleErrorGroupSelected(group)} />
                            </td>
                            <td style={{ fontWeight: 600 }}>{group.context || '-'}</td>
                            <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={group.message}>{group.message}</td>
                            <td style={{ color: '#9A8A8E', fontSize: 12, whiteSpace: 'nowrap' }}>{group.method ? `${group.method} ${group.route || ''}` : '-'}</td>
                            <td>{group.status || '-'}</td>
                            <td><span className="sa-badge" style={{ background: '#F7EEF0', color: '#8C5A6A' }}>{group.count}</span></td>
                            <td style={{ color: '#9A8A8E', fontSize: 12, whiteSpace: 'nowrap' }}>
                              {new Date(group.lastSeen).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td>
                              <button
                                className="sa-btn-secondary"
                                style={{ padding: '5px 10px', fontSize: 11 }}
                                disabled={resolvingErrors}
                                onClick={() => resolveErrors(group.ids)}
                              >
                                Mark Resolved
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      {!errorsLoading && errorGroups.length === 0 && (
                        <tr><td colSpan={8} style={{ color: '#AAAAAA', padding: '16px 0' }}>No errors match these filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Settings */}
            {activePage === 'settings' && (
              <div>
                <div className="sa-panel" style={{ maxWidth: 480 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 20 }}>Change Password</div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Current Password</label>
                  <input className="sa-input" type="password" placeholder="Current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>New Password</label>
                  <input className="sa-input" type="password" placeholder="New password (min 6 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9A8A8E', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Confirm New Password</label>
                  <input className="sa-input" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                  {pwMsg && (
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: pwMsg.includes('successfully') ? '#2E7D32' : '#C47A8A' }}>{pwMsg}</div>
                  )}
                  <button className="sa-btn" onClick={changeOwnPassword}>Change Password</button>
                </div>

                <div className="sa-panel" style={{ maxWidth: 480, marginTop: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#2C1A20', marginBottom: 16 }}>System Notifications</div>
                  {systemNotifications.length === 0 && (
                    <div style={{ fontSize: 13, color: '#AAAAAA' }}>No system notifications.</div>
                  )}
                  {systemNotifications.map((n, i) => (
                    <div key={n.id} style={{ padding: '10px 0', borderBottom: i === systemNotifications.length - 1 ? 'none' : '1px solid #F7F0F2' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#2C1A20' }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: '#9A8A8E', marginTop: 2 }}>{n.message}</div>
                      <div style={{ fontSize: 11, color: '#C4A0A8', marginTop: 4 }}>
                        {new Date(n.createdAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
