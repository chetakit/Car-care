import { useState } from 'react'
import { DataTable, PageHeading, RequestState } from '../components/AdminPageState.jsx'
import useRemoteData from '../hooks/useRemoteData.js'
import formatMoney from '../utils/formatMoney.js'

function ReportsPage() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [groupBy, setGroupBy] = useState('day')
  const [applied, setApplied] = useState('')
  const [reportType, setReportType] = useState('bookings')
  const params = new URLSearchParams({ group_by: groupBy })
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  const { data, loading, error, refresh } = useRemoteData(applied ? `/api/admin/reports/${reportType}?${applied}` : `/api/admin/reports/${reportType}?group_by=${groupBy}`)

  function applyFilters(event) {
    event.preventDefault()
    setApplied(params.toString())
  }

  return (
    <div>
      <PageHeading description="Booking and revenue reports from existing Admin report endpoints." eyebrow="ANALYTICS" title="Reports" action={<button className="admin-secondary-button" onClick={refresh} type="button">Refresh</button>} />
      <div className="admin-tabs" role="tablist">
        {['bookings', 'revenue'].map((type) => <button aria-selected={reportType === type} className={reportType === type ? 'is-selected' : ''} key={type} onClick={() => { setReportType(type); setApplied('') }} role="tab" type="button">{type === 'bookings' ? 'Bookings' : 'Revenue'}</button>)}
      </div>
      <form className="admin-filter-bar" onSubmit={applyFilters}>
        <label>From<input onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} /></label>
        <label>To<input onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} /></label>
        <label>Group by<select onChange={(event) => setGroupBy(event.target.value)} value={groupBy}><option value="day">Day</option><option value="month">Month</option></select></label>
        <button className="admin-primary-button" type="submit">Apply</button>
      </form>
      <section className="admin-panel admin-data-panel">
        <RequestState error={error} loading={loading} onRetry={refresh} />
        {!loading && !error && reportType === 'bookings' && (
          <>
            <div className="admin-report-total"><span>Total bookings</span><strong>{data?.totalBookings ?? 0}</strong></div>
            <DataTable columns={[
              { key: 'booking_status', label: 'Status' },
              { key: 'count', label: 'Bookings' },
            ]} rows={data?.bookingCountsByStatus ?? []} />
            <h3 className="admin-subheading">Bookings by {groupBy}</h3>
            <DataTable columns={[
              { key: 'period', label: 'Period' },
              { key: 'count', label: 'Bookings' },
            ]} rows={data?.bookingCountsByPeriod ?? []} />
          </>
        )}
        {!loading && !error && reportType === 'revenue' && (
          <>
            <div className="admin-report-total"><span>Total revenue</span><strong>{formatMoney(data?.totalRevenue)}</strong><span>{data?.successfulPayments ?? 0} successful payments</span></div>
            <DataTable columns={[
              { key: 'period', label: 'Period' },
              { key: 'revenue', label: 'Revenue', render: (row) => formatMoney(row.revenue) },
              { key: 'successfulPayments', label: 'Successful payments' },
            ]} rows={data?.revenueByPeriod ?? []} />
          </>
        )}
      </section>
    </div>
  )
}

export default ReportsPage
