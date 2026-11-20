import { useEffect, useState } from 'react'

// Drop a model at frontend/public/models/urus.glb and the garage uses it.
export const MODEL_URL = '/models/urus.glb'

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** true once we know the 3D model file is there and WebGL works. */
export function useCarModel3d() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (!hasWebGL()) return undefined
    let alive = true
    // The dev server and Vercel answer missing files with index.html, so a
    // 200 is not enough: it must not be an HTML page.
    fetch(MODEL_URL, { method: 'HEAD' })
      .then((response) => {
        const type = response.headers.get('content-type') || ''
        if (alive && response.ok && !type.includes('text/html')) setAvailable(true)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return available
}

