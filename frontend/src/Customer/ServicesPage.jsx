import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../Admin/api/client.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import AnimatedPrice from './AnimatedPrice.jsx'
import CustomerHeader, { BrandMark } from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import ServiceIcon from './ServiceIcon.jsx'
import VehicleTypePicker from './VehicleTypePicker.jsx'
import { SERVICE_IMAGE_URL } from './serviceAssets.js'
import { useRevealOnScroll } from './useLandingMotion.js'
import { buildPriceTypes, priceForType } from './vehicleTypePrices.js'
import './customer.css'

function ClockIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </svg>
  )
}

function ServicesPage({ user, onLogout }) {
  const { language, t } = useLanguage()
  const [services, setServices] = useState([])
  const [serviceState, setServiceState] = useState('loading')
  const [serviceReload, setServiceReload] = useState(0)
  const [imageFailed, setImageFailed] = useState(false)
  // Vehicle type the customer picked ('' = all types, show "from" prices).
  const [typeId, setTypeId] = useState('')
  const rootRef = useRef(null)
  useRevealOnScroll(rootRef, serviceState)

  useEffect(() => {
    const controller = new AbortController()

    apiRequest('/api/public/catalog/services', { signal: controller.signal })
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
  }, [serviceReload])

  const priceTypes = buildPriceTypes(services)
  const selectedType = priceTypes.find((type) => type.id === typeId)
  const availableCount = typeId
    ? services.filter((service) => priceForType(service, typeId) !== null).length
    : services.length

  return (
    <div className="customer-home customer-services-page" ref={rootRef}>
      <CustomerHeader
        bookingAvailable={serviceState !== 'empty'}
        onLogout={onLogout}
        user={user}
      />
      <main>
        <section className="services-page-intro" aria-labelledby="services-page-title">
          <div className="customer-container services-page-intro-inner">
            <div>
              <span className="services-page-eyebrow customer-rise" style={{ '--rise-delay': '60ms' }}>
                {t('customer.services.eyebrow')}
              </span>
              <h1 className="customer-rise" id="services-page-title" style={{ '--rise-delay': '160ms' }}>
                {t('customer.services.title')}
              </h1>
              <p className="customer-rise" style={{ '--rise-delay': '280ms' }}>
                {t('customer.services.description')}
              </p>
            </div>
            <div className="services-page-image customer-rise" style={{ '--rise-delay': '200ms' }}>
              {imageFailed ? (
                <div className="services-page-image-fallback">
                  <BrandMark />
                  <span>Car Care</span>
                </div>
              ) : (
                <img
                  alt={t('customer.landing.serviceImageAlt')}
                  decoding="async"
                  onError={() => setImageFailed(true)}
                  src={SERVICE_IMAGE_URL}
                />
              )}
            </div>
          </div>
        </section>

        <section className="services-page-catalog" aria-labelledby="services-catalog-title">
          <div className="customer-container">
            <div className="services-catalog-head">
              <div>
                <h2 id="services-catalog-title">{t('customer.services.catalogTitle')}</h2>
                <p className="services-page-note">{t('customer.services.pickTypeNote')}</p>
              </div>
              {serviceState === 'ready' && (
                <span className="services-catalog-count" aria-live="polite">
                  {selectedType
                    ? t('customer.services.countForType', { count: availableCount, type: selectedType.name })
                    : t('customer.services.count', { count: availableCount })}
                </span>
              )}
            </div>

            {serviceState === 'ready' && priceTypes.length > 0 && (
              <div className="services-toolbar">
                <span className="services-toolbar-label">{t('customer.services.yourCar')}</span>
                <VehicleTypePicker onChange={setTypeId} types={priceTypes} value={typeId} />
              </div>
            )}

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
              <div aria-live="polite" className="customer-catalog-message" role="status">
                {t('customer.landing.noServicesAvailable')}
              </div>
            )}
            {serviceState === 'ready' && (
              <div className="services-grid">
                {services.map((service, index) => {
                  const price = priceForType(service, typeId)
                  const offered = price !== null
                  return (
                    <article
                      className={`services-card${offered ? '' : ' is-unavailable'}`}
                      data-reveal
                      key={service.service_id}
                      style={{ '--reveal-delay': `${(index % 3) * 80}ms` }}
                    >
                      <div className="services-card-top">
                        <ServiceIcon name={service.service_name} />
                        {service.duration_minutes !== null && service.duration_minutes !== undefined && (
                          <span className="services-card-duration">
                            <ClockIcon />
                            {t('customer.landing.durationMinutes', { minutes: service.duration_minutes })}
                          </span>
                        )}
                      </div>
                      <h3>{service.service_name}</h3>
                      <p>
                        {service.description?.trim() || t('customer.landing.noServiceDescription')}
                      </p>
                      <div className="services-card-foot">
                        <div className="services-card-price">
                          {offered ? (
                            <>
                              <small>
                                {selectedType
                                  ? t('customer.services.priceForType', { type: selectedType.name })
                                  : t('customer.landing.priceFromLabel')}
                              </small>
                              <strong><AnimatedPrice language={language} value={price} /></strong>
                            </>
                          ) : (
                            <small>{t('customer.landing.priceNotForType')}</small>
                          )}
                        </div>
                        {offered && (
                          <a className="services-card-book" href="/customer/booking">
                            {t('customer.common.bookService')}
                            <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
                              <path d="M3.5 10h12m-5-5 5 5-5 5" />
                            </svg>
                          </a>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </main>
      <CustomerFooter />
    </div>
  )
}

export default ServicesPage
