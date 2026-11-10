const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
).replace(/\/+$/, '')

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
      `Could not connect to the backend at ${API_BASE_URL}. Check that the API is running and that VITE_API_BASE_URL is correct.`,
      0,
    )
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    if (response.status !== 204) {
      throw new ApiError('The backend returned an invalid response.', response.status)
    }
  }

  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.()
    throw new ApiError(
      payload?.message || `Request failed with status ${response.status}.`,
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
