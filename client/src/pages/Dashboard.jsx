import { useState, useEffect } from 'react'
import { authFetch, formatPrice } from '../utils/api'

export default function Dashboard({ cashier }) {
  const [stats, setStats] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [loading, setLoading] = useState(true)
  const isSupervisor = cashier?.role === 'supervisor'

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      if (isSupervisor) {
        const [xRes, stockRes] = await Promise.all([
          authFetch('/api/reports/x-report'),
          authFetch('/api/reports/low-stock?threshold=15')
        ])
        setStats(await xRes.json())
        setLowStock((await stockRes.json()).products || [])
      }
    } catch {}
    setLoading(false)
  }

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good Morning' : now.getHours() < 17 ? 'Good Afternoon' : 'Good Evening'

  return (
    <div className="page dashboard-page">
      <div className="page-header">
        <div>
          <h1>{greeting}, {cashier?.name?.split(' ')[0]}! 👋</h1>
          <p className="page-subtitle">{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="header-badge">
          <span className={`role-badge ${cashier?.role}`}>{cashier?.role}</span>
        </div>
      </div>

      {isSupervisor && stats && (
        <>
          <div className="stats-grid">
            <div className="stat-card accent">
              <div className="stat-icon">💰</div>
              <div className="stat-info">
                <div className="stat-value">{formatPrice(stats.total_sales)}</div>
                <div className="stat-label">Today's Sales</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🧾</div>
              <div className="stat-info">
                <div className="stat-value">{stats.total_transactions}</div>
                <div className="stat-label">Transactions</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🏛️</div>
              <div className="stat-info">
                <div className="stat-value">{formatPrice(stats.total_tax)}</div>
                <div className="stat-label">Tax Collected</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🏷️</div>
              <div className="stat-info">
                <div className="stat-value">{formatPrice(stats.total_discounts)}</div>
                <div className="stat-label">Discounts Given</div>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            {/* Payment Breakdown */}
            <div className="dash-card">
              <h3>💳 Payment Methods Today</h3>
              {stats.payment_breakdown?.length > 0 ? (
                <div className="payment-breakdown">
                  {stats.payment_breakdown.map(p => (
                    <div key={p.method} className="breakdown-row">
                      <span className="breakdown-label">
                        {p.method === 'cash' ? '💵' : p.method === 'card' ? '💳' : '📱'} {p.method.toUpperCase()}
                      </span>
                      <span className="breakdown-count">{p.count} txns</span>
                      <span className="breakdown-amount">{formatPrice(p.total)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">No transactions yet today</p>
              )}
            </div>

            {/* Top Products */}
            <div className="dash-card">
              <h3>🏆 Top Products Today</h3>
              {stats.top_products?.length > 0 ? (
                <div className="top-products-list">
                  {stats.top_products.map((p, i) => (
                    <div key={i} className="top-product-row">
                      <span className="rank">#{i + 1}</span>
                      <span className="product-name">{p.name}</span>
                      <span className="product-qty">{p.qty_sold} sold</span>
                      <span className="product-rev">{formatPrice(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">No sales data yet</p>
              )}
            </div>
          </div>

          {/* Low Stock Alerts */}
          {lowStock.length > 0 && (
            <div className="dash-card alert-card">
              <h3>⚠️ Low Stock Alerts ({lowStock.length} items)</h3>
              <div className="low-stock-grid">
                {lowStock.map(p => (
                  <div key={p.id} className="low-stock-item">
                    <div>
                      <div className="ls-name">{p.name}</div>
                      <div className="ls-meta">{p.sku} · {p.category}</div>
                    </div>
                    <span className={`ls-qty ${p.stock_qty <= 5 ? 'critical' : 'warning'}`}>
                      {p.stock_qty} {p.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!isSupervisor && (
        <div className="cashier-dashboard">
          <div className="dash-card" style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>🛒</div>
            <h2>Ready to Bill</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
              Use the <strong>Billing</strong> page in the sidebar to start scanning items.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
