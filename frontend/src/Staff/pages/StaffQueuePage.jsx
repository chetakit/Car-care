// [STAFF] 1) ดูรายการจองในแต่ละวัน — GET /api/staff/bookings?date=YYYY-MM-DD
import { useState } from 'react'
import useApi from '../../Admin/hooks/useApi.js'
import { listStaffBookings } from '../api/staffBookingApi.js'
import StaffCalendar from '../components/StaffCalendar.jsx'
import { LoadState, StaffLink, StatusBadge } from '../components/StaffUi.jsx'
import useStaffRequest from '../hooks/useStaffRequest.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { formatDate, plateText, todayKey } from '../utils/staffFormat.js'

const GROUPS = [
  { key: 'all', labelKey: 'staff.queue.group.all', match: () => true },
  { key: 'waiting', labelKey: 'staff.queue.group.waiting', match: (s) => s === 'CONFIRMED' },
  { key: 'working', labelKey: 'staff.queue.group.working', match: (s) => s === 'CHECKED_IN' || s === 'IN_SERVICE' },
  { key: 'done', labelKey: 'staff.queue.group.done', match: (s) => s === 'COMPLETED' },
  { key: 'noshow', labelKey: 'staff.queue.group.noShow', match: (s) => s === 'NO_SHOW' },
]

export default function StaffQueuePage({ date: dateParam, navigate }) {
  const { language, t } = useLanguage()
  const api = useApi()
  const date = dateParam || todayKey()
  const [group, setGroup] = useState('all')
  const [query, setQuery] = useState('')
  const [calendarRefresh, setCalendarRefresh] = useState(0) // กด ↻ แล้วให้ปฏิทินโหลดใหม่ด้วย

  // limit=200 = ดึงทั้งวันในครั้งเดียว (ร้านไม่น่ามีคิวเกิน 200 ต่อวัน)
  const { data, loading, error, reload } = useStaffRequest(date, (signal) =>
    listStaffBookings(api, { date, limit: 200 }, signal),
  )

  const setDate = (next) => navigate(next === todayKey() ? '/staff' : `/staff?date=${next}`)
  const items = data?.items ?? []
  const activeGroup = GROUPS.find((g) => g.key === group)
  const term = query.trim().toLowerCase()
  const rows = items.filter((b) => {
    if (!activeGroup.match(b.booking_status)) return false
    if (!term) return true
    return `${b.booking_id} ${b.full_name} ${b.phone} ${b.license_plate}`.toLowerCase().includes(term)
  })

  return (
    <>
      <div className="staff-page-head">
        <div>
          <span className="staff-eyebrow">{t('staff.queue.eyebrow')}</span>
          <h1>{t('staff.queue.title')}</h1>
          <p className="staff-muted">{formatDate(date, language)}</p>
        </div>
        {/* [STAFF] เลือกวันผ่านปฏิทินด้านซ้ายแทนช่องเลือกวันที่เดิม เหลือแค่ปุ่ม "วันนี้" กับ "โหลดใหม่" */}
        <div className="staff-actions">
          {date !== todayKey() && (
            <button className="staff-btn ghost" onClick={() => setDate(todayKey())} type="button">{t('staff.queue.today')}</button>
          )}
          <button
            className="staff-btn ghost"
            onClick={() => {
              reload()
              setCalendarRefresh((n) => n + 1)
            }}
            type="button"
          >
            <span aria-hidden="true">↻</span> {t('staff.queue.refresh')}
          </button>
        </div>
      </div>

      {/* [STAFF] ซ้าย: ปฏิทินมีจุดบอกวันที่มีการจอง · ขวา: คิวงานของวันที่เลือก */}
      <div className="staff-queue-layout">
        <aside className="staff-queue-side">
          <StaffCalendar key={date.slice(0, 7)} onChange={setDate} refreshKey={calendarRefresh} value={date} />
        </aside>

        <div>
          <div className="staff-summary">
            {GROUPS.map((g) => (
              <button
                className={`staff-stat staff-stat-${g.key} ${group === g.key ? 'active' : ''}`}
                key={g.key}
                onClick={() => setGroup(g.key)}
                type="button"
              >
                <span className="staff-stat-num">{items.filter((b) => g.match(b.booking_status)).length}</span>
                <span className="staff-stat-label">{t(g.labelKey)}</span>
              </button>
            ))}
          </div>

          <input
            className="staff-search"
            aria-label={t('staff.queue.search')}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('staff.queue.searchPlaceholder')}
            value={query}
          />

          <LoadState
            empty={!loading && !error && rows.length === 0}
            emptyText={t('staff.queue.empty')}
            error={error}
            loading={loading && !data}
            onRetry={reload}
          />

          <div className="staff-queue">
            {rows.map((b) => (
              <StaffLink
                className={`staff-queue-item s-${b.booking_status.toLowerCase()}`}
                key={b.booking_id}
                navigate={navigate}
                to={`/staff/bookings/${b.booking_id}`}
              >
                <div className="staff-q-time">
                  <span>{b.start_time}</span>
                  <small>{b.end_time}</small>
                </div>
                <div className="staff-q-main">
                  <div className="staff-q-title">
                    <span className="staff-q-plate">{plateText(b)}</span>
                    <span className="staff-q-car">{[b.brand_name, b.model_name].filter(Boolean).join(' ')}</span>
                  </div>
                  <div className="staff-q-customer">{b.full_name} · {b.phone || '—'}</div>
                  <div className="staff-chips">
                    {b.service_names.map((name) => <span className="staff-chip" key={name}>{name}</span>)}
                  </div>
                </div>
                <div className="staff-q-side">
                  <StatusBadge status={b.booking_status} />
                  <small className="staff-muted">#{b.booking_id}</small>
                </div>
              </StaffLink>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
