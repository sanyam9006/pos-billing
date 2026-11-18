import { useState, useEffect } from 'react'
import { authFetch, clearStoreConfigCache } from '../utils/api'

export default function Settings() {
  const [settings, setSettings] = useState({
    STORE_NAME: 'House of Sadaya',
    STORE_ADDRESS: '4/8 Housing board Tonk Rajasthan',
    STORE_PHONE: '7568458575',
    BILL_PREFIX: 'HOS-',
    DISCOUNT_PIN_THRESHOLD: '500',
    FOOTER_TEXT: 'Thank you for shopping at House of Sadaya! Exchange within 7 days with tag intact.',
    THERMAL_WIDTH: '80mm',
    RENT_OVERRIDE_PIN_THRESHOLD: '500',
    RENTAL_COUNT_PICKUP_DAY: '1',
    RENTAL_EARLY_RETURN_REFUND: '0'
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [backupMsg, setBackupMsg] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [showAudit, setShowAudit] = useState(false)

  // Staff Management State
  const [staffList, setStaffList] = useState([])
  const [showStaffModal, setShowStaffModal] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [staffForm, setStaffForm] = useState({ name: '', employee_code: '', pin: '', role: 'cashier', is_active: true })
  const [staffMsg, setStaffMsg] = useState(null)
  const [staffSaving, setStaffSaving] = useState(false)

  useEffect(() => {
    loadSettings()
    loadStaff()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const res = await authFetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        if (data.settings) {
          setSettings(prev => ({ ...prev, ...data.settings }))
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadStaff = async () => {
    try {
      const res = await authFetch('/api/auth/cashiers')
      if (res.ok) {
        const data = await res.json()
        setStaffList(data)
      }
    } catch (err) {
      console.error('Failed to load staff:', err)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setSettings(prev => ({ ...prev, [name]: value }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      })
      if (res.ok) {
        clearStoreConfigCache()
        setMessage({ type: 'success', text: '✅ Boutique settings updated and applied successfully!' })
        setTimeout(() => setMessage(null), 4000)
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.error || 'Failed to update settings.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error while saving settings.' })
    } finally {
      setSaving(false)
    }
  }

  const handleBackupNow = async () => {
    setBackupMsg('Creating database backup...')
    try {
      const res = await authFetch('/api/settings/backup-now', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setBackupMsg(`✅ Backup created successfully: ${data.file}`)
      } else {
        setBackupMsg(`❌ Backup failed: ${data.error}`)
      }
    } catch {
      setBackupMsg('❌ Error triggering backup')
    }
    setTimeout(() => setBackupMsg(null), 5000)
  }

  const loadAuditLogs = async () => {
    try {
      const res = await authFetch('/api/reports/audit-logs')
      if (res.ok) {
        const data = await res.json()
        setAuditLogs(data)
        setShowAudit(true)
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err)
    }
  }

  const handleOpenNewStaff = () => {
    setEditingStaff(null)
    setStaffForm({ name: '', employee_code: '', pin: '', role: 'cashier', is_active: true })
    setStaffMsg(null)
    setShowStaffModal(true)
  }

  const handleOpenEditStaff = (st) => {
    setEditingStaff(st)
    setStaffForm({ name: st.name, employee_code: st.employee_code, pin: '', role: st.role, is_active: !!st.is_active })
    setStaffMsg(null)
    setShowStaffModal(true)
  }

  const handleSaveStaff = async (e) => {
    e.preventDefault()
    setStaffSaving(true)
    setStaffMsg(null)
    try {
      const isEdit = !!editingStaff
      const url = isEdit ? `/api/auth/cashiers/${editingStaff.id}` : '/api/auth/cashiers'
      const method = isEdit ? 'PUT' : 'POST'

      const payload = {
        name: staffForm.name.trim(),
        employee_code: staffForm.employee_code.trim(),
        role: staffForm.role,
        is_active: staffForm.is_active ? 1 : 0
      }
      if (staffForm.pin && staffForm.pin.trim()) {
        payload.pin = staffForm.pin.trim()
      } else if (!isEdit) {
        setStaffMsg({ type: 'error', text: '4-digit PIN is required for new staff' })
        setStaffSaving(false)
        return
      }

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok) {
        setShowStaffModal(false)
        loadStaff()
        setMessage({ type: 'success', text: `✅ Staff member ${payload.name} saved successfully!` })
        setTimeout(() => setMessage(null), 4000)
      } else {
        setStaffMsg({ type: 'error', text: data.error || 'Failed to save staff member' })
      }
    } catch {
      setStaffMsg({ type: 'error', text: 'Network error saving staff' })
    } finally {
      setStaffSaving(false)
    }
  }

  const handleToggleStaffActive = async (st) => {
    try {
      const res = await authFetch(`/api/auth/cashiers/${st.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: st.is_active ? 0 : 1 })
      })
      if (res.ok) {
        loadStaff()
        setMessage({ type: 'success', text: `Status for ${st.name} updated!` })
        setTimeout(() => setMessage(null), 3000)
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.error || 'Failed to update status' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error updating staff' })
    }
  }

  if (loading) {
    return (
      <div className="page settings-page" style={{ textAlign: 'center', padding: '60px' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Loading boutique settings...</p>
      </div>
    )
  }

  return (
    <div className="page settings-page">
      {/* Top Banner Alerts */}
      {backupMsg && (
        <div className="toast info" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 2000 }}>
          {backupMsg}
        </div>
      )}
      {message && (
        <div className={`toast ${message.type}`} style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 2000 }}>
          {message.text}
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>⚙️ Boutique Store Settings</h1>
          <p className="page-subtitle">Configure branding, print sizes, staff logins, and store security policies</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" onClick={handleBackupNow} className="btn-primary btn-sm" style={{ background: '#2E7D32' }}>
            📦 Backup Database Now
          </button>
          <button type="button" onClick={() => { if (showAudit) setShowAudit(false); else loadAuditLogs(); }} className="btn-secondary">
            {showAudit ? '✕ Close Audit' : '🔍 View Audit Log'}
          </button>
        </div>
      </div>

      {/* Audit Log Modal */}
      {showAudit && (
        <div className="modal-overlay" onClick={() => setShowAudit(false)}>
          <div className="modal" style={{ maxWidth: '800px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <h2>
              <span>📋 Security & Audit Trail (Last 100 Actions)</span>
              <button type="button" className="modal-close" onClick={() => setShowAudit(false)}>✕</button>
            </h2>
            <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Staff</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{log.created_at}</td>
                      <td><strong>{log.cashier_name || 'Staff'}</strong></td>
                      <td><code style={{ color: 'var(--accent-dark)' }}>{log.action}</code></td>
                      <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.details_json}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button type="button" className="modal-btn secondary" onClick={() => setShowAudit(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave}>
        {/* Section 1: Store Branding & Receipts */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="settings-card-title">
              <h2>👗 Boutique Identity & Receipts</h2>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>House of Sadaya</span>
          </div>

          <div className="logo-preview-box">
            <img src="/logo.png" alt="House of Sadaya" className="logo-preview-img" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>
                Official Boutique Logo
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Active and automatically printed on every bill, rental agreement slip, and tailoring job card.
              </div>
            </div>
          </div>

          <div className="settings-grid-2">
            <div className="settings-field">
              <label>Store / Brand Name</label>
              <input
                type="text"
                name="STORE_NAME"
                value={settings.STORE_NAME}
                onChange={handleChange}
                required
              />
            </div>

            <div className="settings-field">
              <label>Store Phone / WhatsApp</label>
              <input
                type="text"
                name="STORE_PHONE"
                value={settings.STORE_PHONE}
                onChange={handleChange}
                placeholder="e.g. 7568458575"
              />
            </div>

            <div className="settings-field span-2">
              <label>Store Address</label>
              <input
                type="text"
                name="STORE_ADDRESS"
                value={settings.STORE_ADDRESS}
                onChange={handleChange}
                placeholder="4/8 Housing board Tonk Rajasthan"
              />
            </div>

            <div className="settings-field">
              <label>Bill Number Prefix</label>
              <input
                type="text"
                name="BILL_PREFIX"
                value={settings.BILL_PREFIX}
                onChange={handleChange}
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              />
              <span className="field-hint">Example bill: {settings.BILL_PREFIX}20261118-0001</span>
            </div>

            <div className="settings-field">
              <label>Receipt Printer Size</label>
              <select
                name="THERMAL_WIDTH"
                value={settings.THERMAL_WIDTH}
                onChange={handleChange}
              >
                <option value="80mm">80mm Thermal (Standard POS Roll)</option>
                <option value="58mm">58mm Thermal (Compact POS Roll)</option>
                <option value="a4">A4 Full Page (Desktop Printer)</option>
              </select>
            </div>

            <div className="settings-field span-2">
              <label>Receipt Footer Note</label>
              <input
                type="text"
                name="FOOTER_TEXT"
                value={settings.FOOTER_TEXT}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Staff & Cashier Login Management */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <div className="settings-card-title">
                <h2>👥 Staff & Cashier Login Management</h2>
              </div>
              <div className="settings-card-subtitle">
                Add staff, set/change 4-digit PINs, or activate/deactivate counter cashier logins
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenNewStaff}
              className="btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>➕</span> Add New Staff
            </button>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Employee Code (Login ID)</th>
                  <th>Role & Access</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map(st => (
                  <tr key={st.id}>
                    <td><strong>{st.name}</strong></td>
                    <td>
                      <code style={{ fontSize: '13px', color: 'var(--accent-dark)', fontWeight: 700 }}>
                        {st.employee_code}
                      </code>
                    </td>
                    <td>
                      <span className={`role-pill ${st.role === 'supervisor' ? 'supervisor' : 'cashier'}`}>
                        {st.role === 'supervisor' ? '👑 Supervisor / Owner' : '🛒 Cashier'}
                      </span>
                    </td>
                    <td>
                      {st.is_active ? (
                        <span className="status-pill-active">● Active</span>
                      ) : (
                        <span className="status-pill-inactive">○ Deactivated</span>
                      )}
                    </td>
                    <td>
                      <div className="action-btn-group">
                        <button
                          type="button"
                          onClick={() => handleOpenEditStaff(st)}
                          className="btn-secondary"
                        >
                          ✏️ Edit / Change PIN
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStaffActive(st)}
                          className={st.is_active ? 'btn-danger-outline' : 'btn-success-outline'}
                        >
                          {st.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Discounts & Owner Approvals */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="settings-card-title">
              <h2>🛡️ Security & PIN Approvals</h2>
            </div>
          </div>

          <div className="settings-grid-2">
            <div className="settings-field">
              <label>Discount PIN Approval Threshold (₹)</label>
              <input
                type="number"
                name="DISCOUNT_PIN_THRESHOLD"
                value={settings.DISCOUNT_PIN_THRESHOLD || 500}
                onChange={handleChange}
              />
              <span className="field-hint">
                Discounts greater than ₹{settings.DISCOUNT_PIN_THRESHOLD || 500} prompt for Supervisor PIN.
              </span>
            </div>

            <div className="settings-field">
              <label>Rental Price Override Threshold (₹)</label>
              <input
                type="number"
                name="RENT_OVERRIDE_PIN_THRESHOLD"
                value={settings.RENT_OVERRIDE_PIN_THRESHOLD || 500}
                onChange={handleChange}
              />
              <span className="field-hint">
                Rental manual discounts exceeding ₹{settings.RENT_OVERRIDE_PIN_THRESHOLD || 500} require Supervisor PIN.
              </span>
            </div>
          </div>
        </div>

        {/* Section 4: Rental Policies */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="settings-card-title">
              <h2>👘 Bridal & Occasion Wear Rental Policies</h2>
            </div>
          </div>

          <div className="settings-grid-2">
            <div className="settings-field">
              <label>Per-Day Rental: Count Pickup Day</label>
              <select
                name="RENTAL_COUNT_PICKUP_DAY"
                value={settings.RENTAL_COUNT_PICKUP_DAY ?? '1'}
                onChange={handleChange}
              >
                <option value="1">Yes — Count pickup day (same day return = 1 day, 2 days = 2 days)</option>
                <option value="0">No — Calendar difference only (24hr blocks)</option>
              </select>
            </div>

            <div className="settings-field">
              <label>Early Return Policy (Per-Day)</label>
              <select
                name="RENTAL_EARLY_RETURN_REFUND"
                value={settings.RENTAL_EARLY_RETURN_REFUND ?? '0'}
                onChange={handleChange}
              >
                <option value="0">No automatic refund for early return (standard store policy)</option>
                <option value="1">Enable pro-rated refund for unused days (PER_DAY only)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="settings-footer">
          <button
            type="submit"
            disabled={saving}
            className="btn-save-settings"
          >
            {saving ? 'Saving...' : '💾 Save Boutique Settings'}
          </button>
        </div>
      </form>

      {/* Staff Add / Edit Modal */}
      {showStaffModal && (
        <div className="modal-overlay" onClick={() => setShowStaffModal(false)}>
          <div className="modal" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
            <h2>
              <span>{editingStaff ? `✏️ Edit ${editingStaff.name}` : '➕ Add New Staff Member'}</span>
              <button type="button" className="modal-close" onClick={() => setShowStaffModal(false)}>✕</button>
            </h2>

            {staffMsg && (
              <div className={`toast ${staffMsg.type}`} style={{ position: 'static', marginBottom: '16px' }}>
                {staffMsg.text}
              </div>
            )}

            <form onSubmit={handleSaveStaff}>
              <div className="form-group">
                <label>Staff Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kavita Sharma"
                  value={staffForm.name}
                  onChange={e => setStaffForm(prev => ({ ...prev, name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Employee Code / Login ID *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. EMP004"
                  value={staffForm.employee_code}
                  onChange={e => setStaffForm(prev => ({ ...prev, employee_code: e.target.value.toUpperCase() }))}
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                />
                <span className="field-hint">Used by staff to identify or select their login account</span>
              </div>

              <div className="form-group">
                <label>
                  {editingStaff ? 'New 4-Digit PIN (leave blank to keep current)' : '4-Digit Login PIN *'}
                </label>
                <input
                  type="password"
                  maxLength={6}
                  placeholder={editingStaff ? '•••• (leave blank to keep current)' : 'Enter 4-digit PIN'}
                  value={staffForm.pin}
                  onChange={e => setStaffForm(prev => ({ ...prev, pin: e.target.value }))}
                  style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '4px' }}
                  required={!editingStaff}
                />
              </div>

              <div className="form-group">
                <label>Role & Permissions *</label>
                <select
                  value={staffForm.role}
                  onChange={e => setStaffForm(prev => ({ ...prev, role: e.target.value }))}
                >
                  <option value="cashier">Cashier (Daily Billing, Scanner, Returns, Payments)</option>
                  <option value="supervisor">Supervisor / Owner (Reports, Settings, Staff, Overrides)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '14px 0' }}>
                <input
                  type="checkbox"
                  id="staff_active"
                  checked={staffForm.is_active}
                  onChange={e => setStaffForm(prev => ({ ...prev, is_active: e.target.checked }))}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="staff_active" style={{ fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  Account is Active (can login to POS)
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn secondary"
                  onClick={() => setShowStaffModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn primary"
                  disabled={staffSaving}
                >
                  {staffSaving ? 'Saving...' : editingStaff ? 'Save Changes' : 'Create Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
