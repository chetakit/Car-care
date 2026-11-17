import { useState } from 'react'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import usePagedRows from '../hooks/usePagedRows.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDate } from '../utils/formatDate.js'
import formatMoney from '../utils/formatMoney.js'
import { ADMIN_PAGE_SIZE } from '../utils/pageSize.js'

function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function daysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return toKey(date)
}

// Quick ranges cover what an Admin usually asks; "Custom" opens the date fields.
const RANGES = [
  { id: '7d', label: 'Last 7 days', range: () => ({ dateFrom: daysAgo(6), dateTo: toKey(new Date()), groupBy: 'day' }) },
  { id: '30d', label: 'Last 30 days', range: () => ({ dateFrom: daysAgo(29), dateTo: toKey(new Date()), groupBy: 'day' }) },
  {
    id: 'month',
    label: 'This month',
    range: () => {
      const now = new Date()
      return { dateFrom: toKey(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: toKey(now), groupBy: 'day' }
    },
  },
  { id: 'all', label: 'All time', range: () => ({ dateFrom: '', dateTo: '', groupBy: 'month' }) },
  { id: 'custom', label: 'Custom' },
]

// Bookings move through these statuses in this order.
const STATUS_ORDER = ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW']

function formatPeriod(period, groupBy) {
  if (!period) return '—'
  if (groupBy === 'month') {
    const [year, month] = String(period).split('-').map(Number)
    return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }
  return formatDate(period)
}

function rangeSummary({ dateFrom, dateTo }) {
  if (!dateFrom && !dateTo) return 'All time'
  return `${dateFrom ? formatDate(dateFrom) : 'Start'} – ${dateTo ? formatDate(dateTo) : 'today'}`
}

function ReportsPage() {
  const [rangeId, setRangeId] = useState('30d')
  const [applied, setApplied] = useState(() => RANGES[1].range())
  const [custom, setCustom] = useState(applied)
  const [filterError, setFilterError] = useState('')

  const params = new URLSearchParams({ group_by: applied.groupBy })
  if (applied.dateFrom) params.set('date_from', applied.dateFrom)
  if (applied.dateTo) params.set('date_to', applied.dateTo)
  const query = params.toString()
  const bookings = useRemoteData(`/api/admin/reports/bookings?${query}`)
  const revenue = useRemoteData(`/api/admin/reports/revenue?${query}`)
  const loading = bookings.loading || revenue.loading
  const error = bookings.error || revenue.error

  function chooseRange(range) {
    setRangeId(range.id)
    setFilterError('')
    if (range.range) {
      const next = range.range()
      setApplied(next)
      setCustom(next)
    }
  }

  function applyCustom(event) {
    event.preventDefault()
    if (custom.dateFrom && custom.dateTo && custom.dateTo < custom.dateFrom) {
      setFilterError('The end date must be the same as or later than the start date.')
      return
    }
    setFilterError('')
    setApplied(custom)
  }

  function refresh() {
    bookings.refresh()
    revenue.refresh()
  }

  // Summary numbers
  const statusCounts = new Map((bookings.data?.bookingCountsByStatus ?? []).map((row) => [row.booking_status, Number(row.count) || 0]))
  const totalBookings = Number(bookings.data?.totalBookings ?? 0)
  const completed = statusCounts.get('COMPLETED') ?? 0
  const lost = (statusCounts.get('CANCELLED') ?? 0) + (statusCounts.get('NO_SHOW') ?? 0)
  const percent = (value) => (totalBookings ? Math.round((value / totalBookings) * 100) : 0)
  const statusRows = STATUS_ORDER.map((status) => ({ status, count: statusCounts.get(status) ?? 0 }))
  const maxStatusCount = Math.max(1, ...statusRows.map((row) => row.count))

  // One table per day/month with bookings and revenue side by side, newest first.
  const periods = new Map()
  for (const row of bookings.data?.bookingCountsByPeriod ?? []) {
    periods.set(String(row.period), { period: String(row.period), bookings: Number(row.count) || 0, revenue: 0, payments: 0 })
  }
  for (const row of revenue.data?.revenueByPeriod ?? []) {
    const key = String(row.period)
    const entry = periods.get(key) ?? { period: key, bookings: 0, revenue: 0, payments: 0 }
    entry.revenue = Number(row.revenue) || 0
    entry.payments = Number(row.successfulPayments) || 0
    periods.set(key, entry)
  }
  const periodRows = [...periods.values()].sort((a, b) => b.period.localeCompare(a.period))
  const pagedPeriods = usePagedRows(periodRows, ADMIN_PAGE_SIZE, query)

  return (
    <div className="admin-reports">
      <PageHeading
        action={<button className="admin-secondary-button admin-refresh-button" disabled={loading} onClick={refresh} type="button">Refresh</button>}
        description="How many bookings came in, how they ended, and how much was earned."
        eyebrow="ANALYTICS"
        title="Reports"
      />

      <div aria-label="Report period" className="admin-report-ranges" role="group">
        {RANGES.map((range) => (
          <button aria-pressed={rangeId === range.id} className={rangeId === range.id ? 'is-selected' : ''} key={range.id} onClick={() => chooseRange(range)} type="button">
            {range.label}
          </button>
        ))}
      </div>
      {rangeId === 'custom' && (
        <form className="admin-filter-bar" onSubmit={applyCustom}>
          <label>From<input onChange={(event) => { setCustom({ ...custom, dateFrom: event.target.value }); setFilterError('') }} type="date" value={custom.dateFrom} /></label>
          <label>To<input onChange={(event) => { setCustom({ ...custom, dateTo: event.target.value }); setFilterError('') }} type="date" value={custom.dateTo} /></label>
          <label>Show<select onChange={(event) => setCustom({ ...custom, groupBy: event.target.value })} value={custom.groupBy}><option value="day">Per day</option><option value="month">Per month</option></select></label>
          <button className="admin-primary-button" type="submit">Show report</button>
        </form>
      )}
      {filterError && <div className="admin-alert admin-alert-error" role="alert">{filterError}</div>}
      <p aria-live="polite" className="admin-report-range-label">{rangeSummary(applied)}</p>

      <RequestState error={error} loading={loading} loadingMessage="Loading report…" onRetry={refresh} />
      {!loading && !error && (
        <>
          <section aria-label="Summary" className="admin-report-stats">
            <article>
              <span>Bookings</span>
              <strong>{totalBookings}</strong>
              <small>by visit date</small>
            </article>
            <article>
              <span>Completed</span>
              <strong>{completed}</strong>
              <small>{percent(completed)}% of bookings</small>
            </article>
            <article>
              <span>Cancelled or no-show</span>
              <strong>{lost}</strong>
              <small>{percent(lost)}% of bookings</small>
            </article>
            <article>
              <span>Revenue</span>
              <strong>{formatMoney(revenue.data?.totalRevenue)}</strong>
              <small>{revenue.data?.successfulPayments ?? 0} paid bookings</small>
            </article>
          </section>

          <section className="admin-panel admin-report-panel">
            <div className="admin-panel-heading">
              <div><h3>Bookings by status</h3><p>Where each booking in this period ended up</p></div>
            </div>
            {totalBookings === 0 ? (
              <RequestState empty emptyDescription="Try a longer period." emptyTitle="No bookings in this period" />
            ) : (
              <ul className="admin-status-bars">
                {statusRows.map((row) => (
                  <li className={row.count ? '' : 'is-empty'} key={row.status} title={`${row.count} bookings (${percent(row.count)}%)`}>
                    <span className="admin-status-bars-label"><StatusBadge value={row.status} /></span>
                    <span aria-hidden="true" className="admin-status-bars-track">
                      <span style={{ width: `${(row.count / maxStatusCount) * 100}%` }} />
                    </span>
                    <span className="admin-status-bars-value"><strong>{row.count}</strong> <small>{percent(row.count)}%</small></span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-panel admin-data-panel admin-report-panel">
            <div className="admin-panel-heading">
              <div>
                <h3>{applied.groupBy === 'month' ? 'Month by month' : 'Day by day'}</h3>
                <p>Bookings are counted on the visit date, revenue on the day it was paid · newest first</p>
              </div>
            </div>
            {periodRows.length ? (
              <>
                <DataTable
                  columns={[
                    { key: 'period', label: applied.groupBy === 'month' ? 'Month' : 'Date', render: (row) => formatPeriod(row.period, applied.groupBy) },
                    { key: 'bookings', label: 'Bookings' },
                    { key: 'revenue', label: 'Revenue', render: (row) => formatMoney(row.revenue) },
                    { key: 'payments', label: 'Paid bookings' },
                  ]}
                  rowKey={(row) => row.period}
                  rows={pagedPeriods.pageRows}
                />
                <Pagination onPageChange={pagedPeriods.setPage} pagination={pagedPeriods.pagination} />
              </>
            ) : (
              <RequestState empty emptyDescription="Try a longer period." emptyTitle="Nothing to show for this period" />
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default ReportsPage
