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
          <span className="staff-brand-mark">◆</span>
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
