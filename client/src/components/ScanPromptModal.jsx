import { useState, useRef, useEffect } from 'react'

/**
 * Clean scan prompt modal for USB / Bluetooth hardware barcode scanners
 * Auto-focuses the input and captures scanner trigger (Enter key).
 */
export default function ScanPromptModal({ onScan, onClose, title = 'Scan Barcode' }) {
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (value.trim()) {
        onScan(value.trim())
        onClose()
      }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (value.trim()) {
      onScan(value.trim())
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center' }}>
        <h2>📷 {title} <button className="modal-close" onClick={onClose}>✕</button></h2>
        <div style={{ margin: '16px 0', padding: '16px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚡🔫</div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Point your barcode scanner at the garment tag and pull the trigger, or type the code and press Enter.
          </p>
          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Waiting for scanner input..."
              style={{
                textAlign: 'center',
                fontSize: '18px',
                letterSpacing: '2px',
                fontFamily: 'monospace',
                padding: '10px',
                borderColor: 'var(--accent-secondary)'
              }}
              autoFocus
            />
            <div className="modal-actions" style={{ marginTop: '16px', justifyContent: 'center' }}>
              <button type="button" className="modal-btn secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="modal-btn primary" disabled={!value.trim()}>Confirm Code</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
