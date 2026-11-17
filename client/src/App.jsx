import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Billing from './pages/Billing'
import Products from './pages/Products'
import Customers from './pages/Customers'
import Reports from './pages/Reports'
import Refunds from './pages/Refunds'

const SESSION_KEY = 'pos_cashier_session'

function App() {
  const [cashier, setCashier] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && parsed.id) setCashier(parsed)
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

  const isSupervisor = cashier.role === 'supervisor'

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout cashier={cashier} onLogout={handleLogout} />}>
          <Route path="/" element={<Dashboard cashier={cashier} />} />
          <Route path="/billing" element={<Billing cashier={cashier} onLogout={handleLogout} />} />
          <Route path="/products" element={<Products cashier={cashier} />} />
          <Route path="/customers" element={<Customers cashier={cashier} />} />
          {isSupervisor && (
            <>
              <Route path="/reports" element={<Reports cashier={cashier} />} />
              <Route path="/refunds" element={<Refunds cashier={cashier} />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
