import { useState } from 'react'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import usePagedRows from '../hooks/usePagedRows.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDate } from '../utils/formatDate.js'
import { ADMIN_PAGE_SIZE } from '../utils/pageSize.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

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
  const { language, t } = useLanguage()
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
      setFilterError('admin.schedules.filters.dateRangeError')
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
      setSaveError({ translationKey: 'admin.schedules.validation.capacity' })
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
      setMessage('admin.schedules.capacityUpdated')
      setEditingSchedule(null)
      setCapacityInput('')
      refresh()
    } catch (requestError) {
      setSaveError({ message: requestError.message })
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
            {t('admin.schedules.refresh')}
          </button>
        )}
        description={t('admin.schedules.description')}
        eyebrow={t('admin.schedules.eyebrow')}
        title={t('admin.schedules.title')}
      />
      {message && <div className="admin-alert admin-alert-success" role="status">{t(message)}</div>}
      <form className="admin-filter-bar" onSubmit={applyFilters}>
        <label>
          {t('admin.schedules.filters.from')}
          <input
            aria-label={t('admin.schedules.filters.fromLabel')}
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
          {t('admin.schedules.filters.to')}
          <input
            aria-label={t('admin.schedules.filters.toLabel')}
            onChange={(event) => {
              setFilters({ ...filters, to: event.target.value })
              setFilterError('')
            }}
            required
            type="date"
            value={filters.to}
          />
        </label>
        <button className="admin-primary-button" type="submit">{t('admin.schedules.filters.submit')}</button>
      </form>
      {filterError && <div className="admin-alert admin-alert-error" role="alert">{t(filterError)}</div>}
      <section className="admin-panel admin-data-panel">
        <RequestState
          empty={!rows.length}
          emptyDescription={t('admin.schedules.state.emptyDescription')}
          emptyTitle={t('admin.schedules.state.emptyTitle')}
          error={error}
          loading={loading}
          loadingMessage={t('admin.schedules.state.loading')}
          onRetry={refresh}
        />
        {!loading && !error && rows.length > 0 && (
          <DataTable
            columns={[
              { key: 'schedule_date', label: t('admin.schedules.table.date'), render: (row) => formatDate(row.schedule_date, language) },
              {
                key: 'time',
                label: t('admin.schedules.table.time'),
                render: (row) => `${formatTime(row.start_time)}–${formatTime(row.end_time)}`,
              },
              { key: 'booked_count', label: t('admin.schedules.table.booked') },
              { key: 'capacity', label: t('admin.schedules.table.maximumVehicles') },
              { key: 'remaining_capacity', label: t('admin.schedules.table.remaining') },
              { key: 'status', label: t('admin.schedules.table.status'), render: (row) => <StatusBadge value={row.status} /> },
              {
                key: 'actions',
                label: t('admin.schedules.table.actions'),
                render: (row) => (
                  <button
                    className="admin-inline-button"
                    disabled={saving}
                    onClick={() => openCapacityEditor(row)}
                    type="button"
                  >
                    {t('admin.schedules.editCapacity')}
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
          description={t('admin.schedules.modal.description')}
          error={saveError?.translationKey ? t(saveError.translationKey) : saveError?.message ?? ''}
          onClose={closeCapacityEditor}
          onSubmit={saveCapacity}
          open={Boolean(editingSchedule)}
          submitLabel={t('admin.schedules.modal.save')}
          submitting={saving}
          title={t('admin.schedules.modal.title', {
            date: formatDate(editingSchedule.schedule_date, language),
            time: formatTime(editingSchedule.start_time),
          })}
        >
          <label>
            {t('admin.schedules.modal.maximumVehicles')}
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
            {t('admin.schedules.modal.currentBookings', { count: editingSchedule.booked_count })}
          </p>
        </AdminModal>
      )}
    </div>
  )
}

export default SchedulesPage
