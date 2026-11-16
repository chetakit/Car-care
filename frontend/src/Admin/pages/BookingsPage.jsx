import { useCallback, useEffect, useRef, useState } from 'react'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, PaymentStatusBadge, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDate, formatDateTime } from '../utils/formatDate.js'
import formatStatusLabel from '../utils/formatStatusLabel.js'
import formatMoney from '../utils/formatMoney.js'

const REFUNDS_PAGE_SIZE = 100
const MAX_BOOKING_ID = 2147483647
const BOOKING_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW']

function isValidBookingId(value) {
  const id = String(value ?? '')
  return /^[1-9]\d*$/.test(id) && Number(id) <= MAX_BOOKING_ID
}

function getInitialBookingStatus() {
  const status = new URLSearchParams(window.location.search).get('booking_status')
  return BOOKING_STATUSES.includes(status) ? status : ''
}

function formatTime(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

function scheduleSummary(date, startTime, endTime) {
  const day = formatDate(date)
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

const CANCELLABLE_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED']

function toCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? ''))
  return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : 0
}

// Same rounding as backend calculateRefund(): fee 20% (rounded), refund the rest.
function cancellationPreview(payment) {
  if (payment?.payment_status !== 'PAID') return null
  const paidCents = toCents(payment.amount)
  const feeCents = Math.floor((paidCents * 20 + 50) / 100)
  return {
    paid: (paidCents / 100).toFixed(2),
    fee: (feeCents / 100).toFixed(2),
    refund: ((paidCents - feeCents) / 100).toFixed(2),
  }
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

function BookingsPage({ onNavigate }) {
  const requestedBookingId = new URLSearchParams(window.location.search).get('booking_id') ?? ''
  const [filters, setFilters] = useState({
    search: '',
    booking_status: getInitialBookingStatus(),
    payment_status: '',
    date_from: '',
    date_to: '',
    sort: 'newest',
  })
  const [filterError, setFilterError] = useState('')
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState(() => {
    const bookingStatus = getInitialBookingStatus()
    return bookingStatus ? new URLSearchParams({ booking_status: bookingStatus }).toString() : ''
  })
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [history, setHistory] = useState([])
  const [refunds, setRefunds] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [refundError, setRefundError] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [cancelConfirming, setCancelConfirming] = useState(false)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancelMessage, setCancelMessage] = useState('')
  const api = useApi()
  const autoOpenAttempted = useRef(false)
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  new URLSearchParams(query).forEach((value, key) => params.set(key, value))
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/bookings?${params}`)
  const rows = data?.items ?? []

  function applyFilters(event) {
    event.preventDefault()
    if (filters.date_from && filters.date_to && filters.date_to < filters.date_from) {
      setFilterError('The “To” date must be the same as or later than the “From” date.')
      return
    }
    setFilterError('')
    setPage(1)
    const values = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) values.set(key, value)
    })
    setQuery(values.toString())
  }

  const openDetails = useCallback(async (bookingId, { keepMessage = false } = {}) => {
    if (detailLoading) return
    setCancelReason('')
    setCancelConfirming(false)
    setCancelError('')
    if (!keepMessage) setCancelMessage('')
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
  }, [api, detailLoading])

  useEffect(() => {
    if (!isValidBookingId(requestedBookingId) || autoOpenAttempted.current) return
    autoOpenAttempted.current = true
    void openDetails(requestedBookingId)
  }, [openDetails, requestedBookingId])

  async function cancelBooking() {
    if (cancelSubmitting || selectedId === null) return
    setCancelSubmitting(true)
    setCancelError('')
    try {
      const response = await api(`/api/cancellations/${selectedId}`, {
        method: 'POST',
        body: cancelReason.trim() ? { reason: cancelReason.trim() } : {},
      })
      const refund = response.data?.refund
      setCancelMessage(refund
        ? `Booking cancelled. Fee ${formatMoney(refund.cancellation_fee)} kept; ${formatMoney(refund.refund_amount)} credited to the customer's Wallet.`
        : 'Booking cancelled. Nothing was paid, so no fee or refund applies.')
      refresh()
      await openDetails(selectedId, { keepMessage: true })
    } catch (requestError) {
      setCancelError(requestError.message)
    } finally {
      setCancelSubmitting(false)
    }
  }

  function closeDetails() {
    if (cancelSubmitting) return
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
  const canCancel = Boolean(booking && CANCELLABLE_STATUSES.includes(booking.booking_status))
  const preview = cancellationPreview(payment)

  return (
    <div className="admin-bookings-page">
      <PageHeading
        description="Search, filter and review bookings recorded in the system."
        eyebrow="OPERATIONS"
        title="Bookings"
        action={<button className="admin-secondary-button admin-refresh-button" disabled={loading} onClick={refresh} type="button">Refresh</button>}
      />
      <form className="admin-filter-bar admin-booking-filters" onSubmit={applyFilters}>
        <input
          aria-label="Search bookings"
          maxLength="100"
          onChange={(event) => { setFilters({ ...filters, search: event.target.value }); setFilterError('') }}
          placeholder="Search ID, customer, email, phone or plate"
          value={filters.search}
        />
        <select
          aria-label="Booking status"
          onChange={(event) => { setFilters({ ...filters, booking_status: event.target.value }); setFilterError('') }}
          value={filters.booking_status}
        >
          <option value="">All booking statuses</option>
          {BOOKING_STATUSES.map((value) => <option key={value} value={value}>{formatStatusLabel(value)}</option>)}
        </select>
        <select
          aria-label="Payment status"
          onChange={(event) => { setFilters({ ...filters, payment_status: event.target.value }); setFilterError('') }}
          value={filters.payment_status}
        >
          <option value="">All payment statuses</option>
          {['PENDING', 'PAID', 'FAILED'].map((value) => <option key={value}>{value}</option>)}
        </select>
        <label>
          From
          <input
            aria-label="Date from"
            onChange={(event) => { setFilters({ ...filters, date_from: event.target.value }); setFilterError('') }}
            type="date"
            value={filters.date_from}
          />
        </label>
        <label>
          To
          <input
            aria-label="Date to"
            onChange={(event) => { setFilters({ ...filters, date_to: event.target.value }); setFilterError('') }}
            type="date"
            value={filters.date_to}
          />
        </label>
        <select
          aria-label="Sort bookings"
          onChange={(event) => { setFilters({ ...filters, sort: event.target.value }); setFilterError('') }}
          value={filters.sort}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <button className="admin-primary-button" disabled={loading} type="submit">Search</button>
      </form>
      {filterError && <div className="admin-alert admin-alert-error" role="alert">{filterError}</div>}

      <section className="admin-panel admin-data-panel admin-bookings-panel">
        <div className="admin-panel-heading">
          <div>
            <h3>Booking records</h3>
            <p>{data?.pagination?.total ?? 0} bookings · select a Booking ID for full details</p>
          </div>
        </div>
        <RequestState
          empty={!rows.length}
          emptyDescription="Clear or broaden the search and date filters, then search again."
          emptyTitle="No bookings match these filters"
          error={error}
          loading={loading}
          loadingMessage="Loading booking records…"
          onRetry={refresh}
        />
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
                { key: 'vehicle', label: 'Vehicle', render: vehicleSummary, wrap: true },
                {
                  key: 'schedule',
                  label: 'Schedule',
                  render: (row) => (
                    <span className="admin-booking-schedule">
                      <span>{formatDate(row.booking_date)}</span>
                      <small>{[formatTime(row.start_time), formatTime(row.end_time)].filter(Boolean).join('–')}</small>
                    </span>
                  ),
                },
                { key: 'final_amount', label: 'Amount', render: (row) => formatMoney(row.final_amount) },
                { key: 'booking_status', label: 'Booking status', render: (row) => <StatusBadge value={row.booking_status} /> },
                {
                  key: 'payment_status',
                  label: 'Payment',
                  render: (row) => (
                    <div className="admin-row-actions">
                      {row.payment_status
                        ? <PaymentStatusBadge payment={row} />
                        : <span className="admin-booking-no-payment">Not created</span>}
                      {isValidBookingId(row.booking_id) ? (
                        <button
                          className="admin-inline-button"
                          onClick={() => onNavigate('payments', { booking_id: String(row.booking_id) })}
                          type="button"
                        >
                          View Payment
                        </button>
                      ) : (
                        <span className="admin-booking-no-payment">Unavailable</span>
                      )}
                    </div>
                  ),
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
          submitLabel="Close"
          submitting={cancelSubmitting}
          title={`Booking #${selectedId}`}
          viewOnly
        >
          {detailLoading ? (
            <RequestState loading />
          ) : detail && booking ? (
            <div className="admin-booking-detail">
              {cancelMessage && <div className="admin-alert admin-alert-success" role="status">{cancelMessage}</div>}
              <section className="admin-booking-detail-section">
                <h3>Overview</h3>
                <dl className="admin-booking-detail-grid">
                  <div><dt>Booking status</dt><dd><StatusBadge value={booking.booking_status} /></dd></div>
                  <div><dt>Payment status</dt><dd>{payment?.payment_status
                    ? <PaymentStatusBadge payment={payment} />
                    : <span className="admin-booking-no-payment">Not created</span>}</dd></div>
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
                  <div><dt>Date</dt><dd>{formatDate(schedule?.schedule_date ?? booking.booking_date)}</dd></div>
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
                    <div><dt>Status</dt><dd><PaymentStatusBadge payment={payment} /></dd></div>
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

              {canCancel && (
                <section className="admin-booking-detail-section admin-booking-cancel">
                  <h3>Cancel booking</h3>
                  {preview ? (
                    <dl className="admin-booking-detail-grid">
                      <div><dt>Paid</dt><dd>{formatMoney(preview.paid)}</dd></div>
                      <div><dt>Cancellation fee (20%)</dt><dd>{formatMoney(preview.fee)}</dd></div>
                      <div><dt>Refund to Wallet (80%)</dt><dd><strong>{formatMoney(preview.refund)}</strong></dd></div>
                    </dl>
                  ) : (
                    <p className="admin-booking-detail-empty">This booking is not paid, so it is cancelled with no fee and no refund.</p>
                  )}
                  <label className="admin-booking-cancel-reason">
                    <span>Reason (optional)</span>
                    <textarea
                      disabled={cancelSubmitting}
                      maxLength="5000"
                      onChange={(event) => setCancelReason(event.target.value)}
                      rows="2"
                      value={cancelReason}
                    />
                  </label>
                  {cancelError && <div className="admin-alert admin-alert-error" role="alert">{cancelError}</div>}
                  <div className="admin-row-actions">
                    {cancelConfirming ? (
                      <>
                        <button className="admin-primary-button" disabled={cancelSubmitting} onClick={cancelBooking} type="button">
                          {cancelSubmitting ? 'Cancelling…' : 'Confirm cancellation'}
                        </button>
                        <button className="admin-secondary-button" disabled={cancelSubmitting} onClick={() => setCancelConfirming(false)} type="button">
                          Keep booking
                        </button>
                      </>
                    ) : (
                      <button className="admin-secondary-button" onClick={() => setCancelConfirming(true)} type="button">
                        Cancel this booking
                      </button>
                    )}
                  </div>
                </section>
              )}

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
