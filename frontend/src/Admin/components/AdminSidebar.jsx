import { useState } from 'react'
import AdminIcon from './AdminIcon.jsx'

function AdminSidebar({
  navigationItems,
  activePage,
  onNavigate,
}) {
  const [membersOpen, setMembersOpen] = useState(true)

  return (
    <aside className="admin-sidebar">
      <a
        aria-label="Car Care Admin home"
        className="admin-brand"
        href="/"
      >
        <span className="admin-brand-mark">C</span>
        <span className="admin-brand-copy">
          <strong>Car Care</strong>
          <small>ADMINISTRATION</small>
        </span>
      </a>

      <div className="admin-sidebar-label">WORKSPACE</div>
      <nav aria-label="Admin navigation" className="admin-navigation">
        {navigationItems.map((item) => {
          if (item.children) {
            const isActive = item.children.some((child) => child.id === activePage)
            return (
              <div className="admin-nav-group" key={item.id}>
                <button
                  aria-controls={`admin-subnav-${item.id}`}
                  aria-expanded={membersOpen}
                  className={`admin-nav-item admin-nav-toggle${isActive ? ' is-active' : ''}`}
                  onClick={() => setMembersOpen((open) => !open)}
                  type="button"
                >
                  <AdminIcon name={item.icon} />
                  <span>{item.label}</span>
                  <AdminIcon
                    className="admin-nav-chevron"
                    name="chevron"
                    size={16}
                  />
                </button>
                <div
                  className="admin-subnavigation"
                  hidden={!membersOpen}
                  id={`admin-subnav-${item.id}`}
                >
                  {item.children.map((child) => (
                    <a
                      aria-current={activePage === child.id ? 'page' : undefined}
                      className={`admin-nav-item admin-nav-subitem${activePage === child.id ? ' is-active' : ''}`}
                      href={`/admin/${child.id}`}
                      key={child.id}
                      onClick={(event) => {
                        event.preventDefault()
                        onNavigate(child.id)
                      }}
                    >
                      <span>{child.label}</span>
                      {activePage === child.id && (
                        <AdminIcon className="admin-nav-chevron" name="chevron" size={16} />
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )
          }

          return (
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
          )
        })}
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
