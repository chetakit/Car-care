import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Activity, KeyRound, Volume2, VolumeX } from 'lucide-react'
import CustomerHeader from '../Customer/CustomerHeader.jsx'
import LanguageToggle from '../i18n/LanguageToggle.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import CarModel from './CarModel.jsx'
import { useCarModel3d } from './useCarModel3d.js'
import LoginForm from './LoginForm.jsx'
import RegisterForm from './RegisterForm.jsx'
import {
  isEngineIdleOn,
  isEngineMuted,
  playEngineDriveOff,
  playEngineRev,
  playEngineStall,
  playEngineStart,
  playGearShift,
  preloadEngineSample,
  primeEngineAudio,
  setEngineIdleOn,
  setEngineMuted,
  setEngineSoundPaused,
  stopEngineSound,
} from './engineSound.js'
import './auth.css'

// /login and /register share this page, so switching between them keeps the
// engine running. The form sits in the car's headlight:
//   off      - dark garage, "tap the car to start" (auto-starts after 2s)
//   cranking - starter turns, car shakes
//   running  - lights on, exhaust smoke, form revealed; tap the car to rev
//   leaving  - signed in: the car drives off, then the app navigates
const STARTED_KEY = 'car-care-engine-started'
const AUTO_START_MS = 2000
const CRANK_MS = 1000
const DRIVE_OFF_MS = 1100

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function wasStartedThisSession() {
  try {
    return window.sessionStorage.getItem(STARTED_KEY) === '1'
  } catch {
    return false
  }
}

function rememberStarted() {
  try {
    window.sessionStorage.setItem(STARTED_KEY, '1')
  } catch {
    // Storage blocked: the car just starts again next time.
  }
}

function AuthGaragePage({ mode = 'login', registrationSuccess = false, onNavigate }) {
  const { t } = useLanguage()
  const [phase, setPhase] = useState(() =>
    prefersReducedMotion() || wasStartedThisSession() ? 'running' : 'off',
  )
  const [jolt, setJolt] = useState({ type: '', id: 0 })
  const [muted, setMuted] = useState(isEngineMuted)
  const [idleOn, setIdleOn] = useState(isEngineIdleOn)
  const timers = useRef([])
  const carRef = useRef(null)
  const modelAvailable = useCarModel3d()
  const [modelFailed, setModelFailed] = useState(false)

  const later = useCallback((callback, ms) => {
    const id = window.setTimeout(callback, ms)
    timers.current.push(id)
    return id
  }, [])

  useEffect(() => {
    preloadEngineSample()
    const onVisibility = () => setEngineSoundPaused(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id))
      stopEngineSound()
    },
    [],
  )

  // Replay the shake animation on the same element. Remounting it (e.g. with
  // a key) would also remount the 3D scene inside and flash a second car.
  const shakerRef = useRef(null)
  useLayoutEffect(() => {
    const shaker = shakerRef.current
    if (!shaker || !jolt.type) return
    shaker.classList.remove('is-rev', 'is-stall', 'is-shift')
    void shaker.offsetWidth // force a reflow so the animation restarts
    shaker.classList.add(`is-${jolt.type}`)
  }, [jolt])

  const kick = useCallback((type) => {
    setJolt((current) => ({ type, id: current.id + 1 }))
  }, [])

  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const startEngine = useCallback(
    (withSound) => {
      if (phaseRef.current !== 'off') return
      phaseRef.current = 'cranking'
      setPhase('cranking')
      if (withSound) playEngineStart()
      later(() => {
        setPhase('running')
        rememberStarted()
      }, CRANK_MS)
    },
    [later],
  )

  // Nobody tapped the car: start it quietly so the form is never stuck.
  useEffect(() => {
    if (phase !== 'off') return undefined
    const id = window.setTimeout(() => startEngine(false), AUTO_START_MS)
    return () => window.clearTimeout(id)
  }, [phase, startEngine])

  function handleCarClick() {
    if (phase === 'off') {
      startEngine(true)
    } else if (phase === 'running') {
      playEngineRev()
      kick('rev')
    }
  }

  function toggleIdle() {
    const next = !idleOn
    setEngineIdleOn(next)
    setIdleOn(next)
  }

  function toggleSound() {
    const next = !muted
    setEngineMuted(next)
    setMuted(next)
  }

  function switchMode(event, path) {
    if ((path === '/register') === (mode === 'register')) {
      event.preventDefault()
      return
    }
    onNavigate?.(event, path)
    if (event.defaultPrevented) {
      if (phase === 'running') {
        playGearShift()
        kick('shift')
      }
    }
  }

  const handleFail = useCallback(() => {
    playEngineStall()
    kick('stall')
  }, [kick])

  const driveOff = useCallback(() => {
    if (prefersReducedMotion()) return Promise.resolve()
    playEngineDriveOff()
    setPhase('leaving')
    return new Promise((resolve) => later(resolve, DRIVE_OFF_MS))
  }, [later])

  const isOff = phase === 'off'
  const formLit = phase === 'running' || phase === 'leaving'

  return (
    <>
      <CustomerHeader bookingAvailable={false} user={null} />
      <main className={`shared-auth-page garage is-${phase}`}>
        <div aria-hidden="true" className="garage-ceiling" />
        <div aria-hidden="true" className="garage-floor" />

        <div className="garage-layout">
          <section aria-label={t('auth.garage.sceneLabel')} className="garage-scene">
            <button
              aria-label={t(muted ? 'auth.garage.soundOn' : 'auth.garage.soundOff')}
              aria-pressed={!muted}
              className="garage-sound"
              onClick={toggleSound}
              title={t(muted ? 'auth.garage.soundOn' : 'auth.garage.soundOff')}
              type="button"
            >
              {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            </button>

            <div className="garage-stage">
              <button
                aria-label={t(isOff ? 'auth.garage.start' : 'auth.garage.rev')}
                className="garage-car"
                ref={carRef}
                disabled={phase === 'cranking' || phase === 'leaving'}
                onClick={handleCarClick}
                type="button"
              >
                <span aria-hidden="true" className="garage-beam" />
                <span aria-hidden="true" className="garage-tail-glow" />
                <span aria-hidden="true" className="garage-smoke">
                  {Array.from({ length: 7 }, (_, index) => (
                    <i key={index} style={{ '--puff': index }} />
                  ))}
                </span>
                <span
                  aria-hidden="true"
                  className="garage-car-shaker"
                  ref={shakerRef}
                >
                  <CarModel
                    hostRef={carRef}
                    onFail={() => setModelFailed(true)}
                    phase={phase}
                    use3d={modelAvailable && !modelFailed}
                  />
                  <span className="garage-burst">
                    {Array.from({ length: 5 }, (_, index) => (
                      <i key={index} style={{ '--puff': index }} />
                    ))}
                  </span>
                </span>
              </button>
            </div>

            <div aria-live="polite" className="garage-hint">
              {isOff ? (
                <>
                  <span className="garage-hint-key"><KeyRound aria-hidden="true" /></span>
                  <span>{t('auth.garage.hint')}</span>
                  <button className="garage-skip" onClick={() => startEngine(false)} type="button">
                    {t('auth.garage.skip')}
                  </button>
                </>
              ) : (
                <>
                  <span className="garage-hint-rev">{t('auth.garage.revHint')}</span>
                  {!muted && (
                    <button
                      aria-pressed={idleOn}
                      className={`garage-idle${idleOn ? ' is-on' : ''}`}
                      onClick={toggleIdle}
                      type="button"
                    >
                      <Activity aria-hidden="true" />
                      {t(idleOn ? 'auth.garage.idleOn' : 'auth.garage.idleOff')}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          <section
            aria-labelledby="garage-form-title"
            className={`garage-card${formLit ? ' is-lit' : ''}`}
            inert={!formLit}
            onSubmitCapture={primeEngineAudio}
          >
            <div className="garage-card-top">
              <nav aria-label={t('auth.garage.modeLabel')} className={`garage-gear is-${mode}`}>
                <span aria-hidden="true" className="garage-gear-knob" />
                <a
                  aria-current={mode === 'login' ? 'page' : undefined}
                  href="/login"
                  onClick={(event) => switchMode(event, '/login')}
                >
                  {t('auth.garage.modeLogin')}
                </a>
                <a
                  aria-current={mode === 'register' ? 'page' : undefined}
                  href="/register"
                  onClick={(event) => switchMode(event, '/register')}
                >
                  {t('auth.garage.modeRegister')}
                </a>
              </nav>
              <LanguageToggle />
            </div>

            <div className="garage-card-body" key={mode}>
              {mode === 'register' ? (
                <RegisterForm onFail={handleFail} onSwitch={switchMode} />
              ) : (
                <LoginForm
                  beforeCommit={driveOff}
                  onFail={handleFail}
                  onSwitch={switchMode}
                  registrationSuccess={registrationSuccess}
                />
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  )
}

export default AuthGaragePage
