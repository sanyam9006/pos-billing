/**
 * Date and Time utilities for Indian Boutique POS (IST / Asia/Kolkata)
 * Fixes timezone offsets between SQLite UTC timestamps and local Indian Standard Time.
 */

export function parseDbDate(s) {
  if (!s) return new Date()
  if (s instanceof Date) return s
  let str = String(s).trim()

  // If SQLite UTC datetime 'YYYY-MM-DD HH:MM:SS' without timezone, convert space to 'T' and append 'Z'
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    str = str.replace(' ', 'T') + 'Z'
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    str = str + 'Z'
  }

  const d = new Date(str)
  return isNaN(d.getTime()) ? new Date() : d
}

export function formatDateTime(s) {
  if (!s) return ''
  const d = parseDbDate(s)
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })
}

export function formatDate(s) {
  if (!s) return ''
  const d = parseDbDate(s)
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

export function formatTime(s) {
  if (!s) return ''
  const d = parseDbDate(s)
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })
}
