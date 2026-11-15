export function formatDate(value) {
  if (!value) return '—'
  const date = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return String(value)
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value).replace('T', ' ').replace(/\.000Z$/, '')
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}
