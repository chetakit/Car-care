import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, createApiClient } from '../Admin/api/client.js'
import useAuth from '../auth/useAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import CustomerHeader from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import {
  formatCustomerBookingStatus,
  formatCustomerDate,
  formatCustomerMoney,
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

const PAYMENT_ERROR_KEYS = {
  'The bookings response is incomplete.': 'customer.payment.bookingsResponseIncomplete',
  'The payment response is incomplete.': 'customer.payment.paymentResponseIncomplete',
  'The wallet response is incomplete.': 'customer.payment.walletResponseIncomplete',
}
const EMPTY_ERROR = { message: '', key: '' }

function getErrorMessage(error) {
  if (error instanceof ApiError) return { message: error.message, key: '' }
  if (error instanceof Error) {
    const key = PAYMENT_ERROR_KEYS[error.message]
    return key
      ? { message: '', key }
      : { message: error.message, key: '' }
  }
  return { message: '', key: 'customer.common.unexpectedError' }
}

function renderErrorMessage(error, t) {
  return error.key ? t(error.key) : error.message
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

function PaymentStatus({ payment, language, t }) {
  const status = String(payment?.payment_status || 'NOT PAID').toUpperCase()
  const statusClass = status.toLowerCase().replace(/ /g, '-')
  const statusLabel = formatCustomerPaymentStatus(status, language)
  const label = payment?.payment_method === 'SIMULATED'
    ? t('customer.payment.demoStatus', { status: statusLabel })
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
  const { language, t } = useLanguage()
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
  const [bookingError, setBookingError] = useState(EMPTY_ERROR)
  const [bookingReload, setBookingReload] = useState(0)
  const [payment, setPayment] = useState(null)
  const [paymentState, setPaymentState] = useState(validId ? 'loading' : 'idle')
  const [paymentError, setPaymentError] = useState(EMPTY_ERROR)
  const [walletBalance, setWalletBalance] = useState(null)
  const [walletState, setWalletState] = useState(validId ? 'loading' : 'idle')
  const [walletError, setWalletError] = useState(EMPTY_ERROR)
  const [infoReload, setInfoReload] = useState(0)
  const [action, setAction] = useState('')
  const [actionError, setActionError] = useState(EMPTY_ERROR)
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
        setPaymentError(EMPTY_ERROR)
        setPaymentState('ready')
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        if (error instanceof ApiError && error.status === 404) {
          setPayment(null)
          setPaymentError(EMPTY_ERROR)
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
        setWalletError(EMPTY_ERROR)
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
    setPaymentError(EMPTY_ERROR)
    setWalletError(EMPTY_ERROR)
    setInfoReload((current) => current + 1)
  }

  function retryBooking() {
    setBookingState('loading')
    setBookingError(EMPTY_ERROR)
    setBookingReload((current) => current + 1)
  }

  async function submitPaymentAction(actionType, paymentStatus) {
    if (actionLock.current) return
    actionLock.current = true
    setAction(actionType)
    setActionError(EMPTY_ERROR)
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
          ? t('customer.payment.demoMarked', {
              result: t(
                paymentStatus === 'PAID'
                  ? 'customer.payment.demoPaid'
                  : 'customer.payment.demoFailed',
              ),
            })
          : actionType === 'wallet'
            ? t('customer.payment.walletCompleted')
            : t('customer.payment.demoCreated'),
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
  const hasActionError = Boolean(actionError.key || actionError.message)

  return (
    <div className="customer-home customer-payment">
      <CustomerHeader onLogout={onLogout} user={user} />
      <main className="payment-main">
        <div className="customer-container">
          <nav aria-label={t('customer.profile.breadcrumbLabel')} className="payment-breadcrumb">
            <a href="/customer">{t('customer.common.home')}</a>
            <span aria-hidden="true">/</span>
            <a href="/customer/bookings">{t('customer.common.myBookings')}</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{t('customer.payment.breadcrumb')}</span>
          </nav>

          <header className="payment-heading">
            <div>
              <span className="customer-eyebrow">{t('customer.payment.optionsEyebrow')}</span>
              <h1>{t('customer.payment.title')}</h1>
              <p>{t('customer.payment.description')}</p>
            </div>
            <a className="payment-back-link" href="/customer/bookings">
              <span aria-hidden="true">←</span> {t('customer.payment.backToBookings')}
            </a>
          </header>

          {bookingState === 'loading' && (
            <div aria-live="polite" className="payment-state">
              <span className="customer-loader" />
              {t('customer.payment.loadingBooking')}
            </div>
          )}

          {bookingState === 'error' && (
            <section className="payment-state payment-state-error" role="alert">
              <h2>{t('customer.payment.loadBookingError')}</h2>
              <p>{renderErrorMessage(bookingError, t)}</p>
              <button onClick={retryBooking} type="button">{t('customer.common.retry')}</button>
            </section>
          )}

          {bookingState === 'unavailable' && (
            <section className="payment-state payment-state-error">
              <h2>{t('customer.payment.unavailable')}</h2>
              <p>{t('customer.payment.notInHistory')}</p>
              <a className="payment-primary-link" href="/customer/bookings">
                {t('customer.payment.returnBookings')}
              </a>
            </section>
          )}

          {bookingState === 'ready' && booking && secondsLeft !== null && payment?.payment_status !== 'PAID' && (
            <div className={`payment-countdown${holdExpired ? ' is-expired' : secondsLeft < 180 ? ' is-urgent' : ''}`} role="status">
              {holdExpired ? (
                <>
                  <strong>{t('customer.payment.timeUp')}</strong>
                  <span>{t('customer.payment.slotReleased')}</span>
                  <a href="/customer/booking">{t('customer.payment.bookAgain')}</a>
                </>
              ) : (
                <>
                  <strong>{formatCountdown(secondsLeft)}</strong>
                  <span>{t('customer.payment.timeLeft')}</span>
                </>
              )}
            </div>
          )}

          {bookingState === 'ready' && booking && (
            <div className="payment-layout">
              <section aria-labelledby="payment-booking-title" className="payment-booking-card">
                <div className="payment-card-heading">
                  <div>
                    <span className="payment-overline">{t('customer.payment.bookingSummary')}</span>
                    <h2 id="payment-booking-title">
                      {t('customer.payment.bookingId', { bookingId: booking.booking_id })}
                    </h2>
                  </div>
                  <PaymentStatus language={language} payment={payment} t={t} />
                </div>

                <dl className="payment-booking-details">
                  <div>
                    <dt>{t('customer.payment.vehicle')}</dt>
                    <dd>{vehicleName || t('customer.payment.vehicleDetailsUnavailable')}</dd>
                    {booking.vehicle?.license_plate && (
                      <span>{booking.vehicle.license_plate}</span>
                    )}
                  </div>
                  <div>
                    <dt>{t('customer.payment.appointment')}</dt>
                    <dd>{formatCustomerDate(booking.booking_date, language)}</dd>
                    <span>
                      {formatCustomerTime(booking.start_time, language)} – {formatCustomerTime(booking.end_time, language)}
                    </span>
                  </div>
                </dl>

                <div className="payment-services">
                  <h3>{t('customer.payment.bookedServices')}</h3>
                  {services.length > 0 ? (
                    <ul>
                      {services.map((service, index) => (
                        <li key={service.booking_service_id || `${service.service_name}-${index}`}>
                          <span>{service.service_name || t('customer.common.service')}</span>
                          {service.unit_price !== undefined && (
                            <strong>{formatCustomerMoney(service.unit_price, language)}</strong>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t('customer.payment.serviceDetailsUnavailable')}</p>
                  )}
                </div>

                <div className="payment-total">
                  <span>{t('customer.payment.totalAmount')}</span>
                  <strong>{formatCustomerMoney(amount, language)}</strong>
                </div>

                {bookingAllowsPayment === false && (
                  <p className="payment-inline-note">
                    {t('customer.payment.ineligible', {
                      status: formatCustomerBookingStatus(booking.booking_status, language),
                    })}
                  </p>
                )}
              </section>

              <section aria-labelledby="payment-options-title" className="payment-options-card">
                <div className="payment-card-heading payment-options-heading">
                  <div>
                    <span className="payment-overline">{t('customer.payment.methodEyebrow')}</span>
                    <h2 id="payment-options-title">{t('customer.payment.chooseMethod')}</h2>
                  </div>
                </div>

                <div className="payment-demo-notice">
                  <span className="payment-demo-icon"><PaymentPageIcon type="demo" /></span>
                  <div>
                    <strong>{t('customer.payment.demoOnly')}</strong>
                    <p>{t('customer.payment.demoNotice')}</p>
                  </div>
                </div>

                {paymentState === 'loading' && (
                  <div aria-live="polite" className="payment-inline-state">
                    <span className="customer-loader" />
                    {t('customer.payment.checkingStatus')}
                  </div>
                )}
                {paymentState === 'error' && (
                  <div className="payment-inline-error" role="alert">
                    <span>{renderErrorMessage(paymentError, t)}</span>
                    <button onClick={refreshPaymentInfo} type="button">{t('customer.payment.retry')}</button>
                  </div>
                )}
                {paymentState === 'ready' && payment?.payment_status === 'PAID' && (
                  <div className="payment-success" role="status">
                    <strong>{t('customer.payment.complete')}</strong>
                    <span>{t('customer.payment.recorded')}</span>
                  </div>
                )}
                {paymentState === 'ready' && payment?.payment_status === 'FAILED' && (
                  <div className="payment-inline-note">
                    {retryableFailure
                      ? t('customer.payment.retryFailed')
                      : t('customer.payment.failed')}
                  </div>
                )}
                {paymentState === 'ready' &&
                  pendingPayment &&
                  !canSimulate &&
                  !walletPaymentCompatible && (
                    <div className="payment-inline-note">
                      {t('customer.payment.pendingUnavailable')}
                    </div>
                  )}

                <div className="payment-method">
                  <div className="payment-method-heading">
                    <span className="payment-method-icon"><PaymentPageIcon type="demo" /></span>
                    <div>
                      <h3>{t('customer.payment.simulated')}</h3>
                      <p>{t('customer.payment.simulateInstructions')}</p>
                    </div>
                  </div>
                  {canCreateDemo && (
                    <button
                      className="payment-action-button"
                      disabled={Boolean(action)}
                      onClick={() => submitPaymentAction('create-simulated')}
                      type="button"
                    >
                      {action === 'create-simulated'
                        ? t('customer.payment.creating')
                        : t('customer.payment.createDemo')}
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
                        {action === 'simulate'
                          ? t('customer.payment.processing')
                          : t('customer.payment.simulateSuccess')}
                      </button>
                      <button
                        className="payment-secondary-button"
                        disabled={Boolean(action)}
                        onClick={() => submitPaymentAction('simulate', 'FAILED')}
                        type="button"
                      >
                        {t('customer.payment.simulateFailure')}
                      </button>
                    </div>
                  )}
                  {paymentState === 'ready' && !canCreateDemo && !canSimulate && (
                    <p className="payment-method-unavailable">
                      {payment?.payment_status === 'PAID'
                        ? t('customer.payment.alreadyPaid')
                        : payment?.payment_status === 'FAILED'
                          ? t('customer.payment.noDemoAction')
                          : t('customer.payment.optionUnavailable')}
                    </p>
                  )}
                </div>

                <div className="payment-method">
                  <div className="payment-method-heading">
                    <span className="payment-method-icon"><PaymentPageIcon type="wallet" /></span>
                    <div>
                      <h3>{t('customer.payment.wallet')}</h3>
                      <p>{t('customer.payment.walletDescription')}</p>
                    </div>
                  </div>

                  <div className="payment-wallet-balance">
                    <span>{t('customer.payment.walletBalance')}</span>
                    {walletState === 'loading' && <span>{t('customer.common.loading')}</span>}
                    {walletState === 'ready' && <strong>{formatCustomerMoney(walletBalance, language)}</strong>}
                    {walletState === 'error' && <strong>{t('customer.payment.walletUnavailable')}</strong>}
                  </div>
                  {walletState === 'error' && (
                    <div className="payment-inline-error" role="alert">
                      <span>{renderErrorMessage(walletError, t)}</span>
                      <button onClick={refreshPaymentInfo} type="button">{t('customer.payment.retry')}</button>
                    </div>
                  )}
                  {insufficientWallet && (
                    <p className="payment-inline-note">
                      {t('customer.payment.insufficientWallet')}
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
                        ? t('customer.payment.processingWallet')
                        : t('customer.payment.payWithWallet')}
                    </button>
                  )}
                  {paymentState === 'ready' && !walletPaymentCompatible && (
                    <p className="payment-method-unavailable">
                      {t('customer.payment.walletMethodUnavailable')}
                    </p>
                  )}
                </div>

                {(hasActionError || actionNotice) && (
                  <div
                    className={hasActionError ? 'payment-action-feedback is-error' : 'payment-action-feedback'}
                    role={hasActionError ? 'alert' : 'status'}
                  >
                    {hasActionError ? renderErrorMessage(actionError, t) : actionNotice}
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
