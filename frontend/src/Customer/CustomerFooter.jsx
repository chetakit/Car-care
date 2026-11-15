import { BrandMark } from './CustomerHeader.jsx'

function CustomerFooter() {
  return (
    <footer className="customer-footer">
      <div className="customer-container customer-footer-inner">
        <div className="customer-footer-main">
          <div className="customer-footer-brand-copy">
            <div className="customer-brand customer-footer-brand">
              <BrandMark />
              <span className="customer-brand-name">Car Care</span>
            </div>
            <p className="customer-footer-tagline">Thoughtful care for every journey.</p>
            <p className="customer-footer-description">
              Discover practical car care services, review clear details, and book an
              appointment that fits your schedule.
            </p>
          </div>

          <section
            aria-labelledby="customer-footer-social-heading"
            className="customer-footer-social"
          >
            <h2 id="customer-footer-social-heading">FOLLOW US</h2>
            <p>No official social accounts are listed in this project.</p>
          </section>
        </div>

        <div className="customer-footer-bottom">
          <span>© {new Date().getFullYear()} Car Care</span>
          <span className="customer-footer-bottom-note">Car Care Web Service</span>
        </div>
      </div>
    </footer>
  )
}

export default CustomerFooter
