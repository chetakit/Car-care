import { useEffect, useMemo, useRef, useState } from 'react'
import { createApiClient } from '../Admin/api/client.js'
import useAuth from '../auth/useAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import CustomerHeader, { BrandMark } from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import ServiceIcon from './ServiceIcon.jsx'
import { formatCustomerMoney } from './customerFormatters.js'
import { useHeroParallax, useRevealOnScroll } from './useLandingMotion.js'
import { SERVICE_IMAGE_URL } from './serviceAssets.js'
import { SHOP_LINE_ID, SHOP_PHONE, SHOP_PHONE_HREF } from './shopInfo.js'
import './customer.css'

// Bugatti Chiron at night — the red badge echoes the brand colour.
const HERO_IMAGE_URL = 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b'
const HERO_IMAGE = `${HERO_IMAGE_URL}?auto=format&fit=crop&w=960&q=85`
const HERO_IMAGE_SRCSET = [
  `${HERO_IMAGE_URL}?auto=format&fit=crop&w=640&q=85 640w`,
  `${HERO_IMAGE_URL}?auto=format&fit=crop&w=960&q=85 960w`,
  `${HERO_IMAGE_URL}?auto=format&fit=crop&w=1600&q=85 1600w`,
].join(', ')
// How booking works, in the order the system enforces it.
const PROCESS_STEPS = [
  { key: 'vehicle' },
  { key: 'service' },
  { key: 'time' },
  { key: 'pay' },
  { key: 'visit' },
]

// Matches the server rules: free cancel before payment, 20% fee after,
// no cancelling once the appointment starts, no refund for a no-show.
const POLICY_RULES = [
  { key: 'unpaid', figure: '0%', tone: 'good' },
  { key: 'paid', figure: '80%', tone: 'info' },
  { key: 'started', figure: '—', tone: 'muted' },
  { key: 'noShow', figure: '0 ฿', tone: 'warn' },
]

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
            <path d="M7 4.5h9l5 5v14H7zM16 4.5v5h5M10 14h8m-8 4h6" />
          </>
        )}
      </svg>
    </span>
  )
}

function CustomerLanding({ user, onLogout }) {
  const { token, handleUnauthorized } = useAuth()
  const { language, t } = useLanguage()
  // The public catalog also carries each service's price per vehicle type.
  const catalogPath = '/api/public/catalog/services'
  const bookingHref = '/customer/booking'
  const api = useMemo(
    () => createApiClient(token, handleUnauthorized),
    [handleUnauthorized, token],
  )
  const [services, setServices] = useState([])
  const [serviceState, setServiceState] = useState('loading')
  const [serviceReload, setServiceReload] = useState(0)
  const [heroImageFailed, setHeroImageFailed] = useState(false)
  const [serviceImageFailed, setServiceImageFailed] = useState(false)
  const rootRef = useRef(null)
  const heroImageRef = useRef(null)
  useRevealOnScroll(rootRef, serviceState)
  useHeroParallax(heroImageRef)


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

  // Links such as /#about arrive before React has drawn the sections, so the
  // browser cannot jump to them. Scroll once the services above have loaded
  // (they change the page height).
  useEffect(() => {
    if (serviceState === 'loading') return undefined
    const targetId = decodeURIComponent(window.location.hash.slice(1))
    if (!targetId) return undefined
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [serviceState])

  return (
    <div className="customer-home customer-landing" ref={rootRef}>
      <CustomerHeader
        bookingAvailable={serviceState !== 'empty'}
        onLogout={onLogout}
        user={user}
      />

      <main>
        <section aria-labelledby="customer-hero-title" className="customer-hero" id="home">
          <div className="customer-container customer-hero-grid">
            <div className="customer-hero-copy">
              <span className="customer-eyebrow customer-rise" style={{ '--rise-delay': '60ms' }}>
                <span className="customer-eyebrow-dot" />
                {t('customer.landing.eyebrow')}
              </span>
              <h1 id="customer-hero-title">
                <span className="customer-rise customer-hero-line" style={{ '--rise-delay': '160ms' }}>
                  {t('customer.landing.heroTitle')}
                </span>
                {' '}
                <span className="customer-rise customer-hero-line customer-hero-accent" style={{ '--rise-delay': '280ms' }}>
                  {t('customer.landing.heroTitleAccent')}
                  <span aria-hidden="true" className="customer-hero-underline" />
                </span>
              </h1>
              <p className="customer-rise" style={{ '--rise-delay': '420ms' }}>
                {serviceState === 'empty'
                  ? t('customer.landing.noServicesDescription')
                  : t('customer.landing.heroDescription')}
              </p>
              <div className="customer-hero-actions customer-rise" style={{ '--rise-delay': '540ms' }}>
                {serviceState !== 'empty' && (
                  <a className="customer-button customer-button-primary" href={bookingHref}>
                    {t('customer.common.bookService')}
                    <ArrowIcon />
                  </a>
                )}
                <a className="customer-text-link" href="#services">
                  {t('customer.landing.viewServices')}
                  <ArrowIcon diagonal />
                </a>
              </div>
            </div>

            <div className="customer-hero-visual customer-rise" style={{ '--rise-delay': '200ms' }}>
              <div className="customer-hero-image-wrap" ref={heroImageRef}>
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
                    alt={t('customer.landing.carCareImageAlt')}
                    className="customer-hero-image"
                    decoding="async"
                    fetchPriority="high"
                    onError={() => setHeroImageFailed(true)}
                    sizes="(max-width: 390px) calc(100vw - 28px), (max-width: 700px) calc(100vw - 36px), (max-width: 1244px) 48vw, 560px"
                    src={HERO_IMAGE}
                    srcSet={HERO_IMAGE_SRCSET}
                  />
                )}
                {!heroImageFailed && <span aria-hidden="true" className="customer-hero-shine" />}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="customer-services-title" className="customer-services" id="services">
          <div className="customer-container">
            <div className="customer-section-heading" data-reveal>
              <div>
                <span className="customer-eyebrow">
                  {t('customer.landing.availableServicesEyebrow')}
                </span>
                <h2 id="customer-services-title">
                  {t('customer.landing.servicesTitle')}
                </h2>
                <p>{t('customer.landing.catalogDescription')}</p>
              </div>
              {serviceState !== 'empty' && (
                <a className="customer-section-cta" href={bookingHref}>
                  {t('customer.landing.bookingPageLink')}
                  <ArrowIcon />
                </a>
              )}
            </div>

            {serviceState !== 'empty' && (
              <p className="customer-pricing-note">
                {t('customer.landing.priceByVehicleNote')}
              </p>
            )}

            <div className="customer-services-layout">
              <figure className="customer-services-visual" data-reveal>
                {serviceImageFailed ? (
                  <div className="customer-services-image-fallback">
                    <BrandMark />
                    <span>CAR CARE</span>
                  </div>
                ) : (
                  <img
                    alt={t('customer.landing.serviceImageAlt')}
                    className="customer-services-image"
                    decoding="async"
                    loading="lazy"
                    onError={() => setServiceImageFailed(true)}
                    src={SERVICE_IMAGE_URL}
                  />
                )}
                <figcaption>
                  <span>{t('customer.landing.serviceCategory')}</span>
                  <strong>{t('customer.landing.serviceDetailsCaption')}</strong>
                </figcaption>
              </figure>

              <div className="customer-services-content">
                {serviceState === 'loading' && (
                  <div aria-live="polite" className="customer-catalog-message">
                    <span className="customer-loader" />
                    <span>{t('customer.landing.loadingServices')}</span>
                  </div>
                )}
                {serviceState === 'error' && (
                  <div className="customer-catalog-message customer-catalog-error" role="alert">
                    <span>{t('customer.landing.loadServicesError')}</span>
                    <button
                      onClick={() => {
                        setServiceState('loading')
                        setServiceReload((value) => value + 1)
                      }}
                      type="button"
                    >
                      {t('customer.common.retry')}
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
                    {t('customer.landing.noServicesAvailable')}
                  </div>
                )}
                {serviceState === 'ready' && (
                  <div className="customer-service-list">
                    {services.slice(0, 3).map((service, index) => (
                      <article
                        className="customer-service-card"
                        data-reveal
                        key={service.service_id}
                        style={{ '--reveal-delay': `${index * 90}ms` }}
                      >
                        <ServiceIcon name={service.service_name} />
                        <div className="customer-service-copy">
                          <h3>{service.service_name}</h3>
                          <p>
                            {service.description?.trim() ||
                              t('customer.landing.noServiceDescription')}
                          </p>
                        </div>
                        <span className="customer-service-side">
                          {service.prices?.length > 0 && (
                            <strong className="customer-service-price">
                              {t('customer.services.priceFrom', {
                                amount: formatCustomerMoney(service.prices[0].price, language),
                              })}
                            </strong>
                          )}
                          {service.duration_minutes !== null && service.duration_minutes !== undefined && (
                            <span className="customer-service-duration">
                              {t('customer.landing.durationMinutes', {
                                minutes: service.duration_minutes,
                              })}
                            </span>
                          )}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <a className="customer-section-cta customer-view-all-services" href="/services">
              {t('customer.landing.viewAllServices')}
              <ArrowIcon />
            </a>

            {serviceState === 'ready' && (
              <div className="customer-services-action">
                <p>{t('customer.landing.readyToChoose')}</p>
                <a className="customer-button customer-button-primary" href={bookingHref}>
                  {t('customer.landing.startBooking')}
                  <ArrowIcon />
                </a>
              </div>
            )}
          </div>
        </section>

        <section
          aria-labelledby="customer-process-title"
          className="customer-process"
          id="how-it-works"
        >
          <div className="customer-container">
            <div className="customer-section-heading" data-reveal>
              <div>
                <span className="customer-eyebrow">
                  {t('customer.landing.bookingSteps')}
                </span>
                <h2 id="customer-process-title">
                  {t('customer.landing.threeStepsTitle')}
                </h2>
                <p>{t('customer.landing.stepsDescription')}</p>
              </div>
            </div>
            <ol className="customer-timeline" data-reveal>
              {PROCESS_STEPS.map((step, index) => (
                <li
                  className={step.key === 'pay' ? 'is-key' : undefined}
                  key={step.key}
                  style={{ '--step': index }}
                >
                  <span aria-hidden="true" className="customer-timeline-node">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="customer-timeline-body">
                    <h3>
                      {t(`customer.landing.step.${step.key}.title`)}
                      {step.key === 'pay' && (
                        <span className="customer-timeline-timer">
                          <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
                            <circle cx="8" cy="9" r="5.5" />
                            <path d="M8 6v3l2 1.5M6.5 1.5h3" />
                          </svg>
                          15:00
                        </span>
                      )}
                    </h3>
                    <p>{t(`customer.landing.step.${step.key}.description`)}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="customer-policy" data-reveal>
              <div className="customer-policy-heading">
                <h3>{t('customer.landing.policy.title')}</h3>
                <p>{t('customer.landing.policy.description')}</p>
              </div>
              <ul className="customer-policy-grid">
                {POLICY_RULES.map((rule, index) => (
                  <li
                    className={`customer-policy-card is-${rule.tone}`}
                    key={rule.key}
                    style={{ '--reveal-delay': `${120 + index * 80}ms` }}
                  >
                    <span className="customer-policy-figure">{rule.figure}</span>
                    <div>
                      <h4>{t(`customer.landing.policy.${rule.key}.title`)}</h4>
                      <p>{t(`customer.landing.policy.${rule.key}.description`)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="customer-about-title"
          className="customer-benefits"
          id="about"
        >
          <div className="customer-container">
            <div className="customer-section-heading customer-benefits-heading" data-reveal>
              <div>
                <span className="customer-eyebrow">
                  {t('customer.landing.confidentChoice')}
                </span>
                <h2 id="customer-about-title">
                  {t('customer.landing.clearStepsTitle')}
                </h2>
                <p>{t('customer.landing.clearStepsDescription')}</p>
              </div>
            </div>
            <div className="customer-benefit-grid">
              <article className="customer-benefit-card" data-reveal style={{ '--reveal-delay': '0ms' }}>
                <BenefitMark kind="service" />
                <h3>{t('customer.landing.serviceDetailsTitle')}</h3>
                <p>{t('customer.landing.serviceDetailsDescription')}</p>
              </article>
              <article className="customer-benefit-card" data-reveal style={{ '--reveal-delay': '90ms' }}>
                <BenefitMark kind="schedule" />
                <h3>{t('customer.landing.availableSlotsTitle')}</h3>
                <p>{t('customer.landing.availableSlotsDescription')}</p>
              </article>
              <article className="customer-benefit-card" data-reveal style={{ '--reveal-delay': '180ms' }}>
                <BenefitMark kind="clear" />
                <h3>{t('customer.landing.reviewTitle')}</h3>
                <p>{t('customer.landing.reviewDescription')}</p>
              </article>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="customer-booking-title"
          className="customer-promo"
          id="contact"
        >
          <div className="customer-container customer-promo-inner">
            <div className="customer-promo-copy" data-reveal>
              <span className="customer-eyebrow customer-eyebrow-light">
                {serviceState === 'empty'
                  ? t('customer.landing.updateServices')
                  : t('customer.landing.startCare')}
              </span>
              <h2 id="customer-booking-title">
                {serviceState === 'empty'
                  ? t('customer.landing.noServicesTitle')
                  : t('customer.landing.readyToBookTitle')}
              </h2>
              <p>
                {serviceState === 'empty'
                  ? t('customer.landing.noServicesReturn')
                  : t('customer.landing.bookingDescription')}
              </p>
              {serviceState !== 'empty' && (
                <a className="customer-button customer-button-light" href={bookingHref}>
                  {t('customer.landing.bookingPageLink')}
                  <ArrowIcon />
                </a>
              )}
            </div>
            <address className="customer-contact-card" data-reveal style={{ '--reveal-delay': '120ms' }}>
              <h3>{t('customer.contact.title')}</h3>
              <dl>
                <div>
                  <dt>{t('customer.contact.address')}</dt>
                  <dd>{t('customer.contact.addressValue')}</dd>
                </div>
                <div>
                  <dt>{t('customer.contact.phone')}</dt>
                  <dd><a href={SHOP_PHONE_HREF}>{SHOP_PHONE}</a></dd>
                </div>
                <div>
                  <dt>LINE</dt>
                  <dd>{SHOP_LINE_ID}</dd>
                </div>
                <div>
                  <dt>{t('customer.contact.hours')}</dt>
                  <dd>
                    {t('customer.contact.hoursValue')}
                    <small>{t('customer.contact.closed')}</small>
                  </dd>
                </div>
              </dl>
            </address>
          </div>
        </section>
      </main>

      <CustomerFooter />
    </div>
  )
}

export default CustomerLanding
