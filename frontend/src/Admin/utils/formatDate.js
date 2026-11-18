export function getAdminLanguage(language) {
  if (language !== undefined) {
    if (language !== 'TH' && language !== 'EN') {
      throw new TypeError('Language must be either "TH" or "EN".')
    }
    return language
  }

  try {
    const storedLanguage = window.localStorage.getItem('car-care-language')
    if (storedLanguage === 'TH' || storedLanguage === 'EN') return storedLanguage
  } catch {
    // Fall back to the document language when storage is unavailable.
  }

  if (typeof document !== 'undefined') {
    if (document.documentElement.lang.toLowerCase().startsWith('en')) return 'EN'
    if (document.documentElement.lang.toLowerCase().startsWith('th')) return 'TH'
  }

  return 'TH'
}

function getAdminLocale(language) {
  return getAdminLanguage(language) === 'TH' ? 'th-TH' : 'en-GB'
}

export function formatDate(value, language) {
  if (!value) return '—'
  const date = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return String(value)
  const parsedDate = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return String(value)
  }
  return new Intl.DateTimeFormat(getAdminLocale(language), {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(parsedDate)
}

export function formatDateTime(value, language) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value).replace('T', ' ').replace(/\.000Z$/, '')
    : new Intl.DateTimeFormat(getAdminLocale(language), {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}
