import { useLanguage } from '../../i18n/LanguageContext.jsx'
import AdminHeader from './AdminHeader.jsx'
import AdminSidebar from './AdminSidebar.jsx'

function AdminLayout({
  children,
  navigationItems,
  activePage,
  pageTitle,
  sidebarOpen,
  onNavigate,
  onMenuClick,
  onCloseSidebar,
  user,
  onLogout,
}) {
  const { t } = useLanguage()
  return (
    <div className="admin-shell">
      {sidebarOpen && (
        <button
          aria-label={t('admin.header.closeNavigation')}
          className="admin-sidebar-backdrop"
          onClick={onCloseSidebar}
          type="button"
        />
      )}
      <div className={`admin-sidebar-shell${sidebarOpen ? ' is-open' : ''}`}>
        <AdminSidebar
          activePage={activePage}
          navigationItems={navigationItems}
          onNavigate={onNavigate}
        />
      </div>
      <div className="admin-main">
        <AdminHeader
          onLogout={onLogout}
          onMenuClick={onMenuClick}
          pageTitle={pageTitle}
          user={user}
        />
        <main className="admin-content">{children}</main>
      </div>
    </div>
  )
}

export default AdminLayout
