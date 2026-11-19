import { useEffect } from 'react'

export function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// Fades [data-reveal] elements in the first time they scroll into view.
// The page only hides them after this runs (class "reveal-ready" on the root),
// so content is never stuck invisible if JavaScript or the observer fails.
// Only opacity/transform animate, so it stays smooth on low-end phones.
export function useRevealOnScroll(rootRef, refreshKey) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || prefersReducedMotion() || !('IntersectionObserver' in window)) return undefined

    root.classList.add('reveal-ready')
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-revealed')
        observer.unobserve(entry.target)
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 })

    root.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach((element) => {
      observer.observe(element)
    })

    // Safety net for jumps (menu links, Home/End): once scrolling settles,
    // reveal anything already on screen in case the observer missed it.
    let timer = 0
    const revealVisible = () => {
      const limit = window.innerHeight
      root.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach((element) => {
        const rect = element.getBoundingClientRect()
        if (rect.top < limit && rect.bottom > 0) {
          element.classList.add('is-revealed')
          observer.unobserve(element)
        }
      })
    }
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(revealVisible, 120)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('hashchange', onScroll)
    const initial = window.setTimeout(revealVisible, 400)

    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      window.clearTimeout(initial)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('hashchange', onScroll)
    }
  }, [rootRef, refreshKey])
}

// Gentle parallax for the hero photo: one transform per animation frame, only
// while the hero is on screen, only on wide screens.
export function useHeroParallax(targetRef) {
  useEffect(() => {
    const target = targetRef.current
    if (!target || prefersReducedMotion() || !window.matchMedia('(min-width: 960px)').matches) {
      return undefined
    }

    let frame = 0
    let visible = true
    const update = () => {
      frame = 0
      const offset = Math.min(window.scrollY, 600) * 0.08
      target.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`
    }
    const onScroll = () => {
      if (visible && !frame) frame = window.requestAnimationFrame(update)
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    observer.observe(target)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [targetRef])
}
