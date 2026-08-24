import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Billing from './pages/Billing'

const SESSION_KEY = 'pos_cashier_session'

function App() {
  const [cashier, setCashier] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && parsed.id) {
          setCashier(parsed)
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY)
    }
    setLoading(false)
  }, [])

  const handleLogin = (cashierData) => {
    setCashier(cashierData)
    localStorage.setItem(SESSION_KEY, JSON.stringify(cashierData))
  }

  const handleLogout = () => {
    setCashier(null)
    localStorage.removeItem(SESSION_KEY)
  }

  if (loading) return null

  if (!cashier) {
    return <Login onLogin={handleLogin} />
  }

  return <Billing cashier={cashier} onLogout={handleLogout} />
}

export default App
