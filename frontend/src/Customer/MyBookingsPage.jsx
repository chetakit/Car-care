import { useEffect, useMemo, useRef, useState } from 'react'
import { createApiClient } from '../Admin/api/client.js'
import useAuth from '../auth/useAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import LanguageToggle from '../i18n/LanguageToggle.jsx'
import CustomerHeader from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import {
  formatCustomerBookingStatus,
  formatCustomerBookingPaymentStatus,
  formatCustomerDate,
  formatCustomerMoney,
  formatCustomerPaymentMethod,
  formatCustomerTime,
  formatCustomerTimestamp,
} from './customerFormatters.js'
import './customer.css'
import './bookings.css'

const PAGE_SIZE = 10
const BOOKING_STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]

function formatOptionalMoney(value, language) {
  return value === null || value === undefined || value === ''
    ? '—'
    : formatCustomerMoney(value, language)
}

function BookingIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
      <rect height="30" rx="4" width="32" x="8" y="11" />
      <path d="M15 7v8m18-8v8M8 20h32m-23 7h7m-7 7h13" />
    </svg>
  )
}

function BookingStatus({ status, language }) {
  const normalizedStatus = String(status ?? '').toUpperCase()
  const label = formatCustomerBookingStatus(normalizedStatus, language)
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

function BookingDetails({ booking, language, t }) {
  const vehicle = booking.vehicle
  const vehicleName = [vehicle?.brand_name, vehicle?.model_name]
    .filter(Boolean)
    .join(' ')
  const services = Array.isArray(booking.services) ? booking.services : []

  return (
    <div className="bookings-details">
      <section aria-labelledby={`booking-vehicle-${booking.booking_id}`}>
        <h3 id={`booking-vehicle-${booking.booking_id}`}>{t('customer.bookings.vehicle')}</h3>
        {vehicle ? (
          <dl className="bookings-detail-grid">
            <div>
              <dt>{t('customer.bookings.vehicle')}</dt>
              <dd>{vehicleName || t('customer.bookings.vehicleModelUnavailable')}</dd>
            </div>
            <div>
              <dt>{t('customer.bookings.licensePlate')}</dt>
              <dd>{vehicle.license_plate || '—'}</dd>
            </div>
            <div>
              <dt>{t('customer.bookings.year')}</dt>
              <dd>{vehicle.production_year || '—'}</dd>
            </div>
            <div>
              <dt>{t('customer.bookings.type')}</dt>
              <dd>{vehicle.type_name || '—'}</dd>
            </div>
            <div>
              <dt>{t('customer.bookings.color')}</dt>
              <dd>{vehicle.color || '—'}</dd>
            </div>
            <div>
              <dt>{t('customer.bookings.province')}</dt>
              <dd>{vehicle.province || '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="bookings-muted">{t('customer.bookings.vehicleDetailsUnavailable')}</p>
        )}
      </section>

      <section aria-labelledby={`booking-services-${booking.booking_id}`}>
        <h3 id={`booking-services-${booking.booking_id}`}>{t('customer.bookings.bookedServices')}</h3>
        {services.length > 0 ? (
          <ul className="bookings-service-list">
            {services.map((service) => (
              <li key={service.booking_service_id}>
                <span>
                  <strong>{service.service_name || t('customer.common.service')}</strong>
                  {service.duration_minutes !== null &&
                    service.duration_minutes !== undefined && (
                      <small>{t('customer.booking.durationMinutes', { minutes: service.duration_minutes })}</small>
                    )}
                </span>
                <span>{formatOptionalMoney(service.unit_price, language)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bookings-muted">{t('customer.bookings.noServiceDetails')}</p>
        )}
      </section>

      <section aria-labelledby={`booking-payment-${booking.booking_id}`}>
        <h3 id={`booking-payment-${booking.booking_id}`}>{t('customer.bookings.payment')}</h3>
        {booking.payment ? (
          <dl className="bookings-detail-grid">
            <div>
              <dt>{t('customer.bookings.status')}</dt>
              <dd>{formatCustomerBookingPaymentStatus(booking.payment, language)}</dd>
            </div>
            <div>
              <dt>{t('customer.bookings.method')}</dt>
              <dd>{formatCustomerPaymentMethod(booking.payment.payment_method, language)}</dd>
            </div>
            <div>
              <dt>{t('customer.bookings.amount')}</dt>
              <dd>{formatOptionalMoney(booking.payment.amount, language)}</dd>
            </div>
            {booking.payment.paid_at && (
              <div>
                <dt>{t('customer.bookings.paidAt')}</dt>
                <dd>{formatCustomerTimestamp(booking.payment.paid_at, language)}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="bookings-muted">{formatCustomerBookingPaymentStatus(null, language)}</p>
        )}
      </section>

      <section aria-labelledby={`booking-total-${booking.booking_id}`}>
        <h3 id={`booking-total-${booking.booking_id}`}>{t('customer.bookings.amountSummary')}</h3>
        <dl className="bookings-detail-grid">
          <div>
            <dt>{t('customer.bookings.subtotal')}</dt>
            <dd>{formatOptionalMoney(booking.total_amount, language)}</dd>
          </div>
          <div>
            <dt>{t('customer.bookings.discount')}</dt>
            <dd>{formatOptionalMoney(booking.discount_amount, language)}</dd>
          </div>
          <div>
            <dt>{t('customer.bookings.total')}</dt>
            <dd>{formatOptionalMoney(booking.final_amount, language)}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

const CANCELLABLE_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED']

// True once the appointment's start time has passed in Thailand. Customers
// can't pay for or cancel it any more (the server enforces the cancel rule).
function appointmentStarted(booking) {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(String(booking.booking_date ?? ''))?.[0]
  const time = /^\d{2}:\d{2}/.exec(String(booking.start_time ?? ''))?.[0]
  if (!date || !time) return false
  return new Date(`${date}T${time}:00+07:00`).getTime() <= Date.now()
}

// Still ahead and still on: not started, not cancelled, not finished.
function isUpcoming(booking) {
  return !appointmentStarted(booking) &&
    !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(booking.booking_status)
}

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

function CancelBookingDialog({ booking, submitting, error, onConfirm, onClose, language, t }) {
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
        <h2 id="cancel-booking-title">
          {t('customer.bookings.cancelTitle', { bookingId: booking.booking_id })}
        </h2>
        {preview ? (
          <dl className="bookings-cancel-preview">
            <div>
              <dt>{t('customer.bookings.cancellationFee')}</dt>
              <dd>{formatOptionalMoney(preview.fee, language)}</dd>
            </div>
            <div>
              <dt>{t('customer.bookings.refundToWallet')}</dt>
              <dd><strong>{formatOptionalMoney(preview.refund, language)}</strong></dd>
            </div>
          </dl>
        ) : (
          <p>{t('customer.bookings.bookingNotPaid')}</p>
        )}
        <p className="bookings-cancel-note">
          {preview && t('customer.bookings.walletCreditNote')}
          {t('customer.bookings.cannotUndo')}
        </p>
        <label>
          <span>{t('customer.bookings.reasonOptional')}</span>
          <textarea disabled={submitting} maxLength="500" onChange={(event) => setReason(event.target.value)} rows="2" value={reason} />
        </label>
        {error && <p className="bookings-cancel-error" role="alert">{t(error)}</p>}
        <div className="bookings-cancel-actions">
          <LanguageToggle />
          <button className="bookings-detail-toggle" disabled={submitting} onClick={onClose} type="button">
            {t('customer.bookings.keepBooking')}
          </button>
          <button className="bookings-cancel-confirm" disabled={submitting} type="submit">
            {t(submitting ? 'customer.bookings.cancelling' : 'customer.bookings.cancelBooking')}
          </button>
        </div>
      </form>
    </dialog>
  )
}

function BookingCard({ booking, expanded, onToggle, onPay, onCancel, language, t }) {
  const services = Array.isArray(booking.services) ? booking.services : []
  const vehicleName = [booking.vehicle?.brand_name, booking.vehicle?.model_name]
    .filter(Boolean)
    .join(' ')
  const bookingDate = formatCustomerDate(booking.booking_date, language)
  const bookingTime = `${formatCustomerTime(booking.start_time, language)} – ${formatCustomerTime(booking.end_time, language)}`
  const detailsId = `booking-details-${booking.booking_id}`

  const started = appointmentStarted(booking)

  return (
    <article className={`bookings-card${started ? ' is-past' : ''}`}>
      <div className="bookings-card-heading">
        <div className="bookings-card-when">
          <span className="bookings-card-id">#{booking.booking_id}</span>
          <h2>{bookingDate}</h2>
          <span>{bookingTime}</span>
        </div>
        <div className="bookings-card-badges">
          <span className="visually-hidden">{t('customer.bookings.bookingStatus')}</span>
          <BookingStatus language={language} status={booking.booking_status} />
          <span className="visually-hidden">{t('customer.bookings.paymentStatus')}</span>
          <span className="bookings-payment-status">{formatCustomerBookingPaymentStatus(booking.payment, language)}</span>
        </div>
      </div>

      <div className="bookings-card-summary">
        <div>
          <span className="bookings-summary-label">{t('customer.bookings.vehicle')}</span>
          <strong>{vehicleName || t('customer.bookings.vehicleDetailsUnavailable')}</strong>
          <span>{booking.vehicle?.license_plate || '—'}</span>
        </div>
        <div className="bookings-card-services">
          <span className="bookings-summary-label">{t('customer.bookings.bookedServices')}</span>
          {services.length > 0 ? (
            <ul>
              {services.map((service) => (
                <li key={service.booking_service_id}>
                  {service.service_name || t('customer.common.service')}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('customer.bookings.noServiceDetails')}</p>
          )}
        </div>
        <div className="bookings-card-total">
          <span className="bookings-summary-label">{t('customer.bookings.total')}</span>
          <strong>
            {formatOptionalMoney(booking.final_amount ?? booking.total_amount, language)}
          </strong>
        </div>
      </div>

      <div className="bookings-card-actions">
        <button
          aria-controls={detailsId}
          aria-expanded={expanded}
          className="bookings-detail-toggle"
          onClick={() => onToggle(booking.booking_id)}
          type="button"
        >
          {t(expanded ? 'customer.bookings.hideDetails' : 'customer.bookings.viewDetails')}
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
        {!started && canPayForBooking(booking) && (
          <button
            className="bookings-pay-now"
            onClick={() => onPay(booking)}
            type="button"
          >
            {t('customer.bookings.payNow')}
            <span aria-hidden="true">→</span>
          </button>
        )}
        {!started && CANCELLABLE_STATUSES.includes(booking.booking_status) && (
          <button className="bookings-cancel-button" onClick={() => onCancel(booking)} type="button">
            {t('customer.bookings.cancelBooking')}
          </button>
        )}
      </div>

      <div hidden={!expanded} id={detailsId}>
        {expanded && (
          <BookingDetails booking={booking} language={language} t={t} />
        )}
      </div>
    </article>
  )
}

function MyBookingsPage({ user, onLogout, vehicleId }) {
  const { token, handleUnauthorized } = useAuth()
  const { language, t } = useLanguage()
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
        ? {
            key: 'customer.bookings.cancelledRefund',
            bookingId: cancelTarget.booking_id,
            refundAmount: refund.refund_amount,
          }
        : {
            key: 'customer.bookings.cancelled',
            bookingId: cancelTarget.booking_id,
          })
      setCancelTarget(null)
      setReload((current) => current + 1)
      setBookingState('loading')
    } catch {
      setCancelError('customer.bookings.cancelError')
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
          <nav aria-label={t('customer.profile.breadcrumbLabel')} className="bookings-breadcrumb">
            <a href="/customer">{t('customer.common.home')}</a>
            <span aria-hidden="true">/</span>
            {isVehicleHistory ? (
              <>
                <a href="/customer/vehicles">{t('customer.common.myVehicles')}</a>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{t('customer.bookings.breadcrumbVehicleHistory')}</span>
              </>
            ) : (
              <span aria-current="page">{t('customer.bookings.title')}</span>
            )}
          </nav>

          <header className="bookings-heading">
            <div>
              <span className="customer-eyebrow">
                {t(isVehicleHistory
                  ? 'customer.bookings.eyebrowVehicleVisits'
                  : 'customer.bookings.eyebrowVisits')}
              </span>
              <h1>{t(isVehicleHistory ? 'customer.bookings.serviceHistory' : 'customer.bookings.title')}</h1>
              <p>
                {t(isVehicleHistory
                  ? 'customer.bookings.vehicleDescription'
                  : 'customer.bookings.description')}
              </p>
            </div>
            <label className="bookings-filter">
              <span>{t('customer.bookings.filterStatus')}</span>
              <select onChange={changeStatus} value={bookingStatus}>
                <option value="">{t('customer.bookings.allStatuses')}</option>
                {BOOKING_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatCustomerBookingStatus(status, language)}
                  </option>
                ))}
              </select>
            </label>
          </header>

          {bookingState === 'loading' && (
            <div aria-live="polite" className="bookings-state">
              <span className="customer-loader" />
              {t('customer.bookings.loading')}
            </div>
          )}

          {cancelNotice && (
            <div className="bookings-cancel-notice" role="status">
              {t(cancelNotice.key, {
                bookingId: cancelNotice.bookingId,
                ...(cancelNotice.refundAmount === undefined
                  ? {}
                  : { amount: formatOptionalMoney(cancelNotice.refundAmount, language) }),
              })} <a href="/customer/wallet">{t('customer.bookings.viewWallet')}</a>
            </div>
          )}
          {cancelTarget && (
            <CancelBookingDialog
              booking={cancelTarget}
              error={cancelError}
              onClose={() => { if (!cancelling) setCancelTarget(null) }}
              onConfirm={confirmCancel}
              submitting={cancelling}
              language={language}
              t={t}
            />
          )}

          {bookingState === 'error' && (
            <div className="bookings-state bookings-error" role="alert">
              <span>{t('customer.bookings.loadError')}</span>
              <p>{t('customer.bookings.connectionError')}</p>
              <button onClick={retryLoading} type="button">{t('customer.common.retry')}</button>
            </div>
          )}

          {bookingState === 'ready' && bookings.length === 0 && (
            <section aria-labelledby="bookings-empty-title" className="bookings-empty">
              <span className="bookings-empty-icon"><BookingIcon /></span>
              <span className="customer-eyebrow">{t('customer.bookings.noBookingsEyebrow')}</span>
              <h2 id="bookings-empty-title">
                {bookingStatus
                  ? t('customer.bookings.noMatchStatus')
                  : isVehicleHistory
                    ? t('customer.bookings.noVehicleHistory')
                    : t('customer.bookings.emptyTitle')}
              </h2>
              <p>
                {bookingStatus
                  ? t('customer.bookings.tryAnotherFilter')
                  : isVehicleHistory
                    ? t('customer.bookings.vehicleHistoryEmpty')
                    : t('customer.bookings.historyEmpty')}
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
                  {t('customer.bookings.clearFilter')}
                </button>
              )}
            </section>
          )}

          {bookingState === 'ready' && bookings.length > 0 && (
            <>
              <div className="bookings-list-meta">
                <span>
                  {t(pagination?.total === 1
                    ? 'customer.bookings.countSingular'
                    : 'customer.bookings.count', { count: pagination?.total })}
                </span>
                <span>{t('customer.bookings.newestFirst')}</span>
              </div>
              {[
                { key: 'upcoming', title: t('customer.bookings.groupUpcoming'), items: bookings.filter(isUpcoming) },
                { key: 'past', title: t('customer.bookings.groupPast'), items: bookings.filter((booking) => !isUpcoming(booking)) },
              ].filter((group) => group.items.length > 0).map((group) => (
                <section aria-labelledby={`bookings-group-${group.key}`} className="bookings-group" key={group.key}>
                  <h2 className="bookings-group-title" id={`bookings-group-${group.key}`}>
                    {group.title}
                    <span>{group.items.length}</span>
                  </h2>
                  <div className="bookings-list">
                    {group.items.map((booking) => (
                      <BookingCard
                        booking={booking}
                        expanded={Number(expandedBookingId) === Number(booking.booking_id)}
                        key={booking.booking_id}
                        language={language}
                        onToggle={toggleDetails}
                        onPay={openPayment}
                        onCancel={(target) => { setCancelError(''); setCancelNotice(''); setCancelTarget(target) }}
                        t={t}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {pagination && pagination.totalPages > 1 && (
                <nav aria-label={t('customer.bookings.pagesLabel')} className="bookings-pagination">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => changePage(pagination.page - 1)}
                    type="button"
                  >
                    {t('customer.bookings.previous')}
                  </button>
                  <span>
                    {t('customer.bookings.pageOf', {
                      page: pagination.page,
                      totalPages: pagination.totalPages,
                    })}
                  </span>
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => changePage(pagination.page + 1)}
                    type="button"
                  >
                    {t('customer.bookings.next')}
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
