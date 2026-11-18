import { useCallback, useEffect, useRef, useState } from 'react'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, PaymentStatusBadge, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDate, formatDateTime } from '../utils/formatDate.js'
import formatStatusLabel from '../utils/formatStatusLabel.js'
import formatMoney from '../utils/formatMoney.js'
import { ADMIN_PAGE_SIZE } from '../utils/pageSize.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const REFUNDS_PAGE_SIZE = 100
const MAX_BOOKING_ID = 2147483647
const BOOKING_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW']
const PAYMENT_METHOD_LABEL_KEYS = {
  BANK_TRANSFER: 'admin.payments.method.bankTransfer',
  CASH: 'admin.payments.method.cash',
  SIMULATED: 'admin.payments.method.simulated',
  WALLET: 'admin.payments.method.wallet',
}

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

function paymentMethodLabel(value, t) {
  return PAYMENT_METHOD_LABEL_KEYS[value] ? t(PAYMENT_METHOD_LABEL_KEYS[value]) : value || '—'
}

function scheduleSummary(date, startTime, endTime, language) {
  const day = formatDate(date, language)
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
  const { language, t } = useLanguage()
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
  const params = new URLSearchParams({ page: String(page), limit: String(ADMIN_PAGE_SIZE) })
  new URLSearchParams(query).forEach((value, key) => params.set(key, value))
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/bookings?${params}`)
  const rows = data?.items ?? []

  function applyFilters(event) {
    event.preventDefault()
    if (filters.date_from && filters.date_to && filters.date_to < filters.date_from) {
      setFilterError('admin.bookings.filters.dateRangeError')
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
        ? {
            key: 'admin.bookings.cancel.successWithRefund',
            params: {
              fee: refund.cancellation_fee,
              refund: refund.refund_amount,
            },
          }
        : { key: 'admin.bookings.cancel.successWithoutRefund' })
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
        description={t('admin.bookings.description')}
        eyebrow={t('admin.bookings.eyebrow')}
        title={t('admin.bookings.title')}
        action={<button className="admin-secondary-button admin-refresh-button" disabled={loading} onClick={refresh} type="button">{t('admin.bookings.refresh')}</button>}
      />
      <form className="admin-filter-bar admin-booking-filters" onSubmit={applyFilters}>
        <input
          aria-label={t('admin.bookings.filters.searchLabel')}
          maxLength="100"
          onChange={(event) => { setFilters({ ...filters, search: event.target.value }); setFilterError('') }}
          placeholder={t('admin.bookings.filters.searchPlaceholder')}
          value={filters.search}
        />
        <select
          aria-label={t('admin.bookings.filters.bookingStatusLabel')}
          onChange={(event) => { setFilters({ ...filters, booking_status: event.target.value }); setFilterError('') }}
          value={filters.booking_status}
        >
          <option value="">{t('admin.bookings.filters.allBookingStatuses')}</option>
          {BOOKING_STATUSES.map((value) => <option key={value} value={value}>{formatStatusLabel(value, language)}</option>)}
        </select>
        <select
          aria-label={t('admin.bookings.filters.paymentStatusLabel')}
          onChange={(event) => { setFilters({ ...filters, payment_status: event.target.value }); setFilterError('') }}
          value={filters.payment_status}
        >
          <option value="">{t('admin.bookings.filters.allPaymentStatuses')}</option>
          {['PENDING', 'PAID', 'FAILED'].map((value) => <option key={value} value={value}>{formatStatusLabel(value, language)}</option>)}
        </select>
        <label>
          {t('admin.bookings.filters.from')}
          <input
            aria-label={t('admin.bookings.filters.dateFromLabel')}
            onChange={(event) => { setFilters({ ...filters, date_from: event.target.value }); setFilterError('') }}
            type="date"
            value={filters.date_from}
          />
        </label>
        <label>
          {t('admin.bookings.filters.to')}
          <input
            aria-label={t('admin.bookings.filters.dateToLabel')}
            onChange={(event) => { setFilters({ ...filters, date_to: event.target.value }); setFilterError('') }}
            type="date"
            value={filters.date_to}
          />
        </label>
        <select
          aria-label={t('admin.bookings.filters.sortLabel')}
          onChange={(event) => { setFilters({ ...filters, sort: event.target.value }); setFilterError('') }}
          value={filters.sort}
        >
          <option value="newest">{t('admin.bookings.filters.newestFirst')}</option>
          <option value="oldest">{t('admin.bookings.filters.oldestFirst')}</option>
        </select>
        <button className="admin-primary-button" disabled={loading} type="submit">{t('admin.bookings.filters.submit')}</button>
      </form>
      {filterError && <div className="admin-alert admin-alert-error" role="alert">{t(filterError)}</div>}

      <section className="admin-panel admin-data-panel admin-bookings-panel">
        <div className="admin-panel-heading">
          <div>
            <h3>{t('admin.bookings.records.title')}</h3>
            <p>{t('admin.bookings.records.description', {
              total: (data?.pagination?.total ?? 0).toLocaleString(language === 'TH' ? 'th-TH' : 'en-GB'),
            })}</p>
          </div>
        </div>
        <RequestState
          empty={!rows.length}
          emptyDescription={t('admin.bookings.state.emptyDescription')}
          emptyTitle={t('admin.bookings.state.emptyTitle')}
          error={error}
          loading={loading}
          loadingMessage={t('admin.bookings.state.loading')}
          onRetry={refresh}
        />
        {!loading && !error && rows.length > 0 && (
          <>
            <DataTable
              columns={[
                {
                  key: 'booking_id',
                  label: t('admin.bookings.table.bookingId'),
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
                  label: t('admin.bookings.table.customer'),
                  render: (row) => (
                    <span className="admin-booking-customer">
                      <strong>{row.full_name || '—'}</strong>
                      <small>{row.email || row.phone || ''}</small>
                    </span>
                  ),
                },
                { key: 'vehicle', label: t('admin.bookings.table.vehicle'), render: vehicleSummary, wrap: true },
                {
                  key: 'schedule',
                  label: t('admin.bookings.table.schedule'),
                  render: (row) => (
                    <span className="admin-booking-schedule">
                      <span>{formatDate(row.booking_date, language)}</span>
                      <small>{[formatTime(row.start_time), formatTime(row.end_time)].filter(Boolean).join('–')}</small>
                    </span>
                  ),
                },
                { key: 'final_amount', label: t('admin.bookings.table.amount'), render: (row) => formatMoney(row.final_amount, language) },
                { key: 'booking_status', label: t('admin.bookings.table.bookingStatus'), render: (row) => <StatusBadge value={row.booking_status} /> },
                {
                  key: 'payment_status',
                  label: t('admin.bookings.table.payment'),
                  render: (row) => (
                    <div className="admin-row-actions">
                      {row.payment_status
                        ? <PaymentStatusBadge payment={row} />
                        : <span className="admin-booking-no-payment">{t('admin.bookings.notCreated')}</span>}
                      {isValidBookingId(row.booking_id) ? (
                        <button
                          className="admin-inline-button"
                          onClick={() => onNavigate('payments', { booking_id: String(row.booking_id) })}
                          type="button"
                        >
                          {t('admin.bookings.viewPayment')}
                        </button>
                      ) : (
                        <span className="admin-booking-no-payment">{t('admin.bookings.unavailable')}</span>
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
          description={t('admin.bookings.modal.description', { id: selectedId })}
          error={detailError}
          onClose={closeDetails}
          onSubmit={handleModalSubmit}
          open
          submitLabel={t('admin.common.close')}
          submitting={cancelSubmitting}
          title={t('admin.bookings.modal.title', { id: selectedId })}
          viewOnly
        >
          {detailLoading ? (
            <RequestState loading />
          ) : detail && booking ? (
            <div className="admin-booking-detail">
              {cancelMessage && (
                <div className="admin-alert admin-alert-success" role="status">
                  {t(cancelMessage.key, {
                    ...cancelMessage.params,
                    ...(cancelMessage.key === 'admin.bookings.cancel.successWithRefund' && {
                      fee: formatMoney(cancelMessage.params.fee, language),
                      refund: formatMoney(cancelMessage.params.refund, language),
                    }),
                  })}
                </div>
              )}
              <section className="admin-booking-detail-section">
                <h3>{t('admin.bookings.detail.overview')}</h3>
                <dl className="admin-booking-detail-grid">
                  <div><dt>{t('admin.bookings.detail.bookingStatus')}</dt><dd><StatusBadge value={booking.booking_status} /></dd></div>
                  <div><dt>{t('admin.bookings.detail.paymentStatus')}</dt><dd>{payment?.payment_status
                    ? <PaymentStatusBadge payment={payment} />
                    : <span className="admin-booking-no-payment">{t('admin.bookings.notCreated')}</span>}</dd></div>
                  <div><dt>{t('admin.bookings.detail.bookingDate')}</dt><dd>{scheduleSummary(booking.booking_date, booking.start_time, booking.end_time, language)}</dd></div>
                  <div><dt>{t('admin.bookings.detail.total')}</dt><dd>{formatMoney(booking.total_amount, language)}</dd></div>
                  <div><dt>{t('admin.bookings.detail.discount')}</dt><dd>{formatMoney(booking.discount_amount, language)}</dd></div>
                  <div><dt>{t('admin.bookings.detail.finalAmount')}</dt><dd>{formatMoney(booking.final_amount, language)}</dd></div>
                  {booking.notes && <div className="admin-booking-detail-wide"><dt>{t('admin.bookings.detail.notes')}</dt><dd>{booking.notes}</dd></div>}
                </dl>
              </section>

              <section className="admin-booking-detail-section">
                <h3>{t('admin.bookings.detail.customer')}</h3>
                <dl className="admin-booking-detail-grid">
                  <div><dt>{t('admin.bookings.detail.name')}</dt><dd>{customer?.full_name || '—'}</dd></div>
                  <div><dt>{t('admin.bookings.detail.email')}</dt><dd>{customer?.email || '—'}</dd></div>
                  <div><dt>{t('admin.bookings.detail.phone')}</dt><dd>{customer?.phone || '—'}</dd></div>
                </dl>
              </section>

              <section className="admin-booking-detail-section">
                <h3>{t('admin.bookings.detail.vehicle')}</h3>
                <dl className="admin-booking-detail-grid">
                  <div><dt>{t('admin.bookings.detail.vehicleName')}</dt><dd>{[vehicle?.brand_name, vehicle?.model_name].filter(Boolean).join(' ') || '—'}</dd></div>
                  <div><dt>{t('admin.bookings.detail.type')}</dt><dd>{vehicle?.type_name || '—'}</dd></div>
                  <div><dt>{t('admin.bookings.detail.licensePlate')}</dt><dd>{vehicle?.license_plate || '—'}</dd></div>
                  <div><dt>{t('admin.bookings.detail.year')}</dt><dd>{vehicle?.production_year || '—'}</dd></div>
                  <div><dt>{t('admin.bookings.detail.color')}</dt><dd>{vehicle?.color || '—'}</dd></div>
                  <div><dt>{t('admin.bookings.detail.province')}</dt><dd>{vehicle?.province || '—'}</dd></div>
                </dl>
              </section>

              <section className="admin-booking-detail-section">
                <h3>{t('admin.bookings.detail.schedule')}</h3>
                <dl className="admin-booking-detail-grid">
                  <div><dt>{t('admin.bookings.detail.date')}</dt><dd>{formatDate(schedule?.schedule_date ?? booking.booking_date, language)}</dd></div>
                  <div><dt>{t('admin.bookings.detail.time')}</dt><dd>{[
                    schedule?.start_time ?? booking.start_time,
                    schedule?.end_time ?? booking.end_time,
                  ].map(formatTime).filter(Boolean).join('–') || '—'}</dd></div>
                  <div><dt>{t('admin.bookings.detail.scheduleStatus')}</dt><dd>{schedule?.status ? formatStatusLabel(schedule.status, language) : '—'}</dd></div>
                </dl>
              </section>

              <section className="admin-booking-detail-section">
                <h3>{t('admin.bookings.detail.services')}</h3>
                {services.length ? (
                  <div className="admin-booking-service-list">
                    {services.map((service) => (
                      <div className="admin-booking-service" key={service.booking_service_id}>
                        <div>
                          <strong>{service.service_name}</strong>
                          <small>{t('admin.bookings.detail.durationMinutes', { minutes: service.duration_minutes })}</small>
                        </div>
                        <span>{formatMoney(service.unit_price, language)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="admin-booking-detail-empty">{t('admin.bookings.detail.noServices')}</p>}
              </section>

              <section className="admin-booking-detail-section">
                <h3>{t('admin.bookings.detail.payment')}</h3>
                {payment ? (
                  <dl className="admin-booking-detail-grid">
                    <div><dt>{t('admin.bookings.detail.paymentId')}</dt><dd>{payment.payment_id}</dd></div>
                    <div><dt>{t('admin.bookings.detail.amount')}</dt><dd>{formatMoney(payment.amount, language)}</dd></div>
                    <div><dt>{t('admin.bookings.detail.method')}</dt><dd>{paymentMethodLabel(payment.payment_method, t)}</dd></div>
                    <div><dt>{t('admin.bookings.detail.status')}</dt><dd><PaymentStatusBadge payment={payment} /></dd></div>
                    <div><dt>{t('admin.bookings.detail.paidAt')}</dt><dd>{formatDateTime(payment.paid_at, language)}</dd></div>
                    <div className="admin-booking-detail-wide"><dt>{t('admin.bookings.detail.transactionReference')}</dt><dd>{payment.transaction_ref || '—'}</dd></div>
                  </dl>
                ) : <p className="admin-booking-detail-empty">{t('admin.bookings.detail.noPayment')}</p>}
              </section>

              <section className="admin-booking-detail-section">
                <h3>{t('admin.bookings.detail.refunds')}</h3>
                {refundError ? (
                  <div className="admin-alert admin-alert-error" role="alert">{refundError}</div>
                ) : refunds.length ? (
                  <div className="admin-booking-refund-list">
                    {refunds.map((refund) => (
                      <div className="admin-booking-refund" key={refund.refund_id}>
                        <div>
                          <strong>{t('admin.bookings.detail.refundId', { id: refund.refund_id })}</strong>
                          <small>{t('admin.bookings.detail.refundPaymentFee', {
                            id: refund.payment_id,
                            fee: formatMoney(refund.cancellation_fee, language),
                          })}</small>
                        </div>
                        <div>
                          <strong>{formatMoney(refund.refund_amount, language)}</strong>
                          <small><StatusBadge value={refund.refund_status} /> · {formatDateTime(refund.processed_at, language)}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="admin-booking-detail-empty">{t('admin.bookings.detail.noRefunds')}</p>
                )}
              </section>

              {canCancel && (
                <section className="admin-booking-detail-section admin-booking-cancel">
                  <h3>{t('admin.bookings.cancel.title')}</h3>
                  {preview ? (
                    <dl className="admin-booking-detail-grid">
                      <div><dt>{t('admin.bookings.cancel.paid')}</dt><dd>{formatMoney(preview.paid, language)}</dd></div>
                      <div><dt>{t('admin.bookings.cancel.fee')}</dt><dd>{formatMoney(preview.fee, language)}</dd></div>
                      <div><dt>{t('admin.bookings.cancel.refund')}</dt><dd><strong>{formatMoney(preview.refund, language)}</strong></dd></div>
                    </dl>
                  ) : (
                    <p className="admin-booking-detail-empty">{t('admin.bookings.cancel.notPaid')}</p>
                  )}
                  <label className="admin-booking-cancel-reason">
                    <span>{t('admin.bookings.cancel.reason')}</span>
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
                          {cancelSubmitting
                            ? t('admin.bookings.cancel.submitting')
                            : t('admin.bookings.cancel.confirm')}
                        </button>
                        <button className="admin-secondary-button" disabled={cancelSubmitting} onClick={() => setCancelConfirming(false)} type="button">
                          {t('admin.bookings.cancel.keepBooking')}
                        </button>
                      </>
                    ) : (
                      <button className="admin-secondary-button" onClick={() => setCancelConfirming(true)} type="button">
                        {t('admin.bookings.cancel.action')}
                      </button>
                    )}
                  </div>
                </section>
              )}

              <section className="admin-booking-detail-section">
                <h3>{t('admin.bookings.detail.statusHistory')}</h3>
                {history.length ? (
                  <ol className="admin-booking-history">
                    {history.map((item) => (
                      <li key={item.history_id}>
                        <div className="admin-booking-history-status">
                          {item.old_status ? <StatusBadge value={item.old_status} /> : <span>{t('admin.bookings.detail.created')}</span>}
                          {item.old_status && <span aria-hidden="true">→</span>}
                          <StatusBadge value={item.new_status} />
                        </div>
                        <p>{item.reason || t('admin.bookings.detail.noReason')}</p>
                        <small>{formatDateTime(item.created_at, language)} · {item.changed_by_name || t('admin.bookings.detail.userId', { id: item.changed_by })}</small>
                      </li>
                    ))}
                  </ol>
                ) : <p className="admin-booking-detail-empty">{t('admin.bookings.detail.noStatusHistory')}</p>}
              </section>
            </div>
          ) : null}
        </AdminModal>
      )}
    </div>
  )
}

export default BookingsPage
