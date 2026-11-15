import { useState } from 'react'
import { DataTable, PageHeading, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDate } from '../utils/formatDate.js'
import formatMoney from '../utils/formatMoney.js'

const initialFilters = { dateFrom: '', dateTo: '', groupBy: 'day' }

function ReportsPage() {
  const [filters, setFilters] = useState(initialFilters)
  const [appliedFilters, setAppliedFilters] = useState(initialFilters)
  const [filterError, setFilterError] = useState('')
  const [reportType, setReportType] = useState('bookings')
  const params = new URLSearchParams({ group_by: appliedFilters.groupBy })
  if (appliedFilters.dateFrom) params.set('date_from', appliedFilters.dateFrom)
  if (appliedFilters.dateTo) params.set('date_to', appliedFilters.dateTo)
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/reports/${reportType}?${params}`)
  const hasPendingFilters = Object.keys(filters).some((key) => filters[key] !== appliedFilters[key])

  function applyFilters(event) {
    event.preventDefault()
    if (filters.dateFrom && filters.dateTo && filters.dateTo < filters.dateFrom) {
      setFilterError('The end date must be the same as or later than the start date.')
      return
    }
    setFilterError('')
    setAppliedFilters(filters)
  }

  function changeReportType(nextType) {
    setReportType(nextType)
    setFilters(appliedFilters)
    setFilterError('')
  }

  return (
    <div>
      <PageHeading description="Booking and revenue reports from existing Admin report endpoints." eyebrow="ANALYTICS" title="Reports" action={<button className="admin-secondary-button admin-refresh-button" onClick={refresh} type="button">Refresh</button>} />
      <div aria-label="Report type" className="admin-tabs">
        {['bookings', 'revenue'].map((type) => <button aria-pressed={reportType === type} className={reportType === type ? 'is-selected' : ''} key={type} onClick={() => changeReportType(type)} type="button">{type === 'bookings' ? 'Bookings' : 'Revenue'}</button>)}
      </div>
      <form className="admin-filter-bar" onSubmit={applyFilters}>
        <label>From<input onChange={(event) => { setFilters({ ...filters, dateFrom: event.target.value }); setFilterError('') }} type="date" value={filters.dateFrom} /></label>
        <label>To<input onChange={(event) => { setFilters({ ...filters, dateTo: event.target.value }); setFilterError('') }} type="date" value={filters.dateTo} /></label>
        <label>Group by<select onChange={(event) => setFilters({ ...filters, groupBy: event.target.value })} value={filters.groupBy}><option value="day">Day</option><option value="month">Month</option></select></label>
        <button className="admin-primary-button" type="submit">Update report</button>
      </form>
      {filterError && <div className="admin-alert admin-alert-error" role="alert">{filterError}</div>}
      <p className="admin-report-filter-summary" aria-live="polite">
        Current report: {appliedFilters.dateFrom ? `from ${formatDate(appliedFilters.dateFrom)}` : 'all start dates'} · {appliedFilters.dateTo ? `through ${formatDate(appliedFilters.dateTo)}` : 'no end date'} · grouped by {appliedFilters.groupBy}.
        {hasPendingFilters && ' Filter edits are pending; update the report to apply them.'}
      </p>
      <section className="admin-panel admin-data-panel">
        <RequestState error={error} loading={loading} onRetry={refresh} />
        {!loading && !error && reportType === 'bookings' && (
          <>
            <div className="admin-report-total"><span>Total bookings</span><strong>{data?.totalBookings ?? 0}</strong></div>
            {Number(data?.totalBookings ?? 0) === 0 ? (
              <RequestState empty emptyDescription="No booking records were returned for the current report filters." emptyTitle="No bookings in this range" />
            ) : (
              <>
                {(data?.bookingCountsByStatus ?? []).length ? (
                  <DataTable columns={[
                    { key: 'booking_status', label: 'Status', render: (row) => <StatusBadge value={row.booking_status} /> },
                    { key: 'count', label: 'Bookings' },
                  ]} rows={data.bookingCountsByStatus} />
                ) : <RequestState empty emptyDescription="The report returned no status breakdown for these bookings." emptyTitle="No status breakdown" />}
                <h3 className="admin-subheading">Bookings by {appliedFilters.groupBy}</h3>
                {(data?.bookingCountsByPeriod ?? []).length ? (
                  <DataTable columns={[
                    { key: 'period', label: 'Period', render: (row) => appliedFilters.groupBy === 'day' ? formatDate(row.period) : row.period },
                    { key: 'count', label: 'Bookings' },
                  ]} rows={data.bookingCountsByPeriod} />
                ) : <RequestState empty emptyDescription="No bookings were returned for the selected date grouping." emptyTitle="No period data" />}
              </>
            )}
          </>
        )}
        {!loading && !error && reportType === 'revenue' && (
          <>
            <div className="admin-report-total"><span>Total revenue</span><strong>{formatMoney(data?.totalRevenue)}</strong><span>{data?.successfulPayments ?? 0} successful payments</span></div>
            {(data?.revenueByPeriod ?? []).length ? (
              <DataTable columns={[
                { key: 'period', label: 'Period', render: (row) => appliedFilters.groupBy === 'day' ? formatDate(row.period) : row.period },
                { key: 'revenue', label: 'Revenue', render: (row) => formatMoney(row.revenue) },
                { key: 'successfulPayments', label: 'Successful payments' },
              ]} rows={data.revenueByPeriod} />
            ) : <RequestState empty emptyDescription="No successful payment totals were returned for the current filters." emptyTitle="No revenue in this range" />}
          </>
        )}
      </section>
    </div>
  )
}

export default ReportsPage
