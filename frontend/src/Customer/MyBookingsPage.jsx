import { useEffect, useMemo, useState } from 'react'
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
  if (!booking.payment) return true
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

function BookingCard({ booking, expanded, onToggle, onPay }) {
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
      </div>

      <div hidden={!expanded} id={detailsId}>
        {expanded && (
          <BookingDetails booking={booking} />
        )}
      </div>
    </article>
  )
}

function MyBookingsPage({ user, onLogout, vehicleId }) {
  const { token, handleUnauthorized } = useAuth()
  const api = useMemo(
    () => createApiClient(token, handleUnauthorized),
    [handleUnauthorized, token],
  )
  const isVehicleHistory = vehicleId !== undefined && vehicleId !== null
  const [bookings, setBookings] = useState([])
  const [pagination, setPagination] = useState(null)
  const [bookingState, setBookingState] = useState('loading')
  const [bookingStatus, setBookingStatus] = useState('')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [expandedBookingId, setExpandedBookingId] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: 'newest',
    })
    if (bookingStatus) query.set('booking_status', bookingStatus)

    const endpoint = isVehicleHistory
      ? `/api/customer/vehicles/${encodeURIComponent(vehicleId)}/bookings`
      : '/api/customer/bookings'

    api(`${endpoint}?${query.toString()}`, {
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
  }, [api, bookingStatus, isVehicleHistory, page, reload, vehicleId])

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
            {isVehicleHistory ? (
              <>
                <a href="/customer/vehicles">My Vehicles</a>
                <span aria-hidden="true">/</span>
                <span aria-current="page">Service History</span>
              </>
            ) : (
              <span aria-current="page">My Bookings</span>
            )}
          </nav>

          <header className="bookings-heading">
            <div>
              <span className="customer-eyebrow">
                {isVehicleHistory ? 'VEHICLE VISITS' : 'YOUR VISITS'}
              </span>
              <h1>{isVehicleHistory ? 'Service History' : 'My Bookings'}</h1>
              <p>
                {isVehicleHistory
                  ? 'Review service appointments and booking details for this vehicle.'
                  : 'Review your service appointments and booking details.'}
              </p>
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
                {bookingStatus
                  ? 'No bookings match this status.'
                  : isVehicleHistory
                    ? 'No service history for this vehicle yet.'
                    : 'Your visits will appear here.'}
              </h2>
              <p>
                {bookingStatus
                  ? 'Try another status filter to see your booking history.'
                  : isVehicleHistory
                    ? 'Completed and upcoming bookings for this vehicle will appear here.'
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
