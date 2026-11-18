// [STAFF] ปฏิทินรายเดือนในหน้าคิวงาน
//   - จุดสีใต้วันที่ = วันนั้นมีรถ/ลูกค้าจอง (เหลือง รอรับรถ · เทา อยู่ในร้าน · เขียว เสร็จแล้ว)
//   - ตัวเลขแดงมุมขวาบน = จำนวนการจองของวันนั้น (ไม่นับที่ลูกค้ายกเลิก)
//   - กดวันที่ = เปลี่ยนคิวงานไปวันนั้น
//   ดึงข้อมูลจาก GET /api/staff/bookings?date_from=&date_to= (เดือนละครั้ง)
import { useState } from 'react'
import useApi from '../../Admin/hooks/useApi.js'
import { listStaffBookings } from '../api/staffBookingApi.js'
import useStaffRequest from '../hooks/useStaffRequest.js'
import { toDateKey, todayKey } from '../utils/staffFormat.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const PAGE_LIMIT = 200 // ค่าสูงสุดที่ backend ยอม
const MAX_PAGES = 10 // กันวนไม่จบ (2,000 การจอง/เดือน)

// กลุ่มสถานะเดียวกับการ์ดสรุปในหน้าคิวงาน
function statusGroup(status) {
  if (status === 'CONFIRMED') return 'waiting'
  if (status === 'CHECKED_IN' || status === 'IN_SERVICE') return 'working'
  if (status === 'COMPLETED') return 'done'
  if (status === 'NO_SHOW') return 'noshow'
  return null // CANCELLED ไม่นับ
}

function monthRange(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  return {
    from: toDateKey(new Date(year, month - 1, 1)),
    to: toDateKey(new Date(year, month, 0)), // วันสุดท้ายของเดือน
  }
}

function shiftMonth(monthKey, diff) {
  const [year, month] = monthKey.split('-').map(Number)
  return toDateKey(new Date(year, month - 1 + diff, 1)).slice(0, 7)
}

// ดึงการจองทั้งเดือน (หลายหน้าถ้าเกิน 200) แล้วนับต่อวัน
async function loadMonthCounts(api, monthKey, signal) {
  const { from, to } = monthRange(monthKey)
  const counts = {}
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await listStaffBookings(api, { date_from: from, date_to: to, limit: PAGE_LIMIT, page }, signal)
    for (const b of data.items) {
      const group = statusGroup(b.booking_status)
      if (!group) continue
      const day = (counts[b.booking_date] ??= { total: 0, waiting: 0, working: 0, done: 0, noshow: 0 })
      day.total += 1
      day[group] += 1
    }
    if (page >= (data.pagination?.totalPages ?? 1)) break
  }
  return counts
}

// วันที่ 42 ช่อง (6 สัปดาห์) เริ่มจากวันอาทิตย์
function buildDays(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const first = new Date(year, month - 1, 1)
  const start = new Date(year, month - 1, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return { key: toDateKey(date), day: date.getDate(), inMonth: date.getMonth() === month - 1 }
  })
}

export default function StaffCalendar({ value, onChange, refreshKey = 0 }) {
  const { language, t } = useLanguage()
  const api = useApi()
  const [month, setMonth] = useState(value.slice(0, 7))
  const { data: counts } = useStaffRequest(`cal-${month}-${refreshKey}`, (signal) =>
    loadMonthCounts(api, month, signal),
  )

  const today = todayKey()
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(
    language === 'TH' ? 'th-TH' : 'en-US',
    { month: 'long', year: 'numeric' },
  )
  const monthTotal = Object.entries(counts ?? {})
    .filter(([key]) => key.startsWith(month))
    .reduce((sum, [, c]) => sum + c.total, 0)

  return (
    <section aria-label={t('staff.calendar.ariaLabel')} className="staff-calendar">
      <div className="staff-cal-head">
        <strong>{monthLabel}</strong>
        <div className="staff-cal-nav">
          <button aria-label={t('staff.calendar.previousMonth')} onClick={() => setMonth(shiftMonth(month, -1))} type="button">‹</button>
          <button aria-label={t('staff.calendar.nextMonth')} onClick={() => setMonth(shiftMonth(month, 1))} type="button">›</button>
        </div>
      </div>

      <div className="staff-cal-grid">
        {WEEKDAY_KEYS.map((day) => <div className="staff-cal-dow" key={day}>{t(`staff.calendar.weekday.${day}`)}</div>)}
        {buildDays(month).map(({ key, day, inMonth }) => {
          const c = counts?.[key]
          const classes = [
            'staff-cal-day',
            !inMonth && 'other',
            key === today && 'today',
            key === value && 'selected',
            c && 'has-bookings',
          ].filter(Boolean).join(' ')
          return (
            <button
              aria-label={c
                ? t('staff.calendar.dayWithBookings', { date: key, count: c.total })
                : t('staff.calendar.day', { date: key })}
              className={classes}
              key={key}
              onClick={() => onChange(key)}
              title={c ? t('staff.calendar.bookingCount', { count: c.total }) : ''}
              type="button"
            >
              {c && <span className="staff-cal-count">{c.total}</span>}
              <span>{day}</span>
              <span className="staff-cal-dots">
                {c?.waiting > 0 && <span className="staff-cal-dot waiting" />}
                {c?.working > 0 && <span className="staff-cal-dot working" />}
                {(c?.done > 0 || c?.noshow > 0) && <span className="staff-cal-dot done" />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="staff-cal-legend">
        <span><i className="staff-cal-dot waiting" /> {t('staff.calendar.legend.waiting')}</span>
        <span><i className="staff-cal-dot working" /> {t('staff.calendar.legend.working')}</span>
        <span><i className="staff-cal-dot done" /> {t('staff.calendar.legend.done')}</span>
      </div>
      <div className="staff-cal-month-total">
        {counts
          ? t('staff.calendar.monthTotal', { count: monthTotal })
          : t('staff.calendar.loading')}
      </div>
    </section>
  )
}
