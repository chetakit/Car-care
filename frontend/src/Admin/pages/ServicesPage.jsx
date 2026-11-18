import { useEffect, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import formatMoney from '../utils/formatMoney.js'
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

function ServicePricesPanel({ serviceId, api, onClose }) {
  const { language, t } = useLanguage()
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
            if (!cancelled) {
              setVehicleTypeState({
                data: null,
                loading: false,
                error: { key: 'admin.services.prices.invalidVehicleTypesResponse' },
              })
            }
            return
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
      setSaveError({ key: 'admin.services.prices.validation.noRows' })
      return
    }

    const seenVehicleTypeIds = new Set()
    for (const row of priceRows) {
      const vehicleTypeId = Number(row.vehicle_type_id)
      const vehicleType = vehicleTypesById.get(vehicleTypeId)
      const typeName = vehicleType?.type_name

      if (!Number.isSafeInteger(vehicleTypeId) || vehicleTypeId <= 0) {
        setSaveError({ key: 'admin.services.prices.validation.selectType' })
        return
      }
      if (seenVehicleTypeIds.has(vehicleTypeId)) {
        setSaveError({ key: 'admin.services.prices.validation.duplicateType' })
        return
      }
      if (vehicleType?.status !== 'ACTIVE') {
        setSaveError({ key: 'admin.services.prices.validation.inactiveType' })
        return
      }
      if (!isValidServicePrice(row.price)) {
        setSaveError({
          key: typeName
            ? 'admin.services.prices.validation.price'
            : 'admin.services.prices.validation.priceWithoutType',
          params: typeName ? { typeName } : undefined,
        })
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
      setSaveMessage({ key: 'admin.services.prices.saved' })
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
        <div><h3>{t('admin.services.prices.title', { id: serviceId })}</h3><p>{t('admin.services.prices.description')}</p></div>
        <button className="admin-inline-button" onClick={onClose} type="button">{t('admin.common.close')}</button>
      </div>
      <RequestState
        error={messageText(loadError, t)}
        loading={isLoading}
        loadingMessage={t('admin.services.prices.loading')}
        onRetry={handleRetry}
      />
      {!isLoading && !loadError && (
        <form onSubmit={savePrices}>
          {inactivePrices.length > 0 && (
            <div className="admin-price-note" role="status">
              <p>{t('admin.services.prices.inactiveNote')}</p>
              <ul className="admin-price-inactive-list">
                {inactivePrices.map((item) => {
                  const vehicleType = vehicleTypesById.get(Number(item.vehicle_type_id))
                  const typeName = vehicleType?.type_name || item.type_name || t('admin.services.prices.typeFallback', {
                    id: item.vehicle_type_id,
                  })
                  const status = vehicleType?.status === 'INACTIVE'
                    ? t('admin.status.inactive')
                    : t('admin.services.prices.statusUnavailable')
                  return (
                    <li key={item.vehicle_type_id}>
                      <span>{typeName} · {status}</span>
                      <strong>{formatMoney(item.price, language)}</strong>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {priceRows.length === 0 && (
            <p className="admin-price-empty" role="status">
              {t('admin.services.prices.empty')}
            </p>
          )}
          <div className="admin-price-list">
            {priceRows.map((item, index) => (
              <div className="admin-price-row" key={`${item.vehicle_type_id}-${index}`}>
                {item.isNew ? (
                  <label>
                    {t('admin.services.prices.vehicleType')}
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
                      <option value="">{t('admin.services.prices.selectType')}</option>
                      {activeVehicleTypes.map((vehicleType) => {
                        const typeId = String(vehicleType.vehicle_type_id)
                        const alreadyAssigned = priceRows.some(
                          (price, row) => row !== index && String(price.vehicle_type_id) === typeId,
                        )
                        return (
                          <option disabled={alreadyAssigned} key={typeId} value={typeId}>
                            {vehicleType.type_name}{alreadyAssigned ? ` · ${t('admin.services.prices.alreadyPriced')}` : ''}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                ) : (
                  <div className="admin-price-type">
                    <span>{t('admin.services.prices.vehicleType')}</span>
                    <strong>{vehicleTypesById.get(Number(item.vehicle_type_id))?.type_name || t('admin.services.prices.typeUnavailable')}</strong>
                  </div>
                )}
                <label>
                  {t('admin.services.prices.priceLabel')}
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
                    aria-label={t('admin.services.prices.removeRowLabel')}
                    className="admin-inline-button admin-action-danger"
                    disabled={saving}
                    onClick={() => {
                      updatePriceRows(priceRows.filter((_, row) => row !== index))
                      setSaveMessage({ key: 'admin.services.prices.rowRemoved' })
                    }}
                    type="button"
                  >
                    {t('admin.services.prices.removeRow')}
                  </button>
                )}
              </div>
            ))}
          </div>
          {hasUnselectedPrice && (
            <p className="admin-price-hint">{t('admin.services.prices.chooseTypeHint')}</p>
          )}
          {activeVehicleTypes.length === 0 && (
            <p className="admin-price-hint">{t('admin.services.prices.noActiveTypes')}</p>
          )}
          {activeVehicleTypes.length > 0 && priceRows.length > 0 && !canAddVehicleType && (
            <p className="admin-price-hint">{t('admin.services.prices.allTypesPriced')}</p>
          )}
          {saveError && <div className="admin-alert admin-alert-error" role="alert">{messageText(saveError, t)}</div>}
          {saveMessage && <div className="admin-alert admin-alert-success" role="status">{messageText(saveMessage, t)}</div>}
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
              {t('admin.services.prices.addVehicleType')}
            </button>
            <button
              className="admin-primary-button"
              disabled={saving || priceRows.length === 0 || hasUnselectedPrice}
              type="submit"
            >
              {saving ? t('admin.common.saving') : t('admin.services.prices.save')}
            </button>
          </div>
        </form>
      )}
    </section>
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
                    return <button className="admin-inline-button admin-action-danger" onClick={() => setPricingServiceId(row.service_id)} type="button">{t('admin.services.table.setPrices')}</button>
                  }
                  const range = Number(row.min_price) === Number(row.max_price)
                    ? formatMoney(row.min_price, language)
                    : `${formatMoney(row.min_price, language)} – ${formatMoney(row.max_price, language)}`
                  return <span>{range} <small className="admin-muted">· {t('admin.services.table.typeCount', {
                    count: row.price_count,
                  })}</small></span>
                },
              },
              { key: 'status', label: t('admin.services.table.status'), render: (row) => <StatusBadge value={row.status} /> },
              { key: 'actions', label: t('admin.services.table.actions'), render: (row) => (
                <div className="admin-row-actions">
                  <button className="admin-inline-button" disabled={busy} onClick={() => { startEdit(row); setActionError(''); setFormOpen(true) }} type="button">{t('admin.services.table.edit')}</button>
                  <button className="admin-inline-button" onClick={() => setPricingServiceId(row.service_id)} type="button">{t('admin.services.table.prices')}</button>
                  <button className={`admin-inline-button ${row.status === 'ACTIVE' ? 'admin-action-danger' : 'admin-action-success'}`} disabled={busy} onClick={() => toggleStatus(row)} type="button">{t(row.status === 'ACTIVE' ? 'admin.services.action.deactivate' : 'admin.services.action.activate')}</button>
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
