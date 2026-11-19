import { useEffect, useRef, useState } from 'react'
import { formatCustomerMoney } from './customerFormatters.js'
import { prefersReducedMotion } from './useLandingMotion.js'

// A baht amount that rolls smoothly to its new value when it changes
// (about 0.45s, ease-out). Jumps straight there when motion is reduced.
function AnimatedPrice({ value, language }) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    if (from === value || prefersReducedMotion()) {
      fromRef.current = value
      setShown(value)
      return undefined
    }
    let frame = 0
    let start = 0
    const step = (time) => {
      if (!start) start = time
      const progress = Math.min(1, (time - start) / 450)
      const current = from + (value - from) * (1 - (1 - progress) ** 3)
      fromRef.current = current
      setShown(current)
      if (progress < 1) frame = window.requestAnimationFrame(step)
    }
    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [value])

  return <>{formatCustomerMoney(Math.round(shown), language)}</>
}

export default AnimatedPrice
