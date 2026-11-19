import { useState, useEffect } from 'react'
import { getStoreConfig } from '../utils/api'

const API = '/api'

export default function Login({ onLogin }) {
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [storeName, setStoreName] = useState('House of Sadaya')
  const [storeLogo, setStoreLogo] = useState('')

  useEffect(() => {
    getStoreConfig().then(c => {
      if (c) {
        if (c.store_name) setStoreName(c.store_name)
        if (c.store_logo) setStoreLogo(c.store_logo)
      }
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_code: code, pin })
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      // Store token alongside cashier data
      onLogin({ ...data.cashier, token: data.token })
    } catch (err) {
      setError('Server connection failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          {storeLogo ? (
            <img
              src={storeLogo}
              alt="Store Logo"
              style={{
                width: 68,
                height: 68,
                objectFit: 'contain',
                borderRadius: '50%',
                marginBottom: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
              }}
            />
          ) : (
            <span className="icon">👗</span>
          )}
          <h1>{storeName}</h1>
          <p>Boutique Point of Sale</p>
        </div>

        {error && <div className="login-error">⚠️ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Employee Code</label>
            <input
              id="employee-code"
              type="text"
              placeholder="e.g. EMP001"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              autoFocus
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label>PIN</label>
            <input
              id="pin"
              type="password"
              placeholder="Enter 4-digit PIN"
              value={pin}
              onChange={e => setPin(e.target.value)}
              maxLength={4}
            />
          </div>
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? '⏳ Logging in...' : '🔐 Login to POS'}
          </button>
        </form>
      </div>
    </div>
  )
}
