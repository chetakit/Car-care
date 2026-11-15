// =====================================================================
// [STAFF] Staff & Service Management (Flame)
// เปิดจาก src/App.jsx เมื่อ user.role === 'STAFF'
//
//   /staff                    1) คิวงานรายวัน      -> StaffQueuePage
//   /staff/bookings/:id       2)-7) รายละเอียดการจอง -> StaffBookingDetailPage
//   /staff/history            8) ประวัติการให้บริการ  -> StaffHistoryPage
// =====================================================================
import { useEffect, useState } from 'react'
import StaffBookingDetailPage from './pages/StaffBookingDetailPage.jsx'
import StaffHistoryPage from './pages/StaffHistoryPage.jsx'
import StaffQueuePage from './pages/StaffQueuePage.jsx'
import { StaffLink } from './components/StaffUi.jsx'
import './styles/staff.css'

function navigate(path) {
  if (`${window.location.pathname}${window.location.search}` !== path) {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

function readLocation() {
  return {
    pathname: window.location.pathname.replace(/\/+$/, '') || '/',
    search: window.location.search,
  }
}

export default function StaffApp({ user, onLogout }) {
  const [location, setLocation] = useState(readLocation)

  useEffect(() => {
    const sync = () => setLocation(readLocation())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const { pathname, search } = location
  const detailMatch = /^\/staff\/bookings\/(\d+)$/.exec(pathname)

  let page
  if (detailMatch) {
    page = <StaffBookingDetailPage bookingId={detailMatch[1]} key={detailMatch[1]} navigate={navigate} />
  } else if (pathname === '/staff/history') {
    page = <StaffHistoryPage navigate={navigate} />
  } else {
    const date = new URLSearchParams(search).get('date')
    page = <StaffQueuePage date={date} navigate={navigate} />
  }

  const isHistory = pathname === '/staff/history'

  return (
    <div className="staff-app">
      <header className="staff-topbar">
        <div className="staff-brand">
          {/* โลโก้รถแบบเดียวกับ CustomerHeader ของหน้าหลัก */}
          <span aria-hidden="true" className="staff-brand-mark">
            <svg fill="none" viewBox="0 0 32 32">
              <path d="M5 20.5h2.2l2.1-7.1a2.8 2.8 0 0 1 2.7-2h8a2.8 2.8 0 0 1 2.7 2l2.1 7.1H27v4h-2.1v1.7h-3v-1.7H10.1v1.7h-3v-1.7H5v-4Z" />
              <path d="M9.3 18.2h13.4l-1.5-4.7H10.8l-1.5 4.7ZM10.4 21.3h.1m11 0h.1" />
            </svg>
          </span>
          <div>
            <strong>Car Care</strong>
            <small>Staff &amp; Service</small>
          </div>
        </div>
        <nav>
          <StaffLink className={!isHistory ? 'active' : ''} navigate={navigate} to="/staff">
            คิวงาน
          </StaffLink>
          <StaffLink className={isHistory ? 'active' : ''} navigate={navigate} to="/staff/history">
            ประวัติการให้บริการ
          </StaffLink>
        </nav>
        <div className="staff-user">
          <span className="staff-avatar">{user?.full_name?.[0] ?? 'S'}</span>
          <span className="staff-user-name">{user?.full_name}</span>
          <button className="staff-link-btn" onClick={onLogout} type="button">ออกจากระบบ</button>
        </div>
      </header>
      <main className="staff-container">{page}</main>
    </div>
  )
}
