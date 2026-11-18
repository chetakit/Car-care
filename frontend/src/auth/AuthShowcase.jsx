import { useLanguage } from '../i18n/LanguageContext.jsx'

function AuthShowcase() {
  const { t } = useLanguage()

  return (
    <aside aria-label={t('auth.showcase.ariaLabel')} className="shared-auth-showcase">
      <div className="shared-auth-showcase-copy">
        <span className="shared-auth-eyebrow">
          <span aria-hidden="true" />
          {t('auth.showcase.eyebrow')}
        </span>
        <h2>
          {t('auth.showcase.headingFirst')}
          <span>{t('auth.showcase.headingSecond')}</span>
        </h2>
        <p>
          {t('auth.showcase.description')}
        </p>
        <ul className="shared-auth-benefits">
          <li>{t('auth.showcase.benefit.services')}</li>
          <li>{t('auth.showcase.benefit.booking')}</li>
          <li>{t('auth.showcase.benefit.account')}</li>
        </ul>
      </div>
      <div className="shared-auth-showcase-badge">
        <span aria-hidden="true">✓</span>
        <span>
          <strong>Car Care</strong>
          <small>{t('auth.showcase.badgeTagline')}</small>
        </span>
      </div>
    </aside>
  )
}

export default AuthShowcase
