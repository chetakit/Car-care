import { useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
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
  { id: '7d', label: 'admin.reports.range.last7Days', range: () => ({ dateFrom: daysAgo(6), dateTo: toKey(new Date()), groupBy: 'day' }) },
  { id: '30d', label: 'admin.reports.range.last30Days', range: () => ({ dateFrom: daysAgo(29), dateTo: toKey(new Date()), groupBy: 'day' }) },
  {
    id: 'month',
    label: 'admin.reports.range.thisMonth',
    range: () => {
      const now = new Date()
      return { dateFrom: toKey(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: toKey(now), groupBy: 'day' }
    },
  },
  { id: 'all', label: 'admin.reports.range.allTime', range: () => ({ dateFrom: '', dateTo: '', groupBy: 'month' }) },
  { id: 'custom', label: 'admin.reports.range.custom' },
]

// Bookings move through these statuses in this order.
const STATUS_ORDER = ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW']

function formatPeriod(period, groupBy, language) {
  if (!period) return '—'
  if (groupBy === 'month') {
    const [year, month] = String(period).split('-').map(Number)
    return new Intl.DateTimeFormat(language === 'TH' ? 'th-TH' : 'en-GB', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(year, month - 1, 1))
  }
  return formatDate(period, language)
}

function rangeSummary({ dateFrom, dateTo }, language, t) {
  if (!dateFrom && !dateTo) return t('admin.reports.range.allTime')
  return `${dateFrom ? formatDate(dateFrom, language) : t('admin.reports.range.start')} – ${dateTo ? formatDate(dateTo, language) : t('admin.reports.range.today')}`
}

function ReportsPage() {
  const { language, t } = useLanguage()
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
      setFilterError({ key: 'admin.reports.validation.dateRange' })
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
        action={<button className="admin-secondary-button admin-refresh-button" disabled={loading} onClick={refresh} type="button">{t('admin.reports.refresh')}</button>}
        description={t('admin.reports.description')}
        eyebrow={t('admin.reports.eyebrow')}
        title={t('admin.reports.title')}
      />

      <div aria-label={t('admin.reports.range.ariaLabel')} className="admin-report-ranges" role="group">
        {RANGES.map((range) => (
          <button aria-pressed={rangeId === range.id} className={rangeId === range.id ? 'is-selected' : ''} key={range.id} onClick={() => chooseRange(range)} type="button">
            {t(range.label)}
          </button>
        ))}
      </div>
      {rangeId === 'custom' && (
        <form className="admin-filter-bar" onSubmit={applyCustom}>
          <label>{t('admin.reports.custom.from')}<input onChange={(event) => { setCustom({ ...custom, dateFrom: event.target.value }); setFilterError('') }} type="date" value={custom.dateFrom} /></label>
          <label>{t('admin.reports.custom.to')}<input onChange={(event) => { setCustom({ ...custom, dateTo: event.target.value }); setFilterError('') }} type="date" value={custom.dateTo} /></label>
          <label>{t('admin.reports.custom.groupBy')}<select onChange={(event) => setCustom({ ...custom, groupBy: event.target.value })} value={custom.groupBy}><option value="day">{t('admin.reports.custom.perDay')}</option><option value="month">{t('admin.reports.custom.perMonth')}</option></select></label>
          <button className="admin-primary-button" type="submit">{t('admin.reports.custom.submit')}</button>
        </form>
      )}
      {filterError && <div className="admin-alert admin-alert-error" role="alert">{t(filterError.key)}</div>}
      <p aria-live="polite" className="admin-report-range-label">{rangeSummary(applied, language, t)}</p>

      <RequestState error={error} loading={loading} loadingMessage={t('admin.reports.loading')} onRetry={refresh} />
      {!loading && !error && (
        <>
          <section aria-label={t('admin.reports.summary.ariaLabel')} className="admin-report-stats">
            <article>
              <span>{t('admin.reports.summary.bookings')}</span>
              <strong>{totalBookings}</strong>
              <small>{t('admin.reports.summary.bookingDateBasis')}</small>
            </article>
            <article>
              <span>{t('admin.reports.summary.completed')}</span>
              <strong>{completed}</strong>
              <small>{t('admin.reports.summary.percentOfBookings', { percent: percent(completed) })}</small>
            </article>
            <article>
              <span>{t('admin.reports.summary.cancelledOrNoShow')}</span>
              <strong>{lost}</strong>
              <small>{t('admin.reports.summary.percentOfBookings', { percent: percent(lost) })}</small>
            </article>
            <article>
              <span>{t('admin.reports.summary.revenue')}</span>
              <strong>{formatMoney(revenue.data?.totalRevenue, language)}</strong>
              <small>{t('admin.reports.summary.paidBookings', { count: revenue.data?.successfulPayments ?? 0 })}</small>
            </article>
          </section>

          <section className="admin-panel admin-report-panel">
            <div className="admin-panel-heading">
              <div><h3>{t('admin.reports.status.title')}</h3><p>{t('admin.reports.status.description')}</p></div>
            </div>
            {totalBookings === 0 ? (
              <RequestState empty emptyDescription={t('admin.reports.empty.tryLongerPeriod')} emptyTitle={t('admin.reports.status.emptyTitle')} />
            ) : (
              <ul className="admin-status-bars">
                {statusRows.map((row) => (
                  <li className={row.count ? '' : 'is-empty'} key={row.status} title={t('admin.reports.status.tooltip', { count: row.count, percent: percent(row.count) })}>
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
                <h3>{t(applied.groupBy === 'month' ? 'admin.reports.period.monthByMonth' : 'admin.reports.period.dayByDay')}</h3>
                <p>{t('admin.reports.period.description')}</p>
              </div>
            </div>
            {periodRows.length ? (
              <>
                <DataTable
                  columns={[
                    { key: 'period', label: t(applied.groupBy === 'month' ? 'admin.reports.table.month' : 'admin.reports.table.date'), render: (row) => formatPeriod(row.period, applied.groupBy, language) },
                    { key: 'bookings', label: t('admin.reports.table.bookings') },
                    { key: 'revenue', label: t('admin.reports.table.revenue'), render: (row) => formatMoney(row.revenue, language) },
                    { key: 'payments', label: t('admin.reports.table.paidBookings') },
                  ]}
                  rowKey={(row) => row.period}
                  rows={pagedPeriods.pageRows}
                />
                <Pagination onPageChange={pagedPeriods.setPage} pagination={pagedPeriods.pagination} />
              </>
            ) : (
              <RequestState empty emptyDescription={t('admin.reports.empty.tryLongerPeriod')} emptyTitle={t('admin.reports.period.emptyTitle')} />
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default ReportsPage
