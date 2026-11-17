import { useState } from 'react'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDateTime } from '../utils/formatDate.js'
import { ADMIN_PAGE_SIZE } from '../utils/pageSize.js'

const blankForm = { type_name: '', description: '' }

function VehicleTypesPage({ onNavigate }) {
  const [filters, setFilters] = useState({ search: '', status: '' })
  const [applied, setApplied] = useState({})
  const [page, setPage] = useState(1)
  const [form, setForm] = useState(blankForm)
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const api = useApi()
  const params = new URLSearchParams({ page: String(page), limit: String(ADMIN_PAGE_SIZE), ...applied })
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/vehicle-types?${params}`)
  const rows = data?.items ?? []

  function openForm(row = null) {
    setEditing(row)
    setForm(row ? { type_name: row.type_name ?? '', description: row.description ?? '' } : blankForm)
    setActionError('')
    setMessage('')
    setFormOpen(true)
  }

  function closeForm() {
    if (busy) return
    setFormOpen(false)
    setEditing(null)
    setForm(blankForm)
    setActionError('')
  }

  async function submit(event) {
    event.preventDefault()
    const typeName = form.type_name.trim()
    const description = form.description.trim()
    if (!typeName) {
      setActionError('Enter a vehicle type name.')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await api(editing ? `/api/admin/vehicle-types/${editing.vehicle_type_id}` : '/api/admin/vehicle-types', {
        method: editing ? 'PATCH' : 'POST',
        body: { type_name: typeName, description: description || null },
      })
      setMessage(editing ? `Vehicle type “${typeName}” updated.` : `Vehicle type “${typeName}” added. Set its prices in Services & pricing.`)
      setFormOpen(false)
      setEditing(null)
      setForm(blankForm)
      refresh()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(row) {
    const nextStatus = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const question = nextStatus === 'INACTIVE'
      ? `Deactivate “${row.type_name}”? Customers will no longer get prices for this type, but existing vehicles and bookings are kept.`
      : `Activate “${row.type_name}” again?`
    if (!window.confirm(question)) return
    setBusy(true)
    setActionError('')
    setMessage('')
    try {
      await api(`/api/admin/vehicle-types/${row.vehicle_type_id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      setMessage(`“${row.type_name}” is now ${nextStatus === 'ACTIVE' ? 'active' : 'inactive'}.`)
      refresh()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeading
        action={(
          <div className="admin-heading-actions">
            <button className="admin-secondary-button admin-refresh-button" onClick={refresh} type="button">Refresh</button>
            <button className="admin-primary-button" onClick={() => openForm()} type="button">+ Add vehicle type</button>
          </div>
        )}
        description="Vehicle types group cars for pricing, for example Sedan, SUV, or Pickup. Each service has one price per active type."
        eyebrow="CATALOG"
        title="Vehicle types"
      />
      {formOpen && (
        <AdminModal
          description={editing ? 'Rename or describe this vehicle type. Prices and vehicles stay linked.' : 'Add a vehicle type, then set its price for each service.'}
          error={actionError}
          onClose={closeForm}
          onSubmit={submit}
          open
          submitLabel={editing ? 'Save changes' : 'Add vehicle type'}
          submitting={busy}
          title={editing ? `Edit ${editing.type_name}` : 'Add a vehicle type'}
        >
          <div className="admin-form-grid">
            <label className="admin-form-wide">
              Name
              <input autoFocus maxLength="50" onChange={(e) => setForm({ ...form, type_name: e.target.value })} placeholder="e.g. Van" required value={form.type_name} />
            </label>
            <label className="admin-form-wide">
              Description (optional)
              <textarea maxLength="255" onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. 10–12 seat passenger vans" value={form.description} />
            </label>
          </div>
        </AdminModal>
      )}
      {!formOpen && (message || actionError) && (
        <div className={`admin-alert ${actionError ? 'admin-alert-error' : 'admin-alert-success'}`} role={actionError ? 'alert' : 'status'}>
          {actionError || message}
          {!actionError && message.includes('Services & pricing') && (
            <> <button className="admin-inline-button" onClick={() => onNavigate?.('services')} type="button">Go to Services &amp; pricing</button></>
          )}
        </div>
      )}
      <form className="admin-filter-bar" onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied(Object.fromEntries(Object.entries(filters).filter(([, value]) => value.trim()))) }}>
        <input aria-label="Search vehicle types" maxLength="100" onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search vehicle type" value={filters.search} />
        <select aria-label="Vehicle type status filter" onChange={(e) => setFilters({ ...filters, status: e.target.value })} value={filters.status}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <button className="admin-primary-button" type="submit">Apply</button>
      </form>
      <section className="admin-panel admin-data-panel">
        <RequestState
          empty={!rows.length}
          emptyDescription="Add a vehicle type, or try a different search or status."
          emptyTitle="No vehicle types"
          error={error}
          loading={loading}
          loadingMessage="Loading vehicle types…"
          onRetry={refresh}
        />
        {!loading && !error && !!rows.length && (
          <>
            <DataTable
              columns={[
                { key: 'vehicle_type_id', label: 'ID' },
                { key: 'type_name', label: 'Name', render: (row) => <strong>{row.type_name}</strong> },
                { key: 'description', label: 'Description', render: (row) => row.description || '—', wrap: true },
                { key: 'updated_at', label: 'Updated', render: (row) => formatDateTime(row.updated_at) },
                { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (row) => (
                    <div className="admin-row-actions">
                      <button className="admin-inline-button" disabled={busy} onClick={() => openForm(row)} type="button">Edit</button>
                      <button
                        className={`admin-inline-button ${row.status === 'ACTIVE' ? 'admin-action-danger' : 'admin-action-success'}`}
                        disabled={busy}
                        onClick={() => toggleStatus(row)}
                        type="button"
                      >
                        {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  ),
                },
              ]}
              rowKey={(row) => row.vehicle_type_id}
              rows={rows}
            />
            <Pagination onPageChange={setPage} pagination={data?.pagination} />
          </>
        )}
      </section>
    </div>
  )
}

export default VehicleTypesPage
