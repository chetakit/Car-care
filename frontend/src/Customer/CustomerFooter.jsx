import { BrandMark } from './CustomerHeader.jsx'
import useAuth from '../auth/useAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'

function CustomerFooter() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const isCustomer = user?.role === 'CUSTOMER'
  const customerLabel = (key, fallback) => (isCustomer ? t(key) : fallback)

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
            aria-labelledby="customer-footer-social-heading"
            className="customer-footer-social"
          >
            <h2 id="customer-footer-social-heading">
              {customerLabel('customer.footer.followUs', 'FOLLOW US')}
            </h2>
            <p>
              {customerLabel(
                'customer.footer.noSocialAccounts',
                'No official social accounts are listed in this project.',
              )}
            </p>
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
