import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, createApiClient } from '../Admin/api/client.js'
import formatMoney from '../Admin/utils/formatMoney.js'
import useAuth from '../auth/useAuth.js'
import CustomerHeader from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import {
  formatCustomerBookingStatus,
  formatCustomerDate,
  formatCustomerPaymentStatus,
  formatCustomerTime,
} from './customerFormatters.js'
import './customer.css'
import './customer-payment.css'

function isBookingId(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0
}

function cents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? '').trim())
  if (!match) return null
  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] || '').padEnd(2, '0'))
  return whole * 100n + fraction
}

function getErrorMessage(error) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

async function findBookingInHistory(api, bookingId, signal) {
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const query = new URLSearchParams({
      page: String(page),
      limit: '100',
      sort: 'newest',
    })
    const response = await api(`/api/customer/bookings?${query.toString()}`, { signal })
    const data = response.data
    const pageCount = Number(data?.pagination?.totalPages)
    if (!Array.isArray(data?.items) || !Number.isInteger(pageCount) || pageCount < 0) {
      throw new Error('The bookings response is incomplete.')
    }

    const booking = data.items.find(
      (item) => String(item.booking_id) === String(bookingId),
    )
    if (booking) return booking

    totalPages = pageCount
    page += 1
  }

  return null
}

function PaymentStatus({ payment }) {
  const status = String(payment?.payment_status || 'NOT PAID').toUpperCase()
  const statusClass = status.toLowerCase().replace(/ /g, '-')
  const statusLabel = formatCustomerPaymentStatus(status)
  const demoStatus = statusLabel.replace(/^Payment /, '')
  const label = payment?.payment_method === 'SIMULATED'
    ? `Demo · ${demoStatus.charAt(0).toUpperCase()}${demoStatus.slice(1)}`
    : statusLabel
  return (
    <span className={`payment-status payment-status-${statusClass}`}>
      {label}
    </span>
  )
}

function PaymentPageIcon({ type }) {
  if (type === 'wallet') {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M4 7.5h15a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h13v4" />
        <path d="M16 12h5v4h-5a2 2 0 1 1 0-4Z" />
        <path d="M17 14h.01" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M4 12.5 9.5 18 20 7.5" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

// Counts down the 15-minute payment hold from the seconds the server reported.
function usePaymentCountdown(booking) {
  const secondsAtLoad = booking?.booking_status === 'PENDING_PAYMENT' &&
    Number.isFinite(Number(booking?.payment_seconds_left))
    ? Number(booking.payment_seconds_left)
    : null
  const [loadedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (secondsAtLoad === null) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [secondsAtLoad])
  if (secondsAtLoad === null) return null
  return Math.max(0, secondsAtLoad - Math.floor((now - loadedAt) / 1000))
}

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function CustomerPaymentPage({ user, onLogout, bookingId, initialBooking }) {
  const { token, handleUnauthorized } = useAuth()
  const api = useMemo(
    () => createApiClient(token, handleUnauthorized),
    [handleUnauthorized, token],
  )
  const validId = isBookingId(bookingId)
  const hasInitialBooking =
    validId && String(initialBooking?.booking_id) === String(bookingId)
  const [booking, setBooking] = useState(hasInitialBooking ? initialBooking : null)
  const [bookingState, setBookingState] = useState(
    hasInitialBooking ? 'ready' : validId ? 'loading' : 'unavailable',
  )
  const [bookingError, setBookingError] = useState('')
  const [bookingReload, setBookingReload] = useState(0)
  const [payment, setPayment] = useState(null)
  const [paymentState, setPaymentState] = useState(validId ? 'loading' : 'idle')
  const [paymentError, setPaymentError] = useState('')
  const [walletBalance, setWalletBalance] = useState(null)
  const [walletState, setWalletState] = useState(validId ? 'loading' : 'idle')
  const [walletError, setWalletError] = useState('')
  const [infoReload, setInfoReload] = useState(0)
  const [action, setAction] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const actionLock = useRef(false)

  useEffect(() => {
    if (!validId || hasInitialBooking) return undefined
    const controller = new AbortController()
    findBookingInHistory(api, bookingId, controller.signal)
      .then((result) => {
        if (!result) {
          setBooking(null)
          setBookingState('unavailable')
          return
        }
        setBooking(result)
        setBookingState('ready')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setBookingError(getErrorMessage(error))
          setBookingState('error')
        }
      })

    return () => controller.abort()
  }, [api, bookingId, bookingReload, hasInitialBooking, validId])

  useEffect(() => {
    if (!validId) return undefined
    const controller = new AbortController()

    api(`/api/payments/${bookingId}`, { signal: controller.signal })
      .then((response) => {
        const result = response.data
        if (!result || String(result.booking_id) !== String(bookingId)) {
          throw new Error('The payment response is incomplete.')
        }
        setPayment(result)
        setPaymentError('')
        setPaymentState('ready')
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        if (error instanceof ApiError && error.status === 404) {
          setPayment(null)
          setPaymentError('')
          setPaymentState('ready')
          return
        }
        setPaymentError(getErrorMessage(error))
        setPaymentState('error')
      })

    api('/api/wallet', { signal: controller.signal })
      .then((response) => {
        const balance = response.data?.balance
        if (balance === undefined || balance === null || cents(balance) === null) {
          throw new Error('The wallet response is incomplete.')
        }
        setWalletBalance(balance)
        setWalletError('')
        setWalletState('ready')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setWalletError(getErrorMessage(error))
          setWalletState('error')
        }
      })

    return () => controller.abort()
  }, [api, bookingId, infoReload, validId])

  function refreshPaymentInfo() {
    setPaymentState('loading')
    setWalletState('loading')
    setPaymentError('')
    setWalletError('')
    setInfoReload((current) => current + 1)
  }

  function retryBooking() {
    setBookingState('loading')
    setBookingError('')
    setBookingReload((current) => current + 1)
  }

  async function submitPaymentAction(actionType, paymentStatus) {
    if (actionLock.current) return
    actionLock.current = true
    setAction(actionType)
    setActionError('')
    setActionNotice('')

    try {
      let response
      if (actionType === 'create-simulated') {
        response = await api(`/api/payments/${bookingId}`, {
          method: 'POST',
          body: { payment_method: 'SIMULATED' },
        })
      } else if (actionType === 'simulate') {
        response = await api(`/api/payments/${bookingId}/simulate`, {
          method: 'POST',
          body: { payment_status: paymentStatus },
        })
      } else {
        response = await api(`/api/payments/${bookingId}/wallet`, {
          method: 'POST',
        })
      }

      const updatedPayment = response.data?.payment || response.data
      if (updatedPayment?.payment_status) {
        setPayment(updatedPayment)
        setPaymentState('ready')
      }
      if (response.data?.wallet?.balance !== undefined) {
        setWalletBalance(response.data.wallet.balance)
        setWalletState('ready')
      }
      setActionNotice(
        actionType === 'simulate'
          ? `Demo payment marked ${paymentStatus === 'PAID' ? 'paid' : 'failed'}.`
          : actionType === 'wallet'
            ? 'Wallet payment completed.'
            : 'Demo payment created. Choose a result below.',
      )
      refreshPaymentInfo()
    } catch (error) {
      setActionError(getErrorMessage(error))
      if (error instanceof ApiError && [400, 409].includes(error.status)) {
        refreshPaymentInfo()
      }
    } finally {
      actionLock.current = false
      setAction('')
    }
  }

  const amount = booking?.final_amount ?? booking?.total_amount
  const amountCents = cents(amount)
  const walletCents = cents(walletBalance)
  const secondsLeft = usePaymentCountdown(booking)
  const holdExpired = secondsLeft === 0
  const bookingAllowsPayment =
    booking && !['CANCELLED', 'NO_SHOW'].includes(booking.booking_status) && !holdExpired
  const pendingPayment = payment?.payment_status === 'PENDING'
  // A failed attempt can be retried while the booking still awaits payment.
  const retryableFailure =
    payment?.payment_status === 'FAILED' && booking?.booking_status === 'PENDING_PAYMENT'
  const canCreateDemo =
    paymentState === 'ready' && (!payment || retryableFailure) && bookingAllowsPayment
  const canSimulate =
    paymentState === 'ready' &&
    payment?.payment_method === 'SIMULATED' &&
    pendingPayment &&
    bookingAllowsPayment
  const walletPaymentCompatible =
    !payment ||
    retryableFailure ||
    (pendingPayment && ['SIMULATED', 'WALLET'].includes(payment.payment_method))
  const canPayWithWallet =
    paymentState === 'ready' &&
    walletState === 'ready' &&
    walletPaymentCompatible &&
    bookingAllowsPayment &&
    amountCents !== null &&
    walletCents !== null &&
    walletCents >= amountCents
  const insufficientWallet =
    walletState === 'ready' &&
    amountCents !== null &&
    walletCents !== null &&
    walletCents < amountCents
  const vehicleName = [booking?.vehicle?.brand_name, booking?.vehicle?.model_name]
    .filter(Boolean)
    .join(' ')
  const services = Array.isArray(booking?.services) ? booking.services : []

  return (
    <div className="customer-home customer-payment">
      <CustomerHeader onLogout={onLogout} user={user} />
      <main className="payment-main">
        <div className="customer-container">
          <nav aria-label="Breadcrumb" className="payment-breadcrumb">
            <a href="/customer">Home</a>
            <span aria-hidden="true">/</span>
            <a href="/customer/bookings">My Bookings</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Payment</span>
          </nav>

          <header className="payment-heading">
            <div>
              <span className="customer-eyebrow">PAYMENT OPTIONS</span>
              <h1>Complete your payment</h1>
              <p>Review your booking and choose an available payment option.</p>
            </div>
            <a className="payment-back-link" href="/customer/bookings">
              <span aria-hidden="true">←</span> My Bookings
            </a>
          </header>

          {bookingState === 'loading' && (
            <div aria-live="polite" className="payment-state">
              <span className="customer-loader" />
              Loading booking details…
            </div>
          )}

          {bookingState === 'error' && (
            <section className="payment-state payment-state-error" role="alert">
              <h2>We couldn’t load this booking.</h2>
              <p>{bookingError}</p>
              <button onClick={retryBooking} type="button">Try again</button>
            </section>
          )}

          {bookingState === 'unavailable' && (
            <section className="payment-state payment-state-error">
              <h2>Booking unavailable</h2>
              <p>This booking could not be found in your booking history.</p>
              <a className="payment-primary-link" href="/customer/bookings">
                Return to My Bookings
              </a>
            </section>
          )}

          {bookingState === 'ready' && booking && secondsLeft !== null && payment?.payment_status !== 'PAID' && (
            <div className={`payment-countdown${holdExpired ? ' is-expired' : secondsLeft < 180 ? ' is-urgent' : ''}`} role="status">
              {holdExpired ? (
                <>
                  <strong>Payment time is up</strong>
                  <span>This slot has been released. Please book again.</span>
                  <a href="/customer/booking">Book again</a>
                </>
              ) : (
                <>
                  <strong>{formatCountdown(secondsLeft)}</strong>
                  <span>left to pay. Your slot is held until then.</span>
                </>
              )}
            </div>
          )}

          {bookingState === 'ready' && booking && (
            <div className="payment-layout">
              <section aria-labelledby="payment-booking-title" className="payment-booking-card">
                <div className="payment-card-heading">
                  <div>
                    <span className="payment-overline">BOOKING SUMMARY</span>
                    <h2 id="payment-booking-title">Booking #{booking.booking_id}</h2>
                  </div>
                  <PaymentStatus payment={payment} />
                </div>

                <dl className="payment-booking-details">
                  <div>
                    <dt>Vehicle</dt>
                    <dd>{vehicleName || 'Vehicle details unavailable'}</dd>
                    {booking.vehicle?.license_plate && (
                      <span>{booking.vehicle.license_plate}</span>
                    )}
                  </div>
                  <div>
                    <dt>Appointment</dt>
                    <dd>{formatCustomerDate(booking.booking_date)}</dd>
                    <span>
                      {formatCustomerTime(booking.start_time)} – {formatCustomerTime(booking.end_time)}
                    </span>
                  </div>
                </dl>

                <div className="payment-services">
                  <h3>Booked services</h3>
                  {services.length > 0 ? (
                    <ul>
                      {services.map((service, index) => (
                        <li key={service.booking_service_id || `${service.service_name}-${index}`}>
                          <span>{service.service_name || 'Service'}</span>
                          {service.unit_price !== undefined && (
                            <strong>{formatMoney(service.unit_price)}</strong>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Service details are not available.</p>
                  )}
                </div>

                <div className="payment-total">
                  <span>Total amount</span>
                  <strong>{formatMoney(amount)}</strong>
                </div>

                {bookingAllowsPayment === false && (
                  <p className="payment-inline-note">
                    This booking is not eligible for payment because it is {formatCustomerBookingStatus(booking.booking_status)}.
                  </p>
                )}
              </section>

              <section aria-labelledby="payment-options-title" className="payment-options-card">
                <div className="payment-card-heading payment-options-heading">
                  <div>
                    <span className="payment-overline">PAYMENT METHOD</span>
                    <h2 id="payment-options-title">Choose how to pay</h2>
                  </div>
                </div>

                <div className="payment-demo-notice">
                  <span className="payment-demo-icon"><PaymentPageIcon type="demo" /></span>
                  <div>
                    <strong>DEMO ONLY</strong>
                    <p>Simulated payment is for demonstration. No real payment is processed.</p>
                  </div>
                </div>

                {paymentState === 'loading' && (
                  <div aria-live="polite" className="payment-inline-state">
                    <span className="customer-loader" />
                    Checking payment status…
                  </div>
                )}
                {paymentState === 'error' && (
                  <div className="payment-inline-error" role="alert">
                    <span>{paymentError}</span>
                    <button onClick={refreshPaymentInfo} type="button">Retry</button>
                  </div>
                )}
                {paymentState === 'ready' && payment?.payment_status === 'PAID' && (
                  <div className="payment-success" role="status">
                    <strong>Payment complete</strong>
                    <span>Your payment has been recorded.</span>
                  </div>
                )}
                {paymentState === 'ready' && payment?.payment_status === 'FAILED' && (
                  <div className="payment-inline-note">
                    {retryableFailure
                      ? 'This payment attempt failed. You can try again below before the 15-minute hold ends.'
                      : 'This payment attempt failed.'}
                  </div>
                )}
                {paymentState === 'ready' &&
                  pendingPayment &&
                  !canSimulate &&
                  !walletPaymentCompatible && (
                    <div className="payment-inline-note">
                      This pending payment cannot be completed using the available methods on this page.
                    </div>
                  )}

                <div className="payment-method">
                  <div className="payment-method-heading">
                    <span className="payment-method-icon"><PaymentPageIcon type="demo" /></span>
                    <div>
                      <h3>Simulated payment</h3>
                      <p>Mark this demo transaction as paid or failed.</p>
                    </div>
                  </div>
                  {canCreateDemo && (
                    <button
                      className="payment-action-button"
                      disabled={Boolean(action)}
                      onClick={() => submitPaymentAction('create-simulated')}
                      type="button"
                    >
                      {action === 'create-simulated' ? 'Creating…' : 'Create demo payment'}
                    </button>
                  )}
                  {canSimulate && (
                    <div className="payment-simulation-actions">
                      <button
                        className="payment-action-button"
                        disabled={Boolean(action)}
                        onClick={() => submitPaymentAction('simulate', 'PAID')}
                        type="button"
                      >
                        {action === 'simulate' ? 'Processing…' : 'Simulate successful payment'}
                      </button>
                      <button
                        className="payment-secondary-button"
                        disabled={Boolean(action)}
                        onClick={() => submitPaymentAction('simulate', 'FAILED')}
                        type="button"
                      >
                        Simulate failed payment
                      </button>
                    </div>
                  )}
                  {paymentState === 'ready' && !canCreateDemo && !canSimulate && (
                    <p className="payment-method-unavailable">
                      {payment?.payment_status === 'PAID'
                        ? 'This booking has already been paid.'
                        : payment?.payment_status === 'FAILED'
                          ? 'No further demo payment action is available.'
                          : 'This option is not available for the current booking or payment state.'}
                    </p>
                  )}
                </div>

                <div className="payment-method">
                  <div className="payment-method-heading">
                    <span className="payment-method-icon"><PaymentPageIcon type="wallet" /></span>
                    <div>
                      <h3>Car Care Wallet</h3>
                      <p>Pay directly from your available wallet balance.</p>
                    </div>
                  </div>

                  <div className="payment-wallet-balance">
                    <span>Wallet balance</span>
                    {walletState === 'loading' && <span>Loading…</span>}
                    {walletState === 'ready' && <strong>{formatMoney(walletBalance)}</strong>}
                    {walletState === 'error' && <strong>Unavailable</strong>}
                  </div>
                  {walletState === 'error' && (
                    <div className="payment-inline-error" role="alert">
                      <span>{walletError}</span>
                      <button onClick={refreshPaymentInfo} type="button">Retry</button>
                    </div>
                  )}
                  {insufficientWallet && (
                    <p className="payment-inline-note">
                      Your wallet balance is less than the booking total.
                    </p>
                  )}
                  {walletPaymentCompatible && bookingAllowsPayment && (
                    <button
                      className="payment-action-button payment-wallet-button"
                      disabled={!canPayWithWallet || Boolean(action)}
                      onClick={() => submitPaymentAction('wallet')}
                      type="button"
                    >
                      {action === 'wallet'
                        ? 'Processing wallet payment…'
                        : 'Pay with wallet'}
                    </button>
                  )}
                  {paymentState === 'ready' && !walletPaymentCompatible && (
                    <p className="payment-method-unavailable">
                      Wallet payment is unavailable for the current payment state.
                    </p>
                  )}
                </div>

                {(actionError || actionNotice) && (
                  <div
                    className={actionError ? 'payment-action-feedback is-error' : 'payment-action-feedback'}
                    role={actionError ? 'alert' : 'status'}
                  >
                    {actionError || actionNotice}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

      <CustomerFooter />
    </div>
  )
}

export default CustomerPaymentPage
