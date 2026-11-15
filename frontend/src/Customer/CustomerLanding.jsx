import { useEffect, useMemo, useState } from 'react'
import { createApiClient } from '../Admin/api/client.js'
import useAuth from '../auth/useAuth.js'
import CustomerHeader, { BrandMark } from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import './customer.css'

const HERO_IMAGE_URL = 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7'
const HERO_IMAGE = `${HERO_IMAGE_URL}?auto=format&fit=crop&w=960&q=85`
const HERO_IMAGE_SRCSET = [
  `${HERO_IMAGE_URL}?auto=format&fit=crop&w=640&q=85 640w`,
  `${HERO_IMAGE_URL}?auto=format&fit=crop&w=960&q=85 960w`,
  `${HERO_IMAGE_URL}?auto=format&fit=crop&w=1600&q=85 1600w`,
].join(', ')

function ArrowIcon({ diagonal = false }) {
  return (
    <svg
      aria-hidden="true"
      className="customer-arrow"
      fill="none"
      viewBox="0 0 20 20"
    >
      {diagonal ? (
        <path d="M5 15 15 5M6 5h9v9" />
      ) : (
        <path d="M3.5 10h12m-5-5 5 5-5 5" />
      )}
    </svg>
  )
}

function ServiceMark() {
  return (
    <span aria-hidden="true" className="customer-service-mark">
      <svg fill="none" viewBox="0 0 28 28">
        <path d="M17.7 5.2a6.1 6.1 0 0 0-7.8 7.8l-5.3 5.3a2.3 2.3 0 0 0 3.2 3.2l5.3-5.3a6.1 6.1 0 0 0 7.8-7.8l-3.6 3.6-3.1-.8-.8-3.1 4.3-2.9Z" />
      </svg>
    </span>
  )
}

function BenefitMark({ kind }) {
  return (
    <span aria-hidden="true" className="customer-benefit-mark">
      <svg fill="none" viewBox="0 0 28 28">
        {kind === 'service' && (
          <path d="M17.7 5.2a6.1 6.1 0 0 0-7.8 7.8l-5.3 5.3a2.3 2.3 0 0 0 3.2 3.2l5.3-5.3a6.1 6.1 0 0 0 7.8-7.8l-3.6 3.6-3.1-.8-.8-3.1 4.3-2.9Z" />
        )}
        {kind === 'schedule' && (
          <>
            <path d="M6 8.5h16v13H6zM9 5v6m10-6v6M6 12.5h16" />
            <path d="m10 17 2.2 2.2L18 14" />
          </>
        )}
        {kind === 'clear' && (
          <>
            <path d="M14 4.5 22 8v5.7c0 4.5-3.1 7.7-8 9.8-4.9-2.1-8-5.3-8-9.8V8l8-3.5Z" />
            <path d="m10 13.8 2.5 2.5 5.2-5.2" />
          </>
        )}
      </svg>
    </span>
  )
}

function CustomerLanding({ user, onLogout }) {
  const { token, handleUnauthorized } = useAuth()
  const catalogPath = user?.role === 'CUSTOMER'
    ? '/api/customer/catalog/services'
    : '/api/public/catalog/services'
  const bookingHref = '/customer/booking'
  const api = useMemo(
    () => createApiClient(token, handleUnauthorized),
    [handleUnauthorized, token],
  )
  const [services, setServices] = useState([])
  const [serviceState, setServiceState] = useState('loading')
  const [serviceReload, setServiceReload] = useState(0)
  const [heroImageFailed, setHeroImageFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    api(catalogPath, { signal: controller.signal })
      .then((response) => {
        const items = response.data?.items
        if (!Array.isArray(items)) {
          throw new Error('The service catalog returned an invalid response.')
        }
        setServices(items)
        setServiceState(items.length > 0 ? 'ready' : 'empty')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setServiceState('error')
      })

    return () => controller.abort()
  }, [api, catalogPath, serviceReload])

  return (
    <div className="customer-home">
      <CustomerHeader
        bookingAvailable={serviceState !== 'empty'}
        onLogout={onLogout}
        user={user}
      />

      <main>
        <section aria-labelledby="customer-hero-title" className="customer-hero" id="home">
          <div className="customer-container customer-hero-grid">
            <div className="customer-hero-copy">
              <span className="customer-eyebrow">
                <span className="customer-eyebrow-dot" />
                CAR CARE, MADE SIMPLE
              </span>
              <h1 id="customer-hero-title">
                A better way to
                <span> care for your car.</span>
              </h1>
              <p>
                {serviceState === 'empty'
                  ? 'Services are currently unavailable. Please check back soon.'
                  : 'Discover practical car care services, review clear details, and book an appointment that fits your schedule.'}
              </p>
              <div className="customer-hero-actions">
                {serviceState !== 'empty' && (
                  <a className="customer-button customer-button-primary" href={bookingHref}>
                    Book a Service
                    <ArrowIcon />
                  </a>
                )}
                <a className="customer-text-link" href="#services">
                  Explore Services
                  <ArrowIcon diagonal />
                </a>
              </div>
              <div className="customer-hero-note">
                <span aria-hidden="true" className="customer-note-check">✓</span>
                <span>Thoughtful care, made straightforward.</span>
              </div>
            </div>

            <div className="customer-hero-visual">
              <div className="customer-hero-image-wrap">
                {heroImageFailed ? (
                  <div
                    aria-label="Car Care"
                    className="customer-hero-image-fallback"
                    role="img"
                  >
                    <BrandMark />
                    <span>Car Care</span>
                  </div>
                ) : (
                  <img
                    alt="A modern sports car ready for the road"
                    className="customer-hero-image"
                    decoding="async"
                    fetchPriority="high"
                    onError={() => setHeroImageFailed(true)}
                    sizes="(max-width: 390px) calc(100vw - 28px), (max-width: 700px) calc(100vw - 36px), (max-width: 1244px) 48vw, 560px"
                    src={HERO_IMAGE}
                    srcSet={HERO_IMAGE_SRCSET}
                  />
                )}
              </div>
              <div className="customer-image-caption">
                <span className="customer-caption-icon">
                  <BrandMark />
                </span>
                <span>
                  <strong>Made for the road ahead</strong>
                  <small>Your car. Your journey. Thoughtful care.</small>
                </span>
              </div>
              <span aria-hidden="true" className="customer-hero-orbit" />
            </div>
          </div>
        </section>

        <section aria-labelledby="customer-services-title" className="customer-services" id="services">
          <div className="customer-container">
            <div className="customer-section-heading">
              <div>
                <span className="customer-eyebrow">THE RIGHT CARE, RIGHT HERE</span>
                <h2 id="customer-services-title">Explore our services</h2>
                <p>Browse the services currently available in the Car Care catalog.</p>
              </div>
              {serviceState !== 'empty' && (
                <a className="customer-section-cta" href={bookingHref}>
                  Book a Service
                  <ArrowIcon />
                </a>
              )}
            </div>

            {serviceState !== 'empty' && (
              <p className="customer-pricing-note">
                Prices depend on vehicle type. Select your vehicle during booking to see the
                applicable price.
              </p>
            )}

            {serviceState === 'loading' && (
              <div aria-live="polite" className="customer-catalog-message">
                <span className="customer-loader" />
                <span>Loading available services…</span>
              </div>
            )}
            {serviceState === 'error' && (
              <div className="customer-catalog-message customer-catalog-error" role="alert">
                <span>We couldn’t load the service catalog.</span>
                <button
                  onClick={() => {
                    setServiceState('loading')
                    setServiceReload((value) => value + 1)
                  }}
                  type="button"
                >
                  Try again
                </button>
              </div>
            )}
            {serviceState === 'empty' && (
              <div
                aria-atomic="true"
                aria-live="polite"
                className="customer-catalog-message"
                role="status"
              >
                No services are currently available to book. Please check back soon.
              </div>
            )}
            {serviceState === 'ready' && (
              <div className="customer-service-grid">
                {services.map((service) => (
                  <article className="customer-service-card" key={service.service_id}>
                    <ServiceMark />
                    <span className="customer-service-label">CAR CARE SERVICE</span>
                    <h3>{service.service_name}</h3>
                    <p>
                      {service.description?.trim() ||
                        'No additional details are listed for this service.'}
                    </p>
                    {service.duration_minutes !== null && service.duration_minutes !== undefined && (
                      <span className="customer-service-duration">
                        {service.duration_minutes} min
                      </span>
                    )}
                  </article>
                ))}
              </div>
            )}

            {serviceState === 'ready' && (
              <div className="customer-services-action">
                <p>Ready to find a service for your car?</p>
                <a className="customer-text-link" href={bookingHref}>
                  Book your service
                  <ArrowIcon />
                </a>
              </div>
            )}
          </div>
        </section>

        {serviceState !== 'empty' && (
          <section aria-labelledby="customer-about-title" className="customer-benefits" id="about">
            <div className="customer-container">
              <div className="customer-section-heading customer-benefits-heading">
                <div>
                  <span className="customer-eyebrow">CAR CARE, MADE CLEAR</span>
                  <h2 id="customer-about-title">Care that fits the way you drive.</h2>
                  <p>Everything you need to choose and book your next service, in one place.</p>
                </div>
              </div>
              <div className="customer-benefit-grid">
                <article className="customer-benefit-card">
                  <BenefitMark kind="service" />
                  <h3>Professional car care</h3>
                  <p>Explore focused service options and clear details before choosing what suits your car.</p>
                </article>
                <article className="customer-benefit-card">
                  <BenefitMark kind="schedule" />
                  <h3>Convenient scheduling</h3>
                  <p>Choose from available appointment times in the online booking flow.</p>
                </article>
                <article className="customer-benefit-card">
                  <BenefitMark kind="clear" />
                  <h3>Clear before you confirm</h3>
                  <p>Review your selected services and booking total before submitting a booking.</p>
                </article>
              </div>
            </div>
          </section>
        )}

        <section aria-labelledby="customer-booking-title" className="customer-promo">
          <div className="customer-container customer-promo-inner">
            <div className="customer-promo-copy">
              <span className="customer-eyebrow customer-eyebrow-light">
                {serviceState === 'empty'
                  ? 'SERVICE CATALOG UPDATE'
                  : 'YOUR NEXT SERVICE STARTS HERE'}
              </span>
              <h2 id="customer-booking-title">
                {serviceState === 'empty'
                  ? 'Services will be available again soon.'
                  : 'Give your car the care it needs.'}
              </h2>
              <p>
                {serviceState === 'empty'
                  ? 'Please check back when services are available to book.'
                  : 'Choose your vehicle, select services, and find an available time for your appointment.'}
              </p>
              {serviceState !== 'empty' && (
                <a className="customer-button customer-button-light" href={bookingHref}>
                  Book a Service
                  <ArrowIcon />
                </a>
              )}
            </div>
            <div aria-hidden="true" className="customer-promo-art">
              <BrandMark />
              <span>CARE</span>
              <span>IN MOTION</span>
            </div>
          </div>
        </section>
      </main>

      <CustomerFooter />
    </div>
  )
}

export default CustomerLanding
