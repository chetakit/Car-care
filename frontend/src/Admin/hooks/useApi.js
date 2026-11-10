import { useMemo } from 'react'
import { createApiClient } from '../api/client.js'
import useAdminAuth from '../auth/useAdminAuth.js'

export default function useApi() {
  const { token, clearSession } = useAdminAuth()
  return useMemo(
    () => createApiClient(token, clearSession),
    [clearSession, token],
  )
}
