import { useLanguage } from '../i18n/LanguageContext.jsx'
import CustomerHeader from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import './customer.css'
import './dashboard.css'

function CustomerNotFoundPage({ user, onLogout }) {
  const { t } = useLanguage()
  return (
    <div className="customer-home customer-dashboard">
      <CustomerHeader onLogout={onLogout} user={user} />
      <main aria-labelledby="customer-not-found-title" className="dashboard-main">
        <div className="customer-container">
          <header className="dashboard-heading">
            <div>
              <span className="customer-eyebrow">{t('customer.notFound.eyebrow')}</span>
              <h1 id="customer-not-found-title">{t('customer.notFound.title')}</h1>
              <p>{t('customer.notFound.description')}</p>
            </div>
            <a className="customer-button customer-button-primary" href="/customer">
              {t('customer.notFound.return')}
            </a>
          </header>
        </div>
      </main>
      <CustomerFooter />
    </div>
  )
}

export default CustomerNotFoundPage
