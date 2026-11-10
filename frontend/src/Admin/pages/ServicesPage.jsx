import { useState } from 'react'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'

const initialForm = { service_name: '', description: '', duration_minutes: '' }

function ServicePricesPanel({ serviceId, api, onClose }) {
  const { data, loading, error, refresh } = useRemoteData(
    `/api/admin/services/${serviceId}/prices`,
    Boolean(serviceId),
  )
  const [prices, setPrices] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  const priceRows = prices ?? (Array.isArray(data)
    ? data.map(({ vehicle_type_id, type_name, price }) => ({
        vehicle_type_id,
        type_name,
        price: String(price),
      }))
    : [])

  async function savePrices(event) {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      await api(`/api/admin/services/${serviceId}/prices`, {
        method: 'PUT',
        body: {
          prices: priceRows.map(({ vehicle_type_id, price }) => ({
            vehicle_type_id: Number(vehicle_type_id),
            price: String(price),
          })),
        },
      })
      refresh()
    } catch (requestError) {
      setSaveError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-panel admin-edit-form">
      <div className="admin-panel-heading">
        <div><h3>Prices · Service #{serviceId}</h3><p>Prices are stored per vehicle type.</p></div>
        <button className="admin-inline-button" onClick={onClose} type="button">Close</button>
      </div>
      <RequestState empty={!priceRows.length} error={error} loading={loading} onRetry={refresh} />
      {!loading && !error && (
        <form onSubmit={savePrices}>
          <div className="admin-price-list">
            {priceRows.map((item, index) => (
              <div className="admin-price-row" key={`${item.vehicle_type_id}-${index}`}>
                <label>Vehicle type ID<input min="1" onChange={(event) => setPrices(priceRows.map((price, row) => row === index ? { ...price, vehicle_type_id: event.target.value } : price))} required type="number" value={item.vehicle_type_id} /></label>
                <label>Type name<input onChange={(event) => setPrices(priceRows.map((price, row) => row === index ? { ...price, type_name: event.target.value } : price))} value={item.type_name ?? ''} /></label>
                <label>Price<input min="0" onChange={(event) => setPrices(priceRows.map((price, row) => row === index ? { ...price, price: event.target.value } : price))} required step="0.01" type="number" value={item.price} /></label>
                <button aria-label={`Remove vehicle type ${item.vehicle_type_id}`} className="admin-inline-button" onClick={() => setPrices(priceRows.filter((_, row) => row !== index))} type="button">Remove</button>
              </div>
            ))}
          </div>
          <div className="admin-form-actions">
            {saveError && <span className="admin-inline-error" role="alert">{saveError}</span>}
            <button className="admin-secondary-button" onClick={() => setPrices([...priceRows, { vehicle_type_id: '', type_name: '', price: '0.00' }])} type="button">Add vehicle type</button>
            <button className="admin-primary-button" disabled={saving || priceRows.length === 0} type="submit">{saving ? 'Saving…' : 'Save prices'}</button>
          </div>
        </form>
      )}
    </section>
  )
}

function ServicesPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [form, setForm] = useState(initialForm)
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [pricingServiceId, setPricingServiceId] = useState(null)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const api = useApi()
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (appliedSearch) params.set('search', appliedSearch)
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/services?${params}`)
  const rows = data?.items ?? []

  function openCreateForm() {
    setEditing(null)
    setForm(initialForm)
    setActionError('')
    setFormOpen(true)
  }

  function startEdit(service) {
    setEditing(service.service_id)
    setForm({
      service_name: service.service_name ?? '',
      description: service.description ?? '',
      duration_minutes: service.duration_minutes ?? '',
    })
  }

  async function submitService(event) {
    event.preventDefault()
    setBusy(true)
    setActionError('')
    setMessage('')
    const body = {
      service_name: form.service_name,
      description: form.description || null,
      duration_minutes: Number(form.duration_minutes),
    }
    try {
      await api(editing ? `/api/admin/services/${editing}` : '/api/admin/services', {
        method: editing ? 'PATCH' : 'POST',
        body,
      })
      setMessage(editing ? 'Service updated.' : 'Service created.')
      setForm(initialForm)
      setEditing(null)
      setFormOpen(false)
      refresh()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(service) {
    setBusy(true)
    setActionError('')
    try {
      await api(`/api/admin/services/${service.service_id}/status`, {
        method: 'PATCH',
        body: { status: service.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
      })
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
            <button className="admin-secondary-button" onClick={refresh} type="button">Refresh</button>
            <button className="admin-primary-button" onClick={openCreateForm} type="button">+ Add service</button>
          </div>
        )}
        description="Manage service records using the existing Admin service endpoints."
        eyebrow="CATALOG"
        title="Services & pricing"
      />
      {!formOpen && message && <div className="admin-alert admin-alert-success" role="status">{message}</div>}
      {!formOpen && actionError && <div className="admin-alert admin-alert-error" role="alert">{actionError}</div>}
      {formOpen && (
        <AdminModal
          description="Enter the service details below."
          error={actionError}
          onClose={() => {
            if (busy) return
            setFormOpen(false)
            setEditing(null)
            setForm(initialForm)
            setActionError('')
          }}
          onSubmit={submitService}
          open={formOpen}
          submitLabel={editing ? 'Save changes' : 'Create service'}
          submitting={busy}
          title={editing ? `Edit service #${editing}` : 'Add a service'}
        >
          <div className="admin-form-grid">
            <label>Service name<input autoFocus maxLength="100" onChange={(e) => setForm({ ...form, service_name: e.target.value })} required value={form.service_name} /></label>
            <label>Duration (minutes)<input min="1" onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} required type="number" value={form.duration_minutes} /></label>
            <label className="admin-form-wide">Description<textarea onChange={(e) => setForm({ ...form, description: e.target.value })} value={form.description} /></label>
          </div>
        </AdminModal>
      )}
      <form className="admin-filter-bar" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()) }}>
        <input aria-label="Search services" maxLength="100" onChange={(event) => setSearch(event.target.value)} placeholder="Search services" value={search} />
        <button className="admin-primary-button" type="submit">Search</button>
      </form>
      <section className="admin-panel admin-data-panel">
        <RequestState empty={!rows.length} error={error} loading={loading} onRetry={refresh} />
        {!loading && !error && !!rows.length && (
          <>
            <DataTable columns={[
              { key: 'service_id', label: 'ID' },
              { key: 'service_name', label: 'Service' },
              { key: 'duration_minutes', label: 'Duration (min)' },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { key: 'actions', label: 'Actions', render: (row) => (
                <div className="admin-row-actions">
                  <button className="admin-inline-button" disabled={busy} onClick={() => { startEdit(row); setActionError(''); setFormOpen(true) }} type="button">Edit</button>
                  <button className="admin-inline-button" onClick={() => setPricingServiceId(row.service_id)} type="button">Prices</button>
                  <button className="admin-inline-button" disabled={busy} onClick={() => toggleStatus(row)} type="button">{row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
                </div>
              ) },
            ]} rows={rows} />
            <Pagination onPageChange={setPage} pagination={data?.pagination} />
          </>
        )}
      </section>
      {pricingServiceId && <ServicePricesPanel api={api} key={pricingServiceId} onClose={() => setPricingServiceId(null)} serviceId={pricingServiceId} />}
    </div>
  )
}

export default ServicesPage
