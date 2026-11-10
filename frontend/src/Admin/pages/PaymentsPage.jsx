import { useState } from 'react'
import { PageHeading, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import formatMoney from '../utils/formatMoney.js'

const MAX_BOOKING_ID = 2147483647
const TERMINAL_BOOKING_STATUSES = new Set(['CANCELLED', 'NO_SHOW'])

function isWalletPaymentAllowed(booking, payment, balance) {
  const canPayBooking = booking && !TERMINAL_BOOKING_STATUSES.has(booking.booking_status)
  const canUseExistingPayment = !payment || (
    payment.payment_status === 'PENDING' &&
    ['SIMULATED', 'WALLET'].includes(payment.payment_method)
  )

  return Boolean(
    canPayBooking &&
    canUseExistingPayment &&
    balance !== null &&
    Number.isFinite(Number(balance)) &&
    Number(balance) >= Number(booking.final_amount),
  )
}

function paymentActionConfirmation(operation, booking, paymentMethod) {
  if (operation === 'create') {
    return `Create a ${paymentMethod} payment for booking #${booking.booking_id}?`
  }
  if (operation === 'wallet') {
    return `Pay ${formatMoney(booking.final_amount)} from the customer's Wallet for booking #${booking.booking_id}? This will deduct the Wallet balance.`
  }
  return `Simulate this payment as ${operation === 'simulate-paid' ? 'PAID' : 'FAILED'}?`
}

function PaymentsPage() {
  const [bookingId, setBookingId] = useState('')
  const [searchedBookingId, setSearchedBookingId] = useState('')
  const [booking, setBooking] = useState(null)
  const [payment, setPayment] = useState(null)
  const [walletBalance, setWalletBalance] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('SIMULATED')
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState('')
  const [error, setError] = useState('')
  const [walletError, setWalletError] = useState('')
  const [notice, setNotice] = useState('')
  const [lookupComplete, setLookupComplete] = useState(false)
  const [paymentLookupComplete, setPaymentLookupComplete] = useState(false)
  const api = useApi()

  const bookingCanHavePayment = booking &&
    !TERMINAL_BOOKING_STATUSES.has(booking.booking_status)
  const canCreatePayment = Boolean(
    lookupComplete &&
    paymentLookupComplete &&
    bookingCanHavePayment &&
    !payment,
  )
  const canPayWithWallet = paymentLookupComplete &&
    isWalletPaymentAllowed(booking, payment, walletBalance)

  async function loadPayment(event) {
    event.preventDefault()
    const id = bookingId.trim()
    if (!/^[1-9]\d*$/.test(id) || Number(id) > MAX_BOOKING_ID) {
      setError(`Enter a valid Booking ID between 1 and ${MAX_BOOKING_ID}.`)
      setBooking(null)
      setPayment(null)
      setWalletBalance(null)
      setSearchedBookingId('')
      setLookupComplete(false)
      setPaymentLookupComplete(false)
      setNotice('')
      return
    }

    setLoading(true)
    setError('')
    setWalletError('')
    setNotice('')
    setBooking(null)
    setPayment(null)
    setWalletBalance(null)
    setSearchedBookingId(id)
    setLookupComplete(false)
    setPaymentLookupComplete(false)

    try {
      const bookingResponse = await api(`/api/admin/bookings/${id}`)
      const bookingData = bookingResponse.data?.booking
      if (!bookingData) {
        throw new Error('The backend did not return Booking details.')
      }

      setBooking(bookingData)
      setLookupComplete(true)

      let paymentData = null
      try {
        const paymentResponse = await api(`/api/payments/${id}`)
        paymentData = paymentResponse.data
      } catch (requestError) {
        if (requestError.status !== 404) throw requestError
        if (bookingResponse.data.payment) {
          paymentData = {
            ...bookingResponse.data.payment,
            booking_id: bookingData.booking_id,
          }
        }
      }
      setPayment(paymentData)
      setPaymentLookupComplete(true)

      const canCheckWallet = !TERMINAL_BOOKING_STATUSES.has(bookingData.booking_status) &&
        (!paymentData || (
          paymentData.payment_status === 'PENDING' &&
          ['SIMULATED', 'WALLET'].includes(paymentData.payment_method)
        ))
      if (canCheckWallet) {
        try {
          const walletResponse = await api(
            `/api/wallet?user_id=${encodeURIComponent(bookingResponse.data.customer?.user_id)}`,
          )
          setWalletBalance(walletResponse.data?.balance ?? null)
        } catch (requestError) {
          setWalletError(`Wallet availability could not be checked: ${requestError.message}`)
        }
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function runAction(operation) {
    if (!booking || action || loading) return
    if (!window.confirm(paymentActionConfirmation(operation, booking, paymentMethod))) return

    setAction(operation)
    setError('')
    setWalletError('')
    setNotice('')
    try {
      let response
      if (operation === 'create') {
        response = await api(`/api/payments/${searchedBookingId}`, {
          method: 'POST',
          body: { payment_method: paymentMethod },
        })
        setPayment(response.data)
      } else if (operation === 'simulate-paid' || operation === 'simulate-failed') {
        response = await api(`/api/payments/${searchedBookingId}/simulate`, {
          method: 'POST',
          body: { payment_status: operation === 'simulate-paid' ? 'PAID' : 'FAILED' },
        })
        setPayment(response.data)
      } else {
        response = await api(`/api/payments/${searchedBookingId}/wallet`, { method: 'POST' })
        setPayment(response.data?.payment ?? null)
        if (response.data?.wallet?.balance !== undefined) {
          setWalletBalance(response.data.wallet.balance)
        }
      }
      setNotice(
        operation === 'wallet'
          ? 'Wallet payment completed successfully.'
          : operation.startsWith('simulate-')
            ? `Payment status updated to ${operation === 'simulate-paid' ? 'PAID' : 'FAILED'}.`
            : 'Payment created successfully.',
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAction('')
    }
  }

  return (
    <div className="admin-payments-page">
      <PageHeading
        description="Find a payment by Booking ID and use only payment actions allowed by the backend."
        eyebrow="FINANCE"
        title="Payments"
      />
      <form className="admin-filter-bar admin-payment-search" onSubmit={loadPayment}>
        <label htmlFor="payment-booking-id">Booking ID</label>
        <input
          autoComplete="off"
          disabled={loading || Boolean(action)}
          id="payment-booking-id"
          inputMode="numeric"
          maxLength="10"
          onChange={(event) => setBookingId(event.target.value)}
          pattern="[1-9][0-9]*"
          placeholder="e.g. 1024"
          required
          type="text"
          value={bookingId}
        />
        <button className="admin-primary-button" disabled={loading || Boolean(action)} type="submit">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <div className="admin-alert admin-alert-error" role="alert">{error}</div>}
      {notice && !error && <div className="admin-alert admin-alert-success" role="status">{notice}</div>}
      {loading && <RequestState loading />}

      {!loading && lookupComplete && paymentLookupComplete && booking && (
        <section className="admin-panel admin-payment-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Booking #{booking.booking_id}</h3>
              <p>Payment details and available actions</p>
            </div>
            <StatusBadge value={booking.booking_status} />
          </div>

          {paymentLookupComplete && payment ? (
            <>
              <dl className="admin-payment-details">
                <div><dt>Booking ID</dt><dd>{payment.booking_id ?? booking.booking_id}</dd></div>
                <div><dt>Payment ID</dt><dd>{payment.payment_id}</dd></div>
                <div><dt>Amount</dt><dd>{formatMoney(payment.amount)}</dd></div>
                <div><dt>Payment method</dt><dd>{payment.payment_method ?? '—'}</dd></div>
                <div><dt>Payment status</dt><dd><StatusBadge value={payment.payment_status} /></dd></div>
                <div><dt>Paid at</dt><dd>{payment.paid_at || '—'}</dd></div>
                <div className="admin-payment-reference"><dt>Transaction reference</dt><dd>{payment.transaction_ref || '—'}</dd></div>
              </dl>
              {payment.payment_status === 'PENDING' && payment.payment_method === 'SIMULATED' && (
                <div className="admin-form-actions admin-payment-actions">
                  <button
                    className="admin-primary-button"
                    disabled={Boolean(action)}
                    onClick={() => runAction('simulate-paid')}
                    type="button"
                  >
                    {action === 'simulate-paid' ? 'Processing…' : 'Simulate paid'}
                  </button>
                  <button
                    className="admin-secondary-button"
                    disabled={Boolean(action)}
                    onClick={() => runAction('simulate-failed')}
                    type="button"
                  >
                    {action === 'simulate-failed' ? 'Processing…' : 'Simulate failed'}
                  </button>
                </div>
              )}
              {payment.payment_status === 'FAILED' && (
                <p className="admin-payment-guidance">Payment unsuccessful. The backend does not allow this payment to be replaced or retried with Wallet.</p>
              )}
              {payment.payment_status === 'PAID' && (
                <p className="admin-payment-guidance">Payment received.</p>
              )}
              {payment.payment_status === 'PENDING' && !['SIMULATED', 'WALLET'].includes(payment.payment_method) && (
                <p className="admin-payment-guidance">Awaiting payment. The backend does not allow this payment method to be changed to Wallet.</p>
              )}
            </>
          ) : paymentLookupComplete ? (
            <>
              <dl className="admin-payment-details">
                <div><dt>Booking ID</dt><dd>{booking.booking_id}</dd></div>
                <div><dt>Booking amount</dt><dd>{formatMoney(booking.final_amount)}</dd></div>
                <div><dt>Booking status</dt><dd><StatusBadge value={booking.booking_status} /></dd></div>
              </dl>
              <p className="admin-payment-guidance">No Payment exists for this Booking yet.</p>
            </>
          ) : null}

          {paymentLookupComplete && (canCreatePayment || canPayWithWallet) && (
            <div className="admin-payment-actions">
              {canCreatePayment && (
                <div className="admin-payment-create">
                  <label htmlFor="payment-method">Create Payment</label>
                  <select
                    disabled={Boolean(action)}
                    id="payment-method"
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    value={paymentMethod}
                  >
                    <option value="SIMULATED">SIMULATED</option>
                    <option value="CASH">CASH</option>
                    <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                  </select>
                  <button
                    className="admin-primary-button"
                    disabled={Boolean(action)}
                    onClick={() => runAction('create')}
                    type="button"
                  >
                    {action === 'create' ? 'Creating…' : 'Create Payment'}
                  </button>
                </div>
              )}
              {canPayWithWallet && (
                <button
                  className="admin-secondary-button"
                  disabled={Boolean(action)}
                  onClick={() => runAction('wallet')}
                  type="button"
                >
                  {action === 'wallet' ? 'Processing…' : 'Pay with Wallet'}
                </button>
              )}
            </div>
          )}
          {walletError && canCheckWalletForDisplay(booking, payment) && (
            <div className="admin-alert admin-alert-error" role="alert">{walletError}</div>
          )}
          {canCheckWalletForDisplay(booking, payment) &&
            walletBalance !== null &&
            Number(walletBalance) < Number(booking.final_amount) && (
              <p className="admin-payment-guidance">
                Wallet balance ({formatMoney(walletBalance)}) is below the amount due ({formatMoney(booking.final_amount)}).
              </p>
            )}
          {paymentLookupComplete && !payment && !bookingCanHavePayment && (
            <p className="admin-payment-guidance">Payment cannot be created for a cancelled or no-show Booking.</p>
          )}
          {paymentLookupComplete && !payment && !canCreatePayment && bookingCanHavePayment && (
            <p className="admin-payment-guidance">Payment actions are unavailable for this Booking.</p>
          )}
        </section>
      )}

      {!loading && !lookupComplete && !error && (
        <div className="admin-request-state">
          <strong>Search for a Booking</strong>
          <span>Enter a Booking ID to view its Payment and available actions.</span>
        </div>
      )}
    </div>
  )
}

function canCheckWalletForDisplay(booking, payment) {
  return Boolean(
    booking &&
    !TERMINAL_BOOKING_STATUSES.has(booking.booking_status) &&
    (!payment || (
      payment.payment_status === 'PENDING' &&
      ['SIMULATED', 'WALLET'].includes(payment.payment_method)
    )),
  )
}

export default PaymentsPage
