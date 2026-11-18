import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('UI Runtime Error caught by ErrorBoundary:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--border, #ede7dd)',
            borderRadius: 'var(--radius, 10px)',
            padding: '32px 40px',
            maxWidth: '520px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary, #2b2622)' }}>
              Page Loading Issue
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted, #7a7168)', marginBottom: '20px', lineHeight: 1.5 }}>
              The page encountered an unexpected rendering error. Please click reload to refresh the data.
            </p>
            {this.state.error?.message && (
              <div style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                background: 'var(--bg-subtle, #f5efe6)',
                padding: '8px 12px',
                borderRadius: '6px',
                color: '#b91c1c',
                marginBottom: '20px',
                wordBreak: 'break-all',
                textAlign: 'left'
              }}>
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReload}
              style={{
                background: 'var(--accent, #5B9BD5)',
                color: '#ffffff',
                border: 'none',
                padding: '10px 24px',
                borderRadius: 'var(--radius-sm, 6px)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              🔄 Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
