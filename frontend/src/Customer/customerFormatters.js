export const CUSTOMER_TIME_ZONE = 'Asia/Bangkok'

const BOOKING_STATUS_LABELS = {
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  IN_SERVICE: 'In service',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No show',
}

const PAYMENT_STATUS_LABELS = {
  PAID: 'Paid',
  PENDING: 'Payment pending',
  FAILED: 'Payment failed',
  'NOT PAID': 'Not paid',
}

const PAYMENT_METHOD_LABELS = {
  SIMULATED: 'Simulated demo payment',
  WALLET: 'Car Care Wallet',
}

const BOOKING_PAYMENT_STATUS_LABELS = {
  PENDING: 'รอชำระเงิน',
  PAID: 'ชำระแล้ว',
  FAILED: 'ชำระไม่สำเร็จ',
}

function humanize(value) {
  return String(value ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

export function formatCustomerBookingStatus(value) {
  const status = String(value ?? '').trim().toUpperCase()
  return BOOKING_STATUS_LABELS[status] || humanize(status) || 'Status unavailable'
}

export function formatCustomerPaymentStatus(value) {
  const status = String(value ?? '').trim().toUpperCase()
  return PAYMENT_STATUS_LABELS[status] || humanize(status) || 'Not paid'
}

export function formatCustomerBookingPaymentStatus(payment) {
  if (!payment) return 'ยังไม่มีรายการชำระเงิน'
  const status = String(payment.payment_status ?? '').trim().toUpperCase()
  const label = BOOKING_PAYMENT_STATUS_LABELS[status] || 'ไม่ทราบสถานะการชำระเงิน'
  return String(payment.payment_method ?? '').trim().toUpperCase() === 'SIMULATED'
    ? `${label} (จำลอง — ไม่ใช่การชำระเงินจริง)`
    : label
}

export function formatCustomerPaymentMethod(value) {
  const method = String(value ?? '').trim().toUpperCase()
  return PAYMENT_METHOD_LABELS[method] || humanize(method) || '—'
}

function parseCustomerDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  if (!match) return null

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const validationDate = new Date(Date.UTC(year, month - 1, day))
  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day
  ) {
    return null
  }

  return new Date(`${yearText}-${monthText}-${dayText}T12:00:00+07:00`)
}

export function formatCustomerDate(value) {
  const date = parseCustomerDate(value)
  if (!date) return 'Date unavailable'

  return new Intl.DateTimeFormat(undefined, {
    timeZone: CUSTOMER_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatCustomerTime(value) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(
    String(value ?? '').trim(),
  )
  if (!match) return 'Time unavailable'

  const [, hourText, minute] = match
  const hour = hourText.padStart(2, '0')
  const time = new Date(`2000-01-01T${hour}:${minute}:00+07:00`)
  return new Intl.DateTimeFormat(undefined, {
    timeZone: CUSTOMER_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(time)
}

export function formatCustomerTimestamp(value) {
  if (!value) return '—'

  const timestamp = String(value).trim().replace(' ', 'T')
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)
  const date = new Date(hasTimeZone ? timestamp : `${timestamp}+07:00`)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'

  return new Intl.DateTimeFormat(undefined, {
    timeZone: CUSTOMER_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
