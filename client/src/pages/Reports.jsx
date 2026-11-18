import { useState, useEffect } from 'react'
import { authFetch, formatPrice } from '../utils/api'
import {
  HourlySalesBarChart,
  PaymentDistributionChart,
  DailySalesTrendChart,
  TopProductsBarChart,
  ProfitMarginMeter
} from '../components/Charts'
import SalesTimeline from '../components/SalesTimeline'

export default function Reports() {
  const [activeTab, setActiveTab] = useState('x-report')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10)
  })
  const [zDate, setZDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedDayTimeline, setSelectedDayTimeline] = useState(null)
  const [loadingDayTimeline, setLoadingDayTimeline] = useState(false)
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerHistory, setCustomerHistory] = useState(null)

  useEffect(() => {
    if (activeTab !== 'customer-history') {
      loadReport()
    }
  }, [activeTab, zDate])

  const loadReport = async () => {
    setLoading(true)
    setSelectedDayTimeline(null)
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
        case 'rental-income': url = `/api/rentals/reports/income?from=${dateRange.from}&to=${dateRange.to}`; break
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

  const loadDayTimeline = async (dayDate) => {
    setLoadingDayTimeline(true)
    try {
      const res = await authFetch(`/api/reports/day-transactions?date=${dayDate}`)
      if (res.ok) {
        const result = await res.json()
        setSelectedDayTimeline(result)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingDayTimeline(false)
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
    { id: 'daily', label: '📅 Daily Sales', desc: 'Date range trends' },
    { id: 'profit', label: '💰 Profit & Margin', desc: 'Cost vs Revenue' },
    { id: 'top-products', label: '🏆 Top Sellers', desc: 'Best selling items' },
    { id: 'rental-income', label: '👘 Rental Income', desc: 'Per-day vs per-event' },
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
          <p className="page-subtitle">Real-time shift audits, hourly sales velocity, charts, and customer purchase history</p>
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

      {/* Date controls for Z-Report */}
      {activeTab === 'z-report' && (
        <div className="date-controls" style={{ margin: '14px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontWeight: 700, fontSize: '13px' }}>Audit Date:</label>
          <input
            type="date"
            value={zDate}
            onChange={e => setZDate(e.target.value)}
            className="search-bar"
            style={{ width: '180px', padding: '6px 10px' }}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Select any date to view historical EOD closing report & timeline</span>
        </div>
      )}

      {/* Date range controls for multi-day reports */}
      {['daily', 'profit', 'top-products', 'cashier', 'rental-income'].includes(activeTab) && (
        <div className="date-controls" style={{ margin: '14px 0', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontWeight: 700, fontSize: '13px' }}>From:</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="search-bar"
              style={{ width: '160px', padding: '6px 10px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontWeight: 700, fontSize: '13px' }}>To:</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="search-bar"
              style={{ width: '160px', padding: '6px 10px' }}
            />
          </div>
          <button className="btn-primary btn-sm" onClick={loadReport}>Apply Date Filter</button>
        </div>
      )}

      {/* Customer history search bar */}
      {activeTab === 'customer-history' && (
        <div className="date-controls" style={{ margin: '14px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontWeight: 700, fontSize: '13px' }}>Customer Mobile Number:</label>
          <input
            type="text"
            placeholder="e.g. 9876543210"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            className="search-bar"
            style={{ width: '220px', padding: '6px 10px', fontFamily: 'monospace' }}
          />
          <button className="btn-primary btn-sm" onClick={handleCustomerSearch}>🔍 Search History</button>
        </div>
      )}

      {loading && <div className="loading-state">Loading boutique analytics & charts...</div>}

      {/* Report Content */}
      {!loading && data && (
        <div className="report-content">

          {/* ═══════════════════════════════════════════════════════════════
              X REPORT (CURRENT SHIFT) & Z REPORT (END OF DAY)
              Includes Hourly Charts, Payment Donut, and Sales Timeline
             ═══════════════════════════════════════════════════════════════ */}
          {['x-report', 'z-report'].includes(activeTab) && (
            <div>
              {/* Top KPI Metric Cards */}
              <div className="metric-cards">
                <div className="metric-card gold">
                  <div className="metric-header">
                    <span className="metric-label">Gross Shift Sales</span>
                    <span className="metric-icon">💰</span>
                  </div>
                  <div className="metric-val" style={{ color: 'var(--accent-secondary, #C9A227)' }}>
                    {formatPrice(data.total_sales)}
                  </div>
                  <div className="metric-sub">Final MRP collected (0% tax)</div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-label">Completed Transactions</span>
                    <span className="metric-icon">🧾</span>
                  </div>
                  <div className="metric-val">{data.total_transactions}</div>
                  <div className="metric-sub">Total bills issued this shift</div>
                </div>

                <div className="metric-card green">
                  <div className="metric-header">
                    <span className="metric-label">Net Sales</span>
                    <span className="metric-icon">📈</span>
                  </div>
                  <div className="metric-val" style={{ color: '#10B981' }}>
                    {formatPrice(data.net_sales !== undefined ? data.net_sales : (data.total_sales - (data.refunds?.total || 0)))}
                  </div>
                  <div className="metric-sub">After subtracting refunds</div>
                </div>

                <div className="metric-card amber">
                  <div className="metric-header">
                    <span className="metric-label">Total Discounts Given</span>
                    <span className="metric-icon">🏷️</span>
                  </div>
                  <div className="metric-val" style={{ color: '#D97706' }}>
                    {formatPrice(data.total_discounts)}
                  </div>
                  <div className="metric-sub">Coupons & supervisor approvals</div>
                </div>
              </div>

              {/* Visual Charts Grid: Hourly Sales + Payment Breakdown */}
              <div className="report-grid-2">
                <HourlySalesBarChart hourlyData={data.hourly_sales || []} />
                <PaymentDistributionChart
                  payments={data.payment_breakdown || []}
                  totalSales={data.total_sales}
                />
              </div>

              {/* Cashier breakdown table for Z-Report */}
              {activeTab === 'z-report' && data.cashier_breakdown && data.cashier_breakdown.length > 0 && (
                <div className="report-section">
                  <h3>👥 Staff Sales Performance</h3>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Staff Name</th>
                          <th>Employee Code</th>
                          <th>Bills Created</th>
                          <th>Total Revenue</th>
                          <th>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cashier_breakdown.map(c => {
                          const sharePct = data.total_sales > 0 ? Math.round((c.total_sales / data.total_sales) * 100) : 0
                          return (
                            <tr key={c.employee_code}>
                              <td style={{ fontWeight: 600 }}>{c.name}</td>
                              <td><code className="sku-code">{c.employee_code}</code></td>
                              <td><strong>{c.transactions}</strong> bills</td>
                              <td className="num font-bold" style={{ color: 'var(--accent-secondary)' }}>
                                {formatPrice(c.total_sales)}
                              </td>
                              <td>
                                <span className="category-badge" style={{ fontSize: '11px' }}>{sharePct}%</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top Selling Products in Shift */}
              {data.top_products && data.top_products.length > 0 && (
                <TopProductsBarChart products={data.top_products} />
              )}

              {/* ══════════════════════════════════════════════════════════
                  CHRONOLOGICAL SALES TIMELINE ("When & What Was Sold")
                 ══════════════════════════════════════════════════════════ */}
              <SalesTimeline
                timeline={data.sales_timeline || []}
                title={activeTab === 'x-report' ? 'Current Shift Sales Log (When & What Was Sold)' : `End of Day Sales Log for ${data.date}`}
              />
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              DAILY SALES TRENDS
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'daily' && data.days && (
            <div>
              {/* Daily Trend Chart */}
              <DailySalesTrendChart days={data.days} />

              <div className="report-section" style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3>📅 Daily Performance Breakdown</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Click any day to view its detailed chronological sales audit log below
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Bills Completed</th>
                        <th>Total Revenue (MRP)</th>
                        <th>Avg Bill Size</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.days.map(d => {
                        const avg = d.transactions > 0 ? Math.round(d.total_sales / d.transactions) : 0
                        const isSelected = selectedDayTimeline?.date === d.date
                        return (
                          <tr key={d.date} className={isSelected ? 'selected-row' : ''}>
                            <td><strong style={{ fontFamily: 'monospace' }}>{d.date}</strong></td>
                            <td>{d.transactions} bills</td>
                            <td className="num font-bold" style={{ color: 'var(--accent-secondary)' }}>
                              {formatPrice(d.total_sales)}
                            </td>
                            <td className="num">{formatPrice(avg)}</td>
                            <td>
                              <button
                                className="btn-secondary btn-sm"
                                style={{ padding: '3px 8px', fontSize: '11px' }}
                                onClick={() => loadDayTimeline(d.date)}
                              >
                                🕒 View Timing & Items
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Drilldown Day Timeline */}
              {loadingDayTimeline && <div className="loading-state">Loading day's sales timeline...</div>}
              {selectedDayTimeline && !loadingDayTimeline && (
                <SalesTimeline
                  timeline={selectedDayTimeline.sales_timeline || []}
                  title={`Sales Audit Log for ${selectedDayTimeline.date} (${formatPrice(selectedDayTimeline.total_sales || 0)})`}
                />
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              PROFIT & MARGIN REPORT
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'profit' && (
            <div>
              <div className="metric-cards">
                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-label">Total Revenue</span>
                    <span className="metric-icon">💰</span>
                  </div>
                  <div className="metric-val" style={{ color: 'var(--accent-dark, #4582BD)' }}>
                    {formatPrice(data.total_revenue)}
                  </div>
                  <div className="metric-sub">Final MRP sales</div>
                </div>

                <div className="metric-card amber">
                  <div className="metric-header">
                    <span className="metric-label">Cost of Goods (COGS)</span>
                    <span className="metric-icon">📦</span>
                  </div>
                  <div className="metric-val" style={{ color: 'var(--text-muted)' }}>
                    {formatPrice(data.total_cost)}
                  </div>
                  <div className="metric-sub">Wholesale / manufacturing cost</div>
                </div>

                <div className="metric-card green">
                  <div className="metric-header">
                    <span className="metric-label">Gross Profit</span>
                    <span className="metric-icon">💵</span>
                  </div>
                  <div className="metric-val font-bold" style={{ color: '#10B981' }}>
                    {formatPrice(data.gross_profit)}
                  </div>
                  <div className="metric-sub">Revenue minus COGS</div>
                </div>

                <div className="metric-card purple">
                  <div className="metric-header">
                    <span className="metric-label">Overall Margin</span>
                    <span className="metric-icon">📊</span>
                  </div>
                  <div className="metric-val" style={{ color: '#8B5CF6' }}>
                    {data.overall_margin_pct}%
                  </div>
                  <div className="metric-sub">Profit margin percentage</div>
                </div>
              </div>

              {/* Profit Margin Visual Meter */}
              <ProfitMarginMeter
                marginPct={data.overall_margin_pct}
                revenue={data.total_revenue}
                cost={data.total_cost}
                profit={data.gross_profit}
              />

              {/* Product Variant Profit Breakdown Table */}
              <div className="report-section" style={{ marginTop: '20px' }}>
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
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                Size: {p.variant_size || '—'} | Color: {p.variant_color || '—'}
                              </div>
                            )}
                          </td>
                          <td>{p.units_sold} pcs</td>
                          <td>{formatPrice(p.cost_price)}</td>
                          <td>{formatPrice(p.total_cost)}</td>
                          <td className="num font-bold">{formatPrice(p.total_revenue)}</td>
                          <td className="num font-bold" style={{ color: '#10B981' }}>{formatPrice(p.profit)}</td>
                          <td>
                            <span className={`category-badge ${p.margin_pct >= 40 ? 'teal' : 'amber'}`}>
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

          {/* ═══════════════════════════════════════════════════════════════
              TOP PRODUCTS (BEST SELLERS)
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'top-products' && data.products && (
            <div>
              <TopProductsBarChart products={data.products} />

              <div className="report-section" style={{ marginTop: '20px' }}>
                <h3>Best Selling Garments Breakdown</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Garment Name</th>
                        <th>Category</th>
                        <th>Variant</th>
                        <th>Qty Sold</th>
                        <th>Orders</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.map((p, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td><span className="category-badge">{p.category}</span></td>
                          <td>{p.variant_size || '—'} / {p.variant_color || '—'}</td>
                          <td style={{ fontWeight: 700 }}>{p.qty_sold} pcs</td>
                          <td>{p.order_count} bills</td>
                          <td className="num font-bold" style={{ color: 'var(--accent-secondary)' }}>
                            {formatPrice(p.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              RENTAL INCOME
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'rental-income' && data.summary && (
            <div>
              <div className="metric-cards">
                <div className="metric-card green">
                  <div className="metric-header">
                    <span className="metric-label">Net Rental Revenue</span>
                    <span className="metric-icon">👘</span>
                  </div>
                  <div className="metric-val" style={{ color: '#10B981' }}>
                    {formatPrice(data.summary.net_rental_income)}
                  </div>
                  <div className="metric-sub">{data.summary.total_orders} total bookings</div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-label">☀️ Per-Day Rentals</span>
                    <span className="metric-icon">📅</span>
                  </div>
                  <div className="metric-val" style={{ color: 'var(--accent, #5B9BD5)' }}>
                    {formatPrice(data.summary.per_day_revenue)}
                  </div>
                  <div className="metric-sub">{data.summary.per_day_orders} daily rentals</div>
                </div>

                <div className="metric-card purple">
                  <div className="metric-header">
                    <span className="metric-label">🎉 Per-Event Rentals</span>
                    <span className="metric-icon">👑</span>
                  </div>
                  <div className="metric-val" style={{ color: '#8B5CF6' }}>
                    {formatPrice(data.summary.per_event_revenue)}
                  </div>
                  <div className="metric-sub">{data.summary.per_event_orders} fixed event rentals</div>
                </div>

                <div className="metric-card amber">
                  <div className="metric-header">
                    <span className="metric-label">Late Fees Collected</span>
                    <span className="metric-icon">⏰</span>
                  </div>
                  <div className="metric-val" style={{ color: '#D97706' }}>
                    {formatPrice(data.summary.total_late_fees)}
                  </div>
                  <div className="metric-sub">Overdue return penalties</div>
                </div>
              </div>

              <div className="report-section">
                <h3>Rental Bookings Breakdown ({data.orders ? data.orders.length : 0})</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Garment</th>
                        <th>Customer</th>
                        <th>Pricing Mode</th>
                        <th>Period</th>
                        <th>Rent Charged</th>
                        <th>Late Fee</th>
                        <th>Deposit Refunded</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.orders || []).map(o => (
                        <tr key={o.id}>
                          <td><code className="sku-code">{o.order_number}</code></td>
                          <td style={{ fontWeight: 600 }}>{o.item_name}</td>
                          <td>{o.customer_name} ({o.customer_phone})</td>
                          <td>
                            <span className={`category-badge ${o.pricing_mode === 'PER_DAY' ? 'teal' : 'purple'}`}>
                              {o.pricing_mode === 'PER_DAY' ? '☀️ Per Day' : '🎉 Per Event'} (₹{o.applied_rate})
                            </span>
                          </td>
                          <td style={{ fontSize: '11px' }}>{o.rent_date} to {o.due_date} ({o.billed_days}d)</td>
                          <td className="num font-bold" style={{ color: '#10B981' }}>{formatPrice(o.final_rent)}</td>
                          <td className="num" style={{ color: o.late_fee > 0 ? '#DC2626' : 'var(--text-muted)' }}>
                            {o.late_fee > 0 ? `+${formatPrice(o.late_fee)}` : '₹0.00'}
                          </td>
                          <td className="num">
                            {o.status === 'returned' ? formatPrice(o.deposit_refunded) : 'Held'}
                          </td>
                          <td>
                            <span className={`badge ${o.status === 'returned' ? 'badge-success' : 'badge-warning'}`}>
                              {o.status === 'returned' ? 'Returned' : 'Active'}
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

          {/* ═══════════════════════════════════════════════════════════════
              SLOW MOVERS REPORT
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'slow-movers' && (
            <div className="report-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3>🐢 Slow Movers & Inactive Garments (Last 30 Days)</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{data.count} items found with ≤ {data.max_sold} sales</span>
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
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td>
                          <code>{p.sku}</code>
                          <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-muted)' }}>{p.barcode}</div>
                        </td>
                        <td><span className="category-badge">{p.category}</span></td>
                        <td>{p.variant_size || '—'} / {p.variant_color || '—'}</td>
                        <td style={{ fontWeight: 700 }}>{p.stock_qty} pcs</td>
                        <td className="num">{formatPrice(p.selling_price)}</td>
                        <td className="num">{formatPrice(p.cost_price)}</td>
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

          {/* ═══════════════════════════════════════════════════════════════
              LOW STOCK REORDER ALERTS
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'low-stock' && data.products && (
            <div className="report-section">
              <h3>Low Stock Garments (≤ {data.threshold} remaining)</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Garment</th>
                      <th>SKU</th>
                      <th>Size / Color</th>
                      <th>Stock Qty</th>
                      <th>Selling Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td><code>{p.sku}</code></td>
                        <td>{p.variant_size || '—'} / {p.variant_color || '—'}</td>
                        <td>
                          <span className={`badge ${p.stock_qty <= 5 ? 'badge-danger' : 'badge-warning'}`}>
                            {p.stock_qty} {p.unit}
                          </span>
                        </td>
                        <td className="num">{formatPrice(p.selling_price)}</td>
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
            <div className="empty-table" style={{ color: '#DC2626' }}>{customerHistory.error}</div>
          )}
          {customerHistory?.customer && (
            <div>
              <div className="metric-cards">
                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-label">Customer Profile</span>
                    <span className="metric-icon">👤</span>
                  </div>
                  <div className="metric-val">{customerHistory.customer.name}</div>
                  <div className="metric-sub">{customerHistory.customer.phone}</div>
                </div>

                <div className="metric-card purple">
                  <div className="metric-header">
                    <span className="metric-label">Membership Tier</span>
                    <span className="metric-icon">⭐</span>
                  </div>
                  <div className="metric-val" style={{ color: '#8B5CF6' }}>
                    {customerHistory.customer.membership_tier}
                  </div>
                  <div className="metric-sub">{customerHistory.customer.loyalty_points || 0} loyalty points</div>
                </div>

                <div className="metric-card green">
                  <div className="metric-header">
                    <span className="metric-label">Total Lifetime Spend</span>
                    <span className="metric-icon">💰</span>
                  </div>
                  <div className="metric-val" style={{ color: '#10B981' }}>
                    {formatPrice(customerHistory.total_spend)}
                  </div>
                  <div className="metric-sub">Across all boutique purchases</div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-label">Store Visits</span>
                    <span className="metric-icon">🏪</span>
                  </div>
                  <div className="metric-val">{customerHistory.total_visits}</div>
                  <div className="metric-sub">Completed visits</div>
                </div>
              </div>

              <div className="report-section">
                <h3>Past Invoices & Bills</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Bill Number</th>
                        <th>Date & Time</th>
                        <th>Discounts</th>
                        <th>Total Paid</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(customerHistory.bills || []).map(b => (
                        <tr key={b.id}>
                          <td><code>{b.bill_number}</code></td>
                          <td>{(b.completed_at || '').slice(0, 19).replace('T', ' ')}</td>
                          <td>{formatPrice(b.total_discount)}</td>
                          <td className="num font-bold" style={{ color: 'var(--accent-secondary)' }}>
                            {formatPrice(b.grand_total)}
                          </td>
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
