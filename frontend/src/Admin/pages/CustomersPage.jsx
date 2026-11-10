import { useRef, useState } from 'react'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import formatMoney from '../utils/formatMoney.js'

const BOOKING_PAGE_SIZE = 10
const WALLET_TRANSACTION_PAGE_SIZE = 10

function formatDate(value) {
  if (!value) return '—'
  const date = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return String(value)
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value).replace('T', ' ').replace(/\.000Z$/, '')
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

function vehicleLabel(vehicle) {
  return [
    [vehicle.brand_name, vehicle.model_name].filter(Boolean).join(' '),
    vehicle.license_plate,
  ].filter(Boolean).join(' · ') || 'Vehicle details unavailable'
}

function CustomersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [appliedSearch, setAppliedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [appliedStatus, setAppliedStatus] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [customerError, setCustomerError] = useState('')
  const [customerLoading, setCustomerLoading] = useState(false)
  const [bookingRows, setBookingRows] = useState([])
  const [bookingPagination, setBookingPagination] = useState(null)
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState('')
  const [bookingPayments, setBookingPayments] = useState({})
  const [wallet, setWallet] = useState(null)
  const [walletError, setWalletError] = useState('')
  const [walletLoading, setWalletLoading] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [transactionPagination, setTransactionPagination] = useState(null)
  const [transactionsError, setTransactionsError] = useState('')
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const requestId = useRef(0)
  const api = useApi()

  const params = new URLSearchParams({
    page: String(page),
    limit: '20',
    role: 'CUSTOMER',
  })
  if (appliedSearch) params.set('search', appliedSearch)
  if (appliedStatus) params.set('status', appliedStatus)
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/users?${params}`)
  const rows = data?.items ?? []

  function applyFilters(event) {
    event.preventDefault()
    setPage(1)
    setAppliedSearch(search.trim())
    setAppliedStatus(status)
  }

  async function loadBookingHistory(userId, email, currentPage, activeRequestId) {
    setBookingsLoading(true)
    setBookingsError('')
    setBookingPayments({})
    try {
      const query = new URLSearchParams({
        page: String(currentPage),
        limit: String(BOOKING_PAGE_SIZE),
        search: email,
      })
      const response = await api(`/api/admin/bookings?${query}`)
      const matchingBookings = (response.data?.items ?? []).filter(
        (item) => Number(item.user_id) === Number(userId),
      )
      if (requestId.current !== activeRequestId) return
      setBookingRows(matchingBookings)
      setBookingPagination(response.data?.pagination ?? null)
      setBookingsLoading(false)

      const paymentResults = await Promise.allSettled(
        matchingBookings.map(async (booking) => {
          try {
            const paymentResponse = await api(`/api/payments/${booking.booking_id}`)
            return { bookingId: booking.booking_id, payment: paymentResponse.data, error: '' }
          } catch (requestError) {
            if (requestError.status === 404) {
              return { bookingId: booking.booking_id, payment: null, error: '' }
            }
            return { bookingId: booking.booking_id, payment: null, error: requestError.message }
          }
        }),
      )
      if (requestId.current !== activeRequestId) return
      const paymentsByBooking = {}
      paymentResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          paymentsByBooking[result.value.bookingId] = result.value
        } else {
          paymentsByBooking[matchingBookings[index].booking_id] = {
            payment: null,
            error: result.reason instanceof Error ? result.reason.message : 'Payment could not be loaded.',
          }
        }
      })
      setBookingPayments(paymentsByBooking)
    } catch (requestError) {
      if (requestId.current === activeRequestId) {
        setBookingsError(requestError.message)
        setBookingRows([])
        setBookingPagination(null)
      }
    } finally {
      if (requestId.current === activeRequestId) setBookingsLoading(false)
    }
  }

  async function loadWallet(userId, activeRequestId) {
    setWalletLoading(true)
    setWalletError('')
    try {
      const query = new URLSearchParams({ user_id: String(userId) })
      const response = await api(`/api/wallet?${query}`)
      if (requestId.current === activeRequestId) setWallet(response.data)
    } catch (requestError) {
      if (requestId.current === activeRequestId) setWalletError(requestError.message)
    } finally {
      if (requestId.current === activeRequestId) setWalletLoading(false)
    }
  }

  async function loadTransactions(userId, currentPage, activeRequestId) {
    setTransactionsLoading(true)
    setTransactionsError('')
    try {
      const query = new URLSearchParams({
        user_id: String(userId),
        page: String(currentPage),
        limit: String(WALLET_TRANSACTION_PAGE_SIZE),
      })
      const response = await api(`/api/wallet/transactions?${query}`)
      if (requestId.current === activeRequestId) {
        setTransactions(response.data?.items ?? [])
        setTransactionPagination(response.data?.pagination ?? null)
      }
    } catch (requestError) {
      if (requestId.current === activeRequestId) {
        setTransactionsError(requestError.message)
        setTransactions([])
        setTransactionPagination(null)
      }
    } finally {
      if (requestId.current === activeRequestId) setTransactionsLoading(false)
    }
  }

  async function openDetails(row) {
    const activeRequestId = ++requestId.current
    setSelectedCustomer(row)
    setCustomer(null)
    setCustomerError('')
    setCustomerLoading(true)
    setBookingRows([])
    setBookingPagination(null)
    setBookingsError('')
    setBookingPayments({})
    setWallet(null)
    setWalletError('')
    setTransactions([])
    setTransactionPagination(null)
    setTransactionsError('')

    try {
      const response = await api(`/api/admin/users/${row.user_id}`)
      if (requestId.current !== activeRequestId) return
      setCustomer(response.data)
    } catch (requestError) {
      if (requestId.current === activeRequestId) setCustomerError(requestError.message)
    } finally {
      if (requestId.current === activeRequestId) setCustomerLoading(false)
    }

    if (requestId.current !== activeRequestId) return
    await Promise.all([
      loadBookingHistory(row.user_id, row.email, 1, activeRequestId),
      loadWallet(row.user_id, activeRequestId),
      loadTransactions(row.user_id, 1, activeRequestId),
    ])
  }

  function closeDetails() {
    requestId.current += 1
    setSelectedCustomer(null)
    setCustomer(null)
    setBookingRows([])
    setBookingPayments({})
    setTransactions([])
  }

  function changeBookingPage(nextPage) {
    if (!selectedCustomer || bookingsLoading) return
    loadBookingHistory(
      selectedCustomer.user_id,
      customer?.email ?? selectedCustomer.email,
      nextPage,
      requestId.current,
    )
  }

  function changeTransactionPage(nextPage) {
    if (!selectedCustomer || transactionsLoading) return
    loadTransactions(selectedCustomer.user_id, nextPage, requestId.current)
  }

  function handleModalSubmit(event) {
    event.preventDefault()
    closeDetails()
  }

  const displayedCustomer = customer ?? selectedCustomer
  const uniqueVehicles = new Map()
  bookingRows.forEach((booking) => {
    if (booking.vehicle_id !== null && booking.vehicle_id !== undefined) {
      uniqueVehicles.set(booking.vehicle_id, booking)
    }
  })

  return (
    <div className="admin-customers-page">
      <PageHeading
        description="Search and review customer accounts and their related records."
        eyebrow="PEOPLE"
        title="Customers"
        action={<button className="admin-secondary-button" disabled={loading} onClick={refresh} type="button">Refresh</button>}
      />
      <form className="admin-filter-bar admin-customer-filters" onSubmit={applyFilters}>
        <input
          aria-label="Search customers"
          maxLength="100"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email or phone"
          value={search}
        />
        <select
          aria-label="Account status"
          onChange={(event) => setStatus(event.target.value)}
          value={status}
        >
          <option value="">All account statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <button className="admin-primary-button" disabled={loading} type="submit">Search</button>
      </form>

      <section className="admin-panel admin-data-panel admin-customers-panel">
        <div className="admin-panel-heading">
          <div>
            <h3>Customer accounts</h3>
            <p>{data?.pagination?.total ?? 0} customers · ordered by name (A–Z)</p>
          </div>
        </div>
        <RequestState empty={!rows.length} error={error} loading={loading} onRetry={refresh} />
        {!loading && !error && rows.length > 0 && (
          <>
            <DataTable
              columns={[
                { key: 'user_id', label: 'Customer ID', render: (row) => `#${row.user_id}` },
                { key: 'full_name', label: 'Full name' },
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Phone' },
                { key: 'created_at', label: 'Registered', render: (row) => formatDate(row.created_at) },
                { key: 'status', label: 'Account status', render: (row) => <StatusBadge value={row.status} /> },
                {
                  key: 'actions',
                  label: 'Details',
                  render: (row) => (
                    <button
                      className="admin-customer-view-button"
                      disabled={customerLoading}
                      onClick={() => openDetails(row)}
                      type="button"
                    >
                      View details
                    </button>
                  ),
                },
              ]}
              rowKey={(row) => row.user_id}
              rows={rows}
            />
            <Pagination onPageChange={setPage} pagination={data?.pagination} />
          </>
        )}
      </section>

      {selectedCustomer && (
        <AdminModal
          description={`Customer account and related records for ${displayedCustomer?.full_name || `#${selectedCustomer.user_id}`}.`}
          error={customerError}
          onClose={closeDetails}
          onSubmit={handleModalSubmit}
          open
          submitLabel="Close"
          submitting={false}
          title={`Customer #${selectedCustomer.user_id}`}
        >
          <div className="admin-customer-detail">
            {customerLoading ? (
              <RequestState loading />
            ) : displayedCustomer && (
              <section className="admin-customer-detail-section">
                <h3>Customer information</h3>
                <dl className="admin-customer-detail-grid">
                  <div><dt>Full name</dt><dd>{displayedCustomer.full_name || '—'}</dd></div>
                  <div><dt>Account status</dt><dd><StatusBadge value={displayedCustomer.status} /></dd></div>
                  <div><dt>Email</dt><dd>{displayedCustomer.email || '—'}</dd></div>
                  <div><dt>Phone</dt><dd>{displayedCustomer.phone || '—'}</dd></div>
                  <div><dt>Registered</dt><dd>{formatDateTime(displayedCustomer.created_at)}</dd></div>
                </dl>
              </section>
            )}

            <section className="admin-customer-detail-section">
              <h3>Registered vehicles</h3>
              <p className="admin-customer-section-note">
                The current Admin API has no customer vehicle-list endpoint. Vehicles below are only those in the currently loaded page of this customer’s booking records.
              </p>
              <RequestState empty={!uniqueVehicles.size} error={bookingsError} loading={bookingsLoading} />
              {!bookingsLoading && !bookingsError && uniqueVehicles.size > 0 && (
                <div className="admin-customer-record-list">
                  {[...uniqueVehicles.values()].map((vehicle) => (
                    <div className="admin-customer-record" key={vehicle.vehicle_id}>
                      <div>
                        <strong>{vehicleLabel(vehicle)}</strong>
                        <small>{[vehicle.type_name, vehicle.production_year].filter(Boolean).join(' · ') || 'Vehicle details as returned by Booking API'}</small>
                      </div>
                      <span>#{vehicle.vehicle_id}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="admin-customer-detail-section">
              <h3>Booking history</h3>
              <RequestState empty={!bookingRows.length} error={bookingsError} loading={bookingsLoading} />
              {!bookingsLoading && !bookingsError && bookingRows.length > 0 && (
                <>
                  <div className="admin-customer-record-list">
                    {bookingRows.map((booking) => {
                      const paymentInfo = bookingPayments[booking.booking_id]
                      return (
                        <article className="admin-customer-booking" key={booking.booking_id}>
                          <div className="admin-customer-booking-heading">
                            <strong>Booking #{booking.booking_id}</strong>
                            <StatusBadge value={booking.booking_status} />
                          </div>
                          <dl className="admin-customer-booking-grid">
                            <div><dt>Vehicle</dt><dd>{vehicleLabel(booking)}</dd></div>
                            <div><dt>Date</dt><dd>{formatDate(booking.booking_date)} · {String(booking.start_time ?? '').slice(0, 5) || '—'}</dd></div>
                            <div><dt>Amount</dt><dd>{formatMoney(booking.final_amount)}</dd></div>
                            <div>
                              <dt>Payment</dt>
                              <dd>
                                {paymentInfo ? paymentInfo.error
                                  ? <span className="admin-customer-unavailable">Unavailable: {paymentInfo.error}</span>
                                  : paymentInfo.payment
                                    ? <><StatusBadge value={paymentInfo.payment.payment_status} /> <span>{paymentInfo.payment.payment_method}</span></>
                                    : <span>Not available</span>
                                  : 'Loading…'}
                              </dd>
                            </div>
                          </dl>
                          {paymentInfo?.payment?.paid_at && (
                            <p className="admin-customer-payment-date">Paid {formatDateTime(paymentInfo.payment.paid_at)}</p>
                          )}
                        </article>
                      )
                    })}
                  </div>
                  <Pagination onPageChange={changeBookingPage} pagination={bookingPagination} />
                </>
              )}
              {!bookingsError && bookingPagination?.total === 0 && !bookingsLoading && (
                <p className="admin-customer-section-note">No bookings found for this customer.</p>
              )}
            </section>

            <section className="admin-customer-detail-section">
              <h3>Wallet balance</h3>
              <RequestState error={walletError} loading={walletLoading} />
              {!walletLoading && !walletError && wallet && (
                <div className="admin-customer-wallet">
                  <span>Available balance</span>
                  <strong>{formatMoney(wallet.balance)}</strong>
                </div>
              )}
            </section>

            <section className="admin-customer-detail-section">
              <h3>Wallet transaction history</h3>
              <RequestState
                empty={!transactions.length}
                error={transactionsError}
                loading={transactionsLoading}
              />
              {!transactionsLoading && !transactionsError && transactions.length > 0 && (
                <>
                  <div className="admin-customer-record-list">
                    {transactions.map((transaction) => (
                      <div className="admin-customer-transaction" key={transaction.wallet_transaction_id}>
                        <div>
                          <strong><StatusBadge value={transaction.transaction_type} /></strong>
                          <small>{transaction.description || '—'} · {formatDateTime(transaction.created_at)}</small>
                        </div>
                        <span>{formatMoney(transaction.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <Pagination onPageChange={(nextPage) => changeTransactionPage(nextPage)} pagination={transactionPagination} />
                </>
              )}
              {!transactionsError && transactionPagination?.total === 0 && !transactionsLoading && (
                <p className="admin-customer-section-note">No Wallet transactions found.</p>
              )}
            </section>
          </div>
        </AdminModal>
      )}
    </div>
  )
}

export default CustomersPage
