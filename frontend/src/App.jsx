import { useEffect, useState } from 'react'
import AdminApp from './Admin/AdminApp.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import LoginPage from './auth/LoginPage.jsx'
import RegistrationPage from './auth/RegistrationPage.jsx'
import useAuth from './auth/useAuth.js'
import CustomerBookingPage from './Customer/CustomerBookingPage.jsx'
import CustomerDashboardPage from './Customer/CustomerDashboardPage.jsx'
import CustomerLanding from './Customer/CustomerLanding.jsx'
import CustomerNotFoundPage from './Customer/CustomerNotFoundPage.jsx'
import CustomerPaymentPage from './Customer/CustomerPaymentPage.jsx'
import CustomerWalletPage from './Customer/CustomerWalletPage.jsx'
import MyBookingsPage from './Customer/MyBookingsPage.jsx'
import MyVehiclesPage from './Customer/MyVehiclesPage.jsx'
import ServicesPage from './Customer/ServicesPage.jsx'
// [STAFF] หน้าพนักงาน (Staff & Service Management) — แทน StaffDashboard เดิม
import StaffApp from './Staff/StaffApp.jsx'
// [STAFF][MOCK] true เมื่อตั้ง VITE_STAFF_MOCK=true ใน frontend/.env.local
import { STAFF_MOCK } from './Staff/api/staffBookingApi.js'

function isAdminPath(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

// [STAFF] path ของพนักงานทั้งหมดขึ้นต้นด้วย /staff (รวม /staff/dashboard เดิม)
function isStaffPath(pathname) {
  return pathname === '/staff' || pathname.startsWith('/staff/')
}

function isCustomerPath(pathname) {
  return pathname === '/customer' || pathname.startsWith('/customer/')
}

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, '') || '/'
}

function getCustomerReturnPath(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return null
  }

  let url
  try {
    url = new URL(value, window.location.origin)
  } catch {
    return null
  }
  if (url.origin !== window.location.origin) return null

  const path = normalizePath(url.pathname)
  const isCustomerRoute =
    path === '/customer' ||
    path === '/customer/booking' ||
    path === '/customer/vehicles' ||
    path === '/customer/bookings' ||
    path === '/customer/wallet' ||
    /^\/customer\/payment\/\d+$/.test(path)

  return isCustomerRoute ? `${path}${url.search}${url.hash}` : null
}

function navigateTo(path, replace = false, state = {}) {
  if (`${window.location.pathname}${window.location.search}` !== path) {
    if (replace) {
      window.history.replaceState(state, '', path)
    } else {
      window.history.pushState(state, '', path)
    }
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

function navigateAuthLink(event, path) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return
  }
  event.preventDefault()
  const currentState = window.history.state
  navigateTo(
    path,
    false,
    currentState && typeof currentState === 'object' ? currentState : {},
  )
}

function SessionLoading({ message }) {
  return (
    <main aria-live="polite" className="app-session-page">
      <div className="app-session-state">
        <span className="app-session-spinner" />
        <span>{message}</span>
      </div>
    </main>
  )
}

function AppContent() {
  const { authStatus, user, logout } = useAuth()
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const currentPath = normalizePath(pathname)

  function logoutAdminFromHome() {
    const logoutRequest = logout()
    navigateTo('/login', true)
    return logoutRequest
  }

  useEffect(() => {
    function syncPathname() {
      setPathname(window.location.pathname)
    }
    window.addEventListener('popstate', syncPathname)
    return () => window.removeEventListener('popstate', syncPathname)
  }, [])

  useEffect(() => {
    if (authStatus === 'checking') return
    // [STAFF][MOCK] โหมดข้อมูลจำลอง: เปิด /staff ได้โดยไม่ต้องล็อกอิน
    if (STAFF_MOCK && isStaffPath(currentPath)) return

    if (authStatus !== 'authenticated') {
      const isPublicPath = currentPath === '/' || currentPath === '/services'
      if (
        !isPublicPath &&
        currentPath !== '/login' &&
        currentPath !== '/register'
      ) {
        const destination = getCustomerReturnPath(
          `${window.location.pathname}${window.location.search}${window.location.hash}`,
        )
        navigateTo('/login', true, destination ? { customerReturnTo: destination } : {})
      }
      return
    }

    // [STAFF] พนักงานล็อกอินแล้วไปหน้าคิวงาน /staff เสมอ (รวมถึงหน้า / และ /login)
    if (user?.role === 'STAFF') {
      if (!isStaffPath(currentPath)) navigateTo('/staff', true)
      return
    }

    if (currentPath === '/login') {
      const destination = getCustomerReturnPath(
        window.history.state?.customerReturnTo,
      )
      navigateTo(destination || '/', true)
    } else if (currentPath === '/' || currentPath === '/services') {
      return
    } else if (user?.role === 'ADMIN') {
      if (currentPath === '/admin') {
        navigateTo('/admin/dashboard', true)
      } else if (!isAdminPath(currentPath) && currentPath !== '/customer/booking') {
        navigateTo('/admin/dashboard', true)
      }
    } else if (user?.role === 'CUSTOMER' && !isCustomerPath(currentPath)) {
      navigateTo('/customer', true)
    }
  }, [authStatus, currentPath, user])

  if (authStatus === 'checking') {
    return <SessionLoading message="Verifying your session…" />
  }
  // [STAFF][MOCK] โหมดข้อมูลจำลอง: แสดงหน้าพนักงานทันที ไม่ต้องมี backend
  if (STAFF_MOCK && isStaffPath(currentPath)) {
    return <StaffApp onLogout={() => navigateTo('/', true)} user={{ full_name: 'พนักงานทดสอบ (Mock)' }} />
  }
  // [STAFF] แสดง StaffApp เมื่อผู้ใช้เป็นพนักงาน
  if (authStatus === 'authenticated' && user?.role === 'STAFF') {
    return isStaffPath(currentPath)
      ? <StaffApp onLogout={logout} user={user} />
      : <SessionLoading message="Opening the Staff workspace…" />
  }
  if (currentPath === '/services') {
    return (
      <ServicesPage
        onLogout={user?.role === 'ADMIN' ? logoutAdminFromHome : logout}
        user={user}
      />
    )
  }
  if (authStatus !== 'authenticated') {
    if (currentPath === '/login') {
      return (
        <LoginPage
          onNavigate={navigateAuthLink}
          registrationSuccess={window.history.state?.registrationSuccess === true}
        />
      )
    }
    if (currentPath === '/register') {
      return <RegistrationPage onNavigate={navigateAuthLink} />
    }
    if (currentPath === '/') {
      return <CustomerLanding user={null} />
    }
    return <SessionLoading message="Redirecting to sign in…" />
  }

  if (currentPath === '/customer/booking') {
    return <CustomerBookingPage onLogout={logout} user={user} />
  }

  if (user?.role === 'ADMIN') {
    if (currentPath === '/') {
      return <CustomerLanding onLogout={logoutAdminFromHome} user={user} />
    }
    return isAdminPath(currentPath)
      ? <AdminApp onLogout={logout} user={user} />
      : <SessionLoading message="Opening the Admin workspace…" />
  }
  if (user?.role === 'CUSTOMER') {
    if (currentPath === '/') {
      return <CustomerLanding onLogout={logout} user={user} />
    }
    if (!isCustomerPath(currentPath)) {
      return <SessionLoading message="Opening your Customer account…" />
    }
    if (currentPath === '/customer') {
      return <CustomerDashboardPage onLogout={logout} user={user} />
    }
    if (currentPath === '/customer/vehicles') {
      return <MyVehiclesPage onLogout={logout} user={user} />
    }
    if (currentPath === '/customer/bookings') {
      return <MyBookingsPage onLogout={logout} user={user} />
    }
    if (currentPath === '/customer/wallet') {
      return <CustomerWalletPage onLogout={logout} user={user} />
    }
    const paymentRoute = /^\/customer\/payment\/([^/]+)$/.exec(currentPath)
    if (paymentRoute) {
      return (
        <CustomerPaymentPage
          bookingId={paymentRoute[1]}
          initialBooking={window.history.state?.customerBooking}
          key={paymentRoute[1]}
          onLogout={logout}
          user={user}
        />
      )
    }
    return <CustomerNotFoundPage onLogout={logout} user={user} />
  }

  return <SessionLoading message="Checking account access…" />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
