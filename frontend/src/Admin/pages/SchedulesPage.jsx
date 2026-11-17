import { useState } from 'react'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import usePagedRows from '../hooks/usePagedRows.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDate } from '../utils/formatDate.js'
import { ADMIN_PAGE_SIZE } from '../utils/pageSize.js'

function getToday() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(dateValue, days) {
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  const nextYear = date.getFullYear()
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0')
  const nextDay = String(date.getDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDay}`
}


function formatTime(value) {
  return value ? String(value).slice(0, 5) : '—'
}

function SchedulesPage() {
  const [filters, setFilters] = useState(() => {
    const from = getToday()
    return { from, to: addDays(from, 29) }
  })
  const [appliedRange, setAppliedRange] = useState(filters)
  const [filterError, setFilterError] = useState('')
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [capacityInput, setCapacityInput] = useState('')
  const [saveError, setSaveError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const api = useApi()
  const query = new URLSearchParams(appliedRange).toString()
  const { data, loading, error, refresh } = useRemoteData(
    `/api/admin/schedules?${query}`,
  )
  const rows = data?.items ?? []
  const { pageRows, pagination, setPage } = usePagedRows(rows, ADMIN_PAGE_SIZE, query)

  function applyFilters(event) {
    event.preventDefault()
    if (filters.to < filters.from) {
      setFilterError('The “To” date must be the same as or later than the “From” date.')
      return
    }
    setFilterError('')
    setMessage('')
    setAppliedRange(filters)
  }

  function openCapacityEditor(schedule) {
    setEditingSchedule(schedule)
    setCapacityInput(String(schedule.capacity))
    setSaveError('')
    setMessage('')
  }

  function closeCapacityEditor() {
    if (saving) return
    setEditingSchedule(null)
    setCapacityInput('')
    setSaveError('')
  }

  async function saveCapacity(event) {
    event.preventDefault()
    const capacity = Number(capacityInput)
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      setSaveError('Capacity must be a positive whole number.')
      return
    }

    setSaving(true)
    setSaveError('')
    setMessage('')
    try {
      await api(`/api/admin/schedules/${editingSchedule.schedule_id}/capacity`, {
        method: 'PATCH',
        body: { capacity },
      })
      setMessage('Schedule capacity updated.')
      setEditingSchedule(null)
      setCapacityInput('')
      refresh()
    } catch (requestError) {
      setSaveError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeading
        action={(
          <button
            className="admin-secondary-button admin-refresh-button"
            disabled={loading}
            onClick={refresh}
            type="button"
          >
            Refresh
          </button>
        )}
        description="Review scheduled time slots and set the maximum number of vehicles each can accept."
        eyebrow="OPERATIONS"
        title="Queue capacity"
      />
      {message && <div className="admin-alert admin-alert-success" role="status">{message}</div>}
      <form className="admin-filter-bar" onSubmit={applyFilters}>
        <label>
          From
          <input
            aria-label="From date"
            onChange={(event) => {
              setFilters({ ...filters, from: event.target.value })
              setFilterError('')
            }}
            required
            type="date"
            value={filters.from}
          />
        </label>
        <label>
          To
          <input
            aria-label="To date"
            onChange={(event) => {
              setFilters({ ...filters, to: event.target.value })
              setFilterError('')
            }}
            required
            type="date"
            value={filters.to}
          />
        </label>
        <button className="admin-primary-button" type="submit">Show schedules</button>
      </form>
      {filterError && <div className="admin-alert admin-alert-error" role="alert">{filterError}</div>}
      <section className="admin-panel admin-data-panel">
        <RequestState
          empty={!rows.length}
          emptyDescription="Choose another date range to view scheduled slots."
          emptyTitle="No schedules found"
          error={error}
          loading={loading}
          loadingMessage="Loading scheduled slots…"
          onRetry={refresh}
        />
        {!loading && !error && rows.length > 0 && (
          <DataTable
            columns={[
              { key: 'schedule_date', label: 'Date', render: (row) => formatDate(row.schedule_date) },
              {
                key: 'time',
                label: 'Time',
                render: (row) => `${formatTime(row.start_time)}–${formatTime(row.end_time)}`,
              },
              { key: 'booked_count', label: 'Booked' },
              { key: 'capacity', label: 'Maximum vehicles' },
              { key: 'remaining_capacity', label: 'Remaining' },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              {
                key: 'actions',
                label: 'Actions',
                render: (row) => (
                  <button
                    className="admin-inline-button"
                    disabled={saving}
                    onClick={() => openCapacityEditor(row)}
                    type="button"
                  >
                    Edit capacity
                  </button>
                ),
              },
            ]}
            rowKey={(row) => row.schedule_id}
            rows={pageRows}
          />
        )}
        {!loading && !error && <Pagination onPageChange={setPage} pagination={pagination} />}
      </section>
      {editingSchedule && (
        <AdminModal
          description="Capacity cannot be set below the number of bookings that have not been cancelled."
          error={saveError}
          onClose={closeCapacityEditor}
          onSubmit={saveCapacity}
          open={Boolean(editingSchedule)}
          submitLabel="Save capacity"
          submitting={saving}
          title={`Edit capacity · ${formatDate(editingSchedule.schedule_date)} ${formatTime(editingSchedule.start_time)}`}
        >
          <label>
            Maximum vehicles
            <input
              autoFocus
              min="1"
              onChange={(event) => setCapacityInput(event.target.value)}
              required
              type="number"
              value={capacityInput}
            />
          </label>
          <p className="admin-muted">
            Current bookings: {editingSchedule.booked_count}
          </p>
        </AdminModal>
      )}
    </div>
  )
}

export default SchedulesPage
