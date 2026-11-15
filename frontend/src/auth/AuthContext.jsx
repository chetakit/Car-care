import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiRequest } from '../Admin/api/client.js'
import AuthContext from './authContext.js'

const TOKEN_KEY = 'car-care-auth-token'
const LEGACY_ADMIN_TOKEN_KEY = 'car-care-admin-token'
const SUPPORTED_ROLES = new Set(['ADMIN', 'CUSTOMER', 'STAFF'])

function getStoredToken() {
  if (typeof window === 'undefined') return null

  const storedToken = window.sessionStorage.getItem(TOKEN_KEY)
  if (storedToken) {
    window.sessionStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY)
    return storedToken
  }

  const legacyToken = window.sessionStorage.getItem(LEGACY_ADMIN_TOKEN_KEY)
  if (legacyToken) {
    window.sessionStorage.setItem(TOKEN_KEY, legacyToken)
    window.sessionStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY)
  }
  return legacyToken
}

function isSupportedUser(user) {
  return user && SUPPORTED_ROLES.has(user.role)
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken)
  const [user, setUser] = useState(null)
  const [authStatus, setAuthStatus] = useState(token ? 'checking' : 'anonymous')
  const [authError, setAuthError] = useState('')

  const clearSession = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(TOKEN_KEY)
      window.sessionStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY)
    }
    setToken(null)
    setUser(null)
    setAuthStatus('anonymous')
  }, [])

  const handleUnauthorized = useCallback(() => {
    clearSession()
    setAuthError('Your session has expired. Please sign in again.')
  }, [clearSession])

  useEffect(() => {
    if (!token || authStatus !== 'checking') return undefined
    const controller = new AbortController()
    apiRequest('/api/auth/me', {
      token,
      signal: controller.signal,
      onUnauthorized: clearSession,
    })
      .then((response) => {
        const sessionUser = response.data?.user
        if (!isSupportedUser(sessionUser)) {
          throw new Error('This account role is not supported by the frontend.')
        }
        setUser(sessionUser)
        setAuthError('')
        setAuthStatus('authenticated')
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        clearSession()
        setAuthError(
          error instanceof ApiError && (error.status === 401 || error.status === 403)
            ? 'Your session has expired or is not authorized. Please sign in again.'
            : error.message,
        )
      })
    return () => controller.abort()
  }, [authStatus, clearSession, token])

  const login = useCallback(async (email, password) => {
    setAuthError('')
    const response = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    const { accessToken, user: signedInUser } = response.data ?? {}
    if (!accessToken) {
      throw new Error('The login response did not include an access token.')
    }
    if (!isSupportedUser(signedInUser)) {
      throw new Error('This account role is not supported by the frontend.')
    }

    window.sessionStorage.setItem(TOKEN_KEY, accessToken)
    window.sessionStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY)
    setToken(accessToken)
    setUser(signedInUser)
    setAuthStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    const currentToken = token
    clearSession()
    setAuthError('')
    if (!currentToken) return
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        token: currentToken,
      })
    } catch {
      // Local sign-out succeeds even if the stateless backend endpoint is unavailable.
    }
  }, [clearSession, token])

  const clearAuthError = useCallback(() => setAuthError(''), [])
  const value = useMemo(
    () => ({
      token,
      user,
      authStatus,
      authError,
      clearAuthError,
      clearSession,
      handleUnauthorized,
      login,
      logout,
    }),
    [
      authError,
      authStatus,
      clearAuthError,
      clearSession,
      handleUnauthorized,
      login,
      logout,
      token,
      user,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
