import { useState, useEffect } from 'react'
import { authFetch } from '../utils/api'

export default function Customers({ cashier }) {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { loadCustomers() }, [])

  const notify = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadCustomers = async () => {
    try {
      // Search all customers — use a wide search or fetch from a listing endpoint
      // Since we don't have a GET /api/customers list, let's search with broad terms
      const res = await authFetch('/api/customers/all')
      if (res.ok) {
        setCustomers(await res.json())
      }
    } catch {}
    setLoading(false)
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const tierColor = {
    Silver: '#8E8E93',
    Gold: '#C9A227',
    Platinum: '#5B9BD5'
  }

  return (
    <div className="page customers-page">
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1>👥 Customers</h1>
          <p className="page-subtitle">{customers.length} registered customers</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + Add Customer
        </button>
      </div>

      <div className="search-bar-wrapper">
        <span className="search-icon-lg">🔍</span>
        <input
          className="search-bar"
          type="text"
          placeholder="Search by name, phone, or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && <button className="clear-search" onClick={() => setSearch('')}>✕</button>}
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Tier</th>
              <th>Loyalty Points</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td><code>{c.phone}</code></td>
                <td>{c.email || '—'}</td>
                <td>
                  <span className="tier-badge" style={{ background: `${tierColor[c.membership_tier]}20`, color: tierColor[c.membership_tier], border: `1px solid ${tierColor[c.membership_tier]}40` }}>
                    {c.membership_tier}
                  </span>
                </td>
                <td className="num">
                  <span className="points-badge">⭐ {c.loyalty_points}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && !loading && (
          <div className="empty-table">No customers found</div>
        )}
      </div>

      {showForm && (
        <AddCustomerModal
          onClose={() => setShowForm(false)}
          onDone={() => { setShowForm(false); loadCustomers() }}
          notify={notify}
        />
      )}
    </div>
  )
}

function AddCustomerModal({ onClose, onDone, notify }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await authFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify({ name, phone, email: email || undefined })
      })
      if (res.ok || res.status === 201) {
        notify('Customer created')
        onDone()
      } else {
        const data = await res.json()
        notify(data.error, 'error')
      }
    } catch { notify('Failed to create customer', 'error') }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>➕ New Customer <button className="modal-close" onClick={onClose}>✕</button></h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Name *</label><input value={name} onChange={e => setName(e.target.value)} required autoFocus /></div>
          <div className="form-group"><label>Phone * (10 digits)</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required maxLength={10} /></div>
          <div className="form-group"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Optional" /></div>
          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn primary" disabled={saving || !name || phone.length < 10}>
              {saving ? '⏳ Creating...' : '✅ Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
