const API = '/api'

// Store config — loaded once and cached
let _storeConfig = null
export async function getStoreConfig() {
  if (_storeConfig) return _storeConfig
  try {
    const res = await fetch('/api/config')
    _storeConfig = await res.json()
  } catch {
    _storeConfig = { store_name: 'POS System', currency_symbol: '₹', business_type: 'retail' }
  }
  return _storeConfig
}

// Fetch with auth — reads JWT from localStorage, auto-logout on 401
export async function authFetch(url, options = {}) {
  let token = ''
  try {
    const session = JSON.parse(localStorage.getItem('pos_cashier_session') || '{}')
    token = session.token || ''
  } catch {}

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  })

  if (res.status === 401) {
    localStorage.removeItem('pos_cashier_session')
    window.location.href = '/'
    throw new Error('Session expired')
  }
  return res
}

export function formatPrice(n) {
  return `₹${(n || 0).toFixed(2)}`
}

export { API }
