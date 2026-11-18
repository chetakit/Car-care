import messages from '../../i18n/messages.js'
import { getAdminLanguage } from './formatDate.js'

// Labels that read better than the raw enum value.
export default function formatStatusLabel(value, language) {
  if (!value) return '—'
  const resolvedLanguage = getAdminLanguage(language)
  const statusKey = `admin.status.${String(value).toLowerCase().split('_').map((part, index) => (
    index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
  )).join('')}`
  return messages[resolvedLanguage][statusKey] ??
    String(value).toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}
