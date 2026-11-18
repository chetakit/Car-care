import { useEffect, useState } from 'react'
import { apiRequest } from '../Admin/api/client.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import CustomerHeader, { BrandMark } from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import ServiceIcon from './ServiceIcon.jsx'
import { formatCustomerMoney } from './customerFormatters.js'
import { SERVICE_IMAGE_URL } from './serviceAssets.js'
import './customer.css'

function ServicesPage({ user, onLogout }) {
  const { language, t } = useLanguage()
  const [services, setServices] = useState([])
  const [serviceState, setServiceState] = useState('loading')
  const [serviceReload, setServiceReload] = useState(0)
  const [imageFailed, setImageFailed] = useState(false)

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

  return (
    <div className="customer-home customer-services-page">
      <CustomerHeader
        bookingAvailable={serviceState !== 'empty'}
        onLogout={onLogout}
        user={user}
      />
      <main>
        <section className="services-page-intro" aria-labelledby="services-page-title">
          <div className="customer-container services-page-intro-inner">
            <div>
              <span className="services-page-eyebrow">
                {t('customer.services.eyebrow')}
              </span>
              <h1 id="services-page-title">{t('customer.services.title')}</h1>
              <p>{t('customer.services.description')}</p>
            </div>
            <div className="services-page-image">
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
            <h2 id="services-catalog-title">{t('customer.services.catalogTitle')}</h2>
            <p className="services-page-note">
              {t('customer.services.priceNote')}
            </p>
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
              <div className="services-page-grid">
                {services.map((service) => (
                  <article className="services-page-card" key={service.service_id}>
                    <ServiceIcon name={service.service_name} />
                    <h3>{service.service_name}</h3>
                    <p>
                      {service.description?.trim() ||
                        t('customer.landing.noServiceDescription')}
                    </p>
                    <div className="services-page-meta">
                      <span className="services-page-duration">
                        {service.duration_minutes !== null && service.duration_minutes !== undefined
                          ? t('customer.services.duration', {
                              minutes: service.duration_minutes,
                            })
                          : t('customer.services.durationUnavailable')}
                      </span>
                      {service.prices?.length > 0 && (
                        <span className="services-page-from">
                          {t('customer.services.priceFrom', {
                            amount: formatCustomerMoney(service.prices[0].price, language),
                          })}
                        </span>
                      )}
                    </div>
                    {service.prices?.length > 0 && (
                      <details className="services-page-prices">
                        <summary>{t('customer.services.pricesByType')}</summary>
                        <dl>
                          {service.prices.map((item) => (
                            <div key={item.vehicle_type_id}>
                              <dt>{item.type_name}</dt>
                              <dd>{formatCustomerMoney(item.price, language)}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                    <a className="services-page-book" href="/customer/booking">
                      {t('customer.common.bookService')}
                    </a>
                  </article>
                ))}
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
