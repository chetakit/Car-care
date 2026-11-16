import { useMemo } from 'react'
import AdminIcon from '../components/AdminIcon.jsx'
import { DataTable, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDate } from '../utils/formatDate.js'
import formatStatusLabel from '../utils/formatStatusLabel.js'
import formatMoney from '../utils/formatMoney.js'

const BOOKING_STATUS_ORDER = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]
const BOOKING_STATUSES = new Set(BOOKING_STATUS_ORDER)

const metrics = [
  { key: 'todayBookings', label: "Today's bookings", icon: 'calendar' },
  { key: 'totalCustomers', label: 'Customers', icon: 'users' },
  { key: 'totalVehicles', label: 'Vehicles', icon: 'tool' },
]

const revenuePeriods = [
  {
    key: 'today',
    title: "Today's revenue",
    gross: 'todayGrossRevenue',
    refunds: 'todayRefunds',
    net: 'todayRevenue',
  },
  {
    key: 'monthly',
    title: 'This month',
    gross: 'monthlyGrossRevenue',
    refunds: 'monthlyRefunds',
    net: 'monthlyRevenue',
  },
]

function formatCount(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString()
    : '—'
}

function formatSummaryMoney(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? formatMoney(value)
    : '—'
}

function isValidBookingId(value) {
  const id = String(value ?? '')
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) <= 2147483647
}

function formatTimeRange(startTime, endTime) {
  const start = startTime ? String(startTime).slice(0, 5) : ''
  const end = endTime ? String(endTime).slice(0, 5) : ''
  if (start && end) return `${start}–${end}`
  return start || end
}

function DashboardPage({ onNavigate }) {
  const { data, loading, error, refresh } = useRemoteData('/api/admin/dashboard/summary')
  const summary = data ?? {}
  const statusRows = useMemo(
    () => (Array.isArray(summary.bookingStatusSummary)
      ? summary.bookingStatusSummary.filter((row) => (
        row &&
        BOOKING_STATUSES.has(row.booking_status) &&
        typeof row.count === 'number' &&
        Number.isFinite(row.count)
      )).sort((left, right) => (
        BOOKING_STATUS_ORDER.indexOf(left.booking_status) -
        BOOKING_STATUS_ORDER.indexOf(right.booking_status)
      ))
      : []),
    [summary.bookingStatusSummary],
  )
  const hasStatusSummary = Array.isArray(summary.bookingStatusSummary)
  const recentBookings = Array.isArray(summary.recentBookings) ? summary.recentBookings : []
  const hasRecentBookings = Array.isArray(summary.recentBookings)

  return (
    <div className="admin-dashboard">
      <section className="admin-page-intro">
        <div>
          <p className="admin-eyebrow">OVERVIEW</p>
          <h2>Business overview</h2>
          <p className="admin-muted">Today at a glance.</p>
        </div>
        <button className="admin-secondary-button admin-refresh-button" disabled={loading} onClick={refresh} type="button">Refresh</button>
      </section>
      <RequestState error={error} loading={loading} onRetry={refresh} />
      {!loading && !error && (
        <>
          <section aria-label="Business summary" className="admin-metrics">
            {metrics.map((metric, index) => (
              <article className="admin-metric-card" key={metric.key}>
                <div className="admin-metric-heading">
                  <span>{metric.label}</span>
                  <span className={`admin-metric-icon metric-icon-${index + 1}`}>
                    <AdminIcon name={metric.icon} size={16} />
                  </span>
                </div>
                <strong className="admin-metric-value">
                  {formatCount(summary[metric.key])}
                </strong>
              </article>
            ))}
          </section>
          <section aria-label="Revenue summary" className="admin-revenue-grid">
            {revenuePeriods.map((period) => (
              <article className="admin-panel admin-revenue-panel" key={period.key}>
                <div className="admin-panel-heading">
                  <div>
                    <h3>{period.title}</h3>
                    <p>Based on paid and processed transactions</p>
                  </div>
                </div>
                <dl className="admin-revenue-breakdown">
                  <div>
                    <dt>Gross revenue</dt>
                    <dd>{formatSummaryMoney(summary[period.gross])}</dd>
                  </div>
                  <div>
                    <dt>Refunds</dt>
                    <dd>{formatSummaryMoney(summary[period.refunds])}</dd>
                  </div>
                  <div className="is-net-revenue">
                    <dt>Net revenue</dt>
                    <dd>{formatSummaryMoney(summary[period.net])}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>
          <section className="admin-dashboard-grid">
            <article className="admin-panel admin-bookings-panel">
              <div className="admin-panel-heading">
                <div><h3>Recent bookings</h3><p>The newest bookings</p></div>
                <button className="admin-text-button" onClick={() => onNavigate('bookings')} type="button">
                  View bookings <span aria-hidden="true">→</span>
                </button>
              </div>
              <RequestState
                empty={!hasRecentBookings || !recentBookings.length}
                emptyDescription={hasRecentBookings
                  ? 'No recent booking records were returned.'
                  : 'Recent booking data was not included in the dashboard response.'}
                emptyTitle={hasRecentBookings ? 'No recent bookings' : 'Recent bookings unavailable'}
              />
              {!!recentBookings.length && (
                <DataTable columns={[
                  {
                    key: 'booking_id',
                    label: 'Booking',
                    render: (row) => isValidBookingId(row.booking_id) ? (
                      <button
                        aria-label={`View booking #${row.booking_id} details`}
                        className="admin-booking-link"
                        onClick={() => onNavigate('bookings', { booking_id: String(row.booking_id) })}
                        type="button"
                      >
                        #{row.booking_id}
                      </button>
                    ) : '—',
                  },
                  { key: 'customer', label: 'Customer', render: (row) => row.customer?.full_name || row.full_name || '—' },
                  {
                    key: 'booking_date',
                    label: 'Date / time',
                    render: (row) => {
                      const timeRange = formatTimeRange(row.start_time, row.end_time)
                      return (
                        <span className="admin-dashboard-booking-time">
                          {formatDate(row.booking_date)}
                          {timeRange && <small>{timeRange}</small>}
                        </span>
                      )
                    },
                  },
                  { key: 'booking_status', label: 'Status', render: (row) => <StatusBadge value={row.booking_status} /> },
                ]} rows={recentBookings} />
              )}
            </article>
            <article className="admin-panel admin-status-panel">
              <div className="admin-panel-heading">
                <div>
                  <h3>Bookings by status</h3>
                  <p>Select a status to review its bookings.</p>
                </div>
              </div>
              <RequestState
                empty={!statusRows.length}
                emptyDescription={hasStatusSummary
                  ? 'No booking status counts were returned.'
                  : 'Booking status counts were not included in the dashboard response.'}
                emptyTitle={hasStatusSummary ? 'No booking status data' : 'Booking status data unavailable'}
              />
              {!!statusRows.length && (
                <DataTable columns={[
                  {
                    key: 'booking_status',
                    label: 'Status',
                    render: (row) => (
                      <button
                        aria-label={`View ${formatStatusLabel(row.booking_status)} bookings`}
                        className="admin-booking-link"
                        onClick={() => onNavigate('bookings', { booking_status: row.booking_status })}
                        type="button"
                      >
                        <StatusBadge value={row.booking_status} />
                      </button>
                    ),
                  },
                  { key: 'count', label: 'Bookings', render: (row) => formatCount(row.count) },
                ]} rows={statusRows} />
              )}
              <div className="admin-dashboard-payment-note">
                <p>Need to verify a transfer or take a payment?</p>
                <button className="admin-inline-button" onClick={() => onNavigate('payments')} type="button">
                  Open Payments
                </button>
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  )
}

export default DashboardPage
