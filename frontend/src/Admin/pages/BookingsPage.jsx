import { useState } from 'react'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import formatMoney from '../utils/formatMoney.js'

const REFUNDS_PAGE_SIZE = 100

function formatBookingDate(value) {
  if (!value) return '—'
  const date = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return String(value)
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function formatTime(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value).replace('T', ' ').replace(/\.000Z$/, '')
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

function scheduleSummary(date, startTime, endTime) {
  const day = formatBookingDate(date)
  const start = formatTime(startTime)
  const end = formatTime(endTime)
  return [day, start && end ? `${start}–${end}` : start || end].filter(Boolean).join(' · ') || '—'
}

function vehicleSummary(row) {
  return [
    [row.brand_name, row.model_name].filter(Boolean).join(' '),
    row.license_plate,
  ].filter(Boolean).join(' · ') || '—'
}

async function findBookingRefunds(api, userId, bookingId) {
  const matches = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const params = new URLSearchParams({
      user_id: String(userId),
      page: String(page),
      limit: String(REFUNDS_PAGE_SIZE),
    })
    const response = await api(`/api/wallet/refunds?${params}`)
    const refunds = response.data?.items ?? []
    matches.push(...refunds.filter((refund) => Number(refund.booking_id) === Number(bookingId)))
    totalPages = response.data?.pagination?.totalPages ?? page
    if (matches.length) break
    page += 1
  }
  return matches
}

function BookingsPage() {
  const [filters, setFilters] = useState({
    search: '',
    booking_status: '',
    payment_status: '',
    date_from: '',
    date_to: '',
    sort: 'newest',
  })
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [history, setHistory] = useState([])
  const [refunds, setRefunds] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [refundError, setRefundError] = useState('')
  const api = useApi()
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  new URLSearchParams(query).forEach((value, key) => params.set(key, value))
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/bookings?${params}`)
  const rows = data?.items ?? []

  function applyFilters(event) {
    event.preventDefault()
    setPage(1)
    const values = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) values.set(key, value)
    })
    setQuery(values.toString())
  }

  async function openDetails(bookingId) {
    if (detailLoading) return
    setSelectedId(bookingId)
    setDetail(null)
    setHistory([])
    setRefunds([])
    setDetailError('')
    setRefundError('')
    setDetailLoading(true)

    try {
      const [bookingResponse, historyResponse] = await Promise.all([
        api(`/api/admin/bookings/${bookingId}`),
        api(`/api/admin/bookings/${bookingId}/history`),
      ])
      setDetail(bookingResponse.data)
      setHistory(Array.isArray(historyResponse.data) ? historyResponse.data : [])
      const userId = bookingResponse.data?.customer?.user_id
      if (userId) {
        try {
          setRefunds(await findBookingRefunds(api, userId, bookingId))
        } catch (requestError) {
          setRefundError(requestError.message)
        }
      }
    } catch (requestError) {
      setDetailError(requestError.message)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetails() {
    if (detailLoading) return
    setSelectedId(null)
    setDetail(null)
    setHistory([])
    setRefunds([])
  }

  function handleModalSubmit(event) {
    event.preventDefault()
    closeDetails()
  }

  const booking = detail?.booking
  const customer = detail?.customer
  const vehicle = detail?.vehicle
  const schedule = detail?.schedule
  const payment = detail?.payment
  const services = detail?.services ?? []

  return (
    <div className="admin-bookings-page">
      <PageHeading
        description="Search, filter and review bookings recorded in the system."
        eyebrow="OPERATIONS"
        title="Bookings"
        action={<button className="admin-secondary-button" disabled={loading} onClick={refresh} type="button">Refresh</button>}
      />
      <form className="admin-filter-bar admin-booking-filters" onSubmit={applyFilters}>
        <input
          aria-label="Search bookings"
          maxLength="100"
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          placeholder="Search ID, customer, email, phone or plate"
          value={filters.search}
        />
        <select
          aria-label="Booking status"
          onChange={(event) => setFilters({ ...filters, booking_status: event.target.value })}
          value={filters.booking_status}
        >
          <option value="">All booking statuses</option>
          {['CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((value) => <option key={value}>{value}</option>)}
        </select>
        <select
          aria-label="Payment status"
          onChange={(event) => setFilters({ ...filters, payment_status: event.target.value })}
          value={filters.payment_status}
        >
          <option value="">All payment statuses</option>
          {['PENDING', 'PAID', 'FAILED'].map((value) => <option key={value}>{value}</option>)}
        </select>
        <label>
          From
          <input
            aria-label="Date from"
            onChange={(event) => setFilters({ ...filters, date_from: event.target.value })}
            type="date"
            value={filters.date_from}
          />
        </label>
        <label>
          To
          <input
            aria-label="Date to"
            onChange={(event) => setFilters({ ...filters, date_to: event.target.value })}
            type="date"
            value={filters.date_to}
          />
        </label>
        <select
          aria-label="Sort bookings"
          onChange={(event) => setFilters({ ...filters, sort: event.target.value })}
          value={filters.sort}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <button className="admin-primary-button" disabled={loading} type="submit">Search</button>
      </form>

      <section className="admin-panel admin-data-panel admin-bookings-panel">
        <div className="admin-panel-heading">
          <div>
            <h3>Booking records</h3>
            <p>{data?.pagination?.total ?? 0} bookings · select a Booking ID for full details</p>
          </div>
        </div>
        <RequestState empty={!rows.length} error={error} loading={loading} onRetry={refresh} />
        {!loading && !error && rows.length > 0 && (
          <>
            <DataTable
              columns={[
                {
                  key: 'booking_id',
                  label: 'Booking ID',
                  render: (row) => (
                    <button
                      className="admin-booking-link"
                      disabled={detailLoading}
                      onClick={() => openDetails(row.booking_id)}
                      type="button"
                    >
                      #{row.booking_id}
                    </button>
                  ),
                },
                {
                  key: 'full_name',
                  label: 'Customer',
                  render: (row) => (
                    <span className="admin-booking-customer">
                      <strong>{row.full_name || '—'}</strong>
                      <small>{row.email || row.phone || ''}</small>
                    </span>
                  ),
                },
                { key: 'vehicle', label: 'Vehicle', render: vehicleSummary },
                {
                  key: 'service',
                  label: 'Service',
                  render: (row) => (
                    <button
                      className="admin-booking-detail-link"
                      disabled={detailLoading}
                      onClick={() => openDetails(row.booking_id)}
                      type="button"
                    >
                      View services
                    </button>
                  ),
                },
                {
                  key: 'schedule',
                  label: 'Schedule',
                  render: (row) => scheduleSummary(row.booking_date, row.start_time, row.end_time),
                },
                { key: 'final_amount', label: 'Amount', render: (row) => formatMoney(row.final_amount) },
                { key: 'booking_status', label: 'Booking status', render: (row) => <StatusBadge value={row.booking_status} /> },
                {
                  key: 'payment_status',
                  label: 'Payment',
                  render: (row) => row.payment_status
                    ? <StatusBadge value={row.payment_status} />
                    : <span className="admin-booking-no-payment">Not created</span>,
                },
              ]}
              rows={rows}
              rowKey={(row) => row.booking_id}
            />
            <Pagination onPageChange={setPage} pagination={data?.pagination} />
          </>
        )}
      </section>

      {selectedId !== null && (
        <AdminModal
          description={`Booking #${selectedId} details and recorded history.`}
          error={detailError}
          onClose={closeDetails}
          onSubmit={handleModalSubmit}
          open
          submitLabel="Done"
          submitting={detailLoading}
          title={`Booking #${selectedId}`}
        >
          {detailLoading ? (
            <RequestState loading />
          ) : detail && booking ? (
            <div className="admin-booking-detail">
              <section className="admin-booking-detail-section">
                <h3>Overview</h3>
                <dl className="admin-booking-detail-grid">
                  <div><dt>Booking status</dt><dd><StatusBadge value={booking.booking_status} /></dd></div>
                  <div><dt>Booking date</dt><dd>{scheduleSummary(booking.booking_date, booking.start_time, booking.end_time)}</dd></div>
                  <div><dt>Total</dt><dd>{formatMoney(booking.total_amount)}</dd></div>
                  <div><dt>Discount</dt><dd>{formatMoney(booking.discount_amount)}</dd></div>
                  <div><dt>Final amount</dt><dd>{formatMoney(booking.final_amount)}</dd></div>
                  {booking.notes && <div className="admin-booking-detail-wide"><dt>Notes</dt><dd>{booking.notes}</dd></div>}
                </dl>
              </section>

              <section className="admin-booking-detail-section">
                <h3>Customer</h3>
                <dl className="admin-booking-detail-grid">
                  <div><dt>Name</dt><dd>{customer?.full_name || '—'}</dd></div>
                  <div><dt>Email</dt><dd>{customer?.email || '—'}</dd></div>
                  <div><dt>Phone</dt><dd>{customer?.phone || '—'}</dd></div>
                </dl>
              </section>

              <section className="admin-booking-detail-section">
                <h3>Vehicle</h3>
                <dl className="admin-booking-detail-grid">
                  <div><dt>Vehicle</dt><dd>{[vehicle?.brand_name, vehicle?.model_name].filter(Boolean).join(' ') || '—'}</dd></div>
                  <div><dt>Type</dt><dd>{vehicle?.type_name || '—'}</dd></div>
                  <div><dt>License plate</dt><dd>{vehicle?.license_plate || '—'}</dd></div>
                  <div><dt>Year</dt><dd>{vehicle?.production_year || '—'}</dd></div>
                  <div><dt>Color</dt><dd>{vehicle?.color || '—'}</dd></div>
                  <div><dt>Province</dt><dd>{vehicle?.province || '—'}</dd></div>
                </dl>
              </section>

              <section className="admin-booking-detail-section">
                <h3>Schedule</h3>
                <dl className="admin-booking-detail-grid">
                  <div><dt>Date</dt><dd>{formatBookingDate(schedule?.schedule_date ?? booking.booking_date)}</dd></div>
                  <div><dt>Time</dt><dd>{[
                    schedule?.start_time ?? booking.start_time,
                    schedule?.end_time ?? booking.end_time,
                  ].map(formatTime).filter(Boolean).join('–') || '—'}</dd></div>
                  <div><dt>Schedule status</dt><dd>{schedule?.status || '—'}</dd></div>
                </dl>
              </section>

              <section className="admin-booking-detail-section">
                <h3>Services</h3>
                {services.length ? (
                  <div className="admin-booking-service-list">
                    {services.map((service) => (
                      <div className="admin-booking-service" key={service.booking_service_id}>
                        <div>
                          <strong>{service.service_name}</strong>
                          <small>{service.duration_minutes} min</small>
                        </div>
                        <span>{formatMoney(service.unit_price)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="admin-booking-detail-empty">No service details were returned.</p>}
              </section>

              <section className="admin-booking-detail-section">
                <h3>Payment</h3>
                {payment ? (
                  <dl className="admin-booking-detail-grid">
                    <div><dt>Payment ID</dt><dd>{payment.payment_id}</dd></div>
                    <div><dt>Amount</dt><dd>{formatMoney(payment.amount)}</dd></div>
                    <div><dt>Method</dt><dd>{payment.payment_method || '—'}</dd></div>
                    <div><dt>Status</dt><dd><StatusBadge value={payment.payment_status} /></dd></div>
                    <div><dt>Paid at</dt><dd>{formatDateTime(payment.paid_at)}</dd></div>
                    <div className="admin-booking-detail-wide"><dt>Transaction reference</dt><dd>{payment.transaction_ref || '—'}</dd></div>
                  </dl>
                ) : <p className="admin-booking-detail-empty">No Payment is associated with this Booking.</p>}
              </section>

              <section className="admin-booking-detail-section">
                <h3>Refunds</h3>
                {refundError ? (
                  <div className="admin-alert admin-alert-error" role="alert">{refundError}</div>
                ) : refunds.length ? (
                  <div className="admin-booking-refund-list">
                    {refunds.map((refund) => (
                      <div className="admin-booking-refund" key={refund.refund_id}>
                        <div>
                          <strong>Refund #{refund.refund_id}</strong>
                          <small>Payment #{refund.payment_id} · Fee {formatMoney(refund.cancellation_fee)}</small>
                        </div>
                        <div>
                          <strong>{formatMoney(refund.refund_amount)}</strong>
                          <small><StatusBadge value={refund.refund_status} /> · {formatDateTime(refund.processed_at)}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="admin-booking-detail-empty">No refunds recorded for this Booking.</p>
                )}
              </section>

              <section className="admin-booking-detail-section">
                <h3>Status history</h3>
                {history.length ? (
                  <ol className="admin-booking-history">
                    {history.map((item) => (
                      <li key={item.history_id}>
                        <div className="admin-booking-history-status">
                          {item.old_status ? <StatusBadge value={item.old_status} /> : <span>Created</span>}
                          {item.old_status && <span aria-hidden="true">→</span>}
                          <StatusBadge value={item.new_status} />
                        </div>
                        <p>{item.reason || 'No reason recorded'}</p>
                        <small>{formatDateTime(item.created_at)} · {item.changed_by_name || `User #${item.changed_by}`}</small>
                      </li>
                    ))}
                  </ol>
                ) : <p className="admin-booking-detail-empty">No status history was returned.</p>}
              </section>
            </div>
          ) : null}
        </AdminModal>
      )}
    </div>
  )
}

export default BookingsPage
