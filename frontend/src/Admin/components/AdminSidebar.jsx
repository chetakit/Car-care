import AdminIcon from './AdminIcon.jsx'

function AdminSidebar({
  navigationItems,
  activePage,
  onNavigate,
}) {
  return (
    <aside className="admin-sidebar">
      <a
        aria-label="Car Care Admin home"
        className="admin-brand"
        href="/admin/dashboard"
        onClick={(event) => {
          event.preventDefault()
          onNavigate('dashboard')
        }}
      >
        <span className="admin-brand-mark">C</span>
        <span className="admin-brand-copy">
          <strong>Car Care</strong>
          <small>ADMINISTRATION</small>
        </span>
      </a>

      <div className="admin-sidebar-label">WORKSPACE</div>
      <nav aria-label="Admin navigation" className="admin-navigation">
        {navigationItems.map((item) => (
          <a
            aria-current={activePage === item.id ? 'page' : undefined}
            className={`admin-nav-item${activePage === item.id ? ' is-active' : ''}`}
            href={`/admin/${item.id}`}
            key={item.id}
            onClick={(event) => {
              event.preventDefault()
              onNavigate(item.id)
            }}
          >
            <AdminIcon name={item.icon} />
            <span>{item.label}</span>
            {activePage === item.id && (
              <AdminIcon className="admin-nav-chevron" name="chevron" size={16} />
            )}
          </a>
        ))}
      </nav>

      <div className="admin-sidebar-footer">
        <span className="admin-sidebar-status" />
        <span>
          <strong>Admin workspace</strong>
          <small>Management portal</small>
        </span>
      </div>
    </aside>
  )
}

export default AdminSidebar
