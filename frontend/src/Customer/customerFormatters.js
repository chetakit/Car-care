import messages from '../i18n/messages.js'

export const CUSTOMER_TIME_ZONE = 'Asia/Bangkok'

const BOOKING_STATUS_KEYS = {
  PENDING_PAYMENT: 'customer.formatter.bookingStatus.awaitingPayment',
  CONFIRMED: 'customer.formatter.bookingStatus.confirmed',
  CHECKED_IN: 'customer.formatter.bookingStatus.checkedIn',
  IN_SERVICE: 'customer.formatter.bookingStatus.inService',
  COMPLETED: 'customer.formatter.bookingStatus.completed',
  CANCELLED: 'customer.formatter.bookingStatus.cancelled',
  NO_SHOW: 'customer.formatter.bookingStatus.noShow',
}

const PAYMENT_STATUS_KEYS = {
  PAID: 'customer.formatter.paymentStatus.paid',
  PENDING: 'customer.formatter.paymentStatus.pending',
  FAILED: 'customer.formatter.paymentStatus.failed',
  'NOT PAID': 'customer.formatter.paymentStatus.notPaid',
}

const BOOKING_PAYMENT_STATUS_KEYS = {
  PENDING: 'customer.formatter.bookingPayment.pending',
  PAID: 'customer.formatter.bookingPayment.paid',
  FAILED: 'customer.formatter.bookingPayment.failed',
}

const PAYMENT_METHOD_KEYS = {
  SIMULATED: 'customer.formatter.paymentMethod.simulated',
  WALLET: 'customer.formatter.paymentMethod.wallet',
}

function resolveLanguage(language, fallback) {
  if (language === undefined) return fallback
  if (language === 'TH' || language === 'EN') return language
  throw new TypeError('Language must be either "TH" or "EN".')
}

function getLocale(language) {
  if (language === undefined) return undefined
  if (language === 'TH') return 'th-TH'
  if (language === 'EN') return 'en-GB'
  throw new TypeError('Language must be either "TH" or "EN".')
}

function translate(language, key) {
  return messages[language][key]
}

function humanize(value) {
  return String(value ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

export function formatCustomerBookingStatus(value, language) {
  const selectedLanguage = resolveLanguage(language, 'EN')
  const status = String(value ?? '').trim().toUpperCase()
  const key = BOOKING_STATUS_KEYS[status]
  return key
    ? translate(selectedLanguage, key)
    : humanize(status) ||
        translate(selectedLanguage, 'customer.formatter.bookingStatus.unavailable')
}

export function formatCustomerPaymentStatus(value, language) {
  const selectedLanguage = resolveLanguage(language, 'EN')
  const status = String(value ?? '').trim().toUpperCase()
  const key = PAYMENT_STATUS_KEYS[status]
  return key
    ? translate(selectedLanguage, key)
    : humanize(status) ||
        translate(selectedLanguage, 'customer.formatter.paymentStatus.notPaid')
}

export function formatCustomerBookingPaymentStatus(payment, language) {
  const selectedLanguage = resolveLanguage(language, 'TH')
  if (!payment) {
    return translate(selectedLanguage, 'customer.formatter.bookingPayment.none')
  }

  const status = String(payment.payment_status ?? '').trim().toUpperCase()
  const key = BOOKING_PAYMENT_STATUS_KEYS[status]
  const label = key
    ? translate(selectedLanguage, key)
    : translate(selectedLanguage, 'customer.formatter.bookingPayment.unknown')

  return String(payment.payment_method ?? '').trim().toUpperCase() === 'SIMULATED'
    ? `${label} (${translate(selectedLanguage, 'customer.formatter.simulatedNotice')})`
    : label
}

export function formatCustomerPaymentMethod(value, language) {
  const selectedLanguage = resolveLanguage(language, 'EN')
  const method = String(value ?? '').trim().toUpperCase()
  const key = PAYMENT_METHOD_KEYS[method]
  return key ? translate(selectedLanguage, key) : humanize(method) || '—'
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

export function formatCustomerDate(value, language) {
  const locale = getLocale(language)
  const date = parseCustomerDate(value)
  if (!date) {
    return language
      ? translate(language, 'customer.formatter.dateUnavailable')
      : 'Date unavailable'
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: CUSTOMER_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatCustomerTime(value, language) {
  const locale = getLocale(language)
  const match = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(
    String(value ?? '').trim(),
  )
  if (!match) {
    return language
      ? translate(language, 'customer.formatter.timeUnavailable')
      : 'Time unavailable'
  }

  const [, hourText, minute] = match
  const hour = hourText.padStart(2, '0')
  const time = new Date(`2000-01-01T${hour}:${minute}:00+07:00`)
  return new Intl.DateTimeFormat(locale, {
    timeZone: CUSTOMER_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(time)
}

export function formatCustomerTimestamp(value, language) {
  const locale = getLocale(language)
  if (!value) return '—'

  const timestamp = String(value).trim().replace(' ', 'T')
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)
  const date = new Date(hasTimeZone ? timestamp : `${timestamp}+07:00`)
  if (Number.isNaN(date.getTime())) {
    return language
      ? translate(language, 'customer.formatter.dateUnavailable')
      : 'Date unavailable'
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: CUSTOMER_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function formatCustomerMoney(value, language) {
  const locale = getLocale(language)
  const amount = Number(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'THB' }).format(amount)
    : '—'
}
