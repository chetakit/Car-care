import { useEffect, useRef, useState } from 'react'
import AdminAccountMenu from '../Admin/components/AdminAccountMenu.jsx'

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

function CustomerHeader({ user, onLogout, bookingAvailable = true, landingPage = false }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const profileRef = useRef(null)
  const isAdmin = user?.role === 'ADMIN'
  const displayName =
    user?.full_name?.trim() ||
    (isAdmin ? user?.email || 'Administrator' : 'Customer')
  const initials = displayName.slice(0, 1).toUpperCase()
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/'
  const isPublicLanding = currentPath === '/'
  const profileTriggerRef = useRef(null)
  const homeHref = '/'
  const servicesHref = isPublicLanding ? '#services' : '/#services'
  const aboutHref = isPublicLanding ? '#about' : '/#about'
  const howItWorksHref = isPublicLanding ? '#how-it-works' : '/#how-it-works'
  const contactHref = isPublicLanding ? '#contact' : '/#contact'

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

  function closeMobileNav() {
    setMobileNavOpen(false)
  }

  return (
    <header className={`customer-header${landingPage ? ' customer-header-landing' : ''}`}>
      <div className="customer-container customer-header-inner">
        <a aria-label="Car Care home" className="customer-brand" href={homeHref}>
          <BrandMark />
          <span className="customer-brand-name">Car Care</span>
        </a>

        <button
          aria-expanded={mobileNavOpen}
          aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          aria-controls="customer-main-navigation"
          className={`customer-menu-toggle${mobileNavOpen ? ' is-open' : ''}`}
          onClick={() => setMobileNavOpen((open) => !open)}
          type="button"
        >
          <span />
          <span />
        </button>

        <nav
          aria-label="Main navigation"
          className={`customer-nav${mobileNavOpen ? ' is-open' : ''}`}
          id="customer-main-navigation"
        >
          {landingPage ? (
            <>
              <a href={homeHref} onClick={closeMobileNav}>Home</a>
              <a href={servicesHref} onClick={closeMobileNav}>Our Services</a>
              <a href={howItWorksHref} onClick={closeMobileNav}>How It Works</a>
              <a href={contactHref} onClick={closeMobileNav}>Contact</a>
              {bookingAvailable && (
                <a
                  className="customer-nav-book"
                  href="/customer/booking"
                  onClick={closeMobileNav}
                >
                  Book a Service
                </a>
              )}
            </>
          ) : (
            <>
              {user?.role === 'CUSTOMER' ? (
                <>
                  <a href={homeHref} onClick={closeMobileNav}>Home</a>
                  <a href="/customer/booking" onClick={closeMobileNav}>Book a Service</a>
                </>
              ) : (
                <>
                  <a href={homeHref} onClick={closeMobileNav}>Home</a>
                  <a href={servicesHref} onClick={closeMobileNav}>Services</a>
                  <a href={aboutHref} onClick={closeMobileNav}>About</a>
                </>
              )}
              {user?.role !== 'CUSTOMER' && isPublicLanding && bookingAvailable && (
                <a
                  className="customer-nav-book"
                  href="/customer/booking"
                  onClick={closeMobileNav}
                >
                  Book a Service
                </a>
              )}
            </>
          )}
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
                  <a href="/customer/vehicles">My Vehicles</a>
                  <a href="/customer/bookings">My Bookings</a>
                  <button
                    onClick={() => {
                      setProfileOpen(false)
                      void onLogout()
                    }}
                    type="button"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <nav aria-label="Account" className="customer-guest-actions">
                <a className="customer-login-link" href="/login">Log in</a>
                <a className="customer-register-link" href="/register">Register</a>
              </nav>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

export default CustomerHeader
