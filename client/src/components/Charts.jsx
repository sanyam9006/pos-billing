import { useState } from 'react'
import { formatPrice } from '../utils/api'

/**
 * ══════════════════════════════════════════════════════════════════
 * 1. HOURLY SALES & RUSH HOURS BAR CHART (SVG)
 * Shows sales volume and transaction count across hours of the day
 * ══════════════════════════════════════════════════════════════════
 */
export function HourlySalesBarChart({ hourlyData = [], storeHours = { start: 9, end: 22 } }) {
  const [hovered, setHovered] = useState(null)

  // Map 0-23 hours to a full sequence or store hours
  const hoursMap = {}
  const safeData = Array.isArray(hourlyData) ? hourlyData : []
  safeData.forEach(h => {
    hoursMap[h.hour] = {
      hour: h.hour,
      sales: Number(h.total_sales || 0),
      count: Number(h.count || 0),
      items: Number(h.items_sold || 0)
    }
  })

  const startHour = Math.min(storeHours.start, ...Object.keys(hoursMap).map(Number))
  const endHour = Math.max(storeHours.end, ...Object.keys(hoursMap).map(Number))

  const hoursList = []
  let maxSales = 100 // minimum scale
  let peakHour = null
  let maxPeakSales = 0

  for (let h = startHour; h <= endHour; h++) {
    const data = hoursMap[h] || { hour: h, sales: 0, count: 0, items: 0 }
    hoursList.push(data)
    if (data.sales > maxSales) maxSales = data.sales
    if (data.sales > maxPeakSales && data.sales > 0) {
      maxPeakSales = data.sales
      peakHour = h
    }
  }

  const formatHourLabel = (h) => {
    if (h === 0) return '12 AM'
    if (h === 12) return '12 PM'
    return h > 12 ? `${h - 12} PM` : `${h} AM`
  }

  const chartHeight = 160
  const barWidth = 24
  const gap = 14
  const chartWidth = Math.max(500, hoursList.length * (barWidth + gap) + 40)

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div>
          <h4 className="chart-title">⏰ Hourly Sales & Peak Rush Hours</h4>
          <p className="chart-subtitle">
            Sales volume distributed by hour (Indian Standard Time)
          </p>
        </div>
        {peakHour !== null && (
          <div className="peak-hour-badge">
            🔥 Peak Rush: <strong>{formatHourLabel(peakHour)}</strong> ({formatPrice(maxPeakSales)})
          </div>
        )}
      </div>

      <div style={{ paddingBottom: '4px' }}>
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight + 45}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          <defs>
            <linearGradient id="barGradNormal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5B9BD5" />
              <stop offset="100%" stopColor="#366B9E" />
            </linearGradient>
            <linearGradient id="barGradPeak" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EAB308" />
              <stop offset="100%" stopColor="#CA8A04" />
            </linearGradient>
            <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="20" y1={chartHeight} x2={chartWidth - 10} y2={chartHeight} stroke="var(--border, #EDE7DD)" strokeWidth="1.5" />
          <line x1="20" y1={chartHeight / 2} x2={chartWidth - 10} y2={chartHeight / 2} stroke="var(--border-light, #F5EFE6)" strokeDasharray="3 3" />
          <line x1="20" y1="15" x2={chartWidth - 10} y2="15" stroke="var(--border-light, #F5EFE6)" strokeDasharray="3 3" />

          {/* Bars */}
          {hoursList.map((item, idx) => {
            const x = 30 + idx * (barWidth + gap)
            const barH = item.sales > 0 ? Math.max(6, (item.sales / maxSales) * (chartHeight - 30)) : 3
            const y = chartHeight - barH
            const isPeak = item.hour === peakHour
            const isHover = hovered?.hour === item.hour

            return (
              <g
                key={item.hour}
                onMouseEnter={() => setHovered(item)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Background hit area */}
                <rect
                  x={x - gap / 2}
                  y="0"
                  width={barWidth + gap}
                  height={chartHeight + 40}
                  fill="transparent"
                />

                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx="4"
                  fill={isHover ? 'url(#barGradHover)' : isPeak ? 'url(#barGradPeak)' : 'url(#barGradNormal)'}
                  style={{
                    transition: 'all 0.2s ease',
                    filter: isPeak ? 'drop-shadow(0 2px 6px rgba(202, 138, 4, 0.4))' : 'none'
                  }}
                />

                {/* Sales value on top of bar if active */}
                {item.sales > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill={isPeak ? '#CA8A04' : 'var(--text-primary, #2B2622)'}
                  >
                    ₹{item.sales >= 1000 ? `${(item.sales / 1000).toFixed(1)}k` : item.sales}
                  </text>
                )}

                {/* Hour label below */}
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 18}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight={isPeak ? '700' : '500'}
                  fill={isPeak ? '#CA8A04' : 'var(--text-muted, #7A7168)'}
                >
                  {formatHourLabel(item.hour)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Hover tooltip banner */}
      {hovered && (
        <div className="chart-tooltip-banner">
          <span>🕒 <strong>{formatHourLabel(hovered.hour)} - {formatHourLabel(hovered.hour + 1)}</strong></span>
          <span>💰 Sales: <strong>{formatPrice(hovered.sales)}</strong></span>
          <span>🧾 Bills: <strong>{hovered.count}</strong></span>
          {hovered.items > 0 && <span>👗 Items Sold: <strong>{hovered.items}</strong></span>}
        </div>
      )}
    </div>
  )
}

/**
 * ══════════════════════════════════════════════════════════════════
 * 2. PAYMENT METHOD DISTRIBUTION CHART (Donut / Segmented Progress)
 * ══════════════════════════════════════════════════════════════════
 */
export function PaymentDistributionChart({ payments = [], totalSales = 0 }) {
  const METHOD_COLORS = {
    cash: '#10B981', // Emerald
    upi: '#6366F1',  // Indigo
    card: '#F59E0B', // Amber
    split: '#8B5CF6',// Purple
    credit: '#EC4899'// Pink
  }

  const METHOD_ICONS = {
    cash: '💵',
    upi: '📱',
    card: '💳',
    split: '⚖️',
    credit: '📝'
  }

  const total = totalSales || payments.reduce((sum, p) => sum + Number(p.total || 0), 0) || 1

  return (
    <div className="chart-container">
      <h4 className="chart-title">💳 Payment Modes Distribution</h4>
      <p className="chart-subtitle">Breakdown of collected revenue by payment method</p>

      {/* Visual Multi-Segment Bar */}
      <div style={{ height: '20px', display: 'flex', borderRadius: '10px', overflow: 'hidden', margin: '14px 0 16px', background: 'var(--border-light, #F5EFE6)' }}>
        {payments.map(p => {
          const pct = Math.round((Number(p.total || 0) / total) * 100)
          if (pct <= 0) return null
          const color = METHOD_COLORS[p.method?.toLowerCase()] || '#94A3B8'
          return (
            <div
              key={p.method}
              style={{
                width: `${pct}%`,
                background: color,
                transition: 'width 0.4s ease'
              }}
              title={`${p.method.toUpperCase()}: ${formatPrice(p.total)} (${pct}%)`}
            />
          )
        })}
      </div>

      {/* Legend & Details */}
      <div className="payment-legend-grid">
        {payments.map(p => {
          const color = METHOD_COLORS[p.method?.toLowerCase()] || '#94A3B8'
          const icon = METHOD_ICONS[p.method?.toLowerCase()] || '💰'
          const pct = Math.round((Number(p.total || 0) / total) * 100)

          return (
            <div key={p.method} className="payment-legend-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>{icon}</span>
                <div>
                  <div style={{ fontWeight: 700, textTransform: 'capitalize', fontSize: '13px' }}>
                    {p.method.replace('_', ' ')}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {p.count} transaction{p.count !== 1 ? 's' : ''} ({pct}%)
                  </div>
                </div>
              </div>
              <div style={{ fontWeight: 800, fontSize: '15px', color }}>
                {formatPrice(p.total)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * ══════════════════════════════════════════════════════════════════
 * 3. DAILY SALES TREND CHART (Date Range Performance)
 * ══════════════════════════════════════════════════════════════════
 */
export function DailySalesTrendChart({ days = [] }) {
  const [hovered, setHovered] = useState(null)

  if (!days || days.length === 0) {
    return <div className="empty-chart">No daily transactions recorded in this period.</div>
  }

  const maxSales = Math.max(1000, ...days.map(d => Number(d.total_sales || 0)))
  const totalPeriodSales = days.reduce((sum, d) => sum + Number(d.total_sales || 0), 0)
  const avgSales = Math.round(totalPeriodSales / days.length)

  const chartHeight = 170
  const barWidth = Math.max(18, Math.min(36, Math.floor(600 / days.length) - 8))
  const gap = Math.max(8, Math.floor(barWidth / 2))
  const chartWidth = Math.max(500, days.length * (barWidth + gap) + 40)

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div>
          <h4 className="chart-title">📅 Daily Revenue Trend</h4>
          <p className="chart-subtitle">
            Sales trajectory across {days.length} days (Avg: <strong>{formatPrice(avgSales)}/day</strong>)
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Period: </span>
          <strong style={{ fontSize: '16px', color: 'var(--accent-secondary, #C9A227)' }}>{formatPrice(totalPeriodSales)}</strong>
        </div>
      </div>

      <div style={{ paddingBottom: '4px' }}>
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight + 45}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          <defs>
            <linearGradient id="dailyBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="dailyBarHover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="20" y1={chartHeight} x2={chartWidth - 10} y2={chartHeight} stroke="var(--border, #EDE7DD)" strokeWidth="1.5" />
          <line x1="20" y1={chartHeight / 2} x2={chartWidth - 10} y2={chartHeight / 2} stroke="var(--border-light, #F5EFE6)" strokeDasharray="3 3" />

          {/* Average sales benchmark line */}
          {avgSales > 0 && (
            <g>
              <line
                x1="20"
                y1={chartHeight - (avgSales / maxSales) * (chartHeight - 30)}
                x2={chartWidth - 10}
                y2={chartHeight - (avgSales / maxSales) * (chartHeight - 30)}
                stroke="#F59E0B"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <text
                x={chartWidth - 15}
                y={chartHeight - (avgSales / maxSales) * (chartHeight - 30) - 4}
                textAnchor="end"
                fontSize="9"
                fontWeight="700"
                fill="#D97706"
              >
                Avg {formatPrice(avgSales)}
              </text>
            </g>
          )}

          {/* Bars */}
          {days.map((item, idx) => {
            const x = 30 + idx * (barWidth + gap)
            const sales = Number(item.total_sales || 0)
            const barH = sales > 0 ? Math.max(6, (sales / maxSales) * (chartHeight - 30)) : 3
            const y = chartHeight - barH
            const isHover = hovered?.date === item.date

            const dateLabel = item.date.slice(5) // MM-DD

            return (
              <g
                key={item.date}
                onMouseEnter={() => setHovered(item)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={x - gap / 2}
                  y="0"
                  width={barWidth + gap}
                  height={chartHeight + 40}
                  fill="transparent"
                />

                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx="4"
                  fill={isHover ? 'url(#dailyBarHover)' : 'url(#dailyBarGrad)'}
                />

                {sales > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="700"
                    fill="var(--text-primary, #2B2622)"
                  >
                    ₹{sales >= 1000 ? `${(sales / 1000).toFixed(1)}k` : sales}
                  </text>
                )}

                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--text-muted, #7A7168)"
                >
                  {dateLabel}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {hovered && (
        <div className="chart-tooltip-banner">
          <span>📅 <strong>{hovered.date}</strong></span>
          <span>💰 Revenue: <strong>{formatPrice(hovered.total_sales)}</strong></span>
          <span>🧾 Transactions: <strong>{hovered.transactions}</strong></span>
        </div>
      )}
    </div>
  )
}

/**
 * ══════════════════════════════════════════════════════════════════
 * 4. TOP PRODUCTS RANKED PROGRESS BARS
 * ══════════════════════════════════════════════════════════════════
 */
export function TopProductsBarChart({ products = [] }) {
  if (!products || products.length === 0) return null

  const maxRev = Math.max(1, ...products.map(p => Number(p.revenue || 0)))
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="chart-container">
      <h4 className="chart-title">🏆 Top Selling Garments Ranking</h4>
      <p className="chart-subtitle">Ranked by revenue contribution with units sold</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
        {products.slice(0, 7).map((p, idx) => {
          const rev = Number(p.revenue || 0)
          const pct = Math.round((rev / maxRev) * 100)

          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px' }}>{medals[idx] || `${idx + 1}.`}</span>
                  <strong>{p.name}</strong>
                  {(p.variant_size || p.variant_color) && (
                    <span className="variant-tag size" style={{ fontSize: '10px', padding: '1px 5px' }}>
                      {[p.variant_size, p.variant_color].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {p.category && (
                    <span className="category-badge" style={{ fontSize: '10px', padding: '1px 6px' }}>
                      {p.category}
                    </span>
                  )}
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '10px' }}>
                    {p.qty_sold} sold
                  </span>
                  <strong style={{ color: 'var(--accent-secondary, #C9A227)', fontSize: '14px' }}>
                    {formatPrice(rev)}
                  </strong>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: '8px', background: 'var(--border-light, #F5EFE6)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: idx === 0 ? 'var(--accent-secondary, #C9A227)' : 'var(--accent, #5B9BD5)',
                    borderRadius: '4px',
                    transition: 'width 0.4s ease'
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * ══════════════════════════════════════════════════════════════════
 * 5. PROFIT MARGIN VISUAL METER & COST COMPARISON
 * ══════════════════════════════════════════════════════════════════
 */
export function ProfitMarginMeter({ marginPct = 0, revenue = 0, cost = 0, profit = 0 }) {
  const rev = Number(revenue || 0)
  const cst = Number(cost || 0)
  const pft = Number(profit || 0)
  const pct = Number(marginPct || 0)

  const isHealthy = pct >= 40
  const isModerate = pct >= 20 && pct < 40
  const meterColor = isHealthy ? '#10B981' : isModerate ? '#F59E0B' : '#EF4444'

  return (
    <div className="chart-container" style={{ background: 'var(--surface)' }}>
      <h4 className="chart-title">💰 Profit Margin & Cost Structure</h4>
      <p className="chart-subtitle">Gross profit margin vs cost of goods</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'center', marginTop: '16px' }}>
        {/* Margin Gauge Visual */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ position: 'relative', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke="var(--border-light, #F5EFE6)"
                strokeWidth="12"
                fill="none"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke={meterColor}
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${(Math.min(100, Math.max(0, pct)) / 100) * 251.2} 251.2`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.6s ease' }}
              />
            </svg>
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 800, color: meterColor, lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Gross Margin
              </div>
            </div>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
            {isHealthy ? '✅ Excellent boutique margin' : isModerate ? '⚡ Moderate margin' : '⚠️ Low margin warning'}
          </span>
        </div>

        {/* Cost vs Revenue Stacked Bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span>Gross Profit</span>
              <strong style={{ color: '#10B981' }}>{formatPrice(pft)}</strong>
            </div>
            <div style={{ height: '8px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: '#10B981' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span>Cost of Goods (COGS)</span>
              <strong style={{ color: 'var(--text-muted)' }}>{formatPrice(cst)}</strong>
            </div>
            <div style={{ height: '8px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${rev > 0 ? Math.min(100, Math.round((cst / rev) * 100)) : 0}%`, height: '100%', background: '#94A3B8' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span>Total Revenue</span>
              <strong style={{ color: 'var(--accent-dark, #4582BD)' }}>{formatPrice(rev)}</strong>
            </div>
            <div style={{ height: '8px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: 'var(--accent-dark, #4582BD)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
