export const STATUS_KEYS = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_SERVICE',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
]

export const FUEL_LEVEL_KEYS = ['EMPTY', 'QUARTER', 'HALF', 'THREE_QUARTER', 'FULL']

export const PAYMENT_STATUS_KEYS = ['PENDING', 'PAID', 'FAILED']

const pad = (n) => String(n).padStart(2, '0')
const localeFor = (language) => (language === 'TH' ? 'th-TH' : 'en-US')

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const todayKey = () => toDateKey(new Date())

export function shiftDays(key, days) {
  const date = new Date(`${key}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

export function formatDate(key, language = 'TH') {
  if (!key) return '—'
  return new Date(`${key}T00:00:00`).toLocaleDateString(localeFor(language), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatShortDate(key, language = 'TH') {
  if (!key) return '—'
  return new Date(`${key}T00:00:00`).toLocaleDateString(localeFor(language), {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })
}

export function formatDateTime(value, language = 'TH') {
  if (!value) return '—'
  return new Date(value).toLocaleString(localeFor(language), {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatMoney(value, language = 'TH') {
  return `${Number(value ?? 0).toLocaleString(localeFor(language), { maximumFractionDigits: 2 })} ฿`
}

export function vehicleName(vehicle) {
  return [vehicle?.brand_name, vehicle?.model_name].filter(Boolean).join(' ') || '—'
}

export function plateText(item) {
  return [item?.license_plate, item?.province].filter(Boolean).join(' ') || '—'
}
