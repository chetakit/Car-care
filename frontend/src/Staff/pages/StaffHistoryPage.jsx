// [STAFF] 8) ดูประวัติการให้บริการ — GET /api/staff/bookings?date_from=&date_to=&booking_status=&search=
import { useEffect, useState } from 'react'
import useApi from '../../Admin/hooks/useApi.js'
import { listStaffBookings } from '../api/staffBookingApi.js'
import { LoadState, StaffLink, StatusBadge } from '../components/StaffUi.jsx'
import useStaffRequest from '../hooks/useStaffRequest.js'
import { STATUS_LABEL, formatMoney, formatShortDate, plateText } from '../utils/staffFormat.js'

const PAGE_SIZE = 20

export default function StaffHistoryPage({ navigate }) {
  const api = useApi()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  // หน่วงการค้นหา 300ms ไม่ให้ยิง API ทุกตัวอักษร
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const params = {
    search: debouncedSearch,
    booking_status: status,
    date_from: from,
    date_to: to,
    page,
    limit: PAGE_SIZE,
  }
  const { data, loading, error, reload } = useStaffRequest(JSON.stringify(params), (signal) =>
    listStaffBookings(api, params, signal),
  )

  const rows = data?.items ?? []
  const pagination = data?.pagination
  const rangeInvalid = from && to && from > to
  const resetPage = (setter) => (e) => {
    setter(e.target.value)
    setPage(1)
  }

  return (
    <>
      <div className="staff-page-head">
        <div>
          <h1>ประวัติการให้บริการ</h1>
          <p className="staff-muted">ค้นหาตามลูกค้า ทะเบียนรถ ช่วงวันที่ หรือสถานะ</p>
        </div>
      </div>

      <div className="staff-filters">
        <input
          className="staff-search"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ชื่อ / เบอร์ / ทะเบียน / เลขที่จอง"
          value={search}
        />
        <select onChange={resetPage(setStatus)} value={status}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <label className="staff-inline">ตั้งแต่ <input onChange={resetPage(setFrom)} type="date" value={from} /></label>
        <label className="staff-inline">ถึง <input onChange={resetPage(setTo)} type="date" value={to} /></label>
      </div>

      {rangeInvalid ? (
        <div className="staff-alert">วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด</div>
      ) : (
        <LoadState
          empty={!loading && !error && rows.length === 0}
          emptyText="ไม่พบข้อมูล"
          error={error}
          loading={loading && !data}
          onRetry={reload}
        />
      )}

      {rows.length > 0 && (
        <div className="staff-card staff-table-wrap">
          <table className="staff-table">
            <thead>
              <tr>
                <th>วันที่</th><th>เลขที่</th><th>ลูกค้า</th><th>รถ</th>
                <th>บริการ</th><th className="r">ยอด</th><th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.booking_id}>
                  <td className="nowrap">
                    {formatShortDate(b.booking_date)}<br />
                    <span className="staff-muted staff-small">{b.start_time}</span>
                  </td>
                  <td>
                    <StaffLink navigate={navigate} to={`/staff/bookings/${b.booking_id}`}>#{b.booking_id}</StaffLink>
                  </td>
                  <td>{b.full_name}<br /><span className="staff-muted staff-small">{b.phone || '—'}</span></td>
                  <td className="nowrap">
                    {plateText(b)}<br />
                    <span className="staff-muted staff-small">{[b.brand_name, b.model_name].filter(Boolean).join(' ')}</span>
                  </td>
                  <td className="staff-small">{b.service_names.join(', ')}</td>
                  <td className="r nowrap">{formatMoney(b.final_amount)}</td>
                  <td><StatusBadge status={b.booking_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="staff-pagination">
          <span className="staff-muted">หน้า {pagination.page} / {pagination.totalPages} · {pagination.total} รายการ</span>
          <div>
            <button className="staff-btn" disabled={page <= 1} onClick={() => setPage(page - 1)} type="button">ก่อนหน้า</button>
            <button
              className="staff-btn"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
              type="button"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}
    </>
  )
}
