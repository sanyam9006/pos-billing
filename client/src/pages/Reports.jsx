import { useState, useEffect } from 'react'
import { authFetch, formatPrice } from '../utils/api'

export default function Reports({ cashier }) {
  const [activeTab, setActiveTab] = useState('x-report')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10)
  })
  const [zDate, setZDate] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => { loadReport() }, [activeTab, zDate])

  const loadReport = async () => {
    setLoading(true)
    try {
      let url = ''
      switch (activeTab) {
        case 'x-report': url = '/api/reports/x-report'; break
        case 'z-report': url = `/api/reports/z-report?date=${zDate}`; break
        case 'daily': url = `/api/reports/daily-sales?from=${dateRange.from}&to=${dateRange.to}`; break
        case 'top-products': url = `/api/reports/top-products?limit=20&from=${dateRange.from}&to=${dateRange.to}`; break
        case 'cashier': url = `/api/reports/cashier-sales?from=${dateRange.from}&to=${dateRange.to}`; break
        case 'low-stock': url = '/api/reports/low-stock?threshold=20'; break
      }
      const res = await authFetch(url)
      setData(await res.json())
    } catch {}
    setLoading(false)
  }

  const tabs = [
    { id: 'x-report', label: '📊 X Report', desc: 'Current shift' },
    { id: 'z-report', label: '📋 Z Report', desc: 'End of day' },
    { id: 'daily', label: '📅 Daily Sales', desc: 'Date range' },
    { id: 'top-products', label: '🏆 Top Products', desc: 'Best sellers' },
    { id: 'cashier', label: '👥 Cashier Sales', desc: 'Per employee' },
    { id: 'low-stock', label: '⚠️ Low Stock', desc: 'Reorder alerts' },
  ]

  return (
    <div className="page reports-page">
      <div className="page-header">
        <div>
          <h1>📈 Reports & Analytics</h1>
          <p className="page-subtitle">Sales data and inventory insights</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="report-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`report-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-label">{tab.label}</span>
            <span className="tab-desc">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* Date controls */}
      {activeTab === 'z-report' && (
        <div className="date-controls">
          <label>Date:</label>
          <input type="date" value={zDate} onChange={e => setZDate(e.target.value)} />
        </div>
      )}
      {['daily', 'top-products', 'cashier'].includes(activeTab) && (
        <div className="date-controls">
          <label>From:</label>
          <input type="date" value={dateRange.from} onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))} />
          <label>To:</label>
          <input type="date" value={dateRange.to} onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))} />
          <button className="btn-primary btn-sm" onClick={loadReport}>Apply</button>
        </div>
      )}

      {/* Report Content */}
      <div className="report-content">
        {loading ? (
          <div className="loading-state">Loading report...</div>
        ) : !data ? (
          <div className="empty-state">Select a report</div>
        ) : (
          <>
            {/* X Report / Z Report */}
            {(activeTab === 'x-report' || activeTab === 'z-report') && (
              <div>
                <div className="report-summary-grid">
                  <div className="report-stat">
                    <div className="report-stat-value">{formatPrice(data.total_sales)}</div>
                    <div className="report-stat-label">Total Sales</div>
                  </div>
                  <div className="report-stat">
                    <div className="report-stat-value">{data.total_transactions}</div>
                    <div className="report-stat-label">Transactions</div>
                  </div>
                  <div className="report-stat">
                    <div className="report-stat-value">{formatPrice(data.total_tax)}</div>
                    <div className="report-stat-label">Tax Collected</div>
                  </div>
                  <div className="report-stat">
                    <div className="report-stat-value">{formatPrice(data.total_discounts)}</div>
                    <div className="report-stat-label">Discounts</div>
                  </div>
                  {data.net_sales != null && (
                    <div className="report-stat accent">
                      <div className="report-stat-value">{formatPrice(data.net_sales)}</div>
                      <div className="report-stat-label">Net Sales</div>
                    </div>
                  )}
                  {data.refunds && (
                    <div className="report-stat">
                      <div className="report-stat-value">{data.refunds.count} ({formatPrice(data.refunds.total)})</div>
                      <div className="report-stat-label">Refunds</div>
                    </div>
                  )}
                </div>

                {data.payment_breakdown?.length > 0 && (
                  <div className="report-section">
                    <h3>Payment Breakdown</h3>
                    <table className="data-table compact">
                      <thead><tr><th>Method</th><th>Count</th><th>Total</th></tr></thead>
                      <tbody>
                        {data.payment_breakdown.map(p => (
                          <tr key={p.method}>
                            <td>{p.method.toUpperCase()}</td>
                            <td className="num">{p.count}</td>
                            <td className="num">{formatPrice(p.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {data.cashier_breakdown?.length > 0 && (
                  <div className="report-section">
                    <h3>Cashier Breakdown</h3>
                    <table className="data-table compact">
                      <thead><tr><th>Cashier</th><th>Code</th><th>Txns</th><th>Sales</th></tr></thead>
                      <tbody>
                        {data.cashier_breakdown.map(c => (
                          <tr key={c.employee_code}>
                            <td>{c.name}</td>
                            <td><code>{c.employee_code}</code></td>
                            <td className="num">{c.transactions}</td>
                            <td className="num">{formatPrice(c.total_sales)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {data.top_products?.length > 0 && (
                  <div className="report-section">
                    <h3>Top Products</h3>
                    <table className="data-table compact">
                      <thead><tr><th>#</th><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
                      <tbody>
                        {data.top_products.map((p, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>{p.name}</td>
                            <td className="num">{p.qty_sold}</td>
                            <td className="num">{formatPrice(p.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Daily Sales */}
            {activeTab === 'daily' && (
              <div>
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Transactions</th><th>Sales</th><th>Tax</th></tr></thead>
                  <tbody>
                    {data.days?.map(d => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td className="num">{d.transactions}</td>
                        <td className="num">{formatPrice(d.total_sales)}</td>
                        <td className="num">{formatPrice(d.total_tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!data.days || data.days.length === 0) && <div className="empty-table">No sales in this date range</div>}
              </div>
            )}

            {/* Top Products */}
            {activeTab === 'top-products' && (
              <table className="data-table">
                <thead><tr><th>#</th><th>Product</th><th>SKU</th><th>Category</th><th>Qty Sold</th><th>Orders</th><th>Revenue</th></tr></thead>
                <tbody>
                  {data.products?.map((p, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{p.name}</td>
                      <td><code>{p.sku}</code></td>
                      <td><span className="category-badge">{p.category}</span></td>
                      <td className="num">{p.qty_sold}</td>
                      <td className="num">{p.order_count}</td>
                      <td className="num">{formatPrice(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Cashier Sales */}
            {activeTab === 'cashier' && (
              <table className="data-table">
                <thead><tr><th>Cashier</th><th>Code</th><th>Transactions</th><th>Total Sales</th><th>Avg Bill</th></tr></thead>
                <tbody>
                  {data.cashiers?.map(c => (
                    <tr key={c.employee_code}>
                      <td>{c.name}</td>
                      <td><code>{c.employee_code}</code></td>
                      <td className="num">{c.transactions}</td>
                      <td className="num">{formatPrice(c.total_sales)}</td>
                      <td className="num">{formatPrice(c.avg_bill)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Low Stock */}
            {activeTab === 'low-stock' && (
              <div>
                <p className="report-note">Products with stock ≤ {data.threshold} units ({data.count} items)</p>
                <table className="data-table">
                  <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Stock</th></tr></thead>
                  <tbody>
                    {data.products?.map(p => (
                      <tr key={p.id} className={p.stock_qty <= 5 ? 'critical-row' : ''}>
                        <td>{p.name}</td>
                        <td><code>{p.sku}</code></td>
                        <td><span className="category-badge">{p.category}</span></td>
                        <td>
                          <span className={`stock-badge ${p.stock_qty <= 0 ? 'out' : p.stock_qty <= 5 ? 'low' : 'warning-stock'}`}>
                            {p.stock_qty} {p.unit}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
