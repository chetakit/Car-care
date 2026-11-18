import { useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDate, formatDateTime } from '../utils/formatDate.js'
import formatMoney from '../utils/formatMoney.js'
import { ADMIN_PAGE_SIZE } from '../utils/pageSize.js'

const BOOKING_PAGE_SIZE = 10
const WALLET_TRANSACTION_PAGE_SIZE = 10
const ROLE_OPTIONS = ['ADMIN', 'STAFF', 'CUSTOMER']
const BLANK_MEMBER = { full_name: '', email: '', phone: '', password: '', role: 'STAFF' }
const MIN_PASSWORD_LENGTH = 8

function isValidUserId(value) {
  const id = String(value ?? '')
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))
}

function messageText(message, t) {
  return message?.key ? t(message.key, message.params) : message
}

function vehicleLabel(vehicle, t) {
  return [
    [vehicle.brand_name, vehicle.model_name].filter(Boolean).join(' '),
    vehicle.license_plate,
  ].filter(Boolean).join(' · ') || t('admin.members.vehicle.detailsUnavailable')
}

function CustomersPage({ user, role = 'CUSTOMER' }) {
  const { language, t } = useLanguage()
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
  const memberType = t(role === 'STAFF' ? 'admin.members.staff' : 'admin.members.customer')
  const memberTypes = t(role === 'STAFF' ? 'admin.members.staffPlural' : 'admin.members.customers')

  const params = new URLSearchParams({
    page: String(page),
    limit: String(ADMIN_PAGE_SIZE),
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
      `#${selectedRoleUser.user_id}`
    if (!window.confirm(
      t('admin.members.confirm.roleChange', {
        name,
        oldRole: selectedRoleUser.role,
        newRole,
      }),
    )) return

    setRoleChanging(true)
    setRoleChangeError('')
    setRoleChangeMessage('')
    try {
      await api(`/api/admin/users/${selectedRoleUser.user_id}/role`, {
        method: 'PATCH',
        body: { role: newRole },
      })
      setRoleChangeMessage({
        key: 'admin.members.feedback.roleChanged',
        params: { name, role: newRole },
      })
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
      setCreateError({ key: 'admin.staff.validation.phone' })
      return
    }
    if (createForm.password.length < MIN_PASSWORD_LENGTH) {
      setCreateError({
        key: 'admin.staff.validation.passwordLength',
        params: { length: MIN_PASSWORD_LENGTH },
      })
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
      setRoleChangeMessage({
        key: created?.full_name
          ? 'admin.staff.feedback.created'
          : 'admin.staff.feedback.createdWithoutName',
        params: {
          name: created?.full_name ?? '',
          role: created?.role ?? createForm.role,
        },
      })
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
    const name = row.full_name || row.email || `#${row.user_id}`
    const question = nextStatus === 'INACTIVE'
      ? t('admin.members.confirm.suspend', { name })
      : t('admin.members.confirm.activate', { name })
    if (!window.confirm(question)) return

    setStatusChangingId(row.user_id)
    setRoleChangeError('')
    setRoleChangeMessage('')
    try {
      await api(`/api/admin/users/${row.user_id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      setRoleChangeMessage({
        key: nextStatus === 'INACTIVE'
          ? 'admin.members.feedback.suspended'
          : 'admin.members.feedback.activeAgain',
        params: { name },
      })
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
            error: result.reason instanceof Error
              ? result.reason.message
              : { key: 'admin.members.bookings.paymentLoadError' },
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
        description={t('admin.members.description', { member: memberTypes })}
        eyebrow={t('admin.members.eyebrow')}
        title={memberType}
        action={(
          <div className="admin-heading-actions">
            <button className="admin-secondary-button admin-refresh-button" disabled={loading} onClick={refresh} type="button">{t('admin.members.refresh')}</button>
            {role === 'STAFF' && user?.role === 'ADMIN' && (
              <button className="admin-primary-button" onClick={openCreate} type="button">{t('admin.staff.add')}</button>
            )}
          </div>
        )}
      />
      {createOpen && (
        <AdminModal
          description={t('admin.staff.modal.description')}
          error={messageText(createError, t)}
          onClose={() => { if (!creating) setCreateOpen(false) }}
          onSubmit={createMember}
          open
          submitLabel={t('admin.staff.modal.submit')}
          submitting={creating}
          title={t('admin.staff.modal.title')}
        >
          <div className="admin-form-grid">
            <label className="admin-form-wide">{t('admin.staff.form.fullName')}<input autoComplete="off" autoFocus maxLength="100" onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} required value={createForm.full_name} /></label>
            <label>{t('admin.staff.form.email')}<input autoComplete="off" maxLength="150" onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required type="email" value={createForm.email} /></label>
            <label>{t('admin.staff.form.phoneOptional')}<input autoComplete="off" inputMode="numeric" maxLength="10" onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} placeholder={t('admin.staff.form.phonePlaceholder')} value={createForm.phone} /></label>
            <label>{t('admin.staff.form.temporaryPassword')}<input autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required type="password" value={createForm.password} /></label>
            <label>{t('admin.staff.form.role')}<select onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })} value={createForm.role}><option value="STAFF">{t('admin.staff.form.staffRole')}</option><option value="ADMIN">{t('admin.staff.form.adminRole')}</option></select></label>
          </div>
        </AdminModal>
      )}
      <form className="admin-filter-bar admin-customer-filters" onSubmit={applyFilters}>
        <input
          aria-label={t('admin.members.search.label', { member: memberTypes })}
          maxLength="100"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('admin.members.search.placeholder')}
          value={search}
        />
        <select
          aria-label={t('admin.members.status.label')}
          onChange={(event) => setStatus(event.target.value)}
          value={status}
        >
          <option value="">{t('admin.members.status.all')}</option>
          <option value="ACTIVE">{t('admin.status.active')}</option>
          <option value="INACTIVE">{t('admin.status.inactive')}</option>
        </select>
        <button className="admin-primary-button" disabled={loading} type="submit">{t('admin.members.search.submit')}</button>
      </form>

      <section className="admin-panel admin-data-panel admin-customers-panel">
        <div className="admin-panel-heading">
          <div>
            <h3>{t('admin.members.accountsTitle', { member: memberTypes })}</h3>
            <p>{t('admin.members.accountsSummary', {
              count: data?.pagination?.total ?? 0,
              member: memberTypes,
            })}</p>
          </div>
        </div>
        {roleChangeError && !selectedRoleUser && <div className="admin-alert admin-alert-error" role="alert">{roleChangeError}</div>}
        {roleChangeMessage && <div className="admin-alert admin-alert-success" role="status">{messageText(roleChangeMessage, t)}</div>}
        <RequestState
          empty={!rows.length}
          emptyDescription={t('admin.members.state.emptyDescription')}
          emptyTitle={t('admin.members.state.emptyTitle', { member: memberTypes })}
          error={error}
          loading={loading}
          loadingMessage={t('admin.members.state.loading', { member: memberTypes })}
          onRetry={refresh}
        />
        {!loading && !error && rows.length > 0 && (
          <>
            <DataTable
              columns={[
                { key: 'user_id', label: t('admin.members.table.userId'), render: (row) => `#${row.user_id}` },
                { key: 'full_name', label: t('admin.members.table.fullName'), wrap: true },
                { key: 'email', label: t('admin.members.table.email') },
                { key: 'phone', label: t('admin.members.table.phone') },
                { key: 'created_at', label: t('admin.members.table.registered'), render: (row) => formatDate(row.created_at, language) },
                { key: 'status', label: t('admin.members.table.status'), render: (row) => <StatusBadge value={row.status} /> },
                {
                  key: 'actions',
                  label: t('admin.members.table.actions'),
                  render: (row) => (
                    <div className="admin-row-actions">
                      <button
                        className="admin-customer-view-button"
                        disabled={customerLoading}
                        onClick={() => openDetails(row)}
                        type="button"
                      >
                        {t('admin.members.action.viewDetails')}
                      </button>
                      {user?.role === 'ADMIN' && (
                        <button
                          aria-label={t('admin.members.action.changeRoleLabel', {
                            name: row.full_name || row.email || `#${row.user_id}`,
                          })}
                          className="admin-inline-button"
                          disabled={roleChanging || !isValidUserId(row.user_id) || Number(row.user_id) === Number(user?.user_id)}
                          onClick={() => openRoleChange(row)}
                          type="button"
                        >
                          {t('admin.members.action.changeRole')}
                        </button>
                      )}
                      {user?.role === 'ADMIN' && (
                        <button
                          aria-label={t(
                            row.status === 'ACTIVE'
                              ? 'admin.members.action.suspendLabel'
                              : 'admin.members.action.activateLabel',
                            { name: row.full_name || row.email || `#${row.user_id}` },
                          )}
                          className={`admin-inline-button ${row.status === 'ACTIVE' ? 'admin-action-danger' : 'admin-action-success'}`}
                          disabled={statusChangingId !== null || !isValidUserId(row.user_id) || Number(row.user_id) === Number(user?.user_id)}
                          onClick={() => toggleStatus(row)}
                          type="button"
                        >
                          {statusChangingId === row.user_id
                            ? t('admin.common.saving')
                            : t(row.status === 'ACTIVE'
                              ? 'admin.members.action.suspend'
                              : 'admin.members.action.activate')}
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
          description={t('admin.members.details.description', {
            name: displayedCustomer?.full_name || `#${selectedCustomer.user_id}`,
          })}
          error={customerError}
          onClose={closeDetails}
          onSubmit={handleModalSubmit}
          open
          submitLabel={t('admin.common.close')}
          submitting={false}
          viewOnly
          title={t('admin.members.details.title', { id: selectedCustomer.user_id })}
        >
          <div className="admin-customer-detail">
            <nav aria-label={t('admin.members.details.navigation')} className="admin-customer-section-nav">
              <a href="#admin-customer-information">{t('admin.members.details.account')}</a>
              <a href="#admin-customer-vehicles">{t('admin.members.details.vehicles')}</a>
              <a href="#admin-customer-bookings">{t('admin.members.details.bookings')}</a>
              <a href="#admin-customer-wallet">{t('admin.members.details.wallet')}</a>
              <a href="#admin-customer-transactions">{t('admin.members.details.transactions')}</a>
            </nav>

            <section className="admin-customer-detail-section" id="admin-customer-information">
              <h3>{t('admin.members.details.information')}</h3>
              <RequestState loading={customerLoading} loadingMessage={t('admin.members.details.loadingInformation')} />
              {!customerLoading && displayedCustomer && (
                <dl className="admin-customer-detail-grid">
                  <div><dt>{t('admin.members.details.fullName')}</dt><dd>{displayedCustomer.full_name || '—'}</dd></div>
                  <div><dt>{t('admin.members.details.accountStatus')}</dt><dd><StatusBadge value={displayedCustomer.status} /></dd></div>
                  <div><dt>{t('admin.members.details.role')}</dt><dd>{displayedCustomer.role}</dd></div>
                  <div><dt>{t('admin.members.details.email')}</dt><dd>{displayedCustomer.email || '—'}</dd></div>
                  <div><dt>{t('admin.members.details.phone')}</dt><dd>{displayedCustomer.phone || '—'}</dd></div>
                  <div><dt>{t('admin.members.details.registered')}</dt><dd>{formatDateTime(displayedCustomer.created_at, language)}</dd></div>
                </dl>
              )}
            </section>

            <section className="admin-customer-detail-section" id="admin-customer-vehicles">
              <h3>{t('admin.members.vehicles.title')}</h3>
              <p className="admin-customer-section-note">
                {t('admin.members.vehicles.note')}
              </p>
              {bookingsError && (
                <p className="admin-customer-section-note">{t('admin.members.vehicles.bookingError')}</p>
              )}
              <RequestState
                empty={!uniqueVehicles.size && !bookingsError}
                emptyDescription={t('admin.members.vehicles.emptyDescription')}
                emptyTitle={t('admin.members.vehicles.emptyTitle')}
                loading={bookingsLoading}
                loadingMessage={t('admin.members.vehicles.loading')}
              />
              {!bookingsLoading && !bookingsError && uniqueVehicles.size > 0 && (
                <div className="admin-customer-record-list">
                  {[...uniqueVehicles.values()].map((vehicle) => (
                    <div className="admin-customer-record" key={vehicle.vehicle_id}>
                      <div>
                        <strong>{vehicleLabel(vehicle, t)}</strong>
                        <small>{[vehicle.type_name, vehicle.production_year].filter(Boolean).join(' · ') || t('admin.members.vehicles.apiDetails')}</small>
                      </div>
                      <span>#{vehicle.vehicle_id}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="admin-customer-detail-section" id="admin-customer-bookings">
              <h3>{t('admin.members.bookings.title')}</h3>
              <p className="admin-customer-section-note">
                {t('admin.members.bookings.note')}
              </p>
              <RequestState
                empty={!bookingRows.length}
                emptyDescription={t('admin.members.bookings.emptyDescription')}
                emptyTitle={t('admin.members.bookings.emptyTitle')}
                error={bookingsError}
                loading={bookingsLoading}
                loadingMessage={t('admin.members.bookings.loading')}
              />
              {!bookingsLoading && !bookingsError && bookingRows.length > 0 && (
                <>
                  <div className="admin-customer-record-list">
                    {bookingRows.map((booking) => {
                      const paymentInfo = bookingPayments[booking.booking_id]
                      return (
                        <article className="admin-customer-booking" key={booking.booking_id}>
                          <div className="admin-customer-booking-heading">
                            <strong>{t('admin.members.bookings.id', { id: booking.booking_id })}</strong>
                            <StatusBadge value={booking.booking_status} />
                          </div>
                          <dl className="admin-customer-booking-grid">
                            <div><dt>{t('admin.members.bookings.vehicle')}</dt><dd>{vehicleLabel(booking, t)}</dd></div>
                            <div><dt>{t('admin.members.bookings.date')}</dt><dd>{formatDate(booking.booking_date, language)} · {String(booking.start_time ?? '').slice(0, 5) || '—'}</dd></div>
                            <div><dt>{t('admin.members.bookings.amount')}</dt><dd>{formatMoney(booking.final_amount, language)}</dd></div>
                            <div>
                              <dt>{t('admin.members.bookings.payment')}</dt>
                              <dd>
                                {paymentInfo ? paymentInfo.error
                                  ? <span className="admin-customer-unavailable">{t('admin.members.bookings.unavailable')}: {messageText(paymentInfo.error, t)}</span>
                                  : paymentInfo.payment
                                    ? <><StatusBadge value={paymentInfo.payment.payment_status} /> <span>{paymentInfo.payment.payment_method}</span></>
                                    : <span>{t('admin.members.bookings.notAvailable')}</span>
                                  : t('admin.members.bookings.paymentLoading')}
                              </dd>
                            </div>
                          </dl>
                          {paymentInfo?.payment?.paid_at && (
                            <p className="admin-customer-payment-date">{t('admin.members.bookings.paidAt', {
                              date: formatDateTime(paymentInfo.payment.paid_at, language),
                            })}</p>
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
              <h3>{t('admin.members.wallet.title')}</h3>
              <RequestState
                empty={!wallet && !walletError}
                emptyDescription={t('admin.members.wallet.emptyDescription')}
                emptyTitle={t('admin.members.wallet.emptyTitle')}
                error={walletError}
                loading={walletLoading}
                loadingMessage={t('admin.members.wallet.loading')}
              />
              {!walletLoading && !walletError && wallet && (
                <div className="admin-customer-wallet">
                  <span>{t('admin.members.wallet.availableBalance')}</span>
                  <strong>{formatMoney(wallet.balance, language)}</strong>
                </div>
              )}
            </section>

            <section className="admin-customer-detail-section" id="admin-customer-transactions">
              <h3>{t('admin.members.transactions.title')}</h3>
              <RequestState
                empty={!transactions.length}
                emptyDescription={t('admin.members.transactions.emptyDescription')}
                emptyTitle={t('admin.members.transactions.emptyTitle')}
                error={transactionsError}
                loading={transactionsLoading}
                loadingMessage={t('admin.members.transactions.loading')}
              />
              {!transactionsLoading && !transactionsError && transactions.length > 0 && (
                <>
                  <div className="admin-customer-record-list">
                    {transactions.map((transaction) => (
                      <div className="admin-customer-transaction" key={transaction.wallet_transaction_id}>
                        <div>
                          <strong><StatusBadge value={transaction.transaction_type} /></strong>
                          <small>{transaction.description || '—'} · {formatDateTime(transaction.created_at, language)}</small>
                        </div>
                        <span>{formatMoney(transaction.amount, language)}</span>
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
          description={t('admin.members.role.description', {
            name: selectedRoleUser.full_name || selectedRoleUser.email || `#${selectedRoleUser.user_id}`,
            role: selectedRoleUser.role,
          })}
          error={roleChangeError}
          onClose={() => {
            if (!roleChanging) setSelectedRoleUser(null)
          }}
          onSubmit={changeRole}
          open
          submitLabel={t('admin.members.role.save')}
          submitting={roleChanging}
          title={t('admin.members.role.title')}
        >
          <label className="admin-form-field">
            <span>{t('admin.members.role.newRole')}</span>
            <select
              onChange={(event) => setNewRole(event.target.value)}
              value={newRole}
            >
              {ROLE_OPTIONS.map((value) => (
                <option disabled={value === selectedRoleUser.role} key={value} value={value}>
                  {t(`admin.members.role.option.${value.toLowerCase()}`)}
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
