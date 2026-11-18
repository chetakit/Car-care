import { useMemo } from 'react'
import AdminIcon from '../components/AdminIcon.jsx'
import { DataTable, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDate } from '../utils/formatDate.js'
import formatStatusLabel from '../utils/formatStatusLabel.js'
import formatMoney from '../utils/formatMoney.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

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
  { key: 'todayBookings', label: 'admin.dashboard.metric.todayBookings', icon: 'calendar' },
  { key: 'totalCustomers', label: 'admin.dashboard.metric.customers', icon: 'users' },
  { key: 'totalVehicles', label: 'admin.dashboard.metric.vehicles', icon: 'tool' },
]

const revenuePeriods = [
  {
    key: 'today',
    title: 'admin.dashboard.revenue.today',
    gross: 'todayGrossRevenue',
    refunds: 'todayRefunds',
    net: 'todayRevenue',
  },
  {
    key: 'monthly',
    title: 'admin.dashboard.revenue.month',
    gross: 'monthlyGrossRevenue',
    refunds: 'monthlyRefunds',
    net: 'monthlyRevenue',
  },
]

function formatCount(value, language) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString(language === 'TH' ? 'th-TH' : 'en-GB')
    : '—'
}

function formatSummaryMoney(value, language) {
  return typeof value === 'number' && Number.isFinite(value)
    ? formatMoney(value, language)
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
  const { language, t } = useLanguage()
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
          <p className="admin-eyebrow">{t('admin.dashboard.eyebrow')}</p>
          <h2>{t('admin.dashboard.title')}</h2>
          <p className="admin-muted">{t('admin.dashboard.description')}</p>
        </div>
        <button className="admin-secondary-button admin-refresh-button" disabled={loading} onClick={refresh} type="button">{t('admin.dashboard.refresh')}</button>
      </section>
      <RequestState error={error} loading={loading} onRetry={refresh} />
      {!loading && !error && (
        <>
          <section aria-label={t('admin.dashboard.summaryLabel')} className="admin-metrics">
            {metrics.map((metric, index) => (
              <article className="admin-metric-card" key={metric.key}>
                <div className="admin-metric-heading">
                  <span>{t(metric.label)}</span>
                  <span className={`admin-metric-icon metric-icon-${index + 1}`}>
                    <AdminIcon name={metric.icon} size={16} />
                  </span>
                </div>
                <strong className="admin-metric-value">
                  {formatCount(summary[metric.key], language)}
                </strong>
              </article>
            ))}
          </section>
          <section aria-label={t('admin.dashboard.revenue.summaryLabel')} className="admin-revenue-grid">
            {revenuePeriods.map((period) => (
              <article className="admin-panel admin-revenue-panel" key={period.key}>
                <div className="admin-panel-heading">
                  <div>
                    <h3>{t(period.title)}</h3>
                    <p>{t('admin.dashboard.revenue.basis')}</p>
                  </div>
                </div>
                <dl className="admin-revenue-breakdown">
                  <div>
                    <dt>{t('admin.dashboard.revenue.gross')}</dt>
                    <dd>{formatSummaryMoney(summary[period.gross], language)}</dd>
                  </div>
                  <div>
                    <dt>{t('admin.dashboard.revenue.refunds')}</dt>
                    <dd>{formatSummaryMoney(summary[period.refunds], language)}</dd>
                  </div>
                  <div className="is-net-revenue">
                    <dt>{t('admin.dashboard.revenue.net')}</dt>
                    <dd>{formatSummaryMoney(summary[period.net], language)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>
          <section className="admin-dashboard-grid">
            <article className="admin-panel admin-bookings-panel">
              <div className="admin-panel-heading">
                <div><h3>{t('admin.dashboard.recent.title')}</h3><p>{t('admin.dashboard.recent.description')}</p></div>
                <button className="admin-text-button" onClick={() => onNavigate('bookings')} type="button">
                  {t('admin.dashboard.recent.view')} <span aria-hidden="true">→</span>
                </button>
              </div>
              <RequestState
                empty={!hasRecentBookings || !recentBookings.length}
                emptyDescription={hasRecentBookings
                  ? t('admin.dashboard.recent.emptyDescription')
                  : t('admin.dashboard.recent.unavailableDescription')}
                emptyTitle={hasRecentBookings
                  ? t('admin.dashboard.recent.emptyTitle')
                  : t('admin.dashboard.recent.unavailableTitle')}
              />
              {!!recentBookings.length && (
                <DataTable columns={[
                  {
                    key: 'booking_id',
                    label: t('admin.dashboard.recent.booking'),
                    render: (row) => isValidBookingId(row.booking_id) ? (
                      <button
                        aria-label={t('admin.dashboard.recent.viewBooking', { id: row.booking_id })}
                        className="admin-booking-link"
                        onClick={() => onNavigate('bookings', { booking_id: String(row.booking_id) })}
                        type="button"
                      >
                        #{row.booking_id}
                      </button>
                    ) : '—',
                  },
                  { key: 'customer', label: t('admin.dashboard.recent.customer'), render: (row) => row.customer?.full_name || row.full_name || '—' },
                  {
                    key: 'booking_date',
                    label: t('admin.dashboard.recent.dateTime'),
                    render: (row) => {
                      const timeRange = formatTimeRange(row.start_time, row.end_time)
                      return (
                        <span className="admin-dashboard-booking-time">
                          {formatDate(row.booking_date, language)}
                          {timeRange && <small>{timeRange}</small>}
                        </span>
                      )
                    },
                  },
                  { key: 'booking_status', label: t('admin.dashboard.recent.status'), render: (row) => <StatusBadge value={row.booking_status} /> },
                ]} rows={recentBookings} />
              )}
            </article>
            <article className="admin-panel admin-status-panel">
              <div className="admin-panel-heading">
                <div>
                  <h3>{t('admin.dashboard.status.title')}</h3>
                  <p>{t('admin.dashboard.status.description')}</p>
                </div>
              </div>
              <RequestState
                empty={!statusRows.length}
                emptyDescription={hasStatusSummary
                  ? t('admin.dashboard.status.emptyDescription')
                  : t('admin.dashboard.status.unavailableDescription')}
                emptyTitle={hasStatusSummary
                  ? t('admin.dashboard.status.emptyTitle')
                  : t('admin.dashboard.status.unavailableTitle')}
              />
              {!!statusRows.length && (
                <DataTable columns={[
                  {
                    key: 'booking_status',
                    label: t('admin.dashboard.status.status'),
                    render: (row) => (
                      <button
                        aria-label={t('admin.dashboard.status.viewBookings', {
                          status: formatStatusLabel(row.booking_status, language),
                        })}
                        className="admin-booking-link"
                        onClick={() => onNavigate('bookings', { booking_status: row.booking_status })}
                        type="button"
                      >
                        <StatusBadge value={row.booking_status} />
                      </button>
                    ),
                  },
                  { key: 'count', label: t('admin.dashboard.status.bookings'), render: (row) => formatCount(row.count, language) },
                ]} rows={statusRows} />
              )}
              <div className="admin-dashboard-payment-note">
                <p>{t('admin.dashboard.paymentNote')}</p>
                <button className="admin-inline-button" onClick={() => onNavigate('payments')} type="button">
                  {t('admin.dashboard.openPayments')}
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
