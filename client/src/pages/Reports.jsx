import { useState, useEffect } from 'react'
import { authFetch, formatPrice } from '../utils/api'

export default function Reports() {
  const [activeTab, setActiveTab] = useState('x-report')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10)
  })
  const [zDate, setZDate] = useState(new Date().toISOString().slice(0, 10))
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerHistory, setCustomerHistory] = useState(null)

  useEffect(() => {
    if (activeTab !== 'customer-history') {
      loadReport()
    }
  }, [activeTab, zDate])

  const loadReport = async () => {
    setLoading(true)
    try {
      let url = ''
      switch (activeTab) {
        case 'x-report': url = '/api/reports/x-report'; break
        case 'z-report': url = `/api/reports/z-report?date=${zDate}`; break
        case 'daily': url = `/api/reports/daily-sales?from=${dateRange.from}&to=${dateRange.to}`; break
        case 'profit': url = `/api/reports/profit?from=${dateRange.from}&to=${dateRange.to}`; break
        case 'top-products': url = `/api/reports/top-products?limit=20&from=${dateRange.from}&to=${dateRange.to}`; break
        case 'slow-movers': url = `/api/reports/slow-movers?days=30&max_sold=2`; break
        case 'cashier': url = `/api/reports/cashier-sales?from=${dateRange.from}&to=${dateRange.to}`; break
        case 'low-stock': url = '/api/reports/low-stock?threshold=20'; break
      }
      const res = await authFetch(url)
      setData(await res.json())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCustomerSearch = async () => {
    if (!customerPhone.trim()) return
    setLoading(true)
    try {
      const res = await authFetch(`/api/reports/customer-history/${encodeURIComponent(customerPhone.trim())}`)
      if (res.ok) {
        setCustomerHistory(await res.json())
      } else {
        setCustomerHistory({ error: 'Customer not found or no purchase records' })
      }
    } catch {
      setCustomerHistory({ error: 'Failed to fetch customer purchase history' })
    } finally {
      setLoading(false)
    }
  }

  const tabs = [
    { id: 'x-report', label: '📊 X Report', desc: 'Current shift' },
    { id: 'z-report', label: '📋 Z Report', desc: 'End of day' },
    { id: 'profit', label: '💰 Profit & Margin', desc: 'Cost vs Revenue' },
    { id: 'daily', label: '📅 Daily Sales', desc: 'Date range trends' },
    { id: 'top-products', label: '🏆 Top Sellers', desc: 'Best selling items' },
    { id: 'slow-movers', label: '🐢 Slow Movers', desc: 'Dead / low stock' },
    { id: 'customer-history', label: '👤 Customer Spend', desc: 'Visit & bill history' },
    { id: 'cashier', label: '👥 Staff Sales', desc: 'Per employee' },
    { id: 'low-stock', label: '⚠️ Low Stock', desc: 'Reorder alerts' }
  ]

  return (
    <div className="page reports-page">
      <div className="page-header">
        <div>
          <h1>📈 Boutique Reports & Analytics</h1>
          <p className="page-subtitle">Sales audits, profit margins, top sellers, and customer history</p>
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

      {['daily', 'profit', 'top-products', 'cashier'].includes(activeTab) && (
        <div className="date-controls flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label>From:</label>
            <input type="date" value={dateRange.from} onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))} />
            <label>To:</label>
            <input type="date" value={dateRange.to} onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))} />
            <button className="btn-primary btn-sm" onClick={loadReport}>Apply</button>
          </div>
        </div>
      )}

      {/* Customer history search bar */}
      {activeTab === 'customer-history' && (
        <div className="date-controls flex items-center gap-3">
          <label>Customer Mobile:</label>
          <input
            type="text"
            placeholder="e.g. 9876543210"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            className="p-1.5 border rounded text-sm font-mono"
          />
          <button className="btn-primary btn-sm" onClick={handleCustomerSearch}>Search History</button>
        </div>
      )}

      {loading && <div className="loading-state">Loading report data...</div>}

      {/* Report Content */}
      {!loading && data && (
        <div className="report-content">
          {/* ═══════════ PROFIT & MARGIN REPORT ═══════════ */}
          {activeTab === 'profit' && (
            <div>
              <div className="metric-cards mb-6">
                <div className="metric-card">
                  <div className="metric-label">Total Revenue</div>
                  <div className="metric-val text-blue-600">{formatPrice(data.total_revenue)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Total Cost of Goods</div>
                  <div className="metric-val text-gray-600">{formatPrice(data.total_cost)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Gross Profit</div>
                  <div className="metric-val text-emerald-600 font-bold">{formatPrice(data.gross_profit)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Overall Margin</div>
                  <div className="metric-val text-purple-600 font-bold">{data.overall_margin_pct}%</div>
                </div>
              </div>

              <div className="report-section">
                <h3>Product / Variant Profit Breakdown</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Garment / Variant</th>
                        <th>Units Sold</th>
                        <th>Cost / Unit</th>
                        <th>Total Cost</th>
                        <th>Revenue</th>
                        <th>Gross Profit</th>
                        <th>Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.items || []).map((p, i) => (
                        <tr key={i}>
                          <td>
                            <strong>{p.name}</strong>
                            {(p.variant_size || p.variant_color) && (
                              <div className="text-xs text-gray-500">Size: {p.variant_size || '—'} | Color: {p.variant_color || '—'}</div>
                            )}
                          </td>
                          <td>{p.units_sold}</td>
                          <td>{formatPrice(p.cost_price)}</td>
                          <td>{formatPrice(p.total_cost)}</td>
                          <td>{formatPrice(p.total_revenue)}</td>
                          <td className="font-bold text-emerald-700">{formatPrice(p.profit)}</td>
                          <td>
                            <span className={`badge ${p.margin_pct >= 40 ? 'badge-success' : 'badge-warning'}`}>
                              {p.margin_pct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ SLOW MOVERS REPORT ═══════════ */}
          {activeTab === 'slow-movers' && (
            <div className="report-section">
              <div className="flex justify-between items-center mb-4">
                <h3>🐢 Slow Movers & Inactive Garments (Last 30 Days)</h3>
                <span className="text-sm text-gray-500">{data.count} items found with ≤ {data.max_sold} sales</span>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Garment Name</th>
                      <th>SKU / Barcode</th>
                      <th>Category</th>
                      <th>Variant</th>
                      <th>Shelf Stock</th>
                      <th>Selling Price</th>
                      <th>Cost Price</th>
                      <th>Qty Sold (30d)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.products || []).map(p => (
                      <tr key={p.id}>
                        <td className="font-medium">{p.name}</td>
                        <td className="font-mono text-xs">{p.sku}<br/><span className="text-gray-400">{p.barcode}</span></td>
                        <td>{p.category}</td>
                        <td>{p.variant_size || '—'} / {p.variant_color || '—'}</td>
                        <td className="font-bold">{p.stock_qty}</td>
                        <td>{formatPrice(p.selling_price)}</td>
                        <td>{formatPrice(p.cost_price)}</td>
                        <td>
                          <span className="badge badge-danger">{p.qty_sold} sold</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════ X & Z REPORT OVERVIEWS ═══════════ */}
          {['x-report', 'z-report'].includes(activeTab) && (
            <div>
              <div className="metric-cards">
                <div className="metric-card">
                  <div className="metric-label">Total Transactions</div>
                  <div className="metric-val">{data.total_transactions}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Gross Sales</div>
                  <div className="metric-val text-green-600">{formatPrice(data.total_sales)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Total Discounts</div>
                  <div className="metric-val text-amber-600">{formatPrice(data.total_discounts)}</div>
                </div>
              </div>

              <div className="report-grid">
                <div className="report-section">
                  <h3>Payment Mode Breakdown</h3>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead><tr><th>Method</th><th>Count</th><th>Total</th></tr></thead>
                      <tbody>
                        {(data.payment_breakdown || []).map(p => (
                          <tr key={p.method}>
                            <td className="font-medium capitalize">{p.method.replace('_', ' ')}</td>
                            <td>{p.count}</td>
                            <td>{formatPrice(p.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="report-section">
                  <h3>Top Products</h3>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead><tr><th>Product</th><th>Sold</th><th>Revenue</th></tr></thead>
                      <tbody>
                        {(data.top_products || []).map((p, i) => (
                          <tr key={i}>
                            <td>{p.name} {p.variant_size && `(${p.variant_size})`}</td>
                            <td>{p.qty_sold}</td>
                            <td>{formatPrice(p.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ DAILY SALES ═══════════ */}
          {activeTab === 'daily' && data.days && (
            <div className="report-section">
              <h3>Daily Sales Performance</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Bills</th><th>Sales (MRP)</th></tr></thead>
                  <tbody>
                    {data.days.map(d => (
                      <tr key={d.date}>
                        <td className="font-mono">{d.date}</td>
                        <td>{d.transactions}</td>
                        <td className="font-bold">{formatPrice(d.total_sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════ TOP PRODUCTS ═══════════ */}
          {activeTab === 'top-products' && data.products && (
            <div className="report-section">
              <h3>Best Selling Garments</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>Garment Name</th><th>Category</th><th>Variant</th><th>Qty Sold</th><th>Orders</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {data.products.map((p, i) => (
                      <tr key={i}>
                        <td className="font-medium">{p.name}</td>
                        <td>{p.category}</td>
                        <td>{p.variant_size || '—'} / {p.variant_color || '—'}</td>
                        <td className="font-bold">{p.qty_sold}</td>
                        <td>{p.order_count}</td>
                        <td className="font-bold text-green-700">{formatPrice(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════ CASHIER SALES ═══════════ */}
          {activeTab === 'cashier' && data.cashiers && (
            <div className="report-section">
              <h3>Sales by Staff Member</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>Staff Name</th><th>Employee Code</th><th>Bills Created</th><th>Total Sales</th><th>Avg Bill</th></tr></thead>
                  <tbody>
                    {data.cashiers.map(c => (
                      <tr key={c.employee_code}>
                        <td className="font-medium">{c.name}</td>
                        <td className="font-mono">{c.employee_code}</td>
                        <td>{c.transactions}</td>
                        <td className="font-bold">{formatPrice(c.total_sales)}</td>
                        <td>{formatPrice(c.avg_bill)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════ LOW STOCK ═══════════ */}
          {activeTab === 'low-stock' && data.products && (
            <div className="report-section">
              <h3>Low Stock Garments (≤ {data.threshold} remaining)</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>Garment</th><th>SKU</th><th>Size / Color</th><th>Stock Qty</th><th>Selling Price</th></tr></thead>
                  <tbody>
                    {data.products.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td className="font-mono text-xs">{p.sku}</td>
                        <td>{p.variant_size || '—'} / {p.variant_color || '—'}</td>
                        <td><span className={`badge ${p.stock_qty <= 5 ? 'badge-danger' : 'badge-warning'}`}>{p.stock_qty} {p.unit}</span></td>
                        <td>{formatPrice(p.selling_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Customer History Tab Render */}
      {activeTab === 'customer-history' && (
        <div className="report-content">
          {customerHistory?.error && (
            <div className="empty-state text-red-600">{customerHistory.error}</div>
          )}
          {customerHistory?.customer && (
            <div>
              <div className="metric-cards mb-6">
                <div className="metric-card">
                  <div className="metric-label">Customer Name</div>
                  <div className="metric-val text-lg">{customerHistory.customer.name}</div>
                  <div className="text-xs text-gray-500">{customerHistory.customer.phone}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Membership Tier</div>
                  <div className="metric-val text-purple-600">{customerHistory.customer.membership_tier}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Total Lifetime Spend</div>
                  <div className="metric-val text-emerald-600">{formatPrice(customerHistory.total_spend)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Total Store Visits</div>
                  <div className="metric-val">{customerHistory.total_visits}</div>
                </div>
              </div>

              <div className="report-section">
                <h3>Past Invoices & Bills</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead><tr><th>Bill Number</th><th>Date</th><th>Discounts</th><th>Total Paid</th><th>Status</th></tr></thead>
                    <tbody>
                      {(customerHistory.bills || []).map(b => (
                        <tr key={b.id}>
                          <td className="font-mono font-medium">{b.bill_number}</td>
                          <td>{(b.completed_at || '').slice(0, 10)}</td>
                          <td>{formatPrice(b.total_discount)}</td>
                          <td className="font-bold text-green-700">{formatPrice(b.grand_total)}</td>
                          <td><span className="badge badge-success">{b.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
