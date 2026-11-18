import { getAdminLanguage } from './formatDate.js'

// Amount first, baht sign after: "4,380.00 ฿".
export default function formatMoney(value, language) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  const number = new Intl.NumberFormat(
    getAdminLanguage(language) === 'TH' ? 'th-TH' : 'en-GB',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  ).format(amount)
  return `${number} ฿`
}
