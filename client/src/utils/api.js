const API = '/api'

// Store config — loaded and cached, can be invalidated on settings update
let _storeConfig = null
export async function getStoreConfig(forceRefresh = false) {
  if (_storeConfig && !forceRefresh) return _storeConfig
  try {
    const res = await fetch('/api/config')
    _storeConfig = await res.json()
  } catch {
    _storeConfig = { store_name: 'House of Sadaya', currency_symbol: '₹', business_type: 'boutique' }
  }
  return _storeConfig
}

export function clearStoreConfigCache() {
  _storeConfig = null
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
