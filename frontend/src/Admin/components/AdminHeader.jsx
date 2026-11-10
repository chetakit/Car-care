import AdminIcon from './AdminIcon.jsx'

function AdminHeader({ pageTitle, user, onMenuClick, onLogout }) {
  const displayName = user?.full_name || user?.email || 'Administrator'
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
          <div className="admin-breadcrumb">Workspace / Admin</div>
          <h1 className="admin-page-title">{pageTitle}</h1>
        </div>
      </div>

      <div className="admin-header-actions">
        <div className="admin-user-button">
          <span className="admin-user-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
          <span className="admin-user-copy">
            <strong>{displayName}</strong>
            <small>{user?.role || 'Admin account'}</small>
          </span>
        </div>
        <button className="admin-logout-button" onClick={onLogout} type="button">
          Sign out
        </button>
      </div>
    </header>
  )
}

export default AdminHeader
