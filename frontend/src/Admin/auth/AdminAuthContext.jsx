import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../api/client.js'
import AdminAuthContext from './adminAuthContext.js'

const TOKEN_KEY = 'car-care-admin-token'

function getStoredToken() {
  return typeof window === 'undefined' ? null : window.sessionStorage.getItem(TOKEN_KEY)
}

export function AdminAuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken)
  const [user, setUser] = useState(null)
  const [authStatus, setAuthStatus] = useState(token ? 'checking' : 'anonymous')
  const [authError, setAuthError] = useState('')

  const clearSession = useCallback(() => {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setAuthStatus('anonymous')
  }, [])

  useEffect(() => {
    if (!token || authStatus !== 'checking') return undefined
    const controller = new AbortController()
    apiRequest('/api/admin/auth/me', {
      token,
      signal: controller.signal,
      onUnauthorized: clearSession,
    })
      .then((response) => {
        setUser(response.data?.user ?? null)
        setAuthStatus('authenticated')
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        clearSession()
        setAuthError(
          error.status === 401 || error.status === 403
            ? 'Your session has expired or does not have Admin access. Please sign in again.'
            : error.message,
        )
      })
    return () => controller.abort()
  }, [authStatus, clearSession, token])

  const login = useCallback(async (email, password) => {
    setAuthError('')
    const response = await apiRequest('/api/admin/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    const { accessToken, user: signedInUser } = response.data ?? {}
    if (!accessToken) throw new Error('The login response did not include an access token.')
    window.sessionStorage.setItem(TOKEN_KEY, accessToken)
    setToken(accessToken)
    setUser(signedInUser ?? null)
    setAuthStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    const currentToken = token
    clearSession()
    if (!currentToken) return
    try {
      await apiRequest('/api/admin/auth/logout', { method: 'POST', token: currentToken })
    } catch {
      // The token is removed locally; the backend logout endpoint is stateless.
    }
  }, [clearSession, token])

  const value = useMemo(
    () => ({
      token,
      user,
      authStatus,
      authError,
      clearAuthError: () => setAuthError(''),
      clearSession,
      login,
      logout,
    }),
    [authError, authStatus, clearSession, login, logout, token, user],
  )

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  )
}
