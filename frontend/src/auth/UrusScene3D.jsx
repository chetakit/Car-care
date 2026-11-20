import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import SuperSuv from './SuperSuv.jsx'

// ---------------------------------------------------------------------------
// Settings to tune for the downloaded model (every model is a bit different).
// ---------------------------------------------------------------------------
// Turn (radians, around the vertical axis) so the car's nose points right.
// Try 0, Math.PI / 2, Math.PI or -Math.PI / 2 until it faces the form.
const MODEL_TURN = Math.PI / 2
// Repaint the body yellow. Materials whose name matches are recoloured; set
// PAINT_COLOR to null to keep the model's own colour.
const PAINT_MATCH = /paint|body|carpaint|exterior/i
const PAINT_COLOR = '#f6c000'
// Parts to hide (logo badges are Lamborghini trademarks; the cabin and
// engine are never seen from outside). Matched against mesh/material names.
const HIDE_MATCH = /badge|manufacturerplate/i
// Glass is tinted dark (the cabin was removed from the file to save space).
const GLASS_MATCH = /window/i
// Where the lights and exhaust are, as fractions of the car's bounding box:
// x: 0 = rear bumper, 1 = front bumper. y: 0 = ground, 1 = roof.
// z: 0 = far side, 1 = the side facing the camera.
const HEADLIGHT = [0.93, 0.54, 0.82]
const TAILLIGHT = [0.05, 0.62, 0.8]
const EXHAUST = [0.02, 0.2, 0.7]
// ---------------------------------------------------------------------------

const CAR_LENGTH = 4.6 // scene units the model is scaled to

// How bright each light is in every phase of the start-up.
const LEVELS = {
  off: { env: 0.12, key: 0.15, head: 0, tail: 0 },
  cranking: { env: 0.45, key: 0.6, head: 0, tail: 1 },
  running: { env: 1, key: 1.4, head: 1, tail: 1 },
  leaving: { env: 1, key: 1.4, head: 1, tail: 1 },
}

function pointIn(box, [fx, fy, fz]) {
  return new THREE.Vector3(
    THREE.MathUtils.lerp(box.min.x, box.max.x, fx),
    THREE.MathUtils.lerp(box.min.y, box.max.y, fy),
    THREE.MathUtils.lerp(box.min.z, box.max.z, fz),
  )
}

// Load the model, scale it to CAR_LENGTH, stand it on the floor, nose to +X.
function useNormalisedCar(url) {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const car = scene.clone(true)
    const turned = new THREE.Group()
    car.rotation.y = MODEL_TURN
    turned.add(car)

    let box = new THREE.Box3().setFromObject(turned)
    const size = box.getSize(new THREE.Vector3())
    const scale = CAR_LENGTH / Math.max(size.x, 0.0001)
    turned.scale.setScalar(scale)
    box = new THREE.Box3().setFromObject(turned)
    const centre = box.getCenter(new THREE.Vector3())
    turned.position.set(-centre.x, -box.min.y, -centre.z)
    box = new THREE.Box3().setFromObject(turned)

    car.traverse((child) => {
      if (!child.isMesh) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      if (HIDE_MATCH.test(child.name) || materials.some((material) => HIDE_MATCH.test(material?.name || ''))) {
        child.visible = false
        return
      }
      child.castShadow = true
      materials.forEach((material) => {
        const name = material?.name || ''
        if (PAINT_COLOR && material?.color && PAINT_MATCH.test(name)) {
          material.color.set(PAINT_COLOR)
        }
        if (GLASS_MATCH.test(name) || GLASS_MATCH.test(child.name)) {
          material.color?.set('#0a0c10')
          material.transmission = 0
          material.transparent = false
          material.opacity = 1
          material.roughness = 0.08
          material.metalness = 0.85
          material.side = THREE.DoubleSide
          material.needsUpdate = true
        }
      })
    })

    return {
      object: turned,
      head: pointIn(box, HEADLIGHT),
      tail: pointIn(box, TAILLIGHT),
      exhaust: pointIn(box, EXHAUST),
      box,
    }
  }, [scene])
}

function Car({ url, phase, hostRef, onReady }) {
  const car = useNormalisedCar(url)
  const keyLight = useRef(null)
  const headLight = useRef(null)
  const headTarget = useRef(null)
  const tailLight = useRef(null)
  const current = useRef({ ...LEVELS.off })
  const flickerUntil = useRef(0)
  const lastPhase = useRef(phase)
  const projected = useRef({})

  useLayoutEffect(() => {
    if (headLight.current && headTarget.current) headLight.current.target = headTarget.current
  }, [])

  // Mark the host so CSS switches to the 3D layout; undo on unmount.
  useEffect(() => {
    const host = hostRef.current
    host?.classList.add('is-3d')
    onReady?.()
    return () => host?.classList.remove('is-3d')
  }, [hostRef, onReady])

  useFrame((state, delta) => {
    if (lastPhase.current !== phase) {
      if (phase === 'running' && lastPhase.current !== 'leaving') {
        flickerUntil.current = state.clock.elapsedTime + 0.7
      }
      lastPhase.current = phase
    }

    // Ease every light towards its level for this phase.
    const goal = LEVELS[phase] || LEVELS.off
    const ease = 1 - Math.exp(-delta * 5)
    const now = current.current
    Object.keys(goal).forEach((key) => {
      now[key] += (goal[key] - now[key]) * ease
    })
    // Headlights stutter on, like the beam in the CSS.
    let head = now.head
    if (state.clock.elapsedTime < flickerUntil.current) {
      head *= Math.sin(state.clock.elapsedTime * 55) > 0 ? 1 : 0.15
    }

    state.scene.environmentIntensity = now.env
    if (keyLight.current) keyLight.current.intensity = now.key * 3.2
    if (headLight.current) headLight.current.intensity = head * 60
    if (tailLight.current) tailLight.current.intensity = now.tail * 2.5

    // Tell the page where the lamps and exhaust are on screen, so the CSS
    // beam, glow and smoke line up with the model.
    const host = hostRef.current
    if (!host) return
    const anchors = { head: car.head, tail: car.tail, exhaust: car.exhaust }
    Object.entries(anchors).forEach(([name, point]) => {
      const screen = point.clone().project(state.camera)
      const x = (((screen.x + 1) / 2) * 100).toFixed(2)
      const y = (((1 - screen.y) / 2) * 100).toFixed(2)
      const key = `${x},${y}`
      if (projected.current[name] !== key) {
        projected.current[name] = key
        host.style.setProperty(`--${name}-x`, `${x}%`)
        host.style.setProperty(`--${name}-y`, `${y}%`)
      }
    })
  })

  const ahead = car.head.clone().add(new THREE.Vector3(8, -0.6, 0))

  return (
    <>
      <primitive object={car.object} />
      <directionalLight castShadow position={[-3, 6, 4]} ref={keyLight} />
      <spotLight
        angle={0.5}
        color="#fff4e0"
        decay={1.6}
        distance={18}
        penumbra={0.6}
        position={car.head.toArray()}
        ref={headLight}
      />
      <object3D position={ahead.toArray()} ref={headTarget} />
      <pointLight color="#ff2030" decay={2} distance={3} position={car.tail.toArray()} ref={tailLight} />
    </>
  )
}

// The model is big, so the SVG drawing stays on screen until it is ready.
function UrusScene3D({ url, phase, hostRef }) {
  const [ready, setReady] = useState(false)
  const markReady = useMemo(() => () => setReady(true), [])
  return (
    <>
    <Canvas
      camera={{ fov: 28, near: 0.1, far: 60, position: [1.7, 1.3, 6.3] }}
      className="garage-canvas"
      dpr={[1, 1.75]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.35 }}
      onCreated={({ camera }) => camera.lookAt(0.15, 0.68, 0)}
      shadows
      style={{ opacity: ready ? 1 : 0, transition: 'opacity 700ms ease' }}
    >
      <Suspense fallback={null}>
      <Car hostRef={hostRef} onReady={markReady} phase={phase} url={url} />

      {/* No floor mesh: the page background shows through, only the soft
          contact shadow is drawn under the car. */}
      <ContactShadows blur={2.6} far={2.5} frames={1} opacity={0.75} position={[0, 0.002, 0]} scale={9} />

      {/* Studio reflections built from soft panels - nothing downloaded. */}
      <Environment resolution={256}>
        <Lightformer intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 5, 1]} />
        <Lightformer intensity={1.6} position={[0, 1.4, 9]} scale={[14, 3, 1]} />
        <Lightformer intensity={2} position={[-6, 1.5, 2]} rotation-y={Math.PI / 2} scale={[10, 1.2, 1]} />
        <Lightformer intensity={2} position={[6, 1.5, 2]} rotation-y={-Math.PI / 2} scale={[10, 1.2, 1]} />
      </Environment>
      </Suspense>
    </Canvas>
    {!ready && <SuperSuv />}
    </>
  )
}

export default UrusScene3D
