import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { DataTable, PageHeading, Pagination, PaymentStatusBadge, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDateTime } from '../utils/formatDate.js'
import formatMoney from '../utils/formatMoney.js'
import formatStatusLabel from '../utils/formatStatusLabel.js'

const MAX_BOOKING_ID = 2147483647
const TERMINAL_BOOKING_STATUSES = new Set(['CANCELLED', 'NO_SHOW'])
const PAYMENT_METHOD_LABEL_KEYS = {
  BANK_TRANSFER: 'admin.payments.method.bankTransfer',
  CASH: 'admin.payments.method.cash',
  SIMULATED: 'admin.payments.method.simulated',
  WALLET: 'admin.payments.method.wallet',
}

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

function messageText(message, t) {
  return message?.key ? t(message.key, message.params) : message
}

function paymentActionConfirmation(operation, booking, paymentMethod, t, language) {
  if (operation === 'create') {
    const methodKey = paymentMethod === 'CASH'
      ? 'admin.payments.method.cash'
      : paymentMethod === 'BANK_TRANSFER'
        ? 'admin.payments.method.bankTransfer'
        : 'admin.payments.method.simulated'
    return t('admin.payments.confirm.create', {
      method: t(methodKey),
      bookingId: booking.booking_id,
    })
  }
  if (operation === 'wallet') {
    return t('admin.payments.confirm.wallet', {
      amount: formatMoney(booking.final_amount, language),
      bookingId: booking.booking_id,
    })
  }
  if (operation === 'verify-transfer') {
    return t('admin.payments.confirm.verifyTransfer', {
      amount: formatMoney(booking.final_amount, language),
      bookingId: booking.booking_id,
    })
  }
  return t('admin.payments.confirm.simulate', {
    status: t(operation === 'simulate-paid' ? 'admin.status.paid' : 'admin.status.failed'),
  })
}

const QUEUE_TABS = [
  { status: 'PENDING', label: 'admin.payments.queue.waiting', count: 'admin.payments.queue.count.waiting', empty: 'admin.payments.queue.empty.waiting' },
  { status: 'PAID', label: 'admin.payments.queue.paid', count: 'admin.payments.queue.count.paid', empty: 'admin.payments.queue.empty.paid' },
  { status: 'FAILED', label: 'admin.payments.queue.failed', count: 'admin.payments.queue.count.failed', empty: 'admin.payments.queue.empty.failed' },
]

// Recent bookings by payment status, so an Admin can pick one instead of typing its ID.
function PaymentQueue({ onOpen, selectedId }) {
  const { language, t } = useLanguage()
  const [tab, setTab] = useState('PENDING')
  const [page, setPage] = useState(1)
  const params = new URLSearchParams({ payment_status: tab, page: String(page), limit: '10', sort: 'newest' })
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/bookings?${params}`)
  const rows = data?.items ?? []
  const current = QUEUE_TABS.find((item) => item.status === tab) ?? QUEUE_TABS[0]
  return (
    <section className="admin-panel admin-data-panel admin-payment-queue">
      <div className="admin-panel-heading">
        <div>
          <h3>{t('admin.payments.queue.title')}</h3>
          <p>{t(current.count, { count: data?.pagination?.total ?? 0 })} · {t('admin.payments.queue.select')}</p>
        </div>
        <div aria-label={t('admin.payments.queue.ariaLabel')} className="admin-tabs">
          {QUEUE_TABS.map((item) => (
            <button aria-pressed={tab === item.status} className={tab === item.status ? 'is-selected' : ''} key={item.status} onClick={() => { setTab(item.status); setPage(1) }} type="button">
              {t(item.label)}
            </button>
          ))}
        </div>
      </div>
      <RequestState empty={!rows.length} emptyDescription={t('admin.payments.queue.emptyDescription')} emptyTitle={t(current.empty)} error={error} loading={loading} loadingMessage={t('admin.payments.queue.loading')} onRetry={refresh} />
      {!loading && !error && rows.length > 0 && (
        <DataTable
          columns={[
            {
              key: 'booking_id',
              label: t('admin.payments.table.booking'),
              render: (row) => (
                <button aria-current={String(row.booking_id) === selectedId ? 'true' : undefined} className="admin-booking-link" onClick={() => onOpen(String(row.booking_id))} type="button">
                  #{row.booking_id}
                </button>
              ),
            },
            { key: 'full_name', label: t('admin.payments.table.customer'), render: (row) => row.full_name || '—' },
            { key: 'final_amount', label: t('admin.payments.table.amount'), render: (row) => formatMoney(row.final_amount, language) },
            { key: 'payment_method', label: t('admin.payments.table.method'), render: (row) => row.payment_method === 'SIMULATED' ? t('admin.payment.online') : formatMethod(row.payment_method, t) },
            { key: 'booking_status', label: t('admin.payments.table.bookingStatus'), render: (row) => <StatusBadge value={row.booking_status} /> },
          ]}
          rowKey={(row) => row.booking_id}
          rows={rows}
        />
      )}
      {!loading && !error && <Pagination onPageChange={setPage} pagination={data?.pagination} />}
    </section>
  )
}

function formatMethod(value, t) {
  return PAYMENT_METHOD_LABEL_KEYS[value] ? t(PAYMENT_METHOD_LABEL_KEYS[value]) : value || '—'
}

function PaymentsPage() {
  const { language, t } = useLanguage()
  const initialBookingId = new URLSearchParams(window.location.search).get('booking_id') ?? ''
  const [bookingId, setBookingId] = useState(initialBookingId)
  const [searchMode, setSearchMode] = useState('booking') // 'booking' | 'payment'
  const [paymentQuery, setPaymentQuery] = useState('')
  const [paymentMatches, setPaymentMatches] = useState(null)
  const [searchedBookingId, setSearchedBookingId] = useState('')
  const [booking, setBooking] = useState(null)
  // Who the booking belongs to and which car, shown above the payment details.
  const [bookingParty, setBookingParty] = useState(null)
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
      setError({ key: 'admin.payments.validation.bookingId', params: { max: MAX_BOOKING_ID } })
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
        setError({ key: 'admin.payments.error.bookingUnavailable' })
        return
      }

      setBooking(bookingData)
      setBookingParty({
        customer: bookingResponse.data?.customer ?? null,
        vehicle: bookingResponse.data?.vehicle ?? null,
      })
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
          setWalletError({
            key: 'admin.payments.error.walletUnavailable',
            params: { message: requestError.message },
          })
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
    setSearchMode('booking')
    setBookingId(id)
    void loadPayment(undefined, id)
  }

  // Search by payment number or reference: find its booking, then open it.
  async function lookupPayment(event) {
    event.preventDefault()
    const query = paymentQuery.trim()
    if (!query || query.length > 128) {
      setError({ key: 'admin.payments.lookup.invalid' })
      return
    }
    setLoading(true)
    setError('')
    setNotice('')
    setPaymentMatches(null)
    let items
    try {
      const response = await api(`/api/admin/payments/lookup?q=${encodeURIComponent(query)}`)
      items = response.data?.items ?? []
    } catch (lookupError) {
      setError(lookupError.message || { key: 'admin.payments.lookup.failed' })
      setLoading(false)
      return
    }
    setLoading(false)
    if (items.length === 0) {
      setBooking(null)
      setPayment(null)
      setError({ key: 'admin.payments.lookup.notFound', params: { query } })
      return
    }
    if (items.length > 1) {
      // Several bookings match (for example a customer's name): let the Admin pick.
      setBooking(null)
      setPayment(null)
      setPaymentMatches(items)
      return
    }
    await openMatch(items[0])
  }

  async function openMatch(match) {
    setPaymentMatches(null)
    const id = String(match.booking_id)
    setBookingId(id)
    await loadPayment(undefined, id)
    setNotice({ key: 'admin.payments.lookup.found', params: { name: match.customer?.full_name || '—', booking: id } })
  }

  useEffect(() => {
    if (!initialBookingId || autoLookupAttempted.current) return
    autoLookupAttempted.current = true
    void loadPayment()
  }, [initialBookingId, loadPayment])

  async function runAction(operation) {
    if (!booking || action || loading) return
    if (!window.confirm(paymentActionConfirmation(operation, booking, paymentMethod, t, language))) return

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
      setNotice({
        key: operation === 'wallet'
          ? 'admin.payments.notice.walletPaid'
          : operation === 'verify-transfer'
            ? 'admin.payments.notice.transferVerified'
            : operation === 'simulate-paid'
              ? 'admin.payments.notice.statusPaid'
              : operation === 'simulate-failed'
                ? 'admin.payments.notice.statusFailed'
                : 'admin.payments.notice.created',
      })
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
        description={t('admin.payments.description')}
        eyebrow={t('admin.payments.eyebrow')}
        title={t('admin.payments.title')}
      />
      <div aria-label={t('admin.payments.lookup.modeLabel')} className="admin-search-mode" role="group">
        {['booking', 'payment'].map((mode) => (
          <button
            aria-pressed={searchMode === mode}
            className={searchMode === mode ? 'is-active' : ''}
            disabled={loading || Boolean(action)}
            key={mode}
            onClick={() => {
              setSearchMode(mode)
              setError('')
              setPaymentMatches(null)
            }}
            type="button"
          >
            {t(mode === 'booking' ? 'admin.payments.lookup.byBooking' : 'admin.payments.lookup.byPayment')}
          </button>
        ))}
      </div>
      {searchMode === 'payment' ? (
        <form className="admin-filter-bar admin-payment-search" onSubmit={lookupPayment}>
          <label className="admin-lookup-field" htmlFor="payment-lookup-query">
            {t('admin.payments.lookup.label')}
            <input
              aria-describedby="payment-lookup-hint"
              autoComplete="off"
              disabled={loading || Boolean(action)}
              id="payment-lookup-query"
              maxLength="128"
              onChange={(event) => {
                setPaymentQuery(event.target.value)
                setError('')
              }}
              placeholder={t('admin.payments.lookup.placeholder')}
              required
              type="text"
              value={paymentQuery}
            />
            <small id="payment-lookup-hint">{t('admin.payments.lookup.hint')}</small>
          </label>
          <button className="admin-primary-button" disabled={loading || Boolean(action)} type="submit">
            {loading ? t('admin.payments.search.searching') : t('admin.payments.search.submit')}
          </button>
        </form>
      ) : (
      <form className="admin-filter-bar admin-payment-search" onSubmit={loadPayment}>
        <label className="admin-lookup-field" htmlFor="payment-booking-id">
          {t('admin.payments.form.bookingId')}
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
            placeholder={t('admin.payments.form.bookingIdPlaceholder')}
            required
            type="text"
            value={bookingId}
          />
          <small id="payment-booking-id-hint">{t('admin.payments.form.bookingIdHint')}</small>
        </label>
        <button className="admin-primary-button" disabled={loading || Boolean(action)} type="submit">
          {loading ? t('admin.payments.search.searching') : t('admin.payments.search.submit')}
        </button>
      </form>
      )}

      {searchMode === 'payment' && paymentMatches && !loading && (
        <section aria-label={t('admin.payments.lookup.matches')} className="admin-panel admin-wallet-matches">
          <p className="admin-wallet-matches-note">
            {t('admin.payments.lookup.choose', { count: paymentMatches.length })}
          </p>
          <ul>
            {paymentMatches.map((match) => (
              <li key={match.booking_id}>
                <button onClick={() => openMatch(match)} type="button">
                  <strong>{match.customer?.full_name || '—'} · {match.license_plate || '—'}</strong>
                  <span>
                    {t('admin.payments.lookup.matchLine', {
                      booking: match.booking_id,
                      date: match.booking_date,
                      time: match.start_time,
                      amount: formatMoney(match.amount, language),
                    })}
                  </span>
                  <small>
                    {match.payment_id
                      ? `${t('admin.payments.detail.paymentId')} #${match.payment_id} · ${formatMethod(match.payment_method, t)} · ${formatStatusLabel(match.payment_status, language)}`
                      : t('admin.payments.lookup.noPayment')}
                    {' · '}{formatStatusLabel(match.booking_status, language)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error &&<div className="admin-alert admin-alert-error" role="alert">{messageText(error, t)}</div>}
      {notice && !error && <div className="admin-alert admin-alert-success" role="status">{messageText(notice, t)}</div>}
      {loading && <RequestState loading loadingMessage={t('admin.payments.loadingBooking')} />}
      {!booking && <PaymentQueue key={queueRefreshKey} onOpen={openFromQueue} selectedId={searchedBookingId} />}

      {!loading && lookupComplete && paymentLookupComplete && booking && (
        <section className="admin-panel admin-payment-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>{t('admin.payments.bookingTitle', { id: booking.booking_id })}</h3>
              <p>{t('admin.payments.bookingDescription')}</p>
            </div>
            <StatusBadge value={booking.booking_status} />
          </div>

          {bookingParty?.customer && (
            <div className="admin-payment-party">
              <div className="admin-payment-party-item">
                <span className="admin-payment-party-label">{t('admin.payments.party.customer')}</span>
                <strong>{bookingParty.customer.full_name || '—'}</strong>
                <small>
                  {[bookingParty.customer.email, bookingParty.customer.phone].filter(Boolean).join(' · ') || '—'}
                  {' · #'}{bookingParty.customer.user_id}
                </small>
              </div>
              {bookingParty.vehicle && (
                <div className="admin-payment-party-item">
                  <span className="admin-payment-party-label">{t('admin.payments.party.vehicle')}</span>
                  <strong>{bookingParty.vehicle.license_plate || '—'}</strong>
                  <small>{[bookingParty.vehicle.brand_name, bookingParty.vehicle.model_name, bookingParty.vehicle.type_name].filter(Boolean).join(' · ')}</small>
                </div>
              )}
              <div className="admin-payment-party-item">
                <span className="admin-payment-party-label">{t('admin.payments.party.appointment')}</span>
                <strong>{booking.booking_date || '—'}</strong>
                <small>{[booking.start_time, booking.end_time].filter(Boolean).map((value) => String(value).slice(0, 5)).join('–')}</small>
              </div>
              <div className="admin-payment-party-item">
                <span className="admin-payment-party-label">{t('admin.payments.party.wallet')}</span>
                <strong>{walletBalance === null ? '—' : formatMoney(walletBalance, language)}</strong>
                <a
                  className="admin-payment-party-link"
                  href={`/admin/wallet?user_id=${bookingParty.customer.user_id}`}
                  onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return
                    event.preventDefault()
                    window.history.pushState({}, '', event.currentTarget.getAttribute('href'))
                    window.dispatchEvent(new PopStateEvent('popstate'))
                  }}
                >
                  {t('admin.payments.party.openWallet')}
                </a>
              </div>
            </div>
          )}

          {paymentLookupComplete && payment ? (
            <>
              <dl className="admin-payment-details">
                <div><dt>{t('admin.payments.detail.bookingId')}</dt><dd>{payment.booking_id ?? booking.booking_id}</dd></div>
                <div><dt>{t('admin.payments.detail.paymentId')}</dt><dd>{payment.payment_id}</dd></div>
                <div><dt>{t('admin.payments.detail.amount')}</dt><dd>{formatMoney(payment.amount, language)}</dd></div>
                <div><dt>{t('admin.payments.detail.method')}</dt><dd>{formatMethod(payment.payment_method, t)}</dd></div>
                <div><dt>{t('admin.payments.detail.status')}</dt><dd><PaymentStatusBadge payment={payment} /></dd></div>
                <div><dt>{t('admin.payments.detail.paidAt')}</dt><dd>{formatDateTime(payment.paid_at, language)}</dd></div>
                <div className="admin-payment-reference"><dt>{t('admin.payments.detail.reference')}</dt><dd>{payment.transaction_ref || '—'}</dd></div>
              </dl>
              {payment.payment_status === 'PENDING' && payment.payment_method === 'SIMULATED' && (
                <div className="admin-form-actions admin-payment-actions">
                  <button
                    className="admin-primary-button"
                    disabled={Boolean(action)}
                    onClick={() => runAction('simulate-paid')}
                    type="button"
                  >
                    {action === 'simulate-paid' ? t('admin.payments.action.processing') : t('admin.payments.action.simulatePaid')}
                  </button>
                  <button
                    className="admin-secondary-button"
                    disabled={Boolean(action)}
                    onClick={() => runAction('simulate-failed')}
                    type="button"
                  >
                    {action === 'simulate-failed' ? t('admin.payments.action.processing') : t('admin.payments.action.simulateFailed')}
                  </button>
                </div>
              )}
              {payment.payment_status === 'PENDING' && payment.payment_method === 'BANK_TRANSFER' &&
                ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE'].includes(booking.booking_status) && (
                  <div className="admin-payment-create">
                    <label htmlFor="transfer-reference">{t('admin.payments.form.transferReference')}</label>
                    <input id="transfer-reference" maxLength="128" onChange={(event) => setTransferReference(event.target.value)} value={transferReference} />
                    <button className="admin-primary-button" disabled={Boolean(action) || !transferReference.trim()} onClick={() => runAction('verify-transfer')} type="button">
                      {action === 'verify-transfer' ? t('admin.payments.action.verifying') : t('admin.payments.action.verifyTransfer')}
                    </button>
                  </div>
                )}
              {payment.payment_status === 'FAILED' && (
                <p className="admin-payment-guidance">
                  {t(isRetryableFailure(booking, payment)
                    ? 'admin.payments.guidance.retryableFailure'
                    : 'admin.payments.guidance.nonRetryableFailure')}
                </p>
              )}
              {payment.payment_status === 'PAID' && (
                <p className="admin-payment-guidance">
                  {t(payment.payment_method === 'SIMULATED'
                    ? 'admin.payments.guidance.simulatedPaid'
                    : 'admin.payments.guidance.historicalPaid')}
                </p>
              )}
              {payment.payment_status === 'PENDING' && !['SIMULATED', 'WALLET'].includes(payment.payment_method) && (
                <p className="admin-payment-guidance">
                  {t(payment.payment_method === 'CASH'
                    ? 'admin.payments.guidance.awaitingCash'
                    : 'admin.payments.guidance.awaitingVerification')}
                </p>
              )}
            </>
          ) : paymentLookupComplete ? (
            <>
              <dl className="admin-payment-details">
                <div><dt>{t('admin.payments.detail.bookingId')}</dt><dd>{booking.booking_id}</dd></div>
                <div><dt>{t('admin.payments.detail.bookingAmount')}</dt><dd>{formatMoney(booking.final_amount, language)}</dd></div>
                <div><dt>{t('admin.payments.detail.bookingStatus')}</dt><dd><StatusBadge value={booking.booking_status} /></dd></div>
              </dl>
              <p className="admin-payment-guidance">{t('admin.payments.guidance.noPayment')}</p>
            </>
          ) : null}

          {paymentLookupComplete && (canCreatePayment || canPayWithWallet) && (
            <div className="admin-payment-actions">
              {canCreatePayment && (
                <div className="admin-payment-create">
                  <label htmlFor="payment-method">{t('admin.payments.form.method')}</label>
                  <select
                    disabled={Boolean(action)}
                    id="payment-method"
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    value={paymentMethod}
                  >
                    <option value="SIMULATED">{t('admin.payments.method.simulated')}</option>
                    {booking.booking_status !== 'PENDING_PAYMENT' && <option value="CASH">{t('admin.payments.method.cash')}</option>}
                    <option value="BANK_TRANSFER">{t('admin.payments.method.bankTransfer')}</option>
                  </select>
                  <button
                    className="admin-primary-button"
                    disabled={Boolean(action)}
                    onClick={() => runAction('create')}
                    type="button"
                  >
                    {action === 'create' ? t('admin.payments.action.creating') : t('admin.payments.action.create')}
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
                  {action === 'wallet' ? t('admin.payments.action.processing') : t('admin.payments.action.payWithWallet')}
                </button>
              )}
            </div>
          )}
          {walletError && canCheckWalletForDisplay(booking, payment) && (
            <div className="admin-alert admin-alert-error" role="alert">{messageText(walletError, t)}</div>
          )}
          {canCheckWalletForDisplay(booking, payment) &&
            walletBalance !== null &&
            Number(walletBalance) < Number(booking.final_amount) && (
              <p className="admin-payment-guidance">
                {t('admin.payments.guidance.insufficientWallet', {
                  balance: formatMoney(walletBalance, language),
                  amount: formatMoney(booking.final_amount, language),
                })}
              </p>
            )}
          {paymentLookupComplete && !payment && !bookingCanHavePayment && (
            <p className="admin-payment-guidance">{t('admin.payments.guidance.cannotCreate')}</p>
          )}
          {paymentLookupComplete && !payment && !canCreatePayment && bookingCanHavePayment && (
            <p className="admin-payment-guidance">{t('admin.payments.guidance.actionsUnavailable')}</p>
          )}
        </section>
      )}

      {!loading && !lookupComplete && !error && (
        <div className="admin-request-state">
          <strong>{t('admin.payments.initial.title')}</strong>
          <span>{t('admin.payments.initial.description')}</span>
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
