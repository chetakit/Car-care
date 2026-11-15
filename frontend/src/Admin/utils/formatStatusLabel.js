export default function formatStatusLabel(value) {
  return value
    ? String(value).toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : '—'
}
