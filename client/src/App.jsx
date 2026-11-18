import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Billing from './pages/Billing'
import Products from './pages/Products'
import Customers from './pages/Customers'
import Reports from './pages/Reports'
import Refunds from './pages/Refunds'
import PurchaseOrders from './pages/PurchaseOrders'
import CustomOrders from './pages/CustomOrders'
import Rentals from './pages/Rentals'
import Settings from './pages/Settings'

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

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #FAF7F2)' }}>
        <div style={{ color: 'var(--text-muted, #7A7168)', fontSize: '14px', fontWeight: 600 }}>Loading POS...</div>
      </div>
    )
  }

  if (!cashier) {
    return <Login onLogin={handleLogin} />
  }

  const isSupervisor = cashier.role === 'supervisor'

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout cashier={cashier} onLogout={handleLogout} />}>
            <Route path="/" element={<Dashboard cashier={cashier} />} />
            <Route path="/billing" element={<Billing cashier={cashier} onLogout={handleLogout} />} />
            <Route path="/products" element={<Products cashier={cashier} />} />
            <Route path="/customers" element={<Customers cashier={cashier} />} />
            <Route path="/custom-orders" element={<CustomOrders cashier={cashier} />} />
            <Route path="/rentals" element={<Rentals cashier={cashier} />} />
            {isSupervisor && (
              <>
                <Route path="/reports" element={<Reports cashier={cashier} />} />
                <Route path="/refunds" element={<Refunds cashier={cashier} />} />
                <Route path="/purchase-orders" element={<PurchaseOrders cashier={cashier} />} />
                <Route path="/settings" element={<Settings cashier={cashier} />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
