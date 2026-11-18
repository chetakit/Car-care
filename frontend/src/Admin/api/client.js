import messages from '../../i18n/messages.js'

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
).replace(/\/+$/, '')
const LANGUAGE_STORAGE_KEY = 'car-care-language'

// The API client runs outside React, so it reads the preference persisted by LanguageProvider.
function getSelectedLanguage() {
  if (typeof window === 'undefined') return 'TH'

  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'EN' ? 'EN' : 'TH'
  } catch {
    return 'TH'
  }
}

function formatFrontendError(key, params = {}) {
  const message = messages[getSelectedLanguage()]?.[key]
  if (typeof message !== 'string') {
    throw new Error(`Missing frontend error translation "${key}".`)
  }

  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  )
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export async function apiRequest(
  path,
  { method = 'GET', token, body, signal, onUnauthorized } = {},
) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError(
      formatFrontendError('api.error.connection', { baseUrl: API_BASE_URL }),
      0,
    )
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    if (response.status !== 204) {
      throw new ApiError(
        formatFrontendError('api.error.invalidResponse'),
        response.status,
      )
    }
  }

  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.()
    throw new ApiError(
      payload?.message ||
        formatFrontendError('api.error.requestFailed', { status: response.status }),
      response.status,
      payload,
    )
  }
  return payload
}

export function createApiClient(token, onUnauthorized) {
  return (path, options = {}) =>
    apiRequest(path, { ...options, token, onUnauthorized })
}
