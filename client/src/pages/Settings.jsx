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
    THERMAL_WIDTH: '80mm'
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [backupMsg, setBackupMsg] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [showAudit, setShowAudit] = useState(false)

  useEffect(() => {
    loadSettings()
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

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading boutique settings...</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span>⚙️</span> Boutique Store Settings
          </h1>
          <p className="text-sm text-gray-500">Configure branding, print sizes, and store policies</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBackupNow}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-sm transition flex items-center gap-2 text-sm"
          >
            <span>📦</span> Backup Database Now
          </button>
          <button
            type="button"
            onClick={() => {
              if (showAudit) setShowAudit(false)
              else loadAuditLogs()
            }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium border text-sm transition"
          >
            {showAudit ? 'Hide Audit Log' : '🔍 View Audit Log'}
          </button>
        </div>
      </div>

      {backupMsg && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm flex items-center justify-between">
          <span>{backupMsg}</span>
          <button onClick={() => setBackupMsg(null)} className="text-blue-500 font-bold ml-4">✕</button>
        </div>
      )}

      {message && (
        <div className={`mb-6 p-4 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* Audit Log Modal / Panel */}
      {showAudit && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-800 text-base">📋 Security & Audit Trail (Last 100 Actions)</h3>
            <button onClick={() => setShowAudit(false)} className="text-gray-400 hover:text-gray-600">✕ Close</button>
          </div>
          <div className="max-h-60 overflow-y-auto border bg-white rounded-lg text-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="p-2">Timestamp</th>
                  <th className="p-2">Staff</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="p-2 text-gray-500 whitespace-nowrap">{log.created_at}</td>
                    <td className="p-2 font-medium">{log.cashier_name || 'Staff'}</td>
                    <td className="p-2 font-mono text-purple-700">{log.action}</td>
                    <td className="p-2 text-gray-600 truncate max-w-xs">{log.details_json}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Store Branding */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b flex items-center gap-2">
            <span>👗</span> Boutique Identity & Receipts
          </h2>
          <div className="flex items-center gap-4 mb-4 pb-4 border-b">
            <img
              src="/logo.png"
              alt="House of Sadaya Logo"
              style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'contain', background: '#fff', border: '1px solid #e5e7eb' }}
            />
            <div>
              <div className="font-bold text-gray-800 text-sm">Official Boutique Logo</div>
              <div className="text-xs text-gray-500">Active and printed at the top of every sales bill, rental agreement slip, and tailoring job card</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Store / Brand Name</label>
              <input
                type="text"
                name="STORE_NAME"
                value={settings.STORE_NAME}
                onChange={handleChange}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Store Phone / WhatsApp</label>
              <input
                type="text"
                name="STORE_PHONE"
                value={settings.STORE_PHONE}
                onChange={handleChange}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Store Address</label>
              <input
                type="text"
                name="STORE_ADDRESS"
                value={settings.STORE_ADDRESS}
                onChange={handleChange}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Bill / Invoice Number Prefix</label>
              <input
                type="text"
                name="BILL_PREFIX"
                value={settings.BILL_PREFIX}
                onChange={handleChange}
                className="w-full p-2.5 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="e.g. AB-, AURA-"
              />
              <span className="text-xs text-gray-400">Example: {settings.BILL_PREFIX}20261117-0001</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Receipt Print Width</label>
              <select
                name="THERMAL_WIDTH"
                value={settings.THERMAL_WIDTH}
                onChange={handleChange}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white"
              >
                <option value="80mm">80mm Thermal (Standard POS roll)</option>
                <option value="58mm">58mm Thermal (Compact roll)</option>
                <option value="a4">A4 Full Page (Desktop Printer)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Receipt Footer Note</label>
              <input
                type="text"
                name="FOOTER_TEXT"
                value={settings.FOOTER_TEXT}
                onChange={handleChange}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Discounts & Owner Approvals */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b flex items-center gap-2">
            <span>🛡️</span> Security & Approvals
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Discount PIN Approval Threshold (₹)
              </label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-2.5 text-gray-400 text-sm">₹</span>
                <input
                  type="number"
                  name="DISCOUNT_PIN_THRESHOLD"
                  value={settings.DISCOUNT_PIN_THRESHOLD || 500}
                  onChange={handleChange}
                  className="w-full p-2.5 pl-8 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <span className="text-xs text-gray-400 mt-1 block">
                Discounts exceeding ₹{settings.DISCOUNT_PIN_THRESHOLD || 500} require Supervisor PIN.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Rental Price Override PIN Threshold (₹)
              </label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-2.5 text-gray-400 text-sm">₹</span>
                <input
                  type="number"
                  name="RENT_OVERRIDE_PIN_THRESHOLD"
                  value={settings.RENT_OVERRIDE_PIN_THRESHOLD || 500}
                  onChange={handleChange}
                  className="w-full p-2.5 pl-8 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <span className="text-xs text-gray-400 mt-1 block">
                Rental manual price changes exceeding ₹{settings.RENT_OVERRIDE_PIN_THRESHOLD || 500} require Supervisor PIN.
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Rental Policies */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b flex items-center gap-2">
            <span>👘</span> Bridal & Occasion Wear Rental Policies
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Per-Day Rental: Count Pickup Day</label>
              <select
                name="RENTAL_COUNT_PICKUP_DAY"
                value={settings.RENTAL_COUNT_PICKUP_DAY ?? '1'}
                onChange={handleChange}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white"
              >
                <option value="1">Yes — Count pickup day (same day return = 1 day, 2 days = 2 days)</option>
                <option value="0">No — Calendar difference only (24hr blocks)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Early Return Policy (Per-Day)</label>
              <select
                name="RENTAL_EARLY_RETURN_REFUND"
                value={settings.RENTAL_EARLY_RETURN_REFUND ?? '0'}
                onChange={handleChange}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white"
              >
                <option value="0">No automatic refund for early return (store policy standard)</option>
                <option value="1">Enable pro-rated refund for unused days (PER_DAY only)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-4 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow transition disabled:opacity-50 text-base"
          >
            {saving ? 'Saving...' : '💾 Save Boutique Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
