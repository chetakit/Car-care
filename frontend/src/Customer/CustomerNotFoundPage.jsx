import CustomerHeader from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import './customer.css'
import './dashboard.css'

function CustomerNotFoundPage({ user, onLogout }) {
  return (
    <div className="customer-home customer-dashboard">
      <CustomerHeader onLogout={onLogout} user={user} />
      <main aria-labelledby="customer-not-found-title" className="dashboard-main">
        <div className="customer-container">
          <header className="dashboard-heading">
            <div>
              <span className="customer-eyebrow">CUSTOMER WORKSPACE</span>
              <h1 id="customer-not-found-title">Page not found</h1>
              <p>This Customer page doesn’t exist or may have moved.</p>
            </div>
            <a className="customer-button customer-button-primary" href="/customer">
              Return to dashboard
            </a>
          </header>
        </div>
      </main>
      <CustomerFooter />
    </div>
  )
}

export default CustomerNotFoundPage
