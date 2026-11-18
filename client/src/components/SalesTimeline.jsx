import { useState } from 'react'
import { formatPrice } from '../utils/api'
import { formatTime, formatDate } from '../utils/date'

/**
 * ══════════════════════════════════════════════════════════════════
 * CHRONOLOGICAL SALES TIMELINE & AUDIT LOG ("When & What Was Sold")
 * ══════════════════════════════════════════════════════════════════
 */
export default function SalesTimeline({ timeline = [], title = 'Chronological Sales Timeline (When & What Was Sold)' }) {
  const [search, setSearch] = useState('')
  const [filterPayment, setFilterPayment] = useState('')

  const filtered = (timeline || []).filter(txn => {
    if (!txn) return false
    const s = search.toLowerCase()
    const matchesSearch =
      (txn.bill_number || '').toLowerCase().includes(s) ||
      (txn.customer_name || '').toLowerCase().includes(s) ||
      (txn.customer_phone || '').includes(search) ||
      (txn.cashier_name || '').toLowerCase().includes(s) ||
      (txn.items || []).some(i =>
        (i.name || '').toLowerCase().includes(s) ||
        (i.sku || '').toLowerCase().includes(s) ||
        (i.barcode || '').includes(search)
      )

    const matchesPayment = !filterPayment ||
      (txn.payments || []).some(p => p.method?.toLowerCase() === filterPayment.toLowerCase())

    return matchesSearch && matchesPayment
  })

  return (
    <div className="report-section" style={{ marginTop: '24px' }}>
      <div className="timeline-section-header">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🕒</span> {title}
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Real-time audit log of every bill, timestamp, cashier, customer, and exact garments sold
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="search-bar-wrapper" style={{ margin: 0, width: '260px' }}>
            <span className="search-icon-lg" style={{ fontSize: '13px' }}>🔍</span>
            <input
              type="text"
              placeholder="Search time, bill #, garment, customer..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-bar"
              style={{ padding: '6px 10px 6px 32px', fontSize: '12px' }}
            />
            {search && <button className="clear-search" onClick={() => setSearch('')}>✕</button>}
          </div>

          <select
            value={filterPayment}
            onChange={e => setFilterPayment(e.target.value)}
            className="search-bar"
            style={{ width: '130px', padding: '6px 8px', fontSize: '12px' }}
          >
            <option value="">All Payments</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-table" style={{ padding: '32px 16px', textAlign: 'center' }}>
          {timeline.length === 0
            ? 'No sales completed in this shift yet.'
            : 'No transactions matched your search criteria.'}
        </div>
      ) : (
        <div className="timeline-cards-list">
          {filtered.map(txn => {
            const timeStr = formatTime(txn.completed_at || txn.ist_completed_at)
            const dateStr = formatDate(txn.completed_at || txn.ist_completed_at)
            const payments = txn.payments || []

            return (
              <div key={txn.id} className="timeline-card">
                {/* Timeline Card Header */}
                <div className="timeline-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    {/* Timestamp Badge */}
                    <div className="timeline-time-badge">
                      <span className="time-icon">⏰</span>
                      <strong className="time-text">{timeStr}</strong>
                      <span className="date-sub">{dateStr}</span>
                    </div>

                    {/* Bill Number */}
                    <div className="timeline-bill-pill">
                      🧾 <code>{txn.bill_number}</code>
                    </div>

                    {/* Cashier Badge */}
                    <div className="timeline-cashier-pill">
                      👤 {txn.cashier_name || 'Staff'} ({txn.cashier_code || 'EMP'})
                    </div>

                    {/* Customer */}
                    <div className="timeline-customer-pill">
                      {txn.customer_name ? (
                        <>👥 <strong>{txn.customer_name}</strong> {txn.customer_phone ? `(${txn.customer_phone})` : ''}</>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>👥 Walk-in Customer</span>
                      )}
                    </div>

                    {/* Payment methods */}
                    {payments.map((p, pIdx) => (
                      <span key={pIdx} className={`timeline-payment-pill ${p.method}`}>
                        {p.method === 'cash' ? '💵 Cash' : p.method === 'upi' ? '📱 UPI' : p.method === 'card' ? '💳 Card' : '💰 Split'}
                        : {formatPrice(p.amount)}
                      </span>
                    ))}
                  </div>

                  {/* Grand Total */}
                  <div className="timeline-grand-total">
                    <div className="total-label">Final MRP</div>
                    <div className="total-amount">{formatPrice(txn.grand_total)}</div>
                    {txn.total_discount > 0 && (
                      <div className="discount-tag">
                        Saved {formatPrice(txn.total_discount)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Itemized Garments List */}
                <div className="timeline-items-box">
                  <div className="items-header-label">
                    👗 Garments & Items Sold ({txn.items?.length || 0}):
                  </div>

                  {(!txn.items || txn.items.length === 0) ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
                      Standard boutique counter sale ({formatPrice(txn.grand_total)})
                    </div>
                  ) : (
                    <div className="timeline-items-table-wrapper">
                      <table className="timeline-items-table">
                        <thead>
                          <tr>
                            <th>Item / Garment Name</th>
                            <th>SKU / Barcode</th>
                            <th>Variant</th>
                            <th>Qty</th>
                            <th className="num">Unit Price</th>
                            <th className="num">Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {txn.items.map((item, itemIdx) => (
                            <tr key={itemIdx} className={item.is_return ? 'return-item-row' : ''}>
                              <td>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {item.is_return && <span className="return-badge">↩️ Return</span>}
                                  {item.name || 'Boutique Garment'}
                                </div>
                                {item.category && (
                                  <span className="category-badge" style={{ fontSize: '9.5px', padding: '1px 5px' }}>
                                    {item.category}
                                  </span>
                                )}
                              </td>
                              <td>
                                <code style={{ fontSize: '11px' }}>{item.sku || '—'}</code>
                                {item.barcode && (
                                  <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-muted)' }}>
                                    {item.barcode}
                                  </div>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  {item.variant_size && <span className="variant-tag size">{item.variant_size}</span>}
                                  {item.variant_color && <span className="variant-tag color">{item.variant_color}</span>}
                                  {!item.variant_size && !item.variant_color && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                </div>
                              </td>
                              <td style={{ fontWeight: 700 }}>
                                {item.quantity} pcs
                              </td>
                              <td className="num">
                                {formatPrice(item.unit_price)}
                              </td>
                              <td className="num" style={{ fontWeight: 700, color: item.is_return ? '#DC2626' : 'var(--text-primary)' }}>
                                {item.is_return ? `-${formatPrice(item.line_total)}` : formatPrice(item.line_total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Notes / Discounts info */}
                  {txn.discount_reason && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#B45309' }}>
                      🏷️ Discount Reason: <strong>{txn.discount_reason}</strong>
                    </div>
                  )}
                  {txn.exchange_for_bill && (
                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#4338CA' }}>
                      🔄 Exchanged from original bill: <strong>{txn.exchange_for_bill}</strong>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
