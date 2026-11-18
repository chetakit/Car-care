// [STAFF] 8) ดูประวัติการให้บริการ — GET /api/staff/bookings?date_from=&date_to=&booking_status=&search=
import { useEffect, useState } from 'react'
import useApi from '../../Admin/hooks/useApi.js'
import { listStaffBookings } from '../api/staffBookingApi.js'
import { LoadState, StaffLink, StatusBadge } from '../components/StaffUi.jsx'
import useStaffRequest from '../hooks/useStaffRequest.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { STATUS_KEYS, formatMoney, formatShortDate, plateText } from '../utils/staffFormat.js'

const PAGE_SIZE = 20

export default function StaffHistoryPage({ navigate }) {
  const { language, t } = useLanguage()
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
          <span className="staff-eyebrow">{t('staff.history.eyebrow')}</span>
          <h1>{t('staff.history.title')}</h1>
          <p className="staff-muted">{t('staff.history.description')}</p>
        </div>
      </div>

      <div className="staff-filters">
        <input
          className="staff-search"
          aria-label={t('staff.history.search')}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('staff.history.searchPlaceholder')}
          value={search}
        />
        <select aria-label={t('staff.history.statusFilter')} onChange={resetPage(setStatus)} value={status}>
          <option value="">{t('staff.history.allStatuses')}</option>
          {STATUS_KEYS.map((value) => (
            <option key={value} value={value}>{t(`staff.status.${value}`)}</option>
          ))}
        </select>
        <label className="staff-inline">{t('staff.history.from')} <input onChange={resetPage(setFrom)} type="date" value={from} /></label>
        <label className="staff-inline">{t('staff.history.to')} <input onChange={resetPage(setTo)} type="date" value={to} /></label>
      </div>

      {rangeInvalid ? (
        <div className="staff-alert">{t('staff.history.invalidDateRange')}</div>
      ) : (
        <LoadState
          empty={!loading && !error && rows.length === 0}
          emptyText={t('staff.history.empty')}
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
                <th>{t('staff.history.table.date')}</th><th>{t('staff.history.table.booking')}</th><th>{t('staff.history.table.customer')}</th><th>{t('staff.history.table.vehicle')}</th>
                <th>{t('staff.history.table.services')}</th><th className="r">{t('staff.history.table.amount')}</th><th>{t('staff.history.table.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.booking_id}>
                  <td className="nowrap">
                    {formatShortDate(b.booking_date, language)}<br />
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
                  <td className="r nowrap">{formatMoney(b.final_amount, language)}</td>
                  <td><StatusBadge status={b.booking_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="staff-pagination">
          <span className="staff-muted">{t('staff.history.pagination', { page: pagination.page, totalPages: pagination.totalPages, total: pagination.total })}</span>
          <div>
            <button className="staff-btn" disabled={page <= 1} onClick={() => setPage(page - 1)} type="button">{t('staff.history.previous')}</button>
            <button
              className="staff-btn"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
              type="button"
            >
              {t('staff.history.next')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
