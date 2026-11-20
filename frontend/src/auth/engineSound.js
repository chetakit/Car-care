// Engine sounds for the login garage, played with the Web Audio API.
// The real exhaust recording (/sounds/urus.mp3 - "Lamborghini Urus racing
// sound effect" by mizanstock on Pixabay, Pixabay Content License) is cut
// into short clips. If it cannot be loaded, the sounds are synthesised.
//
// Browsers only allow sound after the user clicks or types, so only call the
// play functions from an event handler (click, submit). If sound is muted or
// the browser has no Web Audio, every function quietly does nothing.

const MUTE_KEY = 'car-care-engine-muted'
const IDLE_KEY = 'car-care-engine-idle'
const VOLUME = 0.55
const IDLE_RPM = 52 // synth firing frequency in Hz
const IDLE_LEVEL = 0.16

// Where things are inside urus.mp3 (7.2s): it builds from 0s, peaks around
// 1.7-3.0s and dies away after 4s.
const SAMPLE_URL = '/sounds/urus.mp3'
// Idle: short overlapping slices of the calmer part (4.3-5.5s), slowed down
// and softened, cross-faded into an endless low rumble.
const IDLE_FROM = 4.35
const IDLE_GRAIN = 1 // seconds each slice plays
const IDLE_STEP = 0.75 // a new slice every 0.75s, so they overlap by 0.25s
const IDLE_RATE = 0.85
const IDLE_VOLUME = 0.3

let ctx = null
let master = null
let noise = null
let engine = null // the running synth voice, if any

let sampleBytes = null // Promise<ArrayBuffer | null>, fetched early
let samplePromise = null // Promise<AudioBuffer | null>, decoded on first use
let sample = null
let clip = null // the clip playing now, so a new one can cut it off
let idle = null // the looping idle rumble, if running

export function isEngineMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setEngineMuted(muted) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
  if (muted) stopEngineSound()
}

/** Is the idle rumble between revs switched on? (default: yes) */
export function isEngineIdleOn() {
  try {
    return window.localStorage.getItem(IDLE_KEY) !== '0'
  } catch {
    return true
  }
}

function idleLevel() {
  return isEngineIdleOn() ? IDLE_LEVEL : 0
}

/** Switch the idle rumble on or off. Call from a click so it can start. */
export function setEngineIdleOn(on) {
  try {
    window.localStorage.setItem(IDLE_KEY, on ? '1' : '0')
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
  const c = audio()
  if (!c) return
  if (!on) {
    stopIdle(c.currentTime)
    if (engine) engine.level(0, c.currentTime, 0.3)
    return
  }
  if (engine) engine.level(IDLE_LEVEL, c.currentTime, 0.4)
  withSample(c, () => startIdle(c, c.currentTime + 0.05), () => ensureEngine(c))
}

/** Start downloading the recording (makes no sound, safe on mount). */
export function preloadEngineSample() {
  if (sampleBytes || isEngineMuted()) return
  sampleBytes = fetch(SAMPLE_URL)
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null)
}

function audio() {
  if (isEngineMuted()) return null
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  if (!ctx) {
    ctx = new AudioCtx()
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.ratio.value = 8
    master = ctx.createGain()
    master.gain.value = VOLUME
    master.connect(limiter)
    limiter.connect(ctx.destination)

    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const samples = noise.getChannelData(0)
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Move an AudioParam from where it is now to `value` over `seconds`.
function glide(param, value, at, seconds) {
  param.cancelScheduledValues(at)
  param.setValueAtTime(param.value, at)
  param.linearRampToValueAtTime(value, at + seconds)
}

// ---------- Recorded sample ----------

function loadSample(c) {
  if (!samplePromise) {
    preloadEngineSample()
    samplePromise = (sampleBytes || Promise.resolve(null))
      .then((bytes) => (bytes ? c.decodeAudioData(bytes) : null))
      .then((buffer) => {
        sample = buffer
        return buffer
      })
      .catch(() => null)
  }
  return samplePromise
}

// Use the recording when it is ready, otherwise the synth.
function withSample(c, recorded, synth) {
  if (sample) {
    recorded()
    return
  }
  loadSample(c).then((buffer) => (buffer ? recorded() : synth()))
}

function startIdle(c, at) {
  if (idle || !sample || !isEngineIdleOn()) return
  const bus = c.createGain()
  bus.gain.setValueAtTime(0, at)
  bus.gain.linearRampToValueAtTime(IDLE_VOLUME, at + 1.2)
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 1100
  bus.connect(tone).connect(master)

  const state = { bus, next: at, timer: 0 }
  const schedule = () => {
    while (state.next < c.currentTime + 0.6) {
      const t = Math.max(state.next, c.currentTime + 0.01)
      const slice = c.createBufferSource()
      slice.buffer = sample
      slice.playbackRate.value = IDLE_RATE
      const envelope = c.createGain()
      envelope.gain.setValueAtTime(0, t)
      envelope.gain.linearRampToValueAtTime(1, t + 0.25)
      envelope.gain.setValueAtTime(1, t + IDLE_GRAIN - 0.25)
      envelope.gain.linearRampToValueAtTime(0, t + IDLE_GRAIN)
      slice.connect(envelope).connect(bus)
      slice.start(t, IDLE_FROM + Math.random() * 0.2)
      slice.stop(t + IDLE_GRAIN + 0.02)
      state.next = t + IDLE_STEP
    }
  }
  schedule()
  state.timer = window.setInterval(schedule, 200)
  idle = state
}

function stopIdle(at) {
  if (!idle) return
  const { bus, timer } = idle
  window.clearInterval(timer)
  glide(bus.gain, 0, at, 0.4)
  window.setTimeout(() => bus.disconnect(), 1500)
  idle = null
}

// Turn the idle down while a louder clip plays, then bring it back.
function duckIdle(at, seconds) {
  if (!idle) return
  const { gain } = idle.bus
  glide(gain, 0.04, at, 0.1)
  gain.setValueAtTime(0.04, at + Math.max(0.1, seconds - 0.6))
  gain.linearRampToValueAtTime(IDLE_VOLUME, at + seconds + 0.4)
}

function stopClip(at) {
  if (!clip) return
  glide(clip.gain.gain, 0, at, 0.08)
  clip.source.stop(at + 0.1)
  clip = null
}

// Play part of the recording: from/to in seconds of the file, rate = speed
// (gliding to rateTo), with fades so a cut never clicks.
function playClip(c, options) {
  const {
    from,
    to,
    at = c.currentTime + 0.01,
    level = 1,
    fadeIn = 0.04,
    fadeOut = 0.45,
    rate = 1,
    rateTo = rate,
  } = options
  stopClip(at)
  const source = c.createBufferSource()
  source.buffer = sample
  const gain = c.createGain()
  const length = (to - from) / ((rate + rateTo) / 2)
  source.playbackRate.setValueAtTime(rate, at)
  if (rateTo !== rate) source.playbackRate.linearRampToValueAtTime(rateTo, at + length)
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(level, at + fadeIn)
  gain.gain.setValueAtTime(level, at + Math.max(fadeIn, length - fadeOut))
  gain.gain.linearRampToValueAtTime(0, at + length)
  source.connect(gain).connect(master)
  source.start(at, from)
  source.stop(at + length + 0.02)
  duckIdle(at, length)
  const current = { source, gain, at, level, length }
  clip = current
  source.onended = () => {
    if (clip === current) clip = null
  }
  return current
}

// Play a clip, then let the engine settle into its idle rumble.
function playClipThenIdle(c, options) {
  const current = playClip(c, options)
  startIdle(c, current.at + current.length - 0.8)
  return current
}

// ---------- Synth fallback ----------

function distortion(amount) {
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i * 2) / curve.length - 1
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}

// One engine "voice": a rough sawtooth + sub square through distortion and a
// low-pass filter, with a slow wobble for the V8 burble.
function createEngineVoice(c) {
  const out = c.createGain()
  out.gain.value = 0
  out.connect(master)

  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 5
  filter.frequency.value = 380

  const burble = c.createGain()
  burble.gain.value = 0.75
  const wobble = c.createOscillator()
  wobble.frequency.value = 7
  const wobbleDepth = c.createGain()
  wobbleDepth.gain.value = 0.25
  wobble.connect(wobbleDepth).connect(burble.gain)

  const shaper = c.createWaveShaper()
  shaper.curve = distortion(30)
  shaper.oversample = '2x'

  const saw = c.createOscillator()
  saw.type = 'sawtooth'
  saw.frequency.value = IDLE_RPM
  const sub = c.createOscillator()
  sub.type = 'square'
  sub.frequency.value = IDLE_RPM / 2
  const subLevel = c.createGain()
  subLevel.gain.value = 0.55

  const hiss = c.createBufferSource()
  hiss.buffer = noise
  hiss.loop = true
  const hissBand = c.createBiquadFilter()
  hissBand.type = 'bandpass'
  hissBand.frequency.value = 900
  const hissLevel = c.createGain()
  hissLevel.gain.value = 0.18

  saw.connect(shaper)
  sub.connect(subLevel).connect(shaper)
  hiss.connect(hissBand).connect(hissLevel).connect(shaper)
  shaper.connect(filter).connect(burble).connect(out)

  const sources = [saw, sub, hiss, wobble]
  sources.forEach((source) => source.start())

  return {
    rpm(value, at, seconds) {
      glide(saw.frequency, value, at, seconds)
      glide(sub.frequency, value / 2, at, seconds)
      glide(wobble.frequency, Math.max(4, value / 7), at, seconds)
      glide(filter.frequency, 260 + value * 9, at, seconds)
    },
    level(value, at, seconds) {
      glide(out.gain, value, at, seconds)
    },
    stop(at) {
      glide(out.gain, 0, at, 0.35)
      sources.forEach((source) => source.stop(at + 0.4))
    },
  }
}

// Short crackle from the exhaust.
function pop(c, at, level = 0.5) {
  const burst = c.createBufferSource()
  burst.buffer = noise
  const band = c.createBiquadFilter()
  band.type = 'highpass'
  band.frequency.value = 700
  const gain = c.createGain()
  gain.gain.setValueAtTime(level, at)
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.06)
  burst.connect(band).connect(gain).connect(master)
  burst.start(at, Math.random())
  burst.stop(at + 0.07)
}

// The starter motor: a chugging whine before the engine catches.
function crank(c, at, seconds) {
  const whine = c.createOscillator()
  whine.type = 'sawtooth'
  whine.frequency.setValueAtTime(70, at)
  whine.frequency.linearRampToValueAtTime(95, at + seconds)
  const chug = c.createGain()
  chug.gain.value = 0
  const chugLfo = c.createOscillator()
  chugLfo.type = 'square'
  chugLfo.frequency.value = 11
  const chugDepth = c.createGain()
  chugDepth.gain.value = 0.22
  chugLfo.connect(chugDepth).connect(chug.gain)
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 900
  const out = c.createGain()
  out.gain.setValueAtTime(0, at)
  out.gain.linearRampToValueAtTime(0.9, at + 0.05)
  out.gain.setValueAtTime(0.9, at + seconds - 0.05)
  out.gain.linearRampToValueAtTime(0, at + seconds)
  whine.connect(chug).connect(tone).connect(out).connect(master)
  whine.start(at)
  chugLfo.start(at)
  whine.stop(at + seconds + 0.05)
  chugLfo.stop(at + seconds + 0.05)
}

function ensureEngine(c) {
  if (!engine) {
    engine = createEngineVoice(c)
    engine.level(idleLevel(), c.currentTime, 0.3)
  }
  return engine
}

function synthStart(c, t) {
  if (engine) engine.stop(t)
  engine = createEngineVoice(c)
  engine.rpm(30, t, 0.01)
  engine.rpm(160, t + 0.6, 0.32)
  engine.level(1, t + 0.6, 0.12)
  engine.rpm(IDLE_RPM, t + 1, 0.9)
  engine.level(0.45, t + 1, 0.9)
  engine.level(idleLevel(), t + 2.5, 1.6)
  pop(c, t + 1.05, 0.6)
  pop(c, t + 1.18, 0.4)
}

function synthRev(c) {
  const t = c.currentTime + 0.01
  const voice = ensureEngine(c)
  voice.rpm(175, t, 0.14)
  voice.level(1, t, 0.08)
  voice.rpm(IDLE_RPM, t + 0.2, 0.7)
  voice.level(idleLevel(), t + 0.25, 0.9)
  pop(c, t + 0.4, 0.55)
  pop(c, t + 0.52, 0.35)
  pop(c, t + 0.61, 0.25)
}

function synthShift(c) {
  const t = c.currentTime + 0.01
  const voice = ensureEngine(c)
  voice.rpm(110, t, 0.08)
  voice.level(0.6, t, 0.06)
  voice.rpm(IDLE_RPM, t + 0.12, 0.4)
  voice.level(idleLevel(), t + 0.15, 0.5)
  pop(c, t + 0.22, 0.3)
}

function synthStall(c) {
  const t = c.currentTime + 0.01
  const voice = ensureEngine(c)
  voice.rpm(26, t, 0.25)
  ;[0, 0.14, 0.3, 0.48].forEach((offset, index) => {
    voice.level(0.5, t + offset, 0.03)
    voice.level(0.04, t + offset + 0.07, 0.04)
    pop(c, t + offset + 0.02, 0.45 - index * 0.08)
  })
  voice.rpm(IDLE_RPM, t + 0.65, 0.4)
  voice.level(idleLevel(), t + 0.65, 0.4)
}

function synthDriveOff(c) {
  const t = c.currentTime + 0.01
  const voice = ensureEngine(c)
  voice.rpm(90, t, 0.1)
  voice.level(1, t, 0.1)
  voice.rpm(205, t + 0.1, 1.1)
  voice.stop(t + 1.25)
  engine = null
  pop(c, t + 0.05, 0.6)
}

// ---------- What the page calls ----------

/** Starter turns, then the engine catches with a big rev. */
export function playEngineStart() {
  const c = audio()
  if (!c) return
  const t = c.currentTime + 0.02
  crank(c, t, 0.6)
  withSample(
    c,
    () =>
      playClipThenIdle(c, {
        from: 0.15,
        to: 3.7,
        at: Math.max(t + 0.55, c.currentTime + 0.01),
        fadeIn: 0.08,
        fadeOut: 0.8,
      }),
    () => synthStart(c, t),
  )
}

/** Tap the car: blip the throttle. */
export function playEngineRev() {
  const c = audio()
  if (!c) return
  withSample(c, () => playClipThenIdle(c, { from: 1.5, to: 3.5, fadeOut: 0.6 }), () => synthRev(c))
}

/** Short blip for changing between sign-in and sign-up. */
export function playGearShift() {
  const c = audio()
  if (!c) return
  withSample(
    c,
    () => playClipThenIdle(c, { from: 2.5, to: 3.2, level: 0.6, fadeOut: 0.3 }),
    () => synthShift(c),
  )
}

/** Wrong password: the recording slows and cuts out like a dying engine. */
export function playEngineStall() {
  const c = audio()
  if (!c) return
  withSample(
    c,
    () => {
      const { gain, at, level } = playClipThenIdle(c, {
        from: 2.9,
        to: 3.9,
        level: 0.8,
        fadeOut: 0.3,
        rateTo: 0.45,
      })
      ;[0.12, 0.3, 0.5].forEach((offset) => {
        gain.gain.setValueAtTime(level, at + offset)
        gain.gain.linearRampToValueAtTime(0.08, at + offset + 0.05)
        gain.gain.linearRampToValueAtTime(level, at + offset + 0.1)
      })
    },
    () => synthStall(c),
  )
}

/** Signed in: full throttle as the car drives away. */
export function playEngineDriveOff() {
  const c = audio()
  if (!c) return
  if (engine) {
    engine.stop(c.currentTime)
    engine = null
  }
  withSample(
    c,
    () => {
      stopIdle(c.currentTime)
      playClip(c, { from: 0.4, to: 4.6, fadeOut: 1.2, rateTo: 1.12 })
    },
    () => synthDriveOff(c),
  )
}

/** Fade everything out (leaving the page, or muting). */
export function stopEngineSound() {
  if (!ctx) return
  stopClip(ctx.currentTime)
  stopIdle(ctx.currentTime)
  if (engine) engine.stop(ctx.currentTime)
  engine = null
}

/** Call from a click/submit so later sounds (after a server reply) can play. */
export function primeEngineAudio() {
  const c = audio()
  if (c) loadSample(c)
}

/** Pause all engine sound while the tab is hidden, resume when it is back. */
export function setEngineSoundPaused(paused) {
  if (!ctx) return
  if (paused) ctx.suspend()
  else if (!isEngineMuted()) ctx.resume()
}
