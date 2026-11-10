import { useEffect, useState } from 'react'
import useApi from './useApi.js'

const initialState = { key: null, data: null, error: '' }

export default function useRemoteData(path, enabled = true) {
  const api = useApi()
  const [state, setState] = useState(initialState)
  const [refreshKey, setRefreshKey] = useState(0)
  const requestKey = `${path}:${refreshKey}`

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    api(path, { signal: controller.signal })
      .then((response) => setState({ key: requestKey, data: response.data, error: '' }))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setState({ key: requestKey, data: null, error: requestError.message })
        }
      })
    return () => controller.abort()
  }, [api, enabled, path, refreshKey, requestKey])

  const isCurrentRequest = state.key === requestKey
  return {
    data: enabled && isCurrentRequest ? state.data : null,
    loading: enabled && !isCurrentRequest,
    error: enabled && isCurrentRequest ? state.error : '',
    refresh: () => setRefreshKey((key) => key + 1),
  }
}
