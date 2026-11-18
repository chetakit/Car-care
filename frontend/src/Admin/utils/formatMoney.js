import { getAdminLanguage } from './formatDate.js'

export default function formatMoney(value, language) {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(
        getAdminLanguage(language) === 'TH' ? 'th-TH' : 'en-GB',
        { style: 'currency', currency: 'THB' },
      ).format(amount)
    : '—'
}
