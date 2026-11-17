import AdminIcon from './AdminIcon.jsx'
import AdminAccountMenu from './AdminAccountMenu.jsx'
import LanguageToggle from '../../i18n/LanguageToggle.jsx'

function AdminHeader({ pageTitle, user, onMenuClick, onLogout }) {
  return (
    <header className="admin-header">
      <div className="admin-header-leading">
        <button
          aria-label="Toggle navigation"
          className="admin-icon-button admin-menu-button"
          onClick={onMenuClick}
          type="button"
        >
          <AdminIcon name="menu" />
        </button>
        <div>
          <nav aria-label="Breadcrumb" className="admin-breadcrumb">
            <ol>
              <li>Workspace</li>
              <li>Admin</li>
              <li aria-current="page">{pageTitle}</li>
            </ol>
          </nav>
          <h1 className="admin-page-title">{pageTitle}</h1>
        </div>
      </div>

      <div className="admin-header-actions">
        <LanguageToggle />
        <AdminAccountMenu onLogout={onLogout} user={user} />
      </div>
    </header>
  )
}

export default AdminHeader
