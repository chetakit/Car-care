import { useState } from 'react'
import AdminModal from '../Admin/components/AdminModal.jsx'
import {
  DataTable,
  PageHeading,
  Pagination,
  RequestState,
  StatusBadge,
} from '../Admin/components/AdminPageState.jsx'
import useApi from '../Admin/hooks/useApi.js'
import useRemoteData from '../Admin/hooks/useRemoteData.js'
import { formatDate } from '../Admin/utils/formatDate.js'
import formatStatusLabel from '../Admin/utils/formatStatusLabel.js'
import '../Admin/styles/admin.css'
import './staff.css'

const BOOKING_STATUSES = [
  'CONFIRMED',
  'CHECKED_IN',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]
const NEXT_STATUS = Object.freeze({
  CONFIRMED: 'CHECKED_IN',
  CHECKED_IN: 'IN_SERVICE',
  IN_SERVICE: 'COMPLETED',
})
const STATUS_ACTION = Object.freeze({
  CHECKED_IN: 'Check in',
  IN_SERVICE: 'Start service',
  COMPLETED: 'Complete service',
})

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '—'
}

function scheduleLabel(date, startTime, endTime) {
  const time = [formatTime(startTime), formatTime(endTime)]
    .filter((value) => value !== '—')
    .join('–')
  return [formatDate(date), time].filter(Boolean).join(' · ')
}

function vehicleLabel(vehicle) {
  return [
    [vehicle.brand_name, vehicle.model_name].filter(Boolean).join(' '),
    vehicle.license_plate,
  ].filter(Boolean).join(' · ') || '—'
}

function StaffDashboard({ user, onLogout }) {
  const [filters, setFilters] = useState({
    search: '',
    booking_status: '',
    date_from: '',
    date_to: '',
  })
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const api = useApi()
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  new URLSearchParams(query).forEach((value, key) => params.set(key, value))
  const {
    data,
    loading,
    error,
    refresh,
  } = useRemoteData(`/api/staff/bookings?${params}`)
  const rows = data?.items ?? []

  function applyFilters(event) {
    event.preventDefault()
    if (
      filters.date_from &&
      filters.date_to &&
      filters.date_to < filters.date_from
    ) {
      setActionError('The “To” date must be the same as or later than the “From” date.')
      return
    }

    setActionError('')
    setMessage('')
    setPage(1)
    const values = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) values.set(key, value)
    })
    setQuery(values.toString())
  }

  async function openDetails(row) {
    if (detailLoading) return
    setSelectedId(row.booking_id)
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    try {
      const response = await api(`/api/staff/bookings/${row.booking_id}`)
      setDetail(response.data)
    } catch (requestError) {
      setDetailError(requestError.message)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetails() {
    if (detailLoading) return
    setSelectedId(null)
    setDetail(null)
    setDetailError('')
  }

  async function advanceBooking(row) {
    const nextStatus = NEXT_STATUS[row.booking_status]
    if (!nextStatus || updatingId !== null) return
    const customerName = row.full_name || row.email || `Booking #${row.booking_id}`
    if (!window.confirm(
      `${STATUS_ACTION[nextStatus]} for ${customerName}?`,
    )) return

    setUpdatingId(row.booking_id)
    setActionError('')
    setMessage('')
    try {
      await api(`/api/staff/bookings/${row.booking_id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      setMessage(`Booking #${row.booking_id} updated to ${formatStatusLabel(nextStatus)}.`)
      setDetail((current) => current && current.booking.booking_id === row.booking_id
        ? {
            ...current,
            booking: { ...current.booking, booking_status: nextStatus },
          }
        : current)
      refresh()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const booking = detail?.booking
  const customer = detail?.customer
  const vehicle = detail?.vehicle

  return (
    <div className="staff-dashboard">
      <header className="staff-header">
        <div className="staff-brand">
          <span aria-hidden="true" className="staff-brand-mark">C</span>
          <span>
            <strong>Car Care</strong>
            <small>STAFF WORKSPACE</small>
          </span>
        </div>
        <div className="staff-account">
          <span>
            <strong>{user?.full_name || 'Staff'}</strong>
            <small>{user?.email}</small>
          </span>
          <button className="admin-secondary-button" onClick={() => void onLogout()} type="button">
            Sign out
          </button>
        </div>
      </header>

      <main className="staff-content">
        <PageHeading
          description="Review customer bookings and move each service through its assigned queue stages."
          eyebrow="OPERATIONS"
          title="Staff Dashboard"
          action={<button className="admin-secondary-button" disabled={loading} onClick={refresh} type="button">Refresh</button>}
        />
        <form className="admin-filter-bar staff-filter-bar" onSubmit={applyFilters}>
          <input
            aria-label="Search bookings"
            maxLength="100"
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            placeholder="Search customer, phone, booking ID or plate"
            value={filters.search}
          />
          <select
            aria-label="Booking status"
            onChange={(event) => setFilters({ ...filters, booking_status: event.target.value })}
            value={filters.booking_status}
          >
            <option value="">All booking statuses</option>
            {BOOKING_STATUSES.map((status) => (
              <option key={status} value={status}>{formatStatusLabel(status)}</option>
            ))}
          </select>
          <label>
            From
            <input
              aria-label="Date from"
              onChange={(event) => setFilters({ ...filters, date_from: event.target.value })}
              type="date"
              value={filters.date_from}
            />
          </label>
          <label>
            To
            <input
              aria-label="Date to"
              onChange={(event) => setFilters({ ...filters, date_to: event.target.value })}
              type="date"
              value={filters.date_to}
            />
          </label>
          <button className="admin-primary-button" type="submit">Apply filters</button>
        </form>

        <section className="admin-panel staff-queue-panel">
          <div className="admin-panel-heading">
            <div>
              <h3>Booking queue</h3>
              <p>{data?.pagination?.total ?? 0} bookings · ordered by service date and time</p>
            </div>
          </div>
          {actionError && <div className="admin-alert admin-alert-error" role="alert">{actionError}</div>}
          {message && <div className="admin-alert admin-alert-success" role="status">{message}</div>}
          <RequestState
            empty={!rows.length}
            emptyDescription="Try a different search, date range, or booking status."
            emptyTitle="No bookings match"
            error={error}
            loading={loading}
            loadingMessage="Loading the booking queue…"
            onRetry={refresh}
          />
          {!loading && !error && rows.length > 0 && (
            <>
              <DataTable
                columns={[
                  { key: 'booking_id', label: 'Booking ID', render: (row) => `#${row.booking_id}` },
                  { key: 'full_name', label: 'Customer' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'license_plate', label: 'Vehicle plate' },
                  { key: 'booking_date', label: 'Service date', render: (row) => scheduleLabel(row.booking_date, row.start_time, row.end_time) },
                  { key: 'booking_status', label: 'Status', render: (row) => <StatusBadge value={row.booking_status} /> },
                  {
                    key: 'actions',
                    label: 'Actions',
                    render: (row) => {
                      const nextStatus = NEXT_STATUS[row.booking_status]
                      return (
                        <div className="admin-row-actions">
                          <button
                            className="admin-customer-view-button"
                            disabled={detailLoading}
                            onClick={() => void openDetails(row)}
                            type="button"
                          >
                            View details
                          </button>
                          {nextStatus && (
                            <button
                              className="admin-inline-button"
                              disabled={updatingId !== null}
                              onClick={() => void advanceBooking(row)}
                              type="button"
                            >
                              {STATUS_ACTION[nextStatus]}
                            </button>
                          )}
                        </div>
                      )
                    },
                  },
                ]}
                rowKey={(row) => row.booking_id}
                rows={rows}
              />
              <Pagination onPageChange={setPage} pagination={data?.pagination} />
            </>
          )}
        </section>
      </main>

      {selectedId !== null && (
        <AdminModal
          description={`Booking #${selectedId} customer, vehicle and service details.`}
          error={detailError}
          onClose={closeDetails}
          onSubmit={(event) => {
            event.preventDefault()
            closeDetails()
          }}
          open
          submitLabel="Close"
          submitting={detailLoading}
          title={`Booking #${selectedId}`}
        >
          {detailLoading && <RequestState loading loadingMessage="Loading booking details…" />}
          {!detailLoading && booking && (
            <div className="staff-booking-details">
              <section>
                <h3>Booking</h3>
                <dl>
                  <div><dt>Date and time</dt><dd>{scheduleLabel(booking.booking_date, booking.start_time, booking.end_time)}</dd></div>
                  <div><dt>Status</dt><dd><StatusBadge value={booking.booking_status} /></dd></div>
                  {booking.notes && <div><dt>Customer notes</dt><dd>{booking.notes}</dd></div>}
                </dl>
              </section>
              <section>
                <h3>Customer</h3>
                <dl>
                  <div><dt>Name</dt><dd>{customer?.full_name || '—'}</dd></div>
                  <div><dt>Email</dt><dd>{customer?.email || '—'}</dd></div>
                  <div><dt>Phone</dt><dd>{customer?.phone || '—'}</dd></div>
                </dl>
              </section>
              <section>
                <h3>Vehicle</h3>
                <dl>
                  <div><dt>Vehicle</dt><dd>{vehicle ? vehicleLabel(vehicle) : '—'}</dd></div>
                  <div><dt>Type</dt><dd>{vehicle?.type_name || '—'}</dd></div>
                  <div><dt>Year / province / color</dt><dd>{[vehicle?.production_year, vehicle?.province, vehicle?.color].filter(Boolean).join(' · ') || '—'}</dd></div>
                </dl>
              </section>
              <section>
                <h3>Services</h3>
                {detail.services?.length
                  ? <ul>{detail.services.map((service) => <li key={service.booking_service_id}>{service.service_name} · {service.duration_minutes} min</li>)}</ul>
                  : <p>No service details were returned.</p>}
              </section>
            </div>
          )}
        </AdminModal>
      )}
    </div>
  )
}

export default StaffDashboard
