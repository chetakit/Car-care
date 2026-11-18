import { useMemo, useState } from 'react'
import AdminIcon from '../components/AdminIcon.jsx'
import { DataTable, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import { StatusDonut, TrendBarChart } from '../components/DashboardCharts.jsx'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDate } from '../utils/formatDate.js'
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

const TREND_RANGES = [7, 14, 30]
const TREND_DAYS = 30

function toLocale(language) {
  return language === 'TH' ? 'th-TH' : 'en-GB'
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// The last TREND_DAYS calendar days, oldest first, ending today.
function lastDays(locale) {
  const today = new Date()
  return Array.from({ length: TREND_DAYS }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (TREND_DAYS - 1 - index))
    return {
      key: toDateKey(date),
      label: date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
      shortLabel: date.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    }
  })
}

function formatCompactMoney(value, locale) {
  if (value >= 1000) return `${(value / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}k ฿`
  return `${value.toLocaleString(locale)} ฿`
}

function formatCount(value, language) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString(toLocale(language))
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
  const locale = toLocale(language)
  const { data, loading, error, refresh: refreshSummary } = useRemoteData('/api/admin/dashboard/summary')
  const summary = data ?? {}
  // Fixed once per visit so the report queries stay stable; labels follow the language.
  const [dayKeys] = useState(() => lastDays('en-GB').map((day) => day.key))
  const days = useMemo(
    () => lastDays(locale).filter((day) => dayKeys.includes(day.key)),
    [dayKeys, locale],
  )
  const trendQuery = `date_from=${dayKeys[0]}&date_to=${dayKeys[dayKeys.length - 1]}&group_by=day`
  const revenueTrend = useRemoteData(`/api/admin/reports/revenue?${trendQuery}`)
  const bookingTrend = useRemoteData(`/api/admin/reports/bookings?${trendQuery}`)
  const [trendMetric, setTrendMetric] = useState('revenue')
  const [trendRange, setTrendRange] = useState(14)
  const isRevenue = trendMetric === 'revenue'

  const trendPoints = useMemo(() => {
    const rows = isRevenue
      ? revenueTrend.data?.revenueByPeriod ?? []
      : bookingTrend.data?.bookingCountsByPeriod ?? []
    const values = new Map(rows.map((row) => [
      String(row.period).slice(0, 10),
      Number(isRevenue ? row.revenue : row.count) || 0,
    ]))
    return days.slice(-trendRange).map((day) => ({ ...day, value: values.get(day.key) ?? 0 }))
  }, [bookingTrend.data, days, isRevenue, revenueTrend.data, trendRange])
  const trendTotal = trendPoints.reduce((sum, point) => sum + point.value, 0)
  const trendLoading = revenueTrend.loading || bookingTrend.loading
  const trendError = revenueTrend.error || bookingTrend.error

  function refresh() {
    refreshSummary()
    revenueTrend.refresh()
    bookingTrend.refresh()
  }
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
          <section aria-label={t('admin.dashboard.summaryLabel')} className="admin-metrics admin-metrics-4">
            <article className="admin-metric-card">
              <div className="admin-metric-heading">
                <span>{t('admin.dashboard.metric.todayBookings')}</span>
                <span className="admin-metric-icon metric-icon-1"><AdminIcon name="calendar" size={16} /></span>
              </div>
              <strong className="admin-metric-value">{formatCount(summary.todayBookings, language)}</strong>
              <span className="admin-metric-detail">{t('admin.dashboard.metric.todayDetail')}</span>
            </article>
            <article className="admin-metric-card">
              <div className="admin-metric-heading">
                <span>{t('admin.dashboard.metric.monthNet')}</span>
                <span className="admin-metric-icon metric-icon-3"><AdminIcon name="wallet" size={16} /></span>
              </div>
              <strong className="admin-metric-value">{formatSummaryMoney(summary.monthlyRevenue, language)}</strong>
              <span className="admin-metric-detail">
                {t('admin.dashboard.metric.monthDetail', {
                  paid: formatSummaryMoney(summary.monthlyGrossRevenue, language),
                  refunded: formatSummaryMoney(summary.monthlyRefunds, language),
                })}
              </span>
            </article>
            <article className="admin-metric-card">
              <div className="admin-metric-heading">
                <span>{t('admin.dashboard.metric.customers')}</span>
                <span className="admin-metric-icon metric-icon-2"><AdminIcon name="users" size={16} /></span>
              </div>
              <strong className="admin-metric-value">{formatCount(summary.totalCustomers, language)}</strong>
              <span className="admin-metric-detail">{t('admin.dashboard.metric.customersDetail')}</span>
            </article>
            <article className="admin-metric-card">
              <div className="admin-metric-heading">
                <span>{t('admin.dashboard.metric.vehicles')}</span>
                <span className="admin-metric-icon metric-icon-4"><AdminIcon name="car" size={16} /></span>
              </div>
              <strong className="admin-metric-value">{formatCount(summary.totalVehicles, language)}</strong>
              <span className="admin-metric-detail">{t('admin.dashboard.metric.vehiclesDetail')}</span>
            </article>
          </section>

          <section className="admin-dashboard-charts">
            <article className="admin-panel admin-trend-panel">
              <div className="admin-panel-heading">
                <div>
                  <h3>{t(isRevenue ? 'admin.dashboard.trend.revenueTitle' : 'admin.dashboard.trend.bookingsTitle', { days: trendRange })}</h3>
                  <p>
                    {isRevenue
                      ? t('admin.dashboard.trend.revenueBasis', { total: formatMoney(trendTotal, language) })
                      : t('admin.dashboard.trend.bookingsBasis', { total: trendTotal.toLocaleString(locale) })}
                  </p>
                </div>
                <div className="admin-chart-controls">
                  <div aria-label={t('admin.dashboard.trend.dataLabel')} className="admin-segmented" role="group">
                    <button aria-pressed={isRevenue} onClick={() => setTrendMetric('revenue')} type="button">{t('admin.dashboard.trend.revenue')}</button>
                    <button aria-pressed={!isRevenue} onClick={() => setTrendMetric('bookings')} type="button">{t('admin.dashboard.trend.bookings')}</button>
                  </div>
                  <div aria-label={t('admin.dashboard.trend.periodLabel')} className="admin-segmented" role="group">
                    {TREND_RANGES.map((range) => (
                      <button aria-pressed={trendRange === range} key={range} onClick={() => setTrendRange(range)} type="button">
                        {t('admin.dashboard.trend.days', { days: range })}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <RequestState error={trendError} loading={trendLoading} loadingMessage={t('admin.dashboard.trend.loading')} onRetry={refresh} />
              {!trendLoading && !trendError && (
                <TrendBarChart
                  formatAxis={isRevenue ? (value) => formatCompactMoney(value, locale) : (value) => value.toLocaleString(locale)}
                  formatValue={isRevenue
                    ? (value) => formatMoney(value, language)
                    : (value) => t(value === 1 ? 'admin.dashboard.trend.bookingValueOne' : 'admin.dashboard.trend.bookingValue', { count: value })}
                  label={t(isRevenue ? 'admin.dashboard.trend.revenueChartLabel' : 'admin.dashboard.trend.bookingsChartLabel', { days: trendRange })}
                  points={trendPoints}
                />
              )}
            </article>
            <article className="admin-panel admin-status-panel">
              <div className="admin-panel-heading">
                <div>
                  <h3>{t('admin.dashboard.status.title')}</h3>
                  <p>{t('admin.dashboard.status.allDescription')}</p>
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
                <StatusDonut
                  onSelect={(status) => onNavigate('bookings', { booking_status: status })}
                  rows={statusRows}
                />
              )}
            </article>
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
            <article className="admin-panel admin-today-panel">
              <div className="admin-panel-heading">
                <div><h3>{t('admin.dashboard.today.title')}</h3><p>{t('admin.dashboard.revenue.basis')}</p></div>
              </div>
              <dl className="admin-revenue-breakdown">
                <div>
                  <dt>{t('admin.dashboard.today.paid')}</dt>
                  <dd>{formatSummaryMoney(summary.todayGrossRevenue, language)}</dd>
                </div>
                <div>
                  <dt>{t('admin.dashboard.today.refunded')}</dt>
                  <dd>{formatSummaryMoney(summary.todayRefunds, language)}</dd>
                </div>
                <div className="is-net-revenue">
                  <dt>{t('admin.dashboard.today.net')}</dt>
                  <dd>{formatSummaryMoney(summary.todayRevenue, language)}</dd>
                </div>
              </dl>
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
