import { useEffect, useState } from 'react'
import AdminLayout from './components/AdminLayout.jsx'
import AuditLogPage from './pages/AuditLogPage.jsx'
import BookingsPage from './pages/BookingsPage.jsx'
import CouponsPage from './pages/CouponsPage.jsx'
import CustomersPage from './pages/CustomersPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import PaymentsPage from './pages/PaymentsPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import ServicesPage from './pages/ServicesPage.jsx'
import SchedulesPage from './pages/SchedulesPage.jsx'
import StaffPage from './pages/StaffPage.jsx'
import VehicleTypesPage from './pages/VehicleTypesPage.jsx'
import WalletPage from './pages/WalletPage.jsx'
import './styles/admin.css'

const navigationItems = [
  { id: 'dashboard', label: 'admin.navigation.dashboard', icon: 'grid' },
  { id: 'bookings', label: 'admin.navigation.bookings', icon: 'calendar' },
  { id: 'schedules', label: 'admin.navigation.queueCapacity', icon: 'calendar' },
  {
    id: 'members',
    label: 'admin.navigation.members',
    icon: 'users',
    children: [
      { id: 'staff', label: 'admin.navigation.staff' },
      { id: 'customers', label: 'admin.navigation.customer' },
    ],
  },
  { id: 'services', label: 'admin.navigation.services', icon: 'tool' },
  { id: 'vehicle-types', label: 'admin.navigation.vehicleTypes', icon: 'car' },
  { id: 'coupons', label: 'admin.navigation.coupons', icon: 'tag' },
  { id: 'payments', label: 'admin.navigation.payments', icon: 'credit-card' },
  { id: 'wallet', label: 'admin.navigation.wallet', icon: 'wallet' },
  { id: 'reports', label: 'admin.navigation.reports', icon: 'chart' },
  { id: 'audit-logs', label: 'admin.navigation.auditLogs', icon: 'history' },
]

const pages = {
  dashboard: DashboardPage,
  bookings: BookingsPage,
  customers: CustomersPage,
  services: ServicesPage,
  'vehicle-types': VehicleTypesPage,
  schedules: SchedulesPage,
  coupons: CouponsPage,
  payments: PaymentsPage,
  wallet: WalletPage,
  reports: ReportsPage,
  staff: StaffPage,
  'audit-logs': AuditLogPage,
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

function getAdminPagePath(page, query) {
  const search = new URLSearchParams(query).toString()
  return `/admin/${page}${search ? `?${search}` : ''}`
}

function AdminContent({ user, onLogout }) {
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
    if (!getPageFromPath(window.location.pathname)) {
      navigateTo(`/admin/${activePage}`)
    }
  }, [activePage])

  const activeItem = navigationItems
    .flatMap((item) => item.children ?? [item])
    .find((item) => item.id === activePage)
  const ActivePage = pages[activePage] ?? DashboardPage
  function handleNavigate(page, query) {
    setActivePage(page)
    setSidebarOpen(false)
    navigateTo(getAdminPagePath(page, query))
  }

  return (
    <AdminLayout
      activePage={activePage}
      navigationItems={navigationItems}
      onCloseSidebar={() => setSidebarOpen(false)}
      onLogout={() => void onLogout()}
      onMenuClick={() => setSidebarOpen((open) => !open)}
      onNavigate={handleNavigate}
      pageTitle={activeItem?.label ?? 'admin.navigation.dashboard'}
      sidebarOpen={sidebarOpen}
      user={user}
    >
      <ActivePage
        onNavigate={handleNavigate}
        user={activePage === 'staff' || activePage === 'customers' ? user : undefined}
      />
    </AdminLayout>
  )
}

function AdminApp({ user, onLogout }) {
  return <AdminContent onLogout={onLogout} user={user} />
}

export default AdminApp
