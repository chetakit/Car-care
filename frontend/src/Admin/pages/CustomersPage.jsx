import { useRef, useState } from 'react'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDate, formatDateTime } from '../utils/formatDate.js'
import formatMoney from '../utils/formatMoney.js'

const BOOKING_PAGE_SIZE = 10
const WALLET_TRANSACTION_PAGE_SIZE = 10
const ROLE_OPTIONS = ['ADMIN', 'STAFF', 'CUSTOMER']
const BLANK_MEMBER = { full_name: '', email: '', phone: '', password: '', role: 'STAFF' }
const MIN_PASSWORD_LENGTH = 8

function isValidUserId(value) {
  const id = String(value ?? '')
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))
}

function vehicleLabel(vehicle) {
  return [
    [vehicle.brand_name, vehicle.model_name].filter(Boolean).join(' '),
    vehicle.license_plate,
  ].filter(Boolean).join(' · ') || 'Vehicle details unavailable'
}

function CustomersPage({ user, role = 'CUSTOMER' }) {
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
  const [roleChangeError, setRoleChangeError] = useState('')
  const [roleChangeMessage, setRoleChangeMessage] = useState('')
  const [roleChanging, setRoleChanging] = useState(false)
  const [selectedRoleUser, setSelectedRoleUser] = useState(null)
  const [newRole, setNewRole] = useState('')
  const [statusChangingId, setStatusChangingId] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(BLANK_MEMBER)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const requestId = useRef(0)
  const api = useApi()
  const memberType = role === 'STAFF' ? 'Staff' : 'Customer'
  const memberCountLabel = role === 'STAFF' ? 'staff' : 'customers'

  const params = new URLSearchParams({
    page: String(page),
    limit: '20',
    role,
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

  function openRoleChange(row) {
    if (
      user?.role !== 'ADMIN' ||
      Number(row.user_id) === Number(user?.user_id)
    ) return
    setSelectedRoleUser(row)
    setNewRole(ROLE_OPTIONS.find((value) => value !== row.role) || '')
    setRoleChangeError('')
    setRoleChangeMessage('')
  }

  async function changeRole(event) {
    event.preventDefault()
    if (
      user?.role !== 'ADMIN' ||
      !selectedRoleUser ||
      Number(selectedRoleUser.user_id) === Number(user?.user_id) ||
      !ROLE_OPTIONS.includes(newRole) ||
      newRole === selectedRoleUser.role
    ) return
    const name =
      selectedRoleUser.full_name ||
      selectedRoleUser.email ||
      `User #${selectedRoleUser.user_id}`
    if (!window.confirm(
      `Change ${name}'s role from ${selectedRoleUser.role} to ${newRole}?`,
    )) return

    setRoleChanging(true)
    setRoleChangeError('')
    setRoleChangeMessage('')
    try {
      await api(`/api/admin/users/${selectedRoleUser.user_id}/role`, {
        method: 'PATCH',
        body: { role: newRole },
      })
      setRoleChangeMessage(`${name}'s role is now ${newRole}.`)
      setSelectedRoleUser(null)
      refresh()
    } catch (requestError) {
      setRoleChangeError(requestError.message)
    } finally {
      setRoleChanging(false)
    }
  }

  function openCreate() {
    setCreateForm(BLANK_MEMBER)
    setCreateError('')
    setRoleChangeMessage('')
    setCreateOpen(true)
  }

  async function createMember(event) {
    event.preventDefault()
    if (user?.role !== 'ADMIN' || creating) return
    const phone = createForm.phone.trim()
    if (phone && !/^\d{10}$/.test(phone)) {
      setCreateError('Phone must be exactly 10 digits, or leave it empty.')
      return
    }
    if (createForm.password.length < MIN_PASSWORD_LENGTH) {
      setCreateError(`The temporary password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const response = await api('/api/admin/users', {
        method: 'POST',
        body: {
          full_name: createForm.full_name.trim(),
          email: createForm.email.trim(),
          phone: phone || null,
          password: createForm.password,
          role: createForm.role,
        },
      })
      const created = response.data
      setCreateOpen(false)
      setCreateForm(BLANK_MEMBER)
      setRoleChangeMessage(`${created?.full_name ?? 'The account'} was created as ${created?.role ?? createForm.role}. Share the temporary password with them privately.`)
      refresh()
    } catch (requestError) {
      setCreateError(requestError.message)
    } finally {
      setCreating(false)
    }
  }

  async function toggleStatus(row) {
    if (
      user?.role !== 'ADMIN' ||
      Number(row.user_id) === Number(user?.user_id) ||
      statusChangingId !== null
    ) return
    const nextStatus = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const name = row.full_name || row.email || `User #${row.user_id}`
    const question = nextStatus === 'INACTIVE'
      ? `Suspend ${name}? They will be signed out and cannot sign in until the account is activated again. Their bookings and payments are kept.`
      : `Activate ${name}? They will be able to sign in again.`
    if (!window.confirm(question)) return

    setStatusChangingId(row.user_id)
    setRoleChangeError('')
    setRoleChangeMessage('')
    try {
      await api(`/api/admin/users/${row.user_id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      setRoleChangeMessage(nextStatus === 'INACTIVE' ? `${name} is suspended.` : `${name} is active again.`)
      refresh()
    } catch (requestError) {
      setRoleChangeError(requestError.message)
    } finally {
      setStatusChangingId(null)
    }
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
        description={`Search and review ${memberType.toLowerCase()} accounts and their related records.`}
        eyebrow="PEOPLE"
        title={memberType}
        action={(
          <div className="admin-heading-actions">
            <button className="admin-secondary-button admin-refresh-button" disabled={loading} onClick={refresh} type="button">Refresh</button>
            {role === 'STAFF' && user?.role === 'ADMIN' && (
              <button className="admin-primary-button" onClick={openCreate} type="button">+ Add staff</button>
            )}
          </div>
        )}
      />
      {createOpen && (
        <AdminModal
          description="Create a Staff or Admin account. They sign in with this email and the temporary password you set."
          error={createError}
          onClose={() => { if (!creating) setCreateOpen(false) }}
          onSubmit={createMember}
          open
          submitLabel="Create account"
          submitting={creating}
          title="Add a staff account"
        >
          <div className="admin-form-grid">
            <label className="admin-form-wide">Full name<input autoComplete="off" autoFocus maxLength="100" onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} required value={createForm.full_name} /></label>
            <label>Email<input autoComplete="off" maxLength="150" onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required type="email" value={createForm.email} /></label>
            <label>Phone (optional)<input autoComplete="off" inputMode="numeric" maxLength="10" onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} placeholder="10 digits" value={createForm.phone} /></label>
            <label>Temporary password<input autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required type="password" value={createForm.password} /></label>
            <label>Role<select onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })} value={createForm.role}><option value="STAFF">Staff</option><option value="ADMIN">Admin</option></select></label>
          </div>
        </AdminModal>
      )}
      <form className="admin-filter-bar admin-customer-filters" onSubmit={applyFilters}>
        <input
          aria-label={`Search ${memberCountLabel}`}
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
            <h3>{memberType} accounts</h3>
            <p>{data?.pagination?.total ?? 0} {memberCountLabel} · ordered by name (A–Z)</p>
          </div>
        </div>
        {roleChangeError && !selectedRoleUser && <div className="admin-alert admin-alert-error" role="alert">{roleChangeError}</div>}
        {roleChangeMessage && <div className="admin-alert admin-alert-success" role="status">{roleChangeMessage}</div>}
        <RequestState
          empty={!rows.length}
          emptyDescription="Try a different name, email, phone number, or account status."
          emptyTitle={`No ${memberType.toLowerCase()} accounts match`}
          error={error}
          loading={loading}
          loadingMessage={`Loading ${memberCountLabel} accounts…`}
          onRetry={refresh}
        />
        {!loading && !error && rows.length > 0 && (
          <>
            <DataTable
              columns={[
                { key: 'user_id', label: 'User ID', render: (row) => `#${row.user_id}` },
                { key: 'full_name', label: 'Full name' },
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Phone' },
                { key: 'created_at', label: 'Registered', render: (row) => formatDate(row.created_at) },
                { key: 'status', label: 'Account status', render: (row) => <StatusBadge value={row.status} /> },
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (row) => (
                    <div className="admin-row-actions">
                      <button
                        className="admin-customer-view-button"
                        disabled={customerLoading}
                        onClick={() => openDetails(row)}
                        type="button"
                      >
                        View details
                      </button>
                      {user?.role === 'ADMIN' && (
                        <button
                          aria-label={`Change role for ${row.full_name || row.email || `user ${row.user_id}`}`}
                          className="admin-inline-button"
                          disabled={roleChanging || !isValidUserId(row.user_id) || Number(row.user_id) === Number(user?.user_id)}
                          onClick={() => openRoleChange(row)}
                          type="button"
                        >
                          Change Role
                        </button>
                      )}
                      {user?.role === 'ADMIN' && (
                        <button
                          aria-label={`${row.status === 'ACTIVE' ? 'Suspend' : 'Activate'} ${row.full_name || row.email || `user ${row.user_id}`}`}
                          className={`admin-inline-button ${row.status === 'ACTIVE' ? 'admin-action-danger' : 'admin-action-success'}`}
                          disabled={statusChangingId !== null || !isValidUserId(row.user_id) || Number(row.user_id) === Number(user?.user_id)}
                          onClick={() => toggleStatus(row)}
                          type="button"
                        >
                          {statusChangingId === row.user_id ? 'Saving…' : row.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                        </button>
                      )}
                    </div>
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
          description={`Member account and related records for ${displayedCustomer?.full_name || `#${selectedCustomer.user_id}`}.`}
          error={customerError}
          onClose={closeDetails}
          onSubmit={handleModalSubmit}
          open
          submitLabel="Close"
          submitting={false}
          viewOnly
          title={`Member #${selectedCustomer.user_id}`}
        >
          <div className="admin-customer-detail">
            <nav aria-label="Member record sections" className="admin-customer-section-nav">
              <a href="#admin-customer-information">Account</a>
              <a href="#admin-customer-vehicles">Vehicles</a>
              <a href="#admin-customer-bookings">Bookings</a>
              <a href="#admin-customer-wallet">Wallet</a>
              <a href="#admin-customer-transactions">Transactions</a>
            </nav>

            <section className="admin-customer-detail-section" id="admin-customer-information">
              <h3>Member information</h3>
              <RequestState loading={customerLoading} loadingMessage="Loading member information…" />
              {!customerLoading && displayedCustomer && (
                <dl className="admin-customer-detail-grid">
                  <div><dt>Full name</dt><dd>{displayedCustomer.full_name || '—'}</dd></div>
                  <div><dt>Account status</dt><dd><StatusBadge value={displayedCustomer.status} /></dd></div>
                  <div><dt>Role</dt><dd>{displayedCustomer.role}</dd></div>
                  <div><dt>Email</dt><dd>{displayedCustomer.email || '—'}</dd></div>
                  <div><dt>Phone</dt><dd>{displayedCustomer.phone || '—'}</dd></div>
                  <div><dt>Registered</dt><dd>{formatDateTime(displayedCustomer.created_at)}</dd></div>
                </dl>
              )}
            </section>

            <section className="admin-customer-detail-section" id="admin-customer-vehicles">
              <h3>Vehicles in loaded bookings</h3>
              <p className="admin-customer-section-note">
                This is a partial list from the currently loaded Booking search page, not a complete vehicle list. The Admin API has no member-specific vehicle-list endpoint.
              </p>
              {bookingsError && (
                <p className="admin-customer-section-note">Vehicle information is unavailable because booking history could not be loaded.</p>
              )}
              <RequestState
                empty={!uniqueVehicles.size && !bookingsError}
                emptyDescription="No vehicles were returned in the currently loaded booking results."
                emptyTitle="No vehicle details on this page"
                loading={bookingsLoading}
                loadingMessage="Loading vehicles from booking records…"
              />
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

            <section className="admin-customer-detail-section" id="admin-customer-bookings">
              <h3>Booking history</h3>
              <p className="admin-customer-section-note">
                Results come from the current page of the Admin booking search; pagination may include other matching members and is not a complete member-only history.
              </p>
              <RequestState
                empty={!bookingRows.length}
                emptyDescription="No matching booking records were returned on this search page."
                emptyTitle="No bookings on this page"
                error={bookingsError}
                loading={bookingsLoading}
                loadingMessage="Loading booking history…"
              />
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
            </section>

            <section className="admin-customer-detail-section" id="admin-customer-wallet">
              <h3>Wallet balance</h3>
              <RequestState
                empty={!wallet && !walletError}
                emptyDescription="No wallet record was returned for this member."
                emptyTitle="Wallet balance unavailable"
                error={walletError}
                loading={walletLoading}
                loadingMessage="Loading wallet balance…"
              />
              {!walletLoading && !walletError && wallet && (
                <div className="admin-customer-wallet">
                  <span>Available balance</span>
                  <strong>{formatMoney(wallet.balance)}</strong>
                </div>
              )}
            </section>

            <section className="admin-customer-detail-section" id="admin-customer-transactions">
              <h3>Wallet transaction history</h3>
              <RequestState
                empty={!transactions.length}
                emptyDescription="No wallet transactions were returned for this member."
                emptyTitle="No wallet transactions"
                error={transactionsError}
                loading={transactionsLoading}
                loadingMessage="Loading wallet transactions…"
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
            </section>
          </div>
        </AdminModal>
      )}

      {selectedRoleUser && (
        <AdminModal
          description={`Choose a new role for ${selectedRoleUser.full_name || selectedRoleUser.email || `User #${selectedRoleUser.user_id}`}. Their current role is ${selectedRoleUser.role}.`}
          error={roleChangeError}
          onClose={() => {
            if (!roleChanging) setSelectedRoleUser(null)
          }}
          onSubmit={changeRole}
          open
          submitLabel="Save role"
          submitting={roleChanging}
          title="Change Role"
        >
          <label className="admin-form-field">
            <span>New role</span>
            <select
              onChange={(event) => setNewRole(event.target.value)}
              value={newRole}
            >
              {ROLE_OPTIONS.map((value) => (
                <option disabled={value === selectedRoleUser.role} key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </AdminModal>
      )}
    </div>
  )
}

export default CustomersPage
