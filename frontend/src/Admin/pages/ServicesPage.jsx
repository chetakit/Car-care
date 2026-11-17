import { useEffect, useState } from 'react'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import formatMoney from '../utils/formatMoney.js'
import { ADMIN_PAGE_SIZE } from '../utils/pageSize.js'

const initialForm = { service_name: '', description: '', duration_minutes: '' }
const VEHICLE_TYPE_PAGE_SIZE = 100

function isValidServicePrice(value) {
  const match = String(value).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return false
  return match[1].replace(/^0+(?=\d)/, '').length <= 8
}

function ServicePricesPanel({ serviceId, api, onClose }) {
  const { data, loading, error, refresh } = useRemoteData(
    `/api/admin/services/${serviceId}/prices`,
    Boolean(serviceId),
  )
  const [vehicleTypeState, setVehicleTypeState] = useState({
    data: null,
    loading: true,
    error: '',
  })
  const [vehicleTypeRefreshKey, setVehicleTypeRefreshKey] = useState(0)
  const [prices, setPrices] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function loadVehicleTypes() {
      setVehicleTypeState({ data: null, loading: true, error: '' })
      try {
        const vehicleTypes = []
        let page = 1
        let totalPages = 1

        do {
          const response = await api(
            `/api/admin/vehicle-types?page=${page}&limit=${VEHICLE_TYPE_PAGE_SIZE}`,
            { signal: controller.signal },
          )
          const pageData = response.data
          const reportedTotalPages = pageData?.pagination?.totalPages
          if (
            !Array.isArray(pageData?.items) ||
            !Number.isSafeInteger(reportedTotalPages) ||
            reportedTotalPages < 0
          ) {
            throw new Error('The vehicle type list returned an invalid response.')
          }

          vehicleTypes.push(...pageData.items)
          totalPages = Math.max(1, reportedTotalPages)
          page += 1
        } while (page <= totalPages)

        if (!cancelled) {
          setVehicleTypeState({ data: vehicleTypes, loading: false, error: '' })
        }
      } catch (requestError) {
        if (!cancelled && requestError.name !== 'AbortError') {
          setVehicleTypeState({
            data: null,
            loading: false,
            error: requestError.message,
          })
        }
      }
    }

    loadVehicleTypes()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [api, vehicleTypeRefreshKey])

  const vehicleTypes = vehicleTypeState.data ?? []
  const vehicleTypesById = new Map(
    vehicleTypes.map((vehicleType) => [
      Number(vehicleType.vehicle_type_id),
      vehicleType,
    ]),
  )
  const storedPrices = Array.isArray(data) ? data : []
  const editableStoredPrices = storedPrices.filter(
    (price) => vehicleTypesById.get(Number(price.vehicle_type_id))?.status === 'ACTIVE',
  )
  const inactivePrices = storedPrices.filter(
    (price) => vehicleTypesById.get(Number(price.vehicle_type_id))?.status !== 'ACTIVE',
  )
  const priceRows = prices ?? editableStoredPrices.map(({ vehicle_type_id, price }) => ({
    vehicle_type_id: String(vehicle_type_id),
    price: String(price),
    isNew: false,
  }))
  const activeVehicleTypes = vehicleTypes.filter(
    (vehicleType) => vehicleType.status === 'ACTIVE',
  )
  const assignedVehicleTypeIds = new Set(
    priceRows
      .filter((row) => row.vehicle_type_id !== '')
      .map((row) => String(row.vehicle_type_id)),
  )
  const canAddVehicleType = activeVehicleTypes.some(
    (vehicleType) => !assignedVehicleTypeIds.has(String(vehicleType.vehicle_type_id)),
  )
  const hasUnselectedPrice = priceRows.some((row) => row.vehicle_type_id === '')
  const loadError = error || vehicleTypeState.error
  const isLoading = loading || vehicleTypeState.loading

  function updatePriceRows(nextRows) {
    setPrices(nextRows)
    setSaveError('')
    setSaveMessage('')
  }

  function retryLoading() {
    refresh()
    setVehicleTypeRefreshKey((key) => key + 1)
  }

  async function savePrices(event) {
    event.preventDefault()
    setSaveError('')
    setSaveMessage('')

    if (priceRows.length === 0) {
      setSaveError('Add a vehicle type before saving service prices.')
      return
    }

    const seenVehicleTypeIds = new Set()
    for (const row of priceRows) {
      const vehicleTypeId = Number(row.vehicle_type_id)
      const vehicleType = vehicleTypesById.get(vehicleTypeId)
      const typeName = vehicleType?.type_name || 'Selected vehicle type'

      if (!Number.isSafeInteger(vehicleTypeId) || vehicleTypeId <= 0) {
        setSaveError('Choose a vehicle type for every new price row.')
        return
      }
      if (seenVehicleTypeIds.has(vehicleTypeId)) {
        setSaveError('Each vehicle type can have only one price. Choose a different type.')
        return
      }
      if (vehicleType?.status !== 'ACTIVE') {
        setSaveError('A selected vehicle type is no longer active. Refresh the list and try again.')
        return
      }
      if (!isValidServicePrice(row.price)) {
        setSaveError(
          `${typeName}: enter a non-negative price with up to 2 decimal places and no more than 8 digits before the decimal.`,
        )
        return
      }
      seenVehicleTypeIds.add(vehicleTypeId)
    }

    setSaving(true)
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
      setPrices(null)
      setSaveMessage('Service prices saved.')
      refresh()
    } catch (requestError) {
      setSaveError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRetry = () => retryLoading()

  return (
    <section className="admin-panel admin-edit-form">
      <div className="admin-panel-heading">
        <div><h3>Prices · Service #{serviceId}</h3><p>Prices are stored per vehicle type. Saved prices can be updated; this API does not delete them.</p></div>
        <button className="admin-inline-button" onClick={onClose} type="button">Close</button>
      </div>
      <RequestState
        error={loadError}
        loading={isLoading}
        loadingMessage="Loading service prices and vehicle types…"
        onRetry={handleRetry}
      />
      {!isLoading && !loadError && (
        <form onSubmit={savePrices}>
          {inactivePrices.length > 0 && (
            <div className="admin-price-note" role="status">
              <p>Prices for inactive or unavailable vehicle types are shown for reference and are not changed here.</p>
              <ul className="admin-price-inactive-list">
                {inactivePrices.map((item) => {
                  const vehicleType = vehicleTypesById.get(Number(item.vehicle_type_id))
                  const typeName = vehicleType?.type_name || item.type_name || `Vehicle type #${item.vehicle_type_id}`
                  const status = vehicleType?.status === 'INACTIVE' ? 'Inactive' : 'Status unavailable'
                  return (
                    <li key={item.vehicle_type_id}>
                      <span>{typeName} · {status}</span>
                      <strong>THB {item.price}</strong>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {priceRows.length === 0 && (
            <p className="admin-price-empty" role="status">
              No active prices are set. Add an active vehicle type to set this service’s price.
            </p>
          )}
          <div className="admin-price-list">
            {priceRows.map((item, index) => (
              <div className="admin-price-row" key={`${item.vehicle_type_id}-${index}`}>
                {item.isNew ? (
                  <label>
                    Vehicle type
                    <select
                      disabled={saving}
                      onChange={(event) => updatePriceRows(priceRows.map((price, row) => (
                        row === index
                          ? { ...price, vehicle_type_id: event.target.value }
                          : price
                      )))}
                      required
                      value={item.vehicle_type_id}
                    >
                      <option value="">Select a vehicle type</option>
                      {activeVehicleTypes.map((vehicleType) => {
                        const typeId = String(vehicleType.vehicle_type_id)
                        const alreadyAssigned = priceRows.some(
                          (price, row) => row !== index && String(price.vehicle_type_id) === typeId,
                        )
                        return (
                          <option disabled={alreadyAssigned} key={typeId} value={typeId}>
                            {vehicleType.type_name}{alreadyAssigned ? ' · already priced' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                ) : (
                  <div className="admin-price-type">
                    <span>Vehicle type</span>
                    <strong>{vehicleTypesById.get(Number(item.vehicle_type_id))?.type_name || 'Vehicle type unavailable'}</strong>
                  </div>
                )}
                <label>
                  Price (THB)
                  <input
                    disabled={saving}
                    inputMode="decimal"
                    onChange={(event) => updatePriceRows(priceRows.map((price, row) => (
                      row === index ? { ...price, price: event.target.value } : price
                    )))}
                    required
                    type="text"
                    value={item.price}
                  />
                </label>
                {item.isNew && (
                  <button
                    aria-label="Remove unsaved price row"
                    className="admin-inline-button admin-action-danger"
                    disabled={saving}
                    onClick={() => {
                      updatePriceRows(priceRows.filter((_, row) => row !== index))
                      setSaveMessage('Unsaved row removed. Existing saved prices are unchanged.')
                    }}
                    type="button"
                  >
                    Remove row
                  </button>
                )}
              </div>
            ))}
          </div>
          {hasUnselectedPrice && (
            <p className="admin-price-hint">Choose a vehicle type for each new row before saving.</p>
          )}
          {activeVehicleTypes.length === 0 && (
            <p className="admin-price-hint">No active vehicle types are available for new prices.</p>
          )}
          {activeVehicleTypes.length > 0 && priceRows.length > 0 && !canAddVehicleType && (
            <p className="admin-price-hint">Every active vehicle type already has a price.</p>
          )}
          {saveError && <div className="admin-alert admin-alert-error" role="alert">{saveError}</div>}
          {saveMessage && <div className="admin-alert admin-alert-success" role="status">{saveMessage}</div>}
          <div className="admin-form-actions">
            <button
              className="admin-secondary-button"
              disabled={saving || !canAddVehicleType}
              onClick={() => updatePriceRows([
                ...priceRows,
                { vehicle_type_id: '', price: '', isNew: true },
              ])}
              type="button"
            >
              Add vehicle type
            </button>
            <button
              className="admin-primary-button"
              disabled={saving || priceRows.length === 0 || hasUnselectedPrice}
              type="submit"
            >
              {saving ? 'Saving…' : 'Save prices'}
            </button>
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
  const params = new URLSearchParams({ page: String(page), limit: String(ADMIN_PAGE_SIZE) })
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
    const nextStatus = service.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const action = nextStatus === 'ACTIVE' ? 'activate' : 'deactivate'
    if (!window.confirm(`Are you sure you want to ${action} ${service.service_name}?`)) return

    setBusy(true)
    setActionError('')
    setMessage('')
    try {
      await api(`/api/admin/services/${service.service_id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      setMessage(`${service.service_name} is now ${nextStatus.toLowerCase()}.`)
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
            <button className="admin-primary-button" onClick={openCreateForm} type="button">+ Add service</button>
          </div>
        )}
        description="Add services, set how long they take, and set a price for each vehicle type."
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
        <RequestState
          empty={!rows.length}
          emptyDescription="Try a different service name or clear the search."
          emptyTitle="No services match"
          error={error}
          loading={loading}
          loadingMessage="Loading services…"
          onRetry={refresh}
        />
        {!loading && !error && !!rows.length && (
          <>
            <DataTable columns={[
              { key: 'service_id', label: 'ID' },
              { key: 'service_name', label: 'Service' },
              { key: 'duration_minutes', label: 'Duration (min)' },
              {
                key: 'price',
                label: 'Price',
                render: (row) => {
                  if (!row.price_count) {
                    return <button className="admin-inline-button admin-action-danger" onClick={() => setPricingServiceId(row.service_id)} type="button">Set prices</button>
                  }
                  const range = Number(row.min_price) === Number(row.max_price)
                    ? formatMoney(row.min_price)
                    : `${formatMoney(row.min_price)} – ${formatMoney(row.max_price)}`
                  return <span>{range} <small className="admin-muted">· {row.price_count} {row.price_count === 1 ? 'type' : 'types'}</small></span>
                },
              },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { key: 'actions', label: 'Actions', render: (row) => (
                <div className="admin-row-actions">
                  <button className="admin-inline-button" disabled={busy} onClick={() => { startEdit(row); setActionError(''); setFormOpen(true) }} type="button">Edit</button>
                  <button className="admin-inline-button" onClick={() => setPricingServiceId(row.service_id)} type="button">Prices</button>
                  <button className={`admin-inline-button ${row.status === 'ACTIVE' ? 'admin-action-danger' : 'admin-action-success'}`} disabled={busy} onClick={() => toggleStatus(row)} type="button">{row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
                </div>
              ) },
            ]} rows={rows} />
            <Pagination onPageChange={setPage} pagination={data?.pagination} />
          </>
        )}
      </section>
      {pricingServiceId && <ServicePricesPanel api={api} key={pricingServiceId} onClose={() => { setPricingServiceId(null); refresh() }} serviceId={pricingServiceId} />}
    </div>
  )
}

export default ServicesPage
