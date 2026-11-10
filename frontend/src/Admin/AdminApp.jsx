import { useEffect, useState } from 'react'
import AdminLayout from './components/AdminLayout.jsx'
import AdminLogin from './components/AdminLogin.jsx'
import { AdminAuthProvider } from './auth/AdminAuthContext.jsx'
import useAdminAuth from './auth/useAdminAuth.js'
import BookingsPage from './pages/BookingsPage.jsx'
import CouponsPage from './pages/CouponsPage.jsx'
import CustomersPage from './pages/CustomersPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import PaymentsPage from './pages/PaymentsPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import ServicesPage from './pages/ServicesPage.jsx'
import WalletPage from './pages/WalletPage.jsx'
import './styles/admin.css'

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'bookings', label: 'Bookings', icon: 'calendar' },
  { id: 'customers', label: 'Customers', icon: 'users' },
  { id: 'services', label: 'Services & pricing', icon: 'tool' },
  { id: 'coupons', label: 'Coupons', icon: 'tag' },
  { id: 'payments', label: 'Payments', icon: 'credit-card' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'reports', label: 'Reports', icon: 'chart' },
]

const pages = {
  dashboard: DashboardPage,
  bookings: BookingsPage,
  customers: CustomersPage,
  services: ServicesPage,
  coupons: CouponsPage,
  payments: PaymentsPage,
  wallet: WalletPage,
  reports: ReportsPage,
}

function getPageFromPath(pathname) {
  const match = pathname.match(/^\/admin\/([^/]+)\/?$/)
  return match && Object.hasOwn(pages, match[1]) ? match[1] : null
}

function navigateTo(path) {
  if (`${window.location.pathname}${window.location.search}` !== path) {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

function AdminContent() {
  const { authStatus, user, logout } = useAdminAuth()
  const [activePage, setActivePage] = useState(
    () => getPageFromPath(window.location.pathname) ?? 'dashboard',
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    function syncPageFromPath() {
      const page = getPageFromPath(window.location.pathname)
      if (page) {
        setActivePage(page)
      } else if (window.location.pathname.startsWith('/admin')) {
        setActivePage('dashboard')
      }
    }

    window.addEventListener('popstate', syncPageFromPath)
    return () => window.removeEventListener('popstate', syncPageFromPath)
  }, [])

  useEffect(() => {
    if (authStatus === 'authenticated' && window.location.pathname.replace(/\/+$/, '') === '/admin') {
      navigateTo('/admin/dashboard')
    }
  }, [authStatus])

  useEffect(() => {
    if (
      authStatus !== 'authenticated' &&
      authStatus !== 'checking' &&
      window.location.pathname.startsWith('/admin') &&
      window.location.pathname.replace(/\/+$/, '') !== '/admin'
    ) {
      navigateTo('/admin')
    }
  }, [authStatus])

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    if (!getPageFromPath(window.location.pathname)) {
      navigateTo(`/admin/${activePage}`)
    }
  }, [activePage, authStatus])

  if (authStatus === 'checking') {
    return (
      <main className="admin-login-page">
        <div className="admin-request-state" aria-live="polite">
          <span className="admin-spinner" />
          <span>Verifying administrator session…</span>
        </div>
      </main>
    )
  }
  if (authStatus !== 'authenticated') return <AdminLogin />

  const activeItem = navigationItems.find((item) => item.id === activePage)
  const ActivePage = pages[activePage] ?? DashboardPage
  return (
    <AdminLayout
      activePage={activePage}
      navigationItems={navigationItems}
      onCloseSidebar={() => setSidebarOpen(false)}
      onLogout={() => {
        navigateTo('/admin')
        void logout()
      }}
      onMenuClick={() => setSidebarOpen((open) => !open)}
      onNavigate={(page) => {
        setActivePage(page)
        setSidebarOpen(false)
        navigateTo(`/admin/${page}`)
      }}
      pageTitle={activeItem?.label ?? 'Dashboard'}
      sidebarOpen={sidebarOpen}
      user={user}
    >
      <ActivePage onNavigate={(page) => {
        setActivePage(page)
        navigateTo(`/admin/${page}`)
      }} />
    </AdminLayout>
  )
}

function AdminApp() {
  return (
    <AdminAuthProvider>
      <AdminContent />
    </AdminAuthProvider>
  )
}

export default AdminApp
