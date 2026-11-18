import { useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import AdminIcon from './AdminIcon.jsx'

function AdminSidebar({
  navigationItems,
  activePage,
  onNavigate,
}) {
  const [membersOpen, setMembersOpen] = useState(true)
  const { t } = useLanguage()

  return (
    <aside className="admin-sidebar">
      <a
        aria-label={t('admin.shell.homeLabel')}
        className="admin-brand"
        href="/"
      >
        <span aria-hidden="true" className="admin-brand-mark">
          <svg fill="none" viewBox="0 0 32 32">
            <path d="M5 20.5h2.2l2.1-7.1a2.8 2.8 0 0 1 2.7-2h8a2.8 2.8 0 0 1 2.7 2l2.1 7.1H27v4h-2.1v1.7h-3v-1.7H10.1v1.7h-3v-1.7H5v-4Z" />
            <path d="M9.3 18.2h13.4l-1.5-4.7H10.8l-1.5 4.7ZM10.4 21.3h.1m11 0h.1" />
          </svg>
        </span>
        <span className="admin-brand-copy">
          <strong>Car Care</strong>
          <small>{t('admin.shell.brandSubtitle')}</small>
        </span>
      </a>

      <div className="admin-sidebar-label">{t('admin.shell.workspace')}</div>
      <nav aria-label={t('admin.header.navigation')} className="admin-navigation">
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
                  <span>{t(item.label)}</span>
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
                      <span>{t(child.label)}</span>
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
              <span>{t(item.label)}</span>
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
          <strong>{t('admin.shell.footerTitle')}</strong>
          <small>{t('admin.shell.footerDescription')}</small>
        </span>
      </div>
    </aside>
  )
}

export default AdminSidebar
