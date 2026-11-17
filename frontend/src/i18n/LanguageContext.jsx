import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import messages from './messages.js'

const DEFAULT_LANGUAGE = 'TH'
const SUPPORTED_LANGUAGES = new Set(['TH', 'EN'])
const STORAGE_KEY = 'car-care-language'
const LanguageContext = createContext(null)
const reportedMissingKeys = new Set()

function readStoredLanguage() {
  try {
    const storedLanguage = window.localStorage.getItem(STORAGE_KEY)
    return SUPPORTED_LANGUAGES.has(storedLanguage) ? storedLanguage : DEFAULT_LANGUAGE
  } catch (error) {
    console.warn('Unable to read the saved language preference.', error)
    return DEFAULT_LANGUAGE
  }
}

function getMessage(language, key) {
  return messages[language]?.[key] ?? messages.EN[key]
}

function interpolate(message, params, key) {
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, name) => {
    if (!Object.hasOwn(params, name)) {
      if (import.meta.env.DEV) {
        console.warn(`Missing "${name}" parameter for translation "${key}".`)
      }
      return placeholder
    }
    return String(params[name])
  })
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readStoredLanguage)

  const setLanguage = useCallback((nextLanguage) => {
    if (!SUPPORTED_LANGUAGES.has(nextLanguage)) {
      throw new TypeError('Language must be either "TH" or "EN".')
    }

    setLanguageState(nextLanguage)
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage)
    } catch (error) {
      console.warn('Unable to save the language preference.', error)
    }
  }, [])

  const t = useCallback((key, params = {}) => {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Translation key must be a non-empty string.')
    }
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      throw new TypeError('Translation parameters must be an object.')
    }

    const message = getMessage(language, key)
    if (message === undefined) {
      if (import.meta.env.DEV && !reportedMissingKeys.has(key)) {
        reportedMissingKeys.add(key)
        console.warn(`Missing translation "${key}".`)
      }
      return key
    }

    return interpolate(message, params, key)
  }, [language])

  useEffect(() => {
    document.documentElement.lang = language.toLowerCase()
  }, [language])

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

// The provider and its hook share this file to keep the foundation within the approved file scope.
// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === null) {
    throw new Error('useLanguage must be used within a LanguageProvider.')
  }
  return context
}
