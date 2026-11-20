import { Component, lazy, Suspense } from 'react'
import SuperSuv from './SuperSuv.jsx'
import { MODEL_URL } from './useCarModel3d.js'

// The garage car: a real 3D model when /models/urus.glb exists and the
// browser has WebGL (see useCarModel3d.js), otherwise the SVG drawing.
// three.js is only downloaded when the 3D model is actually used.
const UrusScene3D = lazy(() => import('./UrusScene3D.jsx'))

// If the 3D scene throws (bad model, lost WebGL), show the drawing instead.
class SceneBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    this.props.onFail?.(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function CarModel({ use3d, phase, hostRef, onFail }) {
  const drawing = <SuperSuv />
  if (!use3d) return drawing
  return (
    <SceneBoundary fallback={drawing} onFail={onFail}>
      <Suspense fallback={drawing}>
        <UrusScene3D hostRef={hostRef} phase={phase} url={MODEL_URL} />
      </Suspense>
    </SceneBoundary>
  )
}

export default CarModel
