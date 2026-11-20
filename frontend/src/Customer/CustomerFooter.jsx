import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUp, Clock, MapPin, MessageCircle, Phone } from 'lucide-react'
import { BrandMark } from './CustomerHeader.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { SHOP_LINE_ID, SHOP_PHONE, SHOP_PHONE_HREF } from './shopInfo.js'
import { COURSE_CODE } from './aboutData.js'

// One footer for every customer page. It is also the "Contact us" target
// (#contact), so the shop's contact details live in exactly one place.
// It animates itself in when scrolled into view, so it works on any page.
function CustomerFooter() {
  const { t } = useLanguage()
  const customerLabel = (key, fallback) => {
    const translation = t(key)
    return translation === key ? fallback : translation
  }
  const onHome = (window.location.pathname.replace(/\/+$/, '') || '/') === '/'
  const howItWorksHref = onHome ? '#how-it-works' : '/#how-it-works'

  const footerRef = useRef(null)
  const [visible, setVisible] = useState(
    () => !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (visible) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      // Fire as soon as the top of the footer is a little way on screen, even
      // when the footer is taller than the viewport (phones).
      { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    )
    if (footerRef.current) observer.observe(footerRef.current)
    return () => observer.disconnect()
  }, [visible])

  const menu = [
    ['/', customerLabel('customer.header.home', 'Home')],
    ['/services', customerLabel('customer.header.ourServices', 'Our Services')],
    [howItWorksHref, customerLabel('customer.header.howItWorks', 'How It Works')],
    ['/customer/booking', customerLabel('customer.header.bookService', 'Book a Service')],
  ]

  return (
    <footer className={`customer-footer cf${visible ? ' is-visible' : ''}`} id="contact" ref={footerRef}>
      <span aria-hidden="true" className="cf-line" />
      <span aria-hidden="true" className="cf-glow" />
      <span aria-hidden="true" className="cf-watermark">CAR CARE</span>

      <div className="customer-container cf-inner">
        <div className="cf-main">
          <div className="cf-col cf-brand-col" style={{ '--cf-delay': '0ms' }}>
            <a className="customer-brand cf-brand" href="/">
              <BrandMark />
              <span className="customer-brand-name">Car Care</span>
            </a>
            <p className="cf-tagline">
              {customerLabel('customer.footer.tagline', 'Thoughtful care for every journey.')}
            </p>
            <p className="cf-description">
              {customerLabel(
                'customer.footer.description',
                'Discover practical car care services, review clear details, and book an appointment that fits your schedule.',
              )}
            </p>
            <a className="cf-cta" href="/customer/booking">
              <span>{customerLabel('customer.header.bookService', 'Book a Service')}</span>
              <ArrowRight aria-hidden="true" />
            </a>
          </div>

          <nav
            aria-labelledby="customer-footer-links-heading"
            className="cf-col"
            style={{ '--cf-delay': '120ms' }}
          >
            <h2 className="cf-heading" id="customer-footer-links-heading">
              {customerLabel('customer.footer.menu', 'MENU')}
            </h2>
            <ul className="cf-links">
              {menu.map(([href, label]) => (
                <li key={href}>
                  <a href={href}>
                    <ArrowRight aria-hidden="true" />
                    <span>{label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <section
            aria-labelledby="customer-footer-contact-heading"
            className="cf-col"
            style={{ '--cf-delay': '240ms' }}
          >
            <h2 className="cf-heading" id="customer-footer-contact-heading">
              {customerLabel('customer.footer.contactUs', 'CONTACT US')}
            </h2>
            <ul className="cf-contact">
              <li>
                <span className="cf-contact-icon"><MapPin aria-hidden="true" /></span>
                <span>
                  <small>{customerLabel('customer.contact.address', 'Address')}</small>
                  {customerLabel('customer.contact.addressValue', '')}
                </span>
              </li>
              <li>
                <span className="cf-contact-icon"><Phone aria-hidden="true" /></span>
                <span>
                  <small>{customerLabel('customer.contact.phone', 'Phone')}</small>
                  <a href={SHOP_PHONE_HREF}>{SHOP_PHONE}</a>
                </span>
              </li>
              <li>
                <span className="cf-contact-icon"><MessageCircle aria-hidden="true" /></span>
                <span>
                  <small>LINE</small>
                  {SHOP_LINE_ID}
                </span>
              </li>
              <li>
                <span className="cf-contact-icon"><Clock aria-hidden="true" /></span>
                <span>
                  <small>{customerLabel('customer.contact.hours', 'Opening hours')}</small>
                  {customerLabel('customer.contact.hoursValue', 'Mon–Sat 09:00–18:00')}
                  <em>{customerLabel('customer.contact.closed', 'Closed on Sundays')}</em>
                </span>
              </li>
            </ul>
          </section>
        </div>

        <div className="cf-bottom" style={{ '--cf-delay': '360ms' }}>
          <span>
            © {new Date().getFullYear()} Car Care
            <span aria-hidden="true" className="cf-dot">·</span>
            {t('customer.footer.project', { course: COURSE_CODE })}
          </span>
          <nav aria-label={t('customer.about.title')} className="cf-legal">
            <a href="/about#team">{t('customer.footer.developers')}</a>
            <a href="/about#license">{t('customer.footer.license')}</a>
            <a href="/about#credits">{t('customer.footer.credits')}</a>
          </nav>
          <button
            aria-label={t('customer.footer.backToTop')}
            className="cf-top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            title={t('customer.footer.backToTop')}
            type="button"
          >
            <ArrowUp aria-hidden="true" />
          </button>
        </div>
      </div>
    </footer>
  )
}

export default CustomerFooter
