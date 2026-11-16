import { useEffect, useMemo, useRef, useState } from 'react'
import { createApiClient } from '../Admin/api/client.js'
import formatMoney from '../Admin/utils/formatMoney.js'
import useAuth from '../auth/useAuth.js'
import CustomerHeader from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import {
  formatCustomerBookingStatus,
  formatCustomerBookingPaymentStatus,
  formatCustomerDate,
  formatCustomerPaymentMethod,
  formatCustomerTime,
  formatCustomerTimestamp,
} from './customerFormatters.js'
import './customer.css'
import './bookings.css'

const PAGE_SIZE = 10
const BOOKING_STATUSES = [
  ['PENDING_PAYMENT', 'Awaiting payment'],
  ['CONFIRMED', 'Confirmed'],
  ['CHECKED_IN', 'Checked in'],
  ['IN_SERVICE', 'In service'],
  ['COMPLETED', 'Completed'],
  ['CANCELLED', 'Cancelled'],
  ['NO_SHOW', 'No show'],
]

function formatOptionalMoney(value) {
  return value === null || value === undefined || value === ''
    ? '—'
    : formatMoney(value)
}

function BookingIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
      <rect height="30" rx="4" width="32" x="8" y="11" />
      <path d="M15 7v8m18-8v8M8 20h32m-23 7h7m-7 7h13" />
    </svg>
  )
}

function BookingStatus({ status }) {
  const normalizedStatus = String(status ?? '').toUpperCase()
  const label = formatCustomerBookingStatus(normalizedStatus)
  const statusClass = normalizedStatus
    ? normalizedStatus.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    : 'unknown'

  return (
    <span className={`bookings-status bookings-status-${statusClass}`}>
      {label}
    </span>
  )
}

function canPayForBooking(booking) {
  if (['CANCELLED', 'NO_SHOW'].includes(booking.booking_status)) return false
  // The 15-minute hold has ended; the server will cancel this booking shortly.
  if (booking.booking_status === 'PENDING_PAYMENT' && booking.payment_seconds_left === 0) return false
  if (!booking.payment) return true
  if (booking.payment.payment_status === 'FAILED') {
    return booking.booking_status === 'PENDING_PAYMENT'
  }
  return (
    booking.payment.payment_status === 'PENDING' &&
    ['SIMULATED', 'WALLET'].includes(booking.payment.payment_method)
  )
}

function BookingDetails({ booking }) {
  const vehicle = booking.vehicle
  const vehicleName = [vehicle?.brand_name, vehicle?.model_name]
    .filter(Boolean)
    .join(' ')
  const services = Array.isArray(booking.services) ? booking.services : []

  return (
    <div className="bookings-details">
      <section aria-labelledby={`booking-vehicle-${booking.booking_id}`}>
        <h3 id={`booking-vehicle-${booking.booking_id}`}>Vehicle</h3>
        {vehicle ? (
          <dl className="bookings-detail-grid">
            <div>
              <dt>Vehicle</dt>
              <dd>{vehicleName || 'Vehicle model unavailable'}</dd>
            </div>
            <div>
              <dt>License plate</dt>
              <dd>{vehicle.license_plate || '—'}</dd>
            </div>
            <div>
              <dt>Year</dt>
              <dd>{vehicle.production_year || '—'}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{vehicle.type_name || '—'}</dd>
            </div>
            <div>
              <dt>Color</dt>
              <dd>{vehicle.color || '—'}</dd>
            </div>
            <div>
              <dt>Province</dt>
              <dd>{vehicle.province || '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="bookings-muted">Vehicle details are unavailable.</p>
        )}
      </section>

      <section aria-labelledby={`booking-services-${booking.booking_id}`}>
        <h3 id={`booking-services-${booking.booking_id}`}>Booked services</h3>
        {services.length > 0 ? (
          <ul className="bookings-service-list">
            {services.map((service) => (
              <li key={service.booking_service_id}>
                <span>
                  <strong>{service.service_name || 'Service'}</strong>
                  {service.duration_minutes !== null &&
                    service.duration_minutes !== undefined && (
                      <small>{service.duration_minutes} min</small>
                    )}
                </span>
                <span>{formatOptionalMoney(service.unit_price)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bookings-muted">No service details are available.</p>
        )}
      </section>

      <section aria-labelledby={`booking-payment-${booking.booking_id}`}>
        <h3 id={`booking-payment-${booking.booking_id}`}>Payment</h3>
        {booking.payment ? (
          <dl className="bookings-detail-grid">
            <div>
              <dt>Status</dt>
              <dd>{formatCustomerBookingPaymentStatus(booking.payment)}</dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{formatCustomerPaymentMethod(booking.payment.payment_method)}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{formatOptionalMoney(booking.payment.amount)}</dd>
            </div>
            {booking.payment.paid_at && (
              <div>
                <dt>Paid at</dt>
                <dd>{formatCustomerTimestamp(booking.payment.paid_at)}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="bookings-muted">{formatCustomerBookingPaymentStatus(null)}</p>
        )}
      </section>

      <section aria-labelledby={`booking-total-${booking.booking_id}`}>
        <h3 id={`booking-total-${booking.booking_id}`}>Amount summary</h3>
        <dl className="bookings-detail-grid">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatOptionalMoney(booking.total_amount)}</dd>
          </div>
          <div>
            <dt>Discount</dt>
            <dd>{formatOptionalMoney(booking.discount_amount)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatOptionalMoney(booking.final_amount)}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

const CANCELLABLE_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED']

function toCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? ''))
  return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : 0
}

// Same rule as the server: a paid booking keeps a 20% fee and refunds 80% to the Wallet.
function cancellationPreview(booking) {
  if (booking.payment?.payment_status !== 'PAID') return null
  const paidCents = toCents(booking.payment.amount ?? booking.final_amount)
  const feeCents = Math.floor((paidCents * 20 + 50) / 100)
  return { fee: feeCents / 100, refund: (paidCents - feeCents) / 100 }
}

function CancelBookingDialog({ booking, submitting, error, onConfirm, onClose }) {
  const dialogRef = useRef(null)
  const [reason, setReason] = useState('')
  const preview = cancellationPreview(booking)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  return (
    <dialog
      aria-labelledby="cancel-booking-title"
      className="bookings-cancel-dialog"
      onCancel={(event) => { event.preventDefault(); if (!submitting) onClose() }}
      ref={dialogRef}
    >
      <form onSubmit={(event) => { event.preventDefault(); onConfirm(reason.trim()) }}>
        <h2 id="cancel-booking-title">Cancel booking #{booking.booking_id}?</h2>
        {preview ? (
          <dl className="bookings-cancel-preview">
            <div><dt>Cancellation fee (20%)</dt><dd>{formatOptionalMoney(preview.fee)}</dd></div>
            <div><dt>Refund to your Wallet (80%)</dt><dd><strong>{formatOptionalMoney(preview.refund)}</strong></dd></div>
          </dl>
        ) : (
          <p>This booking has not been paid, so there is no fee.</p>
        )}
        <p className="bookings-cancel-note">
          {preview ? 'Wallet credit can be used to pay for your next booking. ' : ''}This cannot be undone.
        </p>
        <label>
          <span>Reason (optional)</span>
          <textarea disabled={submitting} maxLength="500" onChange={(event) => setReason(event.target.value)} rows="2" value={reason} />
        </label>
        {error && <p className="bookings-cancel-error" role="alert">{error}</p>}
        <div className="bookings-cancel-actions">
          <button className="bookings-detail-toggle" disabled={submitting} onClick={onClose} type="button">Keep booking</button>
          <button className="bookings-cancel-confirm" disabled={submitting} type="submit">
            {submitting ? 'Cancelling…' : 'Cancel booking'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

function BookingCard({ booking, expanded, onToggle, onPay, onCancel }) {
  const services = Array.isArray(booking.services) ? booking.services : []
  const vehicleName = [booking.vehicle?.brand_name, booking.vehicle?.model_name]
    .filter(Boolean)
    .join(' ')
  const bookingDate = formatCustomerDate(booking.booking_date)
  const bookingTime = `${formatCustomerTime(booking.start_time)} – ${formatCustomerTime(booking.end_time)}`
  const detailsId = `booking-details-${booking.booking_id}`

  return (
    <article className="bookings-card">
      <div className="bookings-card-heading">
        <div>
          <span className="bookings-card-label">BOOKING</span>
          <h2>#{booking.booking_id}</h2>
        </div>
      </div>

      <dl className="bookings-card-statuses">
        <div>
          <dt>Booking status</dt>
          <dd><BookingStatus status={booking.booking_status} /></dd>
        </div>
        <div>
          <dt>Payment status</dt>
          <dd><span className="bookings-payment-status">{formatCustomerBookingPaymentStatus(booking.payment)}</span></dd>
        </div>
      </dl>

      <div className="bookings-card-summary">
        <div>
          <span className="bookings-summary-label">Date &amp; time</span>
          <strong>{bookingDate}</strong>
          <span>{bookingTime}</span>
        </div>
        <div>
          <span className="bookings-summary-label">Vehicle</span>
          <strong>{vehicleName || 'Vehicle details unavailable'}</strong>
          <span>{booking.vehicle?.license_plate || '—'}</span>
        </div>
        <div className="bookings-card-total">
          <span className="bookings-summary-label">Total</span>
          <strong>
            {formatOptionalMoney(booking.final_amount ?? booking.total_amount)}
          </strong>
        </div>
      </div>

      <div className="bookings-card-services">
        <span className="bookings-summary-label">Booked services</span>
        {services.length > 0 ? (
          <ul>
            {services.map((service) => (
              <li key={service.booking_service_id}>
                {service.service_name || 'Service'}
              </li>
            ))}
          </ul>
        ) : (
          <p>No service details are available.</p>
        )}
      </div>

      <div className="bookings-card-actions">
        <button
          aria-controls={detailsId}
          aria-expanded={expanded}
          className="bookings-detail-toggle"
          onClick={() => onToggle(booking.booking_id)}
          type="button"
        >
          {expanded ? 'Hide details' : 'View details'}
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
        {canPayForBooking(booking) && (
          <button
            className="bookings-pay-now"
            onClick={() => onPay(booking)}
            type="button"
          >
            Pay Now
            <span aria-hidden="true">→</span>
          </button>
        )}
        {CANCELLABLE_STATUSES.includes(booking.booking_status) && (
          <button className="bookings-cancel-button" onClick={() => onCancel(booking)} type="button">
            Cancel booking
          </button>
        )}
      </div>

      <div hidden={!expanded} id={detailsId}>
        {expanded && (
          <BookingDetails booking={booking} />
        )}
      </div>
    </article>
  )
}

function MyBookingsPage({ user, onLogout }) {
  const { token, handleUnauthorized } = useAuth()
  const api = useMemo(
    () => createApiClient(token, handleUnauthorized),
    [handleUnauthorized, token],
  )
  const [bookings, setBookings] = useState([])
  const [pagination, setPagination] = useState(null)
  const [bookingState, setBookingState] = useState('loading')
  const [bookingStatus, setBookingStatus] = useState('')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [expandedBookingId, setExpandedBookingId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancelNotice, setCancelNotice] = useState('')

  async function confirmCancel(reason) {
    if (!cancelTarget || cancelling) return
    setCancelling(true)
    setCancelError('')
    try {
      const response = await api(`/api/cancellations/${cancelTarget.booking_id}`, {
        method: 'POST',
        body: reason ? { reason } : {},
      })
      const refund = response.data?.refund
      setCancelNotice(refund
        ? `Booking #${cancelTarget.booking_id} was cancelled. ${formatOptionalMoney(refund.refund_amount)} was added to your Wallet.`
        : `Booking #${cancelTarget.booking_id} was cancelled.`)
      setCancelTarget(null)
      setReload((current) => current + 1)
      setBookingState('loading')
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'The booking could not be cancelled.')
    } finally {
      setCancelling(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: 'newest',
    })
    if (bookingStatus) query.set('booking_status', bookingStatus)

    api(`/api/customer/bookings?${query.toString()}`, {
      signal: controller.signal,
    })
      .then((response) => {
        const data = response.data
        const metadata = data?.pagination
        const currentPage = Number(metadata?.page)
        const total = Number(metadata?.total)
        const totalPages = Number(metadata?.totalPages)
        if (
          !Array.isArray(data?.items) ||
          !metadata ||
          !Number.isInteger(currentPage) ||
          currentPage < 1 ||
          !Number.isInteger(total) ||
          total < 0 ||
          !Number.isInteger(totalPages) ||
          totalPages < 0
        ) {
          throw new Error('The bookings response is incomplete.')
        }
        setBookings(data.items)
        setPagination({
          page: currentPage,
          total,
          totalPages,
        })
        setBookingState('ready')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setBookingState('error')
      })

    return () => controller.abort()
  }, [api, bookingStatus, page, reload])

  function changeStatus(event) {
    setBookingStatus(event.target.value)
    setPage(1)
    setExpandedBookingId(null)
    setBookingState('loading')
  }

  function changePage(nextPage) {
    setPage(nextPage)
    setExpandedBookingId(null)
    setBookingState('loading')
  }

  function retryLoading() {
    setBookingState('loading')
    setReload((current) => current + 1)
  }

  function toggleDetails(bookingId) {
    setExpandedBookingId((current) =>
      Number(current) === Number(bookingId) ? null : bookingId,
    )
  }

  function openPayment(booking) {
    window.history.pushState(
      { customerBooking: booking },
      '',
      `/customer/payment/${booking.booking_id}`,
    )
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <div className="customer-home customer-bookings">
      <CustomerHeader onLogout={onLogout} user={user} />
      <main className="bookings-main">
        <div className="customer-container">
          <nav aria-label="Breadcrumb" className="bookings-breadcrumb">
            <a href="/customer">Home</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">My Bookings</span>
          </nav>

          <header className="bookings-heading">
            <div>
              <span className="customer-eyebrow">YOUR VISITS</span>
              <h1>My Bookings</h1>
              <p>Review your service appointments and booking details.</p>
            </div>
            <label className="bookings-filter">
              <span>Filter by status</span>
              <select onChange={changeStatus} value={bookingStatus}>
                <option value="">All statuses</option>
                {BOOKING_STATUSES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </header>

          {bookingState === 'loading' && (
            <div aria-live="polite" className="bookings-state">
              <span className="customer-loader" />
              Loading your bookings…
            </div>
          )}

          {cancelNotice && (
            <div className="bookings-cancel-notice" role="status">
              {cancelNotice} <a href="/customer/wallet">View Wallet</a>
            </div>
          )}
          {cancelTarget && (
            <CancelBookingDialog
              booking={cancelTarget}
              error={cancelError}
              onClose={() => { if (!cancelling) setCancelTarget(null) }}
              onConfirm={confirmCancel}
              submitting={cancelling}
            />
          )}

          {bookingState === 'error' && (
            <div className="bookings-state bookings-error" role="alert">
              <span>We couldn’t load your bookings.</span>
              <p>Check your connection and try again.</p>
              <button onClick={retryLoading} type="button">Try again</button>
            </div>
          )}

          {bookingState === 'ready' && bookings.length === 0 && (
            <section aria-labelledby="bookings-empty-title" className="bookings-empty">
              <span className="bookings-empty-icon"><BookingIcon /></span>
              <span className="customer-eyebrow">NO BOOKINGS YET</span>
              <h2 id="bookings-empty-title">
                {bookingStatus ? 'No bookings match this status.' : 'Your visits will appear here.'}
              </h2>
              <p>
                {bookingStatus
                  ? 'Try another status filter to see your booking history.'
                  : 'When you have a service booking, you can review its details here.'}
              </p>
              {bookingStatus && (
                <button
                  className="bookings-clear-filter"
                  onClick={() => {
                    setBookingStatus('')
                    setPage(1)
                    setBookingState('loading')
                  }}
                  type="button"
                >
                  Clear status filter
                </button>
              )}
            </section>
          )}

          {bookingState === 'ready' && bookings.length > 0 && (
            <>
              <div className="bookings-list-meta">
                <span>
                  {pagination?.total} {pagination?.total === 1 ? 'booking' : 'bookings'}
                </span>
                <span>Newest first</span>
              </div>
              <div className="bookings-list">
                {bookings.map((booking) => (
                  <BookingCard
                    booking={booking}
                    expanded={Number(expandedBookingId) === Number(booking.booking_id)}
                    key={booking.booking_id}
                    onToggle={toggleDetails}
                    onPay={openPayment}
                    onCancel={(target) => { setCancelError(''); setCancelNotice(''); setCancelTarget(target) }}
                  />
                ))}
              </div>
              {pagination && pagination.totalPages > 1 && (
                <nav aria-label="Bookings pages" className="bookings-pagination">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => changePage(pagination.page - 1)}
                    type="button"
                  >
                    Previous
                  </button>
                  <span>
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => changePage(pagination.page + 1)}
                    type="button"
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </div>
      </main>

      <CustomerFooter />
    </div>
  )
}

export default MyBookingsPage
