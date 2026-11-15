import { useEffect, useState } from 'react'
import { apiRequest } from '../Admin/api/client.js'
import CustomerHeader, { BrandMark } from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import ServiceIcon from './ServiceIcon.jsx'
import { SERVICE_IMAGE_URL } from './serviceAssets.js'
import './customer.css'

function ServicesPage({ user, onLogout }) {
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
        landingPage
        onLogout={onLogout}
        user={user}
      />
      <main>
        <section className="services-page-intro" aria-labelledby="services-page-title">
          <div className="customer-container services-page-intro-inner">
            <div>
              <span className="services-page-eyebrow">CAR CARE SERVICES</span>
              <h1 id="services-page-title">บริการดูแลรถของคุณ</h1>
              <p>สำรวจบริการที่เปิดให้จอง และเลือกบริการที่เหมาะกับรถของคุณ</p>
            </div>
            <div className="services-page-image">
              {imageFailed ? (
                <div className="services-page-image-fallback">
                  <BrandMark />
                  <span>Car Care</span>
                </div>
              ) : (
                <img
                  alt="ภาพประกอบบริการดูแลรถ"
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
            <h2 id="services-catalog-title">บริการทั้งหมด</h2>
            <p className="services-page-note">
              เลือกรถและบริการในหน้าจองเพื่อดูราคาตามประเภทรถ
            </p>
            {serviceState === 'loading' && (
              <div aria-live="polite" className="customer-catalog-message">
                <span className="customer-loader" />
                <span>กำลังโหลดบริการที่เปิดให้จอง…</span>
              </div>
            )}
            {serviceState === 'error' && (
              <div className="customer-catalog-message customer-catalog-error" role="alert">
                <span>ไม่สามารถโหลดรายการบริการได้</span>
                <button
                  onClick={() => {
                    setServiceState('loading')
                    setServiceReload((value) => value + 1)
                  }}
                  type="button"
                >
                  ลองอีกครั้ง
                </button>
              </div>
            )}
            {serviceState === 'empty' && (
              <div aria-live="polite" className="customer-catalog-message" role="status">
                ขณะนี้ยังไม่มีบริการให้จอง โปรดลองกลับมาตรวจสอบอีกครั้ง
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
                        'ยังไม่มีรายละเอียดเพิ่มเติมสำหรับบริการนี้'}
                    </p>
                    <span className="services-page-duration">
                      {service.duration_minutes !== null && service.duration_minutes !== undefined
                        ? `ระยะเวลาโดยประมาณ: ${service.duration_minutes} นาที`
                        : 'ระยะเวลาโดยประมาณ: ไม่ระบุ'}
                    </span>
                    <a className="services-page-book" href="/customer/booking">
                      Book This Service
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
