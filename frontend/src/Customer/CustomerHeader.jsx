import { useEffect, useRef, useState } from 'react'
import AdminAccountMenu from '../Admin/components/AdminAccountMenu.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import LanguageToggle from '../i18n/LanguageToggle.jsx'
import './customer-theme.css'

export function BrandMark() {
  return (
    <span aria-hidden="true" className="customer-brand-mark">
      <svg fill="none" viewBox="0 0 32 32">
        <path d="M5 20.5h2.2l2.1-7.1a2.8 2.8 0 0 1 2.7-2h8a2.8 2.8 0 0 1 2.7 2l2.1 7.1H27v4h-2.1v1.7h-3v-1.7H10.1v1.7h-3v-1.7H5v-4Z" />
        <path d="M9.3 18.2h13.4l-1.5-4.7H10.8l-1.5 4.7ZM10.4 21.3h.1m11 0h.1" />
      </svg>
    </span>
  )
}

function CustomerHeader({ user, onLogout, bookingAvailable = true }) {
  const { t } = useLanguage()
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const profileRef = useRef(null)
  const isAdmin = user?.role === 'ADMIN'
  const displayName =
    user?.full_name?.trim() ||
    user?.email ||
    t(isAdmin ? 'admin.account.fallbackName' : 'customer.account.fallbackName')
  const initials = displayName.slice(0, 1).toUpperCase()
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/'
  const isPublicLanding = currentPath === '/'
  const isCustomer = user?.role === 'CUSTOMER'
  const profileTriggerRef = useRef(null)
  const homeHref = '/'
  const servicesHref = '/services'
  const howItWorksHref = isPublicLanding ? '#how-it-works' : '/#how-it-works'
  const contactHref = isPublicLanding ? '#contact' : '/#contact'
  const customerLabel = (key, fallback) => {
    const translation = t(key)
    return translation === key ? fallback : translation
  }

  useEffect(() => {
    if (!profileOpen) return undefined

    function handlePointerDown(event) {
      if (!profileRef.current?.contains(event.target)) setProfileOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setProfileOpen(false)
        profileTriggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [profileOpen])

  // Glass + compact header once the page scrolls, and the red reading
  // progress bar. Checked at most once per animation frame.
  const [scrolled, setScrolled] = useState(() => window.scrollY > 8)
  const progressRef = useRef(null)
  const [atBottom, setAtBottom] = useState(false)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const y = window.scrollY
      setScrolled(y > 8)
      const max = document.documentElement.scrollHeight - window.innerHeight
      const progress = max > 0 ? Math.min(1, y / max) : 0
      // The footer (contact) is short, so count the very bottom as "contact".
      setAtBottom(max > 0 && y >= max - 4)
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress.toFixed(4)})`
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  // Which menu item is "current": the page, or on Home the section in view.
  const pageKey = currentPath === '/services' ? 'services' : currentPath === '/' ? 'home' : ''
  const [sectionKey, setSectionKey] = useState('')
  useEffect(() => {
    if (!isPublicLanding || !('IntersectionObserver' in window)) return undefined
    const sections = [
      ['home', 'home'],
      ['services', 'services'],
      ['how-it-works', 'how'],
      ['contact', 'contact'],
    ]
    const visible = new Map()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0)
      }
      // The section taking up most of the band near the top of the screen wins.
      let best = ''
      let bestRatio = 0
      for (const [id, key] of sections) {
        const ratio = visible.get(id) ?? 0
        if (ratio > bestRatio) {
          best = key
          bestRatio = ratio
        }
      }
      if (best) setSectionKey(best)
    }, { rootMargin: '-35% 0px -45% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] })

    // Sections render after the catalog loads; look them up shortly after.
    const timer = window.setTimeout(() => {
      for (const [id] of sections) {
        const element = document.getElementById(id)
        if (element) observer.observe(element)
      }
    }, 300)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [isPublicLanding])
  const activeKey = (isPublicLanding && (atBottom ? 'contact' : sectionKey)) || pageKey

  // Red underline that glides to the hovered item, else the current one.
  const navRef = useRef(null)
  const [hoverKey, setHoverKey] = useState('')
  const [indicator, setIndicator] = useState(null)
  useEffect(() => {
    const place = () => {
      const key = hoverKey || activeKey
      const nav = navRef.current
      const link = key ? nav?.querySelector(`[data-nav-key="${key}"]`) : null
      if (!link || !nav || !link.offsetParent) {
        setIndicator(null)
        return
      }
      setIndicator({ left: link.offsetLeft, width: link.offsetWidth })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [activeKey, hoverKey, t])
  const navLinkProps = (key) => ({
    'aria-current': activeKey === key ? (pageKey === key && !sectionKey ? 'page' : 'location') : undefined,
    className: activeKey === key ? 'is-current' : undefined,
    onBlur: () => setHoverKey(''),
    onFocus: () => setHoverKey(key),
    onMouseEnter: () => setHoverKey(key),
    'data-nav-key': key,
  })

  function closeMobileNav() {
    setMobileNavOpen(false)
  }

  return (
    <header className={`customer-header customer-header-landing${isCustomer ? ' customer-header-customer' : ''}${scrolled ? ' is-scrolled' : ''}`}>
      <span aria-hidden="true" className="customer-scroll-progress" ref={progressRef} />
      <div className="customer-container customer-header-inner">
        <a
          aria-label={customerLabel('customer.header.home', 'Car Care home')}
          className="customer-brand"
          href={homeHref}
        >
          <BrandMark />
          <span className="customer-brand-name">Car Care</span>
        </a>

        <button
          aria-expanded={mobileNavOpen}
          aria-label={customerLabel(
            mobileNavOpen
              ? 'customer.header.closeNavigation'
              : 'customer.header.openNavigation',
            mobileNavOpen ? 'Close navigation' : 'Open navigation',
          )}
          aria-controls="customer-main-navigation"
          className={`customer-menu-toggle${mobileNavOpen ? ' is-open' : ''}`}
          onClick={() => setMobileNavOpen((open) => !open)}
          type="button"
        >
          <span />
          <span />
        </button>

        <nav
          aria-label={customerLabel('customer.header.mainNavigation', 'Main navigation')}
          className={`customer-nav${mobileNavOpen ? ' is-open' : ''}`}
          id="customer-main-navigation"
          onMouseLeave={() => setHoverKey('')}
          ref={navRef}
        >
          {indicator && (
            <span
              aria-hidden="true"
              className="customer-nav-indicator"
              style={{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }}
            />
          )}
          {/* One menu on every page and for every role (guest, customer, admin). */}
          <a href={homeHref} onClick={closeMobileNav} {...navLinkProps('home')}>
            {customerLabel('customer.header.home', 'Home')}
          </a>
          <a href={servicesHref} onClick={closeMobileNav} {...navLinkProps('services')}>
            {customerLabel('customer.header.ourServices', 'Our Services')}
          </a>
          <a href={howItWorksHref} onClick={closeMobileNav} {...navLinkProps('how')}>
            {customerLabel('customer.header.howItWorks', 'How It Works')}
          </a>
          <a href={contactHref} onClick={closeMobileNav} {...navLinkProps('contact')}>
            {customerLabel('customer.header.contact', 'Contact')}
          </a>
          {bookingAvailable && (
            <a
              className="customer-nav-book"
              href="/customer/booking"
              onClick={closeMobileNav}
            >
              {customerLabel('customer.header.bookService', 'Book a Service')}
            </a>
          )}
          <LanguageToggle />
        </nav>

        {isAdmin ? (
          <AdminAccountMenu onLogout={onLogout} user={user} variant="home" />
        ) : (
          <div className="customer-account" ref={profileRef}>
            {user ? (
              <>
                <button
                  aria-expanded={profileOpen}
                  aria-controls="customer-account-menu"
                  className="customer-account-trigger"
                  onClick={() => setProfileOpen((open) => !open)}
                  ref={profileTriggerRef}
                  type="button"
                >
                  <span className="customer-avatar">{initials}</span>
                  <span className="customer-account-name">{displayName}</span>
                  <svg aria-hidden="true" className="customer-chevron" fill="none" viewBox="0 0 16 16">
                    <path d="m4 6 4 4 4-4" />
                  </svg>
                </button>
                <div
                  className="customer-account-menu"
                  hidden={!profileOpen}
                  id="customer-account-menu"
                >
                  <div className="customer-account-summary">
                    <strong>{displayName}</strong>
                    {user.email && <span>{user.email}</span>}
                  </div>
                  {user.role === 'CUSTOMER' && (
                    <a href="/customer/profile">
                      {customerLabel('customer.header.myProfile', 'My Profile')}
                    </a>
                  )}
                  <a href="/customer/vehicles">
                    {customerLabel('customer.header.myVehicles', 'My Vehicles')}
                  </a>
                  <a href="/customer/bookings">
                    {customerLabel('customer.header.myBookings', 'My Bookings')}
                  </a>
                  {user.role === 'CUSTOMER' && (
                    <a href="/customer/wallet">
                      {customerLabel('customer.header.myWallet', 'My Wallet')}
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setProfileOpen(false)
                      void onLogout()
                    }}
                    type="button"
                  >
                    {customerLabel('customer.header.signOut', 'Sign out')}
                  </button>
                </div>
              </>
            ) : (
              <nav
                aria-label={customerLabel('customer.header.accountNavigation', 'Account')}
                className="customer-guest-actions"
              >
                <a className="customer-login-link" href="/login">
                  {customerLabel('customer.header.login', 'Log in')}
                </a>
                <a className="customer-register-link" href="/register">
                  {customerLabel('customer.header.register', 'Register')}
                </a>
              </nav>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

export default CustomerHeader
