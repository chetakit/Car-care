import { BrandMark } from './CustomerHeader.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { SHOP_LINE_ID, SHOP_PHONE, SHOP_PHONE_HREF } from './shopInfo.js'

function CustomerFooter() {
  const { t } = useLanguage()
  const customerLabel = (key, fallback) => {
    const translation = t(key)
    return translation === key ? fallback : translation
  }

  return (
    <footer className="customer-footer">
      <div className="customer-container customer-footer-inner">
        <div className="customer-footer-main">
          <div className="customer-footer-brand-copy">
            <div className="customer-brand customer-footer-brand">
              <BrandMark />
              <span className="customer-brand-name">Car Care</span>
            </div>
            <p className="customer-footer-tagline">
              {customerLabel(
                'customer.footer.tagline',
                'Thoughtful care for every journey.',
              )}
            </p>
            <p className="customer-footer-description">
              {customerLabel(
                'customer.footer.description',
                'Discover practical car care services, review clear details, and book an appointment that fits your schedule.',
              )}
            </p>
          </div>

          <section
            aria-labelledby="customer-footer-contact-heading"
            className="customer-footer-social"
          >
            <h2 id="customer-footer-contact-heading">
              {customerLabel('customer.footer.contactUs', 'CONTACT US')}
            </h2>
            <ul className="customer-footer-contact">
              <li><a href={SHOP_PHONE_HREF}>{SHOP_PHONE}</a></li>
              <li>LINE {SHOP_LINE_ID}</li>
              <li>{customerLabel('customer.contact.hoursValue', 'Mon–Sat 09:00–18:00')}</li>
            </ul>
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
