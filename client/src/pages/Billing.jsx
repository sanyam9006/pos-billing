import { useState, useEffect, useRef, useCallback } from 'react'
import { authFetch, API, formatPrice } from '../utils/api'

export default function Billing({ cashier, onLogout }) {
  const [txn, setTxn] = useState(null)
  const [items, setItems] = useState([])
  const [customer, setCustomer] = useState(null)
  const [coupon, setCoupon] = useState(null)
  const [scanInput, setScanInput] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [toast, setToast] = useState(null)
  const [clock, setClock] = useState(new Date())

  // Modals
  const [showPayment, setShowPayment] = useState(null) // 'cash','card','upi','split'
  const [showCustomer, setShowCustomer] = useState(false)
  const [showCoupon, setShowCoupon] = useState(false)
  const [showReceipt, setShowReceipt] = useState(null)
  const [showHeld, setShowHeld] = useState(false)

  const scanRef = useRef(null)

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Restore active transaction or create new one on mount
  useEffect(() => {
    const restoreOrCreate = async () => {
      try {
        // Try to restore an existing active transaction for this cashier
        const res = await authFetch(`${API}/transactions/active/${cashier.id}`)
        const data = await res.json()
        if (data && data.id) {
          setTxn(data)
          setItems(data.items || [])
          setCustomer(data.customer || null)
          setCoupon(data.coupon || null)
          return
        }
      } catch {}
      // No active transaction found — create a new one
      createNewBill()
    }
    restoreOrCreate()
  }, [])

  // Focus scan input
  useEffect(() => {
    if (scanRef.current && !showPayment && !showCustomer && !showCoupon && !showReceipt && !showHeld) {
      scanRef.current.focus()
    }
  }, [showPayment, showCustomer, showCoupon, showReceipt, showHeld, items])

  const notify = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const createNewBill = async () => {
    try {
      const res = await authFetch(`${API}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashier_id: cashier.id })
      })
      const data = await res.json()
      setTxn(data)
      setItems([])
      setCustomer(null)
      setCoupon(null)
    } catch { notify('Failed to create bill', 'error') }
  }

  const handleScan = async (e) => {
    e.preventDefault()
    const input = scanInput.trim()
    if (!input || !txn) return

    // Try barcode scan first
    try {
      let res = await authFetch(`${API}/products/scan/${input}`)
      if (res.ok) {
        const product = await res.json()
        await addItemToCart(product)
        setScanInput('')
        setSearchResults([])
        return
      }

      // Try search
      res = await authFetch(`${API}/products/search?q=${encodeURIComponent(input)}`)
      if (res.ok) {
        const results = await res.json()
        if (results.length === 1) {
          await addItemToCart(results[0])
          setScanInput('')
          setSearchResults([])
        } else if (results.length > 1) {
          setSearchResults(results)
        } else {
          notify('Item not found — try manual entry', 'error')
        }
      }
    } catch { notify('Scan failed', 'error') }
  }

  const handleSearchInput = async (val) => {
    setScanInput(val)
    if (val.length >= 2) {
      try {
        const res = await authFetch(`${API}/products/search?q=${encodeURIComponent(val)}`)
        if (res.ok) {
          const results = await res.json()
          setSearchResults(results)
        }
      } catch {}
    } else {
      setSearchResults([])
    }
  }

  const addItemToCart = async (product) => {
    try {
      let currentTxn = txn
      if (!currentTxn) {
        const createRes = await authFetch(`${API}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cashier_id: cashier?.id || 1 })
        })
        currentTxn = await createRes.json()
        setTxn(currentTxn)
      }

      const res = await authFetch(`${API}/transactions/${currentTxn.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, quantity: 1 })
      })
      const data = await res.json()
      if (!res.ok) {
        notify(data.error || 'Failed to add item', 'error')
        return
      }
      setTxn(data)
      setItems(data.items || [])

      // Show stock warnings if any
      if (data.warnings && data.warnings.length > 0) {
        data.warnings.forEach(w => notify(w, 'warning'))
      } else {
        notify(`✅ ${product.name} added`)
      }

      // Beep
      try { new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=').play() } catch {}
    } catch (err) {
      console.error(err)
      notify('Failed to add item', 'error')
    }
  }

  const updateQty = async (itemId, newQty) => {
    try {
      const res = await authFetch(`${API}/transactions/${txn.id}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQty })
      })
      const data = await res.json()
      if (!res.ok) {
        notify(data.error || 'Failed to update', 'error')
        return
      }
      setTxn(data)
      setItems(data.items)
    } catch { notify('Failed to update', 'error') }
  }

  const voidItem = async (itemId) => {
    try {
      const res = await authFetch(`${API}/transactions/${txn.id}/items/${itemId}`, { method: 'DELETE' })
      const data = await res.json()
      setTxn(data)
      setItems(data.items)
      notify('Item voided', 'warning')
    } catch { notify('Failed to void item', 'error') }
  }

  const holdBill = async () => {
    if (!txn || items.length === 0) return
    try {
      await authFetch(`${API}/transactions/${txn.id}/hold`, { method: 'PUT' })
      notify('🔒 Bill held')
      createNewBill()
    } catch { notify('Failed to hold bill', 'error') }
  }

  const recallBill = async (id) => {
    try {
      // Hold current if has items
      if (txn && items.length > 0) {
        await authFetch(`${API}/transactions/${txn.id}/hold`, { method: 'PUT' })
      }
      const res = await authFetch(`${API}/transactions/${id}/recall`, { method: 'PUT' })
      const data = await res.json()
      setTxn(data)
      setItems(data.items || [])
      setShowHeld(false)
      notify('📋 Bill recalled')
    } catch { notify('Failed to recall', 'error') }
  }

  const applyCoupon = async (code) => {
    try {
      const res = await authFetch(`${API}/transactions/${txn.id}/coupon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      const data = await res.json()
      if (!res.ok) {
        notify(data.error, 'error')
        return
      }
      setTxn(data)
      setItems(data.items)
      setCoupon(data.coupon_applied)
      setShowCoupon(false)
      notify(`🏷️ Coupon ${code} applied!`)
    } catch { notify('Failed to apply coupon', 'error') }
  }

  const removeCoupon = async () => {
    try {
      await authFetch(`${API}/transactions/${txn.id}/coupon`, { method: 'DELETE' })
      setCoupon(null)
      // Refresh txn
      const res = await authFetch(`${API}/transactions/${txn.id}`)
      const data = await res.json()
      setTxn(data)
      setItems(data.items)
      notify('Coupon removed')
    } catch {}
  }

  const linkCustomer = async (customerData) => {
    // Link to transaction
    try {
      await authFetch(`${API}/transactions/${txn.id}/customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerData.id })
      })
      setCustomer(customerData)
      setShowCustomer(false)
      notify(`👤 ${customerData.name} linked`)
    } catch { notify('Failed to link customer', 'error') }
  }

  const processPayment = async (method, tendered, refNumber) => {
    try {
      if (method === 'store_credit' && refNumber) {
        try {
          await authFetch('/api/credit-notes/redeem', {
            method: 'POST',
            body: JSON.stringify({
              note_number: refNumber,
              amount_to_use: txn.grand_total
            })
          })
        } catch (_) {}
      }

      const res = await authFetch(`${API}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txn_id: txn.id,
          method,
          amount: txn.grand_total,
          tendered: method === 'cash' ? parseFloat(tendered) : txn.grand_total,
          reference_number: refNumber || (method !== 'cash' ? `REF${Date.now()}` : null)
        })
      })
      const data = await res.json()
      if (!res.ok) {
        notify(data.error, 'error')
        return
      }
      setShowPayment(null)
      // Show receipt
      const receiptRes = await authFetch(`${API}/payments/receipt/${txn.id}`)
      const receipt = await receiptRes.json()
      setShowReceipt({ ...receipt, change: data.change })
    } catch { notify('Payment failed', 'error') }
  }

  const closeReceipt = () => {
    setShowReceipt(null)
    createNewBill()
  }


  const fmtTime = (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fmtDate = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="billing-screen">
      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* Header */}
      <header className="pos-header">
        <div className="store-info">
          <span className="store-icon">🛒</span>
          <span className="store-name">Billing</span>
        </div>
        <div className="header-center">
          <div className="header-info">
            📅 <span className="value">{fmtDate(clock)}</span>
          </div>
          <div className="header-info">
            🕐 <span className="value">{fmtTime(clock)}</span>
          </div>
        </div>
        <div className="header-right">
          {txn && <span className="bill-badge">{txn.bill_number}</span>}
        </div>
      </header>

      {/* Main area */}
      <div className="billing-main">
        {/* Left: Cart */}
        <div className="cart-section">
          {/* Scan bar */}
          <div className="scan-bar">
            <form className="scan-input-wrapper" onSubmit={handleScan}>
              <span className="scan-icon">🔍</span>
              <input
                ref={scanRef}
                className="scan-input"
                type="text"
                placeholder="Scan barcode or search item..."
                value={scanInput}
                onChange={e => handleSearchInput(e.target.value)}
                autoComplete="off"
                id="scan-input"
              />
              {searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map(p => (
                    <div
                      key={p.id}
                      className="search-result-item"
                      onClick={() => {
                        addItemToCart(p)
                        setScanInput('')
                        setSearchResults([])
                      }}
                    >
                      <div>
                        <div className="sr-name">{p.name}</div>
                        <div className="sr-meta">{p.category} · {p.barcode} · Stock: {p.stock_qty}</div>
                      </div>
                      <div className="sr-price">{formatPrice(p.selling_price)}</div>
                    </div>
                  ))}
                </div>
              )}
            </form>
            <button className="search-btn" onClick={handleScan}>Add ⏎</button>
          </div>

          {/* Cart list */}
          <div className="cart-list">
            {items.length === 0 ? (
              <div className="cart-empty">
                <span className="empty-icon">🛒</span>
                <p>Scan items to start billing</p>
              </div>
            ) : (
              <table className="cart-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item</th>
                    <th className="center">Qty</th>
                    <th>Price</th>
                    <th>Tax</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td>
                        <div className="item-name">{item.product_name}</div>
                        <div className="item-meta">
                          {item.sku} · {item.hsn_code}
                          {item.stock_qty !== undefined && item.stock_qty <= 10 && (
                            <span className="low-stock-badge"> · ⚠️ {item.stock_qty} left</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="qty-controls">
                          <button className="qty-btn" onClick={() => updateQty(item.id, item.quantity - 1)}>−</button>
                          <span className="qty-value">{item.quantity}</span>
                          <button className="qty-btn" onClick={() => updateQty(item.id, item.quantity + 1)}>+</button>
                        </div>
                      </td>
                      <td className="price">{formatPrice(item.unit_price)}</td>
                      <td className="price" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatPrice(item.tax)}</td>
                      <td className="line-total">{formatPrice(item.line_total)}</td>
                      <td>
                        <button className="void-btn" onClick={() => voidItem(item.id)} title="Void item">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Totals */}
          <div className="totals-panel">
            <div className="totals-row">
              <span className="label">Subtotal</span>
              <span className="amount">{formatPrice(txn?.subtotal)}</span>
            </div>
            {(txn?.total_discount > 0) && (
              <div className="totals-row discount">
                <span className="label">Discount {coupon ? `(${coupon.code})` : ''}</span>
                <span className="amount">−{formatPrice(txn?.total_discount)}</span>
              </div>
            )}
            <div className="totals-row tax">
              <span className="label">Tax (GST)</span>
              <span className="amount">{formatPrice(txn?.tax_amount)}</span>
            </div>
            <hr className="totals-divider" />
            <div className="totals-row grand-total">
              <span className="label">GRAND TOTAL</span>
              <span className="amount">{formatPrice(txn?.grand_total)}</span>
            </div>
            <div className="item-count">{items.length} item{items.length !== 1 ? 's' : ''} in cart</div>
          </div>
        </div>

        {/* Right: Action Panel */}
        <div className="action-panel">
          <div className="action-buttons">
            <button className="action-btn" onClick={() => setShowCustomer(true)}>
              <span className="icon">👤</span>
              <span className="label">Customer</span>
            </button>
            <button className="action-btn" onClick={() => setShowCoupon(true)}>
              <span className="icon">🏷️</span>
              <span className="label">Coupon</span>
            </button>
            <button className="action-btn" onClick={holdBill}>
              <span className="icon">⏸️</span>
              <span className="label">Hold Bill</span>
            </button>
            <button className="action-btn" onClick={() => setShowHeld(true)}>
              <span className="icon">📋</span>
              <span className="label">Recall</span>
            </button>
          </div>

          {/* Customer display */}
          {customer && (
            <div className="customer-display">
              <div className="cust-header">
                <span className="cust-name">👤 {customer.name}</span>
                <span className={`cust-tier tier-${customer.membership_tier}`}>{customer.membership_tier}</span>
              </div>
              <div className="cust-points">Loyalty Points: <span>{customer.loyalty_points}</span></div>
            </div>
          )}

          {/* Coupon display */}
          {coupon && (
            <div className="coupon-display">
              <span>🏷️ <span className="coupon-code">{coupon.code}</span> — {coupon.type === 'percent' ? `${coupon.value}% off` : `₹${coupon.value} off`}</span>
              <button className="remove-coupon-btn" onClick={removeCoupon}>✕</button>
            </div>
          )}

          {/* Payment */}
          <div className="payment-section">
            <h3>💳 Payment</h3>
            <div className="payment-buttons">
              <button className="pay-btn cash" disabled={items.length === 0} onClick={() => setShowPayment('cash')}>
                <span className="icon">💵</span> Cash
              </button>
              <button className="pay-btn card" disabled={items.length === 0} onClick={() => setShowPayment('card')}>
                <span className="icon">💳</span> Card
              </button>
              <button className="pay-btn upi" disabled={items.length === 0} onClick={() => setShowPayment('upi')}>
                <span className="icon">📱</span> UPI
              </button>
              <button className="pay-btn split" disabled={items.length === 0} onClick={() => setShowPayment('store_credit')}>
                <span className="icon">🎟️</span> Credit Note
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════ MODALS ══════ */}

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          method={showPayment}
          total={txn?.grand_total || 0}
          customerPhone={customer?.phone}
          onConfirm={processPayment}
          onClose={() => setShowPayment(null)}
        />
      )}

      {/* Customer Modal */}
      {showCustomer && (
        <CustomerModal
          onLink={linkCustomer}
          onClose={() => setShowCustomer(false)}
        />
      )}

      {/* Coupon Modal */}
      {showCoupon && (
        <CouponModal
          onApply={applyCoupon}
          onClose={() => setShowCoupon(false)}
        />
      )}

      {/* Receipt Modal */}
      {showReceipt && (
        <ReceiptModal
          data={showReceipt}
          onClose={closeReceipt}
        />
      )}

      {/* Held Bills Modal */}
      {showHeld && (
        <HeldBillsModal
          onRecall={recallBill}
          onClose={() => setShowHeld(false)}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════
   PAYMENT MODAL
   ═══════════════════════════ */
function PaymentModal({ method, total, onConfirm, onClose, customerPhone }) {
  const [tendered, setTendered] = useState('')
  const [cnPhone, setCnPhone] = useState(customerPhone || '')
  const [creditNotes, setCreditNotes] = useState([])
  const [selectedNote, setSelectedNote] = useState(null)
  const [cnLoading, setCnLoading] = useState(false)

  const change = method === 'cash' ? Math.max(0, (parseFloat(tendered) || 0) - total) : 0
  const canPay = method === 'cash'
    ? (parseFloat(tendered) || 0) >= total
    : method === 'store_credit'
    ? !!selectedNote && selectedNote.balance_remaining > 0
    : true

  const methodLabels = {
    cash: '💵 Cash Payment',
    card: '💳 Card Payment',
    upi: '📱 UPI Payment',
    split: '✂️ Split Payment',
    store_credit: '🎟️ Redeem Store Credit / Exchange Note'
  }

  const lookupCreditNotes = async () => {
    if (!cnPhone.trim()) return
    setCnLoading(true)
    try {
      const res = await authFetch(`/api/credit-notes/lookup?phone=${cnPhone.trim()}`)
      if (res.ok) {
        const data = await res.json()
        setCreditNotes(data.notes || [])
        if (data.notes?.length > 0) setSelectedNote(data.notes[0])
      }
    } catch {}
    setCnLoading(false)
  }

  if (method === 'split') {
    return <SplitPaymentModal total={total} onConfirm={onConfirm} onClose={onClose} />
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{methodLabels[method] || 'Payment'} <button className="modal-close" onClick={onClose}>✕</button></h2>
        <div className="payment-amount-display">
          <div className="label">Amount Due</div>
          <div className="amount">₹{total.toFixed(2)}</div>
        </div>

        {method === 'cash' && (
          <>
            <div className="form-group">
              <label>Amount Tendered</label>
              <input
                type="number"
                placeholder="Enter cash amount"
                value={tendered}
                onChange={e => setTendered(e.target.value)}
                autoFocus
                style={{ fontSize: '20px', textAlign: 'center', fontFamily: 'JetBrains Mono' }}
              />
            </div>
            {parseFloat(tendered) >= total && (
              <div className="change-display">
                <div className="label">Change to Return</div>
                <div className="amount">₹{change.toFixed(2)}</div>
              </div>
            )}
          </>
        )}

        {method === 'store_credit' && (
          <div>
            <label style={{ fontSize: '12px', fontWeight: 700 }}>Customer Phone Number</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                placeholder="Enter 10-digit phone"
                value={cnPhone}
                onChange={e => setCnPhone(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn-primary btn-sm" onClick={lookupCreditNotes} disabled={cnLoading}>
                🔍 Find Credit Notes
              </button>
            </div>

            {creditNotes.length > 0 ? (
              <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '6px' }}>
                {creditNotes.map(n => (
                  <div
                    key={n.id}
                    onClick={() => setSelectedNote(n)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: selectedNote?.id === n.id ? 'var(--accent-tint)' : 'var(--bg-subtle)',
                      cursor: 'pointer',
                      marginBottom: '4px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{n.note_number}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{n.reason || 'Store Credit'}</div>
                    </div>
                    <div style={{ fontWeight: 800, color: 'var(--success)' }}>₹{n.balance_remaining}</div>
                  </div>
                ))}
              </div>
            ) : cnPhone && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>
                No active credit notes found for this phone
              </div>
            )}
          </div>
        )}

        {method === 'card' && (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
            💳 Please insert/tap card on the payment terminal...
          </p>
        )}

        {method === 'upi' && (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ fontSize: '80px', marginBottom: '12px' }}>📱</div>
            <p style={{ color: 'var(--text-secondary)' }}>Scan QR code or enter UPI reference number</p>
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn primary"
            disabled={!canPay}
            onClick={() => onConfirm(method, tendered, selectedNote?.note_number)}
          >
            {method === 'cash' ? 'Complete Cash Sale' : method === 'store_credit' ? `Redeem Note (₹${selectedNote?.balance_remaining || 0})` : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
          >
            ✅ Confirm Payment
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════
   SPLIT PAYMENT MODAL
   ═══════════════════════════ */
function SplitPaymentModal({ total, onConfirm, onClose }) {
  const [cashAmt, setCashAmt] = useState('')
  const remaining = total - (parseFloat(cashAmt) || 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>✂️ Split Payment <button className="modal-close" onClick={onClose}>✕</button></h2>
        <div className="payment-amount-display">
          <div className="label">Total Amount</div>
          <div className="amount">₹{total.toFixed(2)}</div>
        </div>

        <div className="form-group">
          <label>Cash Amount</label>
          <input
            type="number"
            value={cashAmt}
            onChange={e => setCashAmt(e.target.value)}
            placeholder="Enter cash portion"
            autoFocus
          />
        </div>

        <div style={{
          padding: '12px', background: 'var(--bg-card)', borderRadius: 'var(--radius)',
          display: 'flex', justifyContent: 'space-between', fontSize: '14px'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Remaining (Card/UPI)</span>
          <span style={{ fontWeight: 700, fontFamily: 'JetBrains Mono', color: remaining > 0 ? 'var(--accent-light)' : 'var(--success)' }}>
            ₹{Math.max(0, remaining).toFixed(2)}
          </span>
        </div>

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn primary"
            disabled={!cashAmt || parseFloat(cashAmt) <= 0 || parseFloat(cashAmt) >= total}
            onClick={async () => {
              const cashPortion = parseFloat(cashAmt)
              const cardPortion = Math.round((total - cashPortion) * 100) / 100
              // Process cash first
              await onConfirm('cash', cashPortion.toString())
            }}
          >
            ✅ Process Split
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════
   CUSTOMER MODAL (with registration)
   ═══════════════════════════ */
function CustomerModal({ onLink, onClose }) {
  const [phone, setPhone] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const searchCustomer = async () => {
    if (phone.length < 10) return
    setLoading(true)
    setNotFound(false)
    setSearchResult(null)
    try {
      const res = await authFetch(`${API}/customers/search?phone=${phone}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResult(data)
      } else {
        setNotFound(true)
      }
    } catch {
      setNotFound(true)
    }
    setLoading(false)
  }

  const createAndLink = async () => {
    if (!newName.trim() || phone.length < 10) return
    setLoading(true)
    try {
      const res = await authFetch(`${API}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), phone, email: newEmail.trim() || undefined })
      })
      const data = await res.json()
      if (res.ok || res.status === 201) {
        onLink(data)
      } else {
        // If phone already exists, try to fetch and link
        if (data.customer_id) {
          const fetchRes = await authFetch(`${API}/customers/search?phone=${phone}`)
          if (fetchRes.ok) {
            const existing = await fetchRes.json()
            onLink(existing)
          }
        }
      }
    } catch {}
    setLoading(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>👤 Link Customer <button className="modal-close" onClick={onClose}>✕</button></h2>

        {/* Phone search */}
        <div className="form-group">
          <label>Phone Number</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="tel"
              placeholder="Enter 10-digit phone number"
              value={phone}
              onChange={e => { setPhone(e.target.value); setNotFound(false); setSearchResult(null) }}
              autoFocus
              maxLength={10}
              style={{ flex: 1 }}
            />
            <button
              className="modal-btn primary"
              onClick={searchCustomer}
              disabled={phone.length < 10 || loading}
              style={{ whiteSpace: 'nowrap', padding: '8px 16px' }}
            >
              🔍 Search
            </button>
          </div>
        </div>

        {/* Found customer */}
        {searchResult && (
          <div className="customer-display" style={{ margin: '12px 0' }}>
            <div className="cust-header">
              <span className="cust-name">👤 {searchResult.name}</span>
              <span className={`cust-tier tier-${searchResult.membership_tier}`}>{searchResult.membership_tier}</span>
            </div>
            <div className="cust-points">Loyalty Points: <span>{searchResult.loyalty_points}</span></div>
            <button
              className="modal-btn primary"
              onClick={() => onLink(searchResult)}
              style={{ marginTop: '8px', width: '100%' }}
            >
              🔗 Link {searchResult.name}
            </button>
          </div>
        )}

        {/* Not found — register new */}
        {notFound && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', margin: '12px 0', background: 'var(--bg-subtle)' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              No customer found. Register a new one:
            </p>
            <div className="form-group" style={{ marginBottom: '8px' }}>
              <label>Name *</label>
              <input
                type="text"
                placeholder="Customer name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Email (optional)</label>
              <input
                type="email"
                placeholder="customer@email.com"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
              />
            </div>
            <button
              className="modal-btn primary"
              onClick={createAndLink}
              disabled={!newName.trim() || loading}
              style={{ width: '100%' }}
            >
              ✅ Register & Link
            </button>
          </div>
        )}

        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
          Demo phones: 9876543210, 9876543211, 9876543212
        </p>

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════
   COUPON MODAL
   ═══════════════════════════ */
function CouponModal({ onApply, onClose }) {
  const [code, setCode] = useState('')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>🏷️ Apply Coupon <button className="modal-close" onClick={onClose}>✕</button></h2>
        <div className="form-group">
          <label>Coupon Code</label>
          <input
            type="text"
            placeholder="Enter coupon code"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            autoFocus
          />
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Demo codes: SAVE10 (10% off), FLAT50 (₹50 off), MEGA20 (20% off)
        </p>
        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn primary" onClick={() => onApply(code)} disabled={!code}>
            ✅ Apply Coupon
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════
   RECEIPT MODAL
   ═══════════════════════════ */
function ReceiptModal({ data, onClose }) {
  const printReceipt = () => {
    const w = window.open('', '', 'width=400,height=600')
    const receiptEl = document.querySelector('.receipt')
    w.document.write(`<html><head><title>Receipt</title>
      <style>body{font-family:monospace;font-size:12px;padding:20px;max-width:350px;margin:0 auto;}
      table{width:100%;border-collapse:collapse;}td,th{padding:2px 4px;text-align:left;font-size:11px;}
      th{border-bottom:1px solid #000;}.right{text-align:right;}.center{text-align:center;}
      hr{border:none;border-top:1px dashed #000;margin:8px 0;}.bold{font-weight:bold;}</style>
      </head><body>${receiptEl.innerHTML}</body></html>`)
    w.document.close()
    w.print()
    w.close()
  }

  const fmtDt = (s) => {
    if (!s) return ''
    const d = new Date(s)
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="modal-overlay">
      <div className="modal receipt-modal">
        <h2>🧾 Receipt <button className="modal-close" onClick={onClose}>✕</button></h2>

        <div className="receipt">
          <div className="store-header">
            <h3>{data.store.name}</h3>
            <p>{data.store.address}</p>
            <p>GSTIN: {data.store.gstin}</p>
          </div>

          <div className="bill-info">
            <div>Bill No: {data.bill_number}</div>
            <div>Date: {fmtDt(data.date)}</div>
            <div>Cashier: {data.cashier?.employee_code} ({data.cashier?.name})</div>
            <div>Counter: {data.counter || 1}</div>
          </div>

          <table className="items-table">
            <thead>
              <tr><th>Item</th><th>HSN</th><th>Qty</th><th>Price</th><th className="right">Amt</th></tr>
            </thead>
            <tbody>
              {data.items?.map((item, i) => (
                <tr key={i}>
                  <td>{item.product_name}</td>
                  <td><code>{item.hsn_code || '—'}</code></td>
                  <td>{item.quantity}</td>
                  <td>₹{item.unit_price?.toFixed(2)}</td>
                  <td className="right">₹{item.line_total?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals-section">
            <div className="row"><span>Subtotal</span><span>₹{data.subtotal?.toFixed(2)}</span></div>
            {data.discount > 0 && (
              <div className="row"><span>Discount{data.coupon ? ` (${data.coupon.code})` : ''}</span><span>-₹{data.discount?.toFixed(2)}</span></div>
            )}
            <div className="row"><span>CGST (Central Tax)</span><span>₹{(data.cgst ?? (data.tax / 2))?.toFixed(2)}</span></div>
            <div className="row"><span>SGST (State Tax)</span><span>₹{(data.sgst ?? (data.tax / 2))?.toFixed(2)}</span></div>
            <div className="row grand"><span>GRAND TOTAL</span><span>₹{data.grand_total?.toFixed(2)}</span></div>
          </div>

          {data.tax_summary?.length > 0 && (
            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #ccc', fontSize: '10px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>GST Tax Summary:</div>
              <table style={{ width: '100%', fontSize: '10px', textAlign: 'left' }}>
                <thead>
                  <tr><th>HSN</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Tax</th></tr>
                </thead>
                <tbody>
                  {data.tax_summary.map((ts, idx) => (
                    <tr key={idx}>
                      <td>{ts.hsn}</td>
                      <td>₹{ts.taxable_value?.toFixed(2)}</td>
                      <td>{ts.cgst_rate}%: ₹{ts.cgst_amount?.toFixed(2)}</td>
                      <td>{ts.sgst_rate}%: ₹{ts.sgst_amount?.toFixed(2)}</td>
                      <td>₹{ts.total_tax?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="payment-info">
            {data.payments?.map((p, i) => (
              <div key={i}>Payment: {p.method.toUpperCase()} — ₹{p.amount?.toFixed(2)}
                {p.change_amount > 0 ? ` (Change: ₹${p.change_amount.toFixed(2)})` : ''}
              </div>
            ))}
          </div>

          {data.customer && (
            <div className="payment-info">
              <div>Customer: {data.customer.name} ({data.customer.phone})</div>
              <div>Points Earned: {data.loyalty_earned} | Balance: {data.customer.loyalty_points}</div>
            </div>
          )}

          <div className="footer">
            ✨ Thank you! Visit again! ✨
          </div>
        </div>

        <button className="print-btn" onClick={printReceipt}>🖨️ Print Receipt</button>
        <button className="modal-btn secondary" style={{ width: '100%', marginTop: '8px' }} onClick={onClose}>
          ✅ Done — New Bill
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════
   HELD BILLS MODAL
   ═══════════════════════════ */
function HeldBillsModal({ onRecall, onClose }) {
  const [held, setHeld] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authFetch(`${API}/transactions/status/held`)
      .then(r => r.json())
      .then(d => { setHeld(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>📋 Held Bills <button className="modal-close" onClick={onClose}>✕</button></h2>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>Loading...</p>
        ) : held.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>No held bills</p>
        ) : (
          <div className="held-bills-list">
            {held.map(bill => (
              <div key={bill.id} className="held-bill-item" onClick={() => onRecall(bill.id)}>
                <div className="bill-info">
                  <h4>{bill.bill_number}</h4>
                  <p>{bill.item_count} items · {bill.cashier_name}</p>
                </div>
                <div className="bill-total">₹{bill.grand_total?.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
