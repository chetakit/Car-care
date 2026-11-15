import { useMemo } from 'react'
import { createApiClient } from '../api/client.js'
import useAuth from '../../auth/useAuth.js'

export default function useApi() {
  const { token, handleUnauthorized } = useAuth()
  return useMemo(
    () => createApiClient(token, handleUnauthorized),
    [handleUnauthorized, token],
  )
}
