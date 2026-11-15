import { useEffect, useMemo, useState } from 'react'
import { createApiClient } from '../Admin/api/client.js'
import useAuth from '../auth/useAuth.js'
import CustomerHeader, { BrandMark } from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import ServiceIcon from './ServiceIcon.jsx'
import { SERVICE_IMAGE_URL } from './serviceAssets.js'
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
  const [serviceImageFailed, setServiceImageFailed] = useState(false)

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
    <div className="customer-home customer-landing">
      <CustomerHeader
        bookingAvailable={serviceState !== 'empty'}
        landingPage
        onLogout={onLogout}
        user={user}
      />

      <main>
        <section aria-labelledby="customer-hero-title" className="customer-hero" id="home">
          <div className="customer-container customer-hero-grid">
            <div className="customer-hero-copy">
              <span className="customer-eyebrow">
                <span className="customer-eyebrow-dot" />
                CAR CARE · ONLINE BOOKING
              </span>
              <h1 id="customer-hero-title">
                ดูแลรถของคุณ
                <span> ให้ง่ายกว่าที่เคย</span>
              </h1>
              <p>
                {serviceState === 'empty'
                  ? 'ขณะนี้ยังไม่มีบริการให้จอง โปรดกลับมาตรวจสอบอีกครั้งในภายหลัง'
                  : 'เลือกบริการที่เหมาะกับรถของคุณ ตรวจสอบรายละเอียดและราคาตามประเภทรถ แล้วเลือกวันเวลาที่สะดวกผ่านระบบจองออนไลน์'}
              </p>
              <div className="customer-hero-actions">
                {serviceState !== 'empty' && (
                  <a className="customer-button customer-button-primary" href={bookingHref}>
                    จองบริการ
                    <ArrowIcon />
                  </a>
                )}
                <a className="customer-text-link" href="#services">
                  ดูบริการทั้งหมด
                  <ArrowIcon diagonal />
                </a>
              </div>
              <ul className="customer-hero-note" aria-label="Booking benefits">
                <li>เลือกรถและบริการ</li>
                <li>เลือกรอบเวลาที่ว่าง</li>
                <li>ตรวจสอบก่อนยืนยัน</li>
              </ul>
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
                    alt="รถยนต์ในภาพแนะนำบริการ Car Care"
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
                <span>
                  <strong>ดูแลรถในแบบของคุณ</strong>
                  <small>เลือกบริการและเวลาที่เหมาะกับคุณ</small>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="customer-services-title" className="customer-services" id="services">
          <div className="customer-container">
            <div className="customer-section-heading">
              <div>
                <span className="customer-eyebrow">บริการที่เลือกได้</span>
                <h2 id="customer-services-title">ค้นหาบริการที่ใช่สำหรับรถคุณ</h2>
                <p>รายการบริการจากแคตตาล็อก Car Care ที่เปิดให้จองในขณะนี้</p>
              </div>
              {serviceState !== 'empty' && (
                <a className="customer-section-cta" href={bookingHref}>
                  ไปที่หน้าจองบริการ
                  <ArrowIcon />
                </a>
              )}
            </div>

            {serviceState !== 'empty' && (
              <p className="customer-pricing-note">
                ราคาขึ้นอยู่กับประเภทรถ เลือกรถในขั้นตอนจองเพื่อดูราคาที่ใช้กับรถของคุณ
              </p>
            )}

            <div className="customer-services-layout">
              <figure className="customer-services-visual">
                {serviceImageFailed ? (
                  <div className="customer-services-image-fallback">
                    <BrandMark />
                    <span>CAR CARE</span>
                  </div>
                ) : (
                  <img
                    alt="ภาพรถยนต์ประกอบการแนะนำบริการดูแลรถ"
                    className="customer-services-image"
                    decoding="async"
                    loading="lazy"
                    onError={() => setServiceImageFailed(true)}
                    src={SERVICE_IMAGE_URL}
                  />
                )}
                <figcaption>
                  <span>CAR CARE SERVICE</span>
                  <strong>รายละเอียดบริการที่เลือกได้</strong>
                </figcaption>
              </figure>

              <div className="customer-services-content">
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
                  <div
                    aria-atomic="true"
                    aria-live="polite"
                    className="customer-catalog-message"
                    role="status"
                  >
                    ขณะนี้ยังไม่มีบริการให้จอง โปรดลองกลับมาตรวจสอบอีกครั้ง
                  </div>
                )}
                {serviceState === 'ready' && (
                  <div className="customer-service-list">
                    {services.slice(0, 3).map((service) => (
                      <article className="customer-service-card" key={service.service_id}>
                        <ServiceIcon name={service.service_name} />
                        <div className="customer-service-copy">
                          <h3>{service.service_name}</h3>
                          <p>
                            {service.description?.trim() ||
                              'ยังไม่มีรายละเอียดเพิ่มเติมสำหรับบริการนี้'}
                          </p>
                        </div>
                        {service.duration_minutes !== null && service.duration_minutes !== undefined && (
                          <span className="customer-service-duration">
                            {service.duration_minutes} นาที
                          </span>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <a className="customer-section-cta customer-view-all-services" href="/services">
              View All Services
              <ArrowIcon />
            </a>

            {serviceState === 'ready' && (
              <div className="customer-services-action">
                <p>พร้อมเลือกบริการสำหรับรถของคุณแล้วหรือยัง?</p>
                <a className="customer-button customer-button-primary" href={bookingHref}>
                  เริ่มจองบริการ
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
            <div className="customer-section-heading">
              <div>
                <span className="customer-eyebrow">ขั้นตอนการจอง</span>
                <h2 id="customer-process-title">เริ่มต้นได้ใน 3 ขั้นตอน</h2>
                <p>ขั้นตอนสั้น ๆ ที่ตรงกับระบบจองบริการของ Car Care</p>
              </div>
            </div>
            <ol className="customer-process-list">
              <li>
                <span className="customer-process-number">01</span>
                <div>
                  <h3>เลือกรถและบริการ</h3>
                  <p>เลือกรถที่ลงทะเบียนไว้ แล้วเลือกบริการที่ต้องการ</p>
                </div>
              </li>
              <li>
                <span className="customer-process-number">02</span>
                <div>
                  <h3>เลือกวันและเวลา</h3>
                  <p>เลือกวันที่และรอบเวลาที่ยังเปิดให้จอง</p>
                </div>
              </li>
              <li>
                <span className="customer-process-number">03</span>
                <div>
                  <h3>ตรวจสอบและยืนยัน</h3>
                  <p>ทบทวนรายละเอียดและยอดตามรถที่เลือกก่อนส่งการจอง</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="customer-about-title"
          className="customer-benefits"
          id="about"
        >
          <div className="customer-container">
            <div className="customer-section-heading customer-benefits-heading">
              <div>
                <span className="customer-eyebrow">เลือกได้อย่างมั่นใจ</span>
                <h2 id="customer-about-title">ทุกขั้นตอนชัดเจนก่อนจอง</h2>
                <p>ข้อมูลและตัวเลือกที่มีอยู่จริงในระบบ ช่วยให้คุณวางแผนได้ง่ายขึ้น</p>
              </div>
            </div>
            <div className="customer-benefit-grid">
              <article className="customer-benefit-card">
                <BenefitMark kind="service" />
                <h3>เห็นรายละเอียดบริการ</h3>
                <p>ตรวจสอบชื่อ รายละเอียด และระยะเวลาเมื่อมีข้อมูลในแคตตาล็อก</p>
              </article>
              <article className="customer-benefit-card">
                <BenefitMark kind="schedule" />
                <h3>เลือกรอบที่ยังว่าง</h3>
                <p>เลือกวันและเวลาจากตารางที่ระบบเปิดให้จอง</p>
              </article>
              <article className="customer-benefit-card">
                <BenefitMark kind="clear" />
                <h3>ทบทวนก่อนยืนยัน</h3>
                <p>ตรวจสอบบริการและราคาตามประเภทรถก่อนส่งรายการจอง</p>
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
            <div className="customer-promo-copy">
              <span className="customer-eyebrow customer-eyebrow-light">
                {serviceState === 'empty'
                  ? 'อัปเดตรายการบริการ'
                  : 'เริ่มดูแลรถของคุณ'}
              </span>
              <h2 id="customer-booking-title">
                {serviceState === 'empty'
                  ? 'ขณะนี้ยังไม่มีบริการให้จอง'
                  : 'พร้อมเลือกบริการที่เหมาะกับรถของคุณหรือยัง?'}
              </h2>
              <p>
                {serviceState === 'empty'
                  ? 'โปรดกลับมาตรวจสอบอีกครั้งเมื่อมีบริการเปิดให้จอง'
                  : 'ไปที่หน้าจองเพื่อเลือกรถ บริการ และช่วงเวลาที่สะดวก ระบบจะแสดงราคาตามประเภทรถก่อนยืนยัน'}
              </p>
              {serviceState !== 'empty' && (
                <a className="customer-button customer-button-light" href={bookingHref}>
                  ไปที่หน้าจองบริการ
                  <ArrowIcon />
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      <CustomerFooter />
    </div>
  )
}

export default CustomerLanding
