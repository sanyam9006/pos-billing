import { useState, useEffect } from 'react'
import { authFetch, formatPrice } from '../utils/api'

export default function Refunds({ cashier }) {
  const [refunds, setRefunds] = useState([])
  const [loading, setLoading] = useState(true)
  const [showProcess, setShowProcess] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { loadRefunds() }, [])

  const notify = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadRefunds = async () => {
    try {
      const res = await authFetch('/api/refunds')
      setRefunds(await res.json())
    } catch {}
    setLoading(false)
  }

  return (
    <div className="page refunds-page">
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1>↩️ Refunds</h1>
          <p className="page-subtitle">{refunds.length} refunds processed</p>
        </div>
        <button className="btn-primary" onClick={() => setShowProcess(true)}>
          + Process Refund
        </button>
      </div>

      {/* Refunds Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Original Bill</th>
              <th>Cashier</th>
              <th>Reason</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Items</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map(r => (
              <tr key={r.id}>
                <td>#{r.id}</td>
                <td><code>{r.bill_number}</code></td>
                <td>{r.cashier_name}</td>
                <td>{r.reason || '—'}</td>
                <td><span className="method-badge">{r.refund_method?.toUpperCase()}</span></td>
                <td className="num refund-amount">-{formatPrice(r.refund_amount)}</td>
                <td className="date-cell">{new Date(r.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td>
                  {r.items?.map((item, i) => (
                    <div key={i} className="refund-item-tag">{item.product_name} ×{item.quantity}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {refunds.length === 0 && !loading && (
          <div className="empty-table">No refunds processed yet</div>
        )}
      </div>

      {showProcess && (
        <ProcessRefundModal
          onClose={() => setShowProcess(false)}
          onDone={() => { setShowProcess(false); loadRefunds() }}
          notify={notify}
        />
      )}
    </div>
  )
}

function ProcessRefundModal({ onClose, onDone, notify }) {
  const [billNumber, setBillNumber] = useState('')
  const [txn, setTxn] = useState(null)
  const [txnItems, setTxnItems] = useState([])
  const [selectedItems, setSelectedItems] = useState({})
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState('cash')
  const [searching, setSearching] = useState(false)
  const [processing, setProcessing] = useState(false)

  const searchBill = async () => {
    if (!billNumber.trim()) return
    setSearching(true)
    try {
      // Search for the bill — we need to find the transaction ID
      // Try using the transactions API to search
      const res = await authFetch(`/api/transactions/bill/${billNumber.trim()}`)
      if (res.ok) {
        const data = await res.json()
        if (data.status !== 'completed') {
          notify('Only completed transactions can be refunded', 'error')
          setSearching(false)
          return
        }
        setTxn(data)
        setTxnItems(data.items || [])
      } else {
        notify('Bill not found', 'error')
      }
    } catch { notify('Search failed', 'error') }
    setSearching(false)
  }

  const toggleItem = (itemId, qty) => {
    setSelectedItems(prev => {
      if (prev[itemId]) {
        const { [itemId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [itemId]: qty }
    })
  }

  const totalRefund = Object.entries(selectedItems).reduce((sum, [itemId, qty]) => {
    const item = txnItems.find(i => i.id === parseInt(itemId))
    if (!item) return sum
    return sum + ((item.line_total / (item.quantity || 1)) * qty)
  }, 0)

  const processRefund = async () => {
    const items = Object.entries(selectedItems).map(([item_id, quantity]) => ({
      item_id: parseInt(item_id),
      quantity
    }))
    if (items.length === 0) { notify('Select items to refund', 'error'); return }

    setProcessing(true)
    try {
      const res = await authFetch('/api/refunds', {
        method: 'POST',
        body: JSON.stringify({ txn_id: txn.id, items, reason, method })
      })
      if (res.ok) {
        const data = await res.json()
        if (method === 'store_credit') {
          try {
            await authFetch('/api/credit-notes', {
              method: 'POST',
              body: JSON.stringify({
                customer_phone: txn.customer?.phone || '9999999999',
                customer_name: txn.customer?.name || 'Customer',
                original_bill_number: txn.bill_number,
                amount: data.refund_amount,
                reason: reason || 'Garment exchange / return credit note'
              })
            })
          } catch (_) {}
        }
        notify(`Refund of ${formatPrice(data.refund_amount)} processed (Credit Note issued)`)
        onDone()
      } else {
        const data = await res.json()
        notify(data.error, 'error')
      }
    } catch { notify('Refund failed', 'error') }
    setProcessing(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide-modal" onClick={e => e.stopPropagation()}>
        <h2>↩️ Process Refund <button className="modal-close" onClick={onClose}>✕</button></h2>

        {/* Search bill */}
        <div className="form-group">
          <label>Bill Number</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              placeholder="e.g. SM-20260825-0001"
              value={billNumber}
              onChange={e => setBillNumber(e.target.value.toUpperCase())}
              autoFocus
              style={{ flex: 1 }}
            />
            <button className="modal-btn primary" onClick={searchBill} disabled={searching} style={{ whiteSpace: 'nowrap' }}>
              🔍 Find
            </button>
          </div>
        </div>

        {txn && (
          <>
            <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)', margin: '12px 0', fontSize: '13px' }}>
              <strong>{txn.bill_number}</strong> · {formatPrice(txn.grand_total)} · {new Date(txn.completed_at).toLocaleString('en-IN')}
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>Select items to refund:</p>
            <div className="refund-items-list">
              {txnItems.map(item => (
                <label key={item.id} className={`refund-item-row ${selectedItems[item.id] ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!selectedItems[item.id]}
                    onChange={() => toggleItem(item.id, item.quantity)}
                  />
                  <span className="ri-name">{item.product_name}</span>
                  <span className="ri-qty">×{item.quantity}</span>
                  <span className="ri-price">{formatPrice(item.line_total)}</span>
                </label>
              ))}
            </div>

            <div className="form-row" style={{ marginTop: '12px' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Reason</label>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Damaged, Wrong item" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Refund Method</label>
                <select value={method} onChange={e => setMethod(e.target.value)} style={{ padding: '10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="store_credit">Store Credit</option>
                </select>
              </div>
            </div>

            {Object.keys(selectedItems).length > 0 && (
              <div className="refund-total">
                Refund Amount: <span>{formatPrice(totalRefund)}</span>
              </div>
            )}

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
              <button className="modal-btn primary" onClick={processRefund} disabled={processing || Object.keys(selectedItems).length === 0}>
                {processing ? '⏳ Processing...' : `↩️ Process Refund (${formatPrice(totalRefund)})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
