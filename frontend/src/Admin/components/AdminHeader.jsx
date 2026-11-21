import AdminIcon from './AdminIcon.jsx'
import AdminAccountMenu from './AdminAccountMenu.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import LanguageToggle from '../../i18n/LanguageToggle.jsx'
import NotificationBell from '../../notifications/NotificationBell.jsx'

function AdminHeader({ pageTitle, user, onMenuClick, onLogout }) {
  const { t } = useLanguage()
  return (
    <header className="admin-header">
      <div className="admin-header-leading">
        <button
          aria-label={t('admin.header.toggleNavigation')}
          className="admin-icon-button admin-menu-button"
          onClick={onMenuClick}
          type="button"
        >
          <AdminIcon name="menu" />
        </button>
        <div>
          <nav aria-label={t('admin.header.breadcrumbLabel')} className="admin-breadcrumb">
            <ol>
              <li>{t('admin.header.workspace')}</li>
              <li>{t('admin.header.admin')}</li>
              <li aria-current="page">{t(pageTitle)}</li>
            </ol>
          </nav>
          <h1 className="admin-page-title">{t(pageTitle)}</h1>
        </div>
      </div>

      <div className="admin-header-actions">
        <LanguageToggle />
        <NotificationBell role="ADMIN" />
        <AdminAccountMenu onLogout={onLogout} user={user} />
      </div>
    </header>
  )
}

export default AdminHeader
