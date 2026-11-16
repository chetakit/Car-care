import { useCallback, useEffect, useRef, useState } from 'react'
import { DataTable, PageHeading, PaymentStatusBadge, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDateTime } from '../utils/formatDate.js'
import formatMoney from '../utils/formatMoney.js'

const MAX_BOOKING_ID = 2147483647
const TERMINAL_BOOKING_STATUSES = new Set(['CANCELLED', 'NO_SHOW'])

// A failed attempt on a booking that still awaits payment can be retried.
function isRetryableFailure(booking, payment) {
  return payment?.payment_status === 'FAILED' && booking?.booking_status === 'PENDING_PAYMENT'
}

function isWalletPaymentAllowed(booking, payment, balance) {
  const canPayBooking = booking && !TERMINAL_BOOKING_STATUSES.has(booking.booking_status)
  const canUseExistingPayment = !payment || isRetryableFailure(booking, payment) || (
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
  if (operation === 'verify-transfer') {
    return `Confirm that the bank transfer for ${formatMoney(booking.final_amount)} has been independently verified for booking #${booking.booking_id}?`
  }
  return `Simulate this payment as ${operation === 'simulate-paid' ? 'PAID' : 'FAILED'}?`
}

const QUEUE_TABS = [
  { status: 'PENDING', label: 'Waiting', empty: 'No payments are waiting.' },
  { status: 'PAID', label: 'Paid', empty: 'No paid bookings yet.' },
  { status: 'FAILED', label: 'Failed', empty: 'No failed payments.' },
]

// Recent bookings by payment status, so an Admin can pick one instead of typing its ID.
function PaymentQueue({ onOpen, selectedId }) {
  const [tab, setTab] = useState('PENDING')
  const params = new URLSearchParams({ payment_status: tab, page: '1', limit: '8', sort: 'newest' })
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/bookings?${params}`)
  const rows = data?.items ?? []
  const current = QUEUE_TABS.find((item) => item.status === tab)
  return (
    <section className="admin-panel admin-data-panel admin-payment-queue">
      <div className="admin-panel-heading">
        <div>
          <h3>Recent payments</h3>
          <p>{data?.pagination?.total ?? 0} {current.label.toLowerCase()} · select one to open it</p>
        </div>
        <div aria-label="Payment status" className="admin-tabs">
          {QUEUE_TABS.map((item) => (
            <button aria-pressed={tab === item.status} className={tab === item.status ? 'is-selected' : ''} key={item.status} onClick={() => setTab(item.status)} type="button">
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <RequestState empty={!rows.length} emptyDescription="Payments appear here as customers pay." emptyTitle={current.empty} error={error} loading={loading} loadingMessage="Loading payments…" onRetry={refresh} />
      {!loading && !error && rows.length > 0 && (
        <DataTable
          columns={[
            {
              key: 'booking_id',
              label: 'Booking',
              render: (row) => (
                <button aria-current={String(row.booking_id) === selectedId ? 'true' : undefined} className="admin-booking-link" onClick={() => onOpen(String(row.booking_id))} type="button">
                  #{row.booking_id}
                </button>
              ),
            },
            { key: 'full_name', label: 'Customer', render: (row) => row.full_name || '—' },
            { key: 'final_amount', label: 'Amount', render: (row) => formatMoney(row.final_amount) },
            { key: 'payment_method', label: 'Method', render: (row) => row.payment_method === 'SIMULATED' ? 'Online' : formatMethod(row.payment_method) },
            { key: 'booking_status', label: 'Booking', render: (row) => <StatusBadge value={row.booking_status} /> },
          ]}
          rowKey={(row) => row.booking_id}
          rows={rows}
        />
      )}
    </section>
  )
}

function formatMethod(value) {
  return value ? value.charAt(0) + value.slice(1).toLowerCase().replace('_', ' ') : '—'
}

function PaymentsPage() {
  const initialBookingId = new URLSearchParams(window.location.search).get('booking_id') ?? ''
  const [bookingId, setBookingId] = useState(initialBookingId)
  const [searchedBookingId, setSearchedBookingId] = useState('')
  const [booking, setBooking] = useState(null)
  const [payment, setPayment] = useState(null)
  const [walletBalance, setWalletBalance] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('SIMULATED')
  const [transferReference, setTransferReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState('')
  const [error, setError] = useState('')
  const [walletError, setWalletError] = useState('')
  const [notice, setNotice] = useState('')
  const [lookupComplete, setLookupComplete] = useState(false)
  const [paymentLookupComplete, setPaymentLookupComplete] = useState(false)
  const autoLookupAttempted = useRef(false)
  const [queueRefreshKey, setQueueRefreshKey] = useState(0)
  const api = useApi()

  const bookingCanHavePayment = booking &&
    !TERMINAL_BOOKING_STATUSES.has(booking.booking_status)
  const canCreatePayment = Boolean(
    lookupComplete &&
    paymentLookupComplete &&
    bookingCanHavePayment &&
    (!payment || isRetryableFailure(booking, payment)),
  )
  const canPayWithWallet = paymentLookupComplete &&
    isWalletPaymentAllowed(booking, payment, walletBalance)

  const loadPayment = useCallback(async (event, overrideId) => {
    event?.preventDefault()
    const id = (overrideId ?? bookingId).trim()
    if (!/^[1-9]\d*$/.test(id) || Number(id) > MAX_BOOKING_ID) {
      setError(`Enter a valid Booking ID between 1 and ${MAX_BOOKING_ID}.`)
      setBooking(null)
      setPayment(null)
      setWalletBalance(null)
      setSearchedBookingId('')
      setLookupComplete(false)
      setPaymentLookupComplete(false)
      setNotice('')
      setTransferReference('')
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
      // Cash cannot confirm an unpaid booking, so never carry it over to one.
      if (bookingData?.booking_status === 'PENDING_PAYMENT') {
        setPaymentMethod((current) => (current === 'CASH' ? 'SIMULATED' : current))
      }
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
  }, [api, bookingId])

  // Opening a row from the payment list fills the Booking ID and loads it.
  function openFromQueue(id) {
    if (loading || action) return
    setBookingId(id)
    void loadPayment(undefined, id)
  }

  useEffect(() => {
    if (!initialBookingId || autoLookupAttempted.current) return
    autoLookupAttempted.current = true
    void loadPayment()
  }, [initialBookingId, loadPayment])

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
      } else if (operation === 'verify-transfer') {
        response = await api(`/api/payments/${searchedBookingId}/verify`, {
          method: 'POST',
          body: {
            payment_method: 'BANK_TRANSFER',
            amount: String(payment.amount),
            transfer_reference: transferReference.trim(),
          },
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
          : operation === 'verify-transfer'
            ? 'Bank transfer verified.'
          : operation.startsWith('simulate-')
            ? `Payment status updated to ${operation === 'simulate-paid' ? 'PAID' : 'FAILED'}.`
            : 'Payment created successfully.',
      )
      setQueueRefreshKey((key) => key + 1)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAction('')
    }
  }

  return (
    <div className="admin-payments-page">
      <PageHeading
        description="Enter a Booking ID (shown in Bookings) to see its payment, verify a bank transfer, or take a payment."
        eyebrow="FINANCE"
        title="Payments"
      />
      <form className="admin-filter-bar admin-payment-search" onSubmit={loadPayment}>
        <label className="admin-lookup-field" htmlFor="payment-booking-id">
          Booking ID
          <input
            aria-describedby="payment-booking-id-hint"
            autoComplete="off"
            disabled={loading || Boolean(action)}
            id="payment-booking-id"
            inputMode="numeric"
            maxLength="10"
            onChange={(event) => {
              const nextValue = event.target.value
              setBookingId(nextValue)
              setError('')
              setNotice('')
              if (nextValue.trim() !== searchedBookingId) {
                setBooking(null)
                setPayment(null)
                setWalletBalance(null)
                setLookupComplete(false)
                setPaymentLookupComplete(false)
              }
            }}
            placeholder="e.g. 1024"
            required
            type="text"
            value={bookingId}
          />
          <small id="payment-booking-id-hint">Use the ID for a booking, not a customer or payment.</small>
        </label>
        <button className="admin-primary-button" disabled={loading || Boolean(action)} type="submit">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <div className="admin-alert admin-alert-error" role="alert">{error}</div>}
      {notice && !error && <div className="admin-alert admin-alert-success" role="status">{notice}</div>}
      {loading && <RequestState loading />}
      {!booking && <PaymentQueue key={queueRefreshKey} onOpen={openFromQueue} selectedId={searchedBookingId} />}

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
                <div><dt>Payment status</dt><dd><PaymentStatusBadge payment={payment} /></dd></div>
                <div><dt>Paid at</dt><dd>{formatDateTime(payment.paid_at)}</dd></div>
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
              {payment.payment_status === 'PENDING' && payment.payment_method === 'BANK_TRANSFER' &&
                ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE'].includes(booking.booking_status) && (
                  <div className="admin-payment-create">
                    <label htmlFor="transfer-reference">Bank transfer reference (check with the bank before confirming)</label>
                    <input id="transfer-reference" maxLength="128" onChange={(event) => setTransferReference(event.target.value)} value={transferReference} />
                    <button className="admin-primary-button" disabled={Boolean(action) || !transferReference.trim()} onClick={() => runAction('verify-transfer')} type="button">
                      {action === 'verify-transfer' ? 'Verifying…' : 'Verify transfer'}
                    </button>
                  </div>
                )}
              {payment.payment_status === 'FAILED' && (
                <p className="admin-payment-guidance">
                  {isRetryableFailure(booking, payment)
                    ? 'Payment unsuccessful. The booking still awaits payment, so you can create a new attempt below.'
                    : 'Payment unsuccessful. This attempt cannot be retried.'}
                </p>
              )}
              {payment.payment_status === 'PAID' && (
                <p className="admin-payment-guidance">
                  {payment.payment_method === 'SIMULATED'
                    ? 'Paid online (simulated payment). Counted as revenue.'
                    : 'Paid status recorded. Historical cash and transfer payments may require reconciliation.'}
                </p>
              )}
              {payment.payment_status === 'PENDING' && !['SIMULATED', 'WALLET'].includes(payment.payment_method) && (
                <p className="admin-payment-guidance">
                  {payment.payment_method === 'CASH'
                    ? 'Awaiting cash confirmation by Staff. This payment cannot be changed to Wallet.'
                    : 'Awaiting payment verification. This payment cannot be changed to Wallet.'}
                </p>
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
                    {booking.booking_status !== 'PENDING_PAYMENT' && <option value="CASH">CASH</option>}
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
          <span>Enter the numeric Booking ID to view its payment status, amount, and supported actions.</span>
        </div>
      )}
      {booking && <PaymentQueue key={queueRefreshKey} onOpen={openFromQueue} selectedId={searchedBookingId} />}
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
