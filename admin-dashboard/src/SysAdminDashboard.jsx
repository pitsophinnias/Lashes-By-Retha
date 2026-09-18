import React, { useState, useEffect } from 'react'

const API = 'http://localhost:3002'

export default function SysAdminDashboard({ user, onLogout }) {
  const [activePage, setActivePage] = useState('overview')
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
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

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('hbh_token')}`,
  })

  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [])

  useEffect(() => {
    if (activePage === 'audit') fetchAuditLogs(auditPage)
  }, [activePage, auditPage])

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
    { label: 'Settings', value: 'settings' },
  ]

  const pageTitles = {
    overview: 'System Overview',
    users: 'User Management',
    roles: 'Roles and Permissions',
    audit: 'Audit Log',
    settings: 'Settings',
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
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: '#FAF6F4', fontFamily: "'Lato', sans-serif" }}>

        {/* Sidebar */}
        <div style={{ position: 'fixed', top: 0, left: 0, width: 240, height: '100vh', background: '#2C1A20', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
          <div style={{ padding: '24px 20px', borderBottom: '1px solid #3E2A30' }}>
            <img src="/logo.png" alt="Hair By Her" style={{ height: 48, width: 'auto', objectFit: 'contain', display: 'block', mixBlendMode: 'lighten' }} />
            <div style={{ fontSize: 10, color: '#C4A0A8', letterSpacing: 2, textTransform: 'uppercase', marginTop: 8 }}>System Admin</div>
          </div>

          <nav style={{ padding: '16px 12px', flex: 1 }}>
            {navItems.map(item => (
              <button
                key={item.value}
                onClick={() => setActivePage(item.value)}
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
        <div style={{ marginLeft: 240, flex: 1, minHeight: '100vh' }}>

          {/* Top bar */}
          <div style={{ background: '#2C1A20', borderBottom: 'none', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 8px rgba(44,20,28,0.2)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF' }}>{pageTitles[activePage]}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)', padding: '4px 12px', borderRadius: 20 }}>System Admin Portal</div>
          </div>

          <div style={{ padding: 32, maxWidth: 1100 }}>

            {/* Overview */}
            {activePage === 'overview' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
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

                <div className="sa-panel">
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

                <div className="sa-panel">
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
                <div className="sa-panel" style={{ padding: 0, overflow: 'hidden' }}>
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

            {/* Settings */}
            {activePage === 'settings' && (
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
            )}

          </div>
        </div>
      </div>
    </>
  )
}
