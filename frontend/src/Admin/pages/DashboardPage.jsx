import { useMemo } from 'react'
import AdminIcon from '../components/AdminIcon.jsx'
import { DataTable, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useRemoteData from '../hooks/useRemoteData.js'
import formatMoney from '../utils/formatMoney.js'

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

function DashboardPage({ onNavigate }) {
  const { data, loading, error, refresh } = useRemoteData('/api/admin/dashboard/summary')
  const summary = data ?? {}
  const statusRows = useMemo(
    () => (summary.bookingStatusSummary ?? []).map((row) => ({
      ...row,
      booking_status: row.booking_status,
    })),
    [summary.bookingStatusSummary],
  )

  return (
    <div className="admin-dashboard">
      <section className="admin-page-intro">
        <div>
          <p className="admin-eyebrow">OVERVIEW</p>
          <h2>Business overview</h2>
          <p className="admin-muted">Live information from your Car Care backend.</p>
        </div>
        <button className="admin-secondary-button" onClick={refresh} type="button">Refresh</button>
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
                  {summary[metric.key] ?? '—'}
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
                    <dd>{formatMoney(summary[period.gross])}</dd>
                  </div>
                  <div>
                    <dt>Refunds</dt>
                    <dd>{formatMoney(summary[period.refunds])}</dd>
                  </div>
                  <div className="is-net-revenue">
                    <dt>Net revenue</dt>
                    <dd>{formatMoney(summary[period.net])}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>
          <section className="admin-dashboard-grid">
            <article className="admin-panel admin-bookings-panel">
              <div className="admin-panel-heading">
                <div><h3>Recent bookings</h3><p>Latest bookings recorded by the backend</p></div>
                <button className="admin-text-button" onClick={() => onNavigate('bookings')} type="button">
                  View bookings <span aria-hidden="true">→</span>
                </button>
              </div>
              <RequestState empty={!summary.recentBookings?.length} />
              {!!summary.recentBookings?.length && (
                <DataTable columns={[
                  { key: 'booking_id', label: 'Booking' },
                  { key: 'customer', label: 'Customer', render: (row) => row.customer?.full_name || '—' },
                  { key: 'booking_date', label: 'Date' },
                  { key: 'final_amount', label: 'Total', render: (row) => formatMoney(row.final_amount) },
                  { key: 'booking_status', label: 'Status', render: (row) => <StatusBadge value={row.booking_status} /> },
                ]} rows={summary.recentBookings} />
              )}
            </article>
            <article className="admin-panel admin-status-panel">
              <div className="admin-panel-heading"><div><h3>Booking status</h3><p>Current totals by status</p></div></div>
              <RequestState empty={!statusRows.length} />
              {!!statusRows.length && (
                <DataTable columns={[
                  { key: 'booking_status', label: 'Status', render: (row) => <StatusBadge value={row.booking_status} /> },
                  { key: 'count', label: 'Bookings' },
                ]} rows={statusRows} />
              )}
            </article>
          </section>
        </>
      )}
    </div>
  )
}

export default DashboardPage
