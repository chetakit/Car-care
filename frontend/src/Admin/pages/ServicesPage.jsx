import { useEffect, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { ADMIN_PAGE_SIZE } from '../utils/pageSize.js'

const initialForm = { service_name: '', description: '', duration_minutes: '' }
const VEHICLE_TYPE_PAGE_SIZE = 100

function messageText(message, t) {
  return message?.key ? t(message.key, message.params) : message
}

function isValidServicePrice(value) {
  const match = String(value).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return false
  return match[1].replace(/^0+(?=\d)/, '').length <= 8
}

// Popup that edits one fixed price per active vehicle size. Every active size
// gets a row; an empty field means "not priced yet". Saved prices can be
// changed but not removed (the API only adds or updates).
function ServicePricesModal({ service, api, onClose, onSaved }) {
  const { t } = useLanguage()
  const serviceId = service.service_id
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/services/${serviceId}/prices`)
  const [vehicleTypeState, setVehicleTypeState] = useState({ data: null, loading: true, error: '' })
  const [vehicleTypeRefreshKey, setVehicleTypeRefreshKey] = useState(0)
  const [edits, setEdits] = useState({})
  const [saveError, setSaveError] = useState('')
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
          if (!Array.isArray(pageData?.items) || !Number.isSafeInteger(reportedTotalPages) || reportedTotalPages < 0) {
            throw Object.assign(new Error('invalid'), { messageKey: 'admin.services.prices.invalidVehicleTypesResponse' })
          }
          vehicleTypes.push(...pageData.items)
          totalPages = Math.max(1, reportedTotalPages)
          page += 1
        } while (page <= totalPages)
        if (!cancelled) setVehicleTypeState({ data: vehicleTypes, loading: false, error: '' })
      } catch (requestError) {
        if (!cancelled && requestError.name !== 'AbortError') {
          setVehicleTypeState({ data: null, loading: false, error: requestError.messageKey ? { key: requestError.messageKey } : requestError.message })
        }
      }
    }

    loadVehicleTypes()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [api, vehicleTypeRefreshKey])

  const storedPrices = Array.isArray(data) ? data : []
  const storedById = new Map(storedPrices.map((item) => [Number(item.vehicle_type_id), item]))
  const vehicleTypes = vehicleTypeState.data ?? []
  const activeIds = new Set(vehicleTypes.filter((type) => type.status === 'ACTIVE').map((type) => Number(type.vehicle_type_id)))
  // Cheapest size first, unpriced sizes last.
  const rows = vehicleTypes
    .filter((type) => activeIds.has(Number(type.vehicle_type_id)))
    .map((type) => {
      const id = Number(type.vehicle_type_id)
      const stored = storedById.get(id)
      const saved = stored ? String(Number(stored.price)) : ''
      return { id, name: type.type_name, saved, value: edits[id] ?? saved }
    })
    .sort((left, right) => (left.saved === '') - (right.saved === '') || Number(left.saved) - Number(right.saved))
  const inactiveCount = storedPrices.filter((item) => !activeIds.has(Number(item.vehicle_type_id))).length
  const loadError = error || vehicleTypeState.error
  const isLoading = loading || vehicleTypeState.loading
  const pricedCount = rows.filter((row) => row.value.trim() !== '').length
  const changed = rows.some((row) => row.value.trim() !== row.saved)

  function setValue(id, value) {
    setEdits((current) => ({ ...current, [id]: value }))
    setSaveError('')
  }

  async function savePrices(event) {
    event.preventDefault()
    if (isLoading || loadError) return
    setSaveError('')

    for (const row of rows) {
      const value = row.value.trim()
      if (value === '' && row.saved !== '') {
        setSaveError(t('admin.services.prices.validation.cannotRemove', { typeName: row.name }))
        return
      }
      if (value !== '' && !isValidServicePrice(value)) {
        setSaveError(t('admin.services.prices.validation.price', { typeName: row.name }))
        return
      }
    }
    const filled = rows.filter((row) => row.value.trim() !== '')
    if (!filled.length) {
      setSaveError(t('admin.services.prices.validation.atLeastOne'))
      return
    }
    if (!changed) {
      onClose()
      return
    }

    setSaving(true)
    try {
      await api(`/api/admin/services/${serviceId}/prices`, {
        method: 'PUT',
        body: { prices: filled.map((row) => ({ vehicle_type_id: row.id, price: row.value.trim() })) },
      })
      onSaved({ key: 'admin.services.prices.savedFor', params: { name: service.service_name } })
    } catch (requestError) {
      setSaveError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminModal
      description={t('admin.services.prices.modalDescription')}
      error={saveError}
      onClose={onClose}
      onSubmit={savePrices}
      open
      submitLabel={t('admin.services.prices.save')}
      submitting={saving}
      title={t('admin.services.prices.modalTitle', { name: service.service_name })}
    >
      <RequestState
        error={messageText(loadError, t)}
        loading={isLoading}
        loadingMessage={t('admin.services.prices.loading')}
        onRetry={() => { refresh(); setVehicleTypeRefreshKey((key) => key + 1) }}
      />
      {!isLoading && !loadError && (
        <>
          {rows.length === 0 ? (
            <p className="admin-price-empty" role="status">{t('admin.services.prices.noActiveTypes')}</p>
          ) : (
            <>
              <div className="admin-price-editor-meta">
                <span>{t('admin.services.prices.vehicleType')}</span>
                <span>{t('admin.services.prices.pricedCount', { count: pricedCount, total: rows.length })}</span>
              </div>
              <ul className="admin-price-editor">
                {rows.map((row) => (
                  <li className={row.value.trim() !== row.saved ? 'is-dirty' : ''} key={row.id}>
                    <label htmlFor={`price-${serviceId}-${row.id}`}>
                      {row.name}
                      {row.saved === '' && <small>{t('admin.services.prices.notPriced')}</small>}
                    </label>
                    <div className="admin-price-input">
                      <input
                        autoComplete="off"
                        disabled={saving}
                        id={`price-${serviceId}-${row.id}`}
                        inputMode="decimal"
                        onChange={(event) => setValue(row.id, event.target.value)}
                        placeholder="0"
                        value={row.value}
                      />
                      <span aria-hidden="true">฿</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {inactiveCount > 0 && (
            <p className="admin-price-hint">
              {t('admin.services.prices.inactiveHidden', { count: inactiveCount })}
            </p>
          )}
        </>
      )}
    </AdminModal>
  )
}

function ServicesPage() {
  const { language, t } = useLanguage()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [form, setForm] = useState(initialForm)
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [pricingService, setPricingService] = useState(null)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const api = useApi()
  const params = new URLSearchParams({ page: String(page), limit: String(ADMIN_PAGE_SIZE) })
  if (appliedSearch) params.set('search', appliedSearch)
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/services?${params}`)
  const rows = data?.items ?? []
  const pricedRows = rows.filter((row) => row.prices?.length)
  // Size columns for the price list, smallest (cheapest on average) first.
  const priceColumns = [...pricedRows.flatMap((row) => row.prices).reduce((types, item) => {
    const entry = types.get(item.vehicle_type_id) ?? { ...item, total: 0, count: 0 }
    entry.total += item.price
    entry.count += 1
    return types.set(item.vehicle_type_id, entry)
  }, new Map()).values()].sort((left, right) => left.total / left.count - right.total / right.count)

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
      setMessage({
        key: editing ? 'admin.services.feedback.updated' : 'admin.services.feedback.created',
      })
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
    const action = t(nextStatus === 'ACTIVE'
      ? 'admin.services.action.activateVerb'
      : 'admin.services.action.deactivateVerb')
    if (!window.confirm(t('admin.services.confirm.status', {
      action,
      name: service.service_name,
    }))) return

    setBusy(true)
    setActionError('')
    setMessage('')
    try {
      await api(`/api/admin/services/${service.service_id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      setMessage({
        key: nextStatus === 'ACTIVE'
          ? 'admin.services.feedback.activated'
          : 'admin.services.feedback.deactivated',
        params: { name: service.service_name },
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
            <button className="admin-secondary-button admin-refresh-button" onClick={refresh} type="button">{t('admin.services.refresh')}</button>
            <button className="admin-primary-button" onClick={openCreateForm} type="button">{t('admin.services.add')}</button>
          </div>
        )}
        description={t('admin.services.description')}
        eyebrow={t('admin.services.eyebrow')}
        title={t('admin.services.title')}
      />
      {!formOpen && message && <div className="admin-alert admin-alert-success" role="status">{messageText(message, t)}</div>}
      {!formOpen && actionError && <div className="admin-alert admin-alert-error" role="alert">{actionError}</div>}
      {formOpen && (
        <AdminModal
          description={t('admin.services.modal.description')}
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
          submitLabel={t(editing ? 'admin.services.modal.save' : 'admin.services.modal.create')}
          submitting={busy}
          title={t(editing ? 'admin.services.modal.editTitle' : 'admin.services.modal.addTitle', {
            id: editing,
          })}
        >
          <div className="admin-form-grid">
            <label>{t('admin.services.form.name')}<input autoFocus maxLength="100" onChange={(e) => setForm({ ...form, service_name: e.target.value })} required value={form.service_name} /></label>
            <label>{t('admin.services.form.duration')}<input min="1" onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} required type="number" value={form.duration_minutes} /></label>
            <label className="admin-form-wide">{t('admin.services.form.description')}<textarea onChange={(e) => setForm({ ...form, description: e.target.value })} value={form.description} /></label>
          </div>
        </AdminModal>
      )}
      <form className="admin-filter-bar" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()) }}>
        <input aria-label={t('admin.services.search.label')} maxLength="100" onChange={(event) => setSearch(event.target.value)} placeholder={t('admin.services.search.placeholder')} value={search} />
        <button className="admin-primary-button" type="submit">{t('admin.services.search.submit')}</button>
      </form>
      <section className="admin-panel admin-data-panel">
        <RequestState
          empty={!rows.length}
          emptyDescription={t('admin.services.state.emptyDescription')}
          emptyTitle={t('admin.services.state.emptyTitle')}
          error={error}
          loading={loading}
          loadingMessage={t('admin.services.state.loading')}
          onRetry={refresh}
        />
        {!loading && !error && !!rows.length && (
          <>
            <DataTable columns={[
              { key: 'service_id', label: t('admin.services.table.id') },
              { key: 'service_name', label: t('admin.services.table.service') },
              { key: 'duration_minutes', label: t('admin.services.table.duration') },
              {
                key: 'price',
                label: t('admin.services.table.price'),
                render: (row) => {
                  if (!row.price_count) {
                    return <button className="admin-inline-button admin-action-danger" onClick={() => { setMessage(''); setPricingService(row) }} type="button">{t('admin.services.table.setPrices')}</button>
                  }
                  // The prices themselves are in the price list below.
                  const complete = row.price_count >= priceColumns.length
                  return (
                    <span className={complete ? 'admin-price-set' : 'admin-price-partial'}>
                      {t('admin.services.table.sizesPriced', { count: row.price_count, total: priceColumns.length })}
                    </span>
                  )
                },
              },
              { key: 'status', label: t('admin.services.table.status'), render: (row) => <StatusBadge value={row.status} /> },
              { key: 'actions', label: t('admin.services.table.actions'), render: (row) => (
                <div className="admin-row-actions">
                  <button className="admin-inline-button" disabled={busy} onClick={() => { startEdit(row); setActionError(''); setFormOpen(true) }} type="button">{t('admin.services.table.edit')}</button>
                  <button className="admin-inline-button" onClick={() => { setMessage(''); setPricingService(row) }} type="button">{t('admin.services.table.prices')}</button>
                  <button className={`admin-inline-button ${row.status === 'ACTIVE' ? 'admin-action-danger' : 'admin-action-success'}`} disabled={busy} onClick={() => toggleStatus(row)} type="button">{t(row.status === 'ACTIVE' ? 'admin.services.action.deactivate' : 'admin.services.action.activate')}</button>
                </div>
              ) },
            ]} rows={rows} />
            <Pagination onPageChange={setPage} pagination={data?.pagination} />
          </>
        )}
      </section>
      {!loading && !error && priceColumns.length > 0 && (
        <section className="admin-panel admin-price-board">
          <div className="admin-panel-heading">
            <div>
              <h3>{t('admin.services.board.title')}</h3>
              <p>{t('admin.services.board.description')}</p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table admin-price-board-table">
              <thead>
                <tr>
                  <th>{t('admin.services.table.service')}</th>
                  {priceColumns.map((column) => <th key={column.vehicle_type_id}>{column.type_name}</th>)}
                </tr>
              </thead>
              <tbody>
                {pricedRows.map((row) => {
                  const priceByType = new Map(row.prices.map((item) => [item.vehicle_type_id, item.price]))
                  return (
                    <tr className={row.status === 'ACTIVE' ? '' : 'is-inactive'} key={row.service_id}>
                      <th scope="row">
                        {row.service_name}
                        {row.status !== 'ACTIVE' && <small> · {t('admin.status.inactive')}</small>}
                      </th>
                      {priceColumns.map((column) => (
                        <td key={column.vehicle_type_id}>
                          {priceByType.has(column.vehicle_type_id)
                            ? priceByType.get(column.vehicle_type_id).toLocaleString(language === 'TH' ? 'th-TH' : 'en-GB')
                            : <span className="admin-muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {pricingService && (
        <ServicePricesModal
          api={api}
          key={pricingService.service_id}
          onClose={() => setPricingService(null)}
          onSaved={(text) => { setPricingService(null); setMessage(text); refresh() }}
          service={pricingService}
        />
      )}
    </div>
  )
}

export default ServicesPage
