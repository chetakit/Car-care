import { BrandMark } from './CustomerHeader.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { SHOP_LINE_ID, SHOP_PHONE, SHOP_PHONE_HREF } from './shopInfo.js'

// One footer for every customer page. It is also the "Contact us" target
// (#contact), so the shop's contact details live in exactly one place.
function CustomerFooter() {
  const { t } = useLanguage()
  const customerLabel = (key, fallback) => {
    const translation = t(key)
    return translation === key ? fallback : translation
  }
  const onHome = (window.location.pathname.replace(/\/+$/, '') || '/') === '/'
  const howItWorksHref = onHome ? '#how-it-works' : '/#how-it-works'

  return (
    <footer className="customer-footer" id="contact">
      <div className="customer-container customer-footer-inner">
        <div className="customer-footer-main">
          <div className="customer-footer-brand-copy">
            <div className="customer-brand customer-footer-brand">
              <BrandMark />
              <span className="customer-brand-name">Car Care</span>
            </div>
            <p className="customer-footer-tagline">
              {customerLabel('customer.footer.tagline', 'Thoughtful care for every journey.')}
            </p>
            <p className="customer-footer-description">
              {customerLabel(
                'customer.footer.description',
                'Discover practical car care services, review clear details, and book an appointment that fits your schedule.',
              )}
            </p>
          </div>

          <nav aria-labelledby="customer-footer-links-heading" className="customer-footer-col">
            <h2 id="customer-footer-links-heading">
              {customerLabel('customer.footer.menu', 'MENU')}
            </h2>
            <ul className="customer-footer-links">
              <li><a href="/">{customerLabel('customer.header.home', 'Home')}</a></li>
              <li><a href="/services">{customerLabel('customer.header.ourServices', 'Our Services')}</a></li>
              <li><a href={howItWorksHref}>{customerLabel('customer.header.howItWorks', 'How It Works')}</a></li>
              <li><a href="/customer/booking">{customerLabel('customer.header.bookService', 'Book a Service')}</a></li>
            </ul>
          </nav>

          <section aria-labelledby="customer-footer-contact-heading" className="customer-footer-col">
            <h2 id="customer-footer-contact-heading">
              {customerLabel('customer.footer.contactUs', 'CONTACT US')}
            </h2>
            <dl className="customer-footer-contact">
              <div>
                <dt>{customerLabel('customer.contact.address', 'Address')}</dt>
                <dd>{customerLabel('customer.contact.addressValue', '')}</dd>
              </div>
              <div>
                <dt>{customerLabel('customer.contact.phone', 'Phone')}</dt>
                <dd><a href={SHOP_PHONE_HREF}>{SHOP_PHONE}</a></dd>
              </div>
              <div>
                <dt>LINE</dt>
                <dd>{SHOP_LINE_ID}</dd>
              </div>
              <div>
                <dt>{customerLabel('customer.contact.hours', 'Opening hours')}</dt>
                <dd>
                  {customerLabel('customer.contact.hoursValue', 'Mon–Sat 09:00–18:00')}
                  <small>{customerLabel('customer.contact.closed', 'Closed on Sundays')}</small>
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="customer-footer-bottom">
          <span>© {new Date().getFullYear()} Car Care</span>
          <span className="customer-footer-bottom-note">
            {customerLabel('customer.footer.webService', 'Car Care Web Service')}
          </span>
        </div>
      </div>
    </footer>
  )
}

export default CustomerFooter
