import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getStoreConfig } from '../utils/api'

export default function Layout({ cashier, onLogout }) {
  const navigate = useNavigate()
  const isSupervisor = cashier?.role === 'supervisor'
  const [storeName, setStoreName] = useState('POS')

  useEffect(() => {
    getStoreConfig().then(c => setStoreName(c.store_name))
  }, [])

  const handleLogout = () => {
    onLogout()
    navigate('/')
  }

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo">🏪</span>
          <div>
            <div className="sidebar-title">{storeName}</div>
            <div className="sidebar-subtitle">Point of Sale</div>
          </div>
        </div>

        <div className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">📊</span>
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/billing" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">🛒</span>
            <span>Billing</span>
          </NavLink>
          <NavLink to="/products" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">📦</span>
            <span>Products</span>
          </NavLink>
          <NavLink to="/customers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">👥</span>
            <span>Customers</span>
          </NavLink>
          {isSupervisor && (
            <>
              <NavLink to="/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <span className="nav-icon">📈</span>
                <span>Reports</span>
              </NavLink>
              <NavLink to="/refunds" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <span className="nav-icon">↩️</span>
                <span>Refunds</span>
              </NavLink>
              <NavLink to="/purchase-orders" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <span className="nav-icon">🚚</span>
                <span>Procurement</span>
              </NavLink>
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{cashier?.name?.charAt(0)}</div>
            <div>
              <div className="user-name">{cashier?.name}</div>
              <div className="user-role">{cashier?.role} · {cashier?.employee_code}</div>
            </div>
          </div>
          <button className="sidebar-logout" onClick={handleLogout}>
            ⏏ Logout
          </button>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
