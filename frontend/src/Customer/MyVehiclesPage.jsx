import { useEffect, useMemo, useRef, useState } from 'react'
import { createApiClient } from '../Admin/api/client.js'
import useAuth from '../auth/useAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import LanguageToggle from '../i18n/LanguageToggle.jsx'
import CustomerHeader from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import './customer.css'
import './vehicles.css'

const EMPTY_FORM = {
  vehicle_type_id: '',
  brand_id: '',
  model_id: '',
  license_plate: '',
  production_year: '',
  province: '',
  color: '',
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function VehicleIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
      <path d="M7 29.5h3l3.2-10.2a4 4 0 0 1 3.8-2.8h14a4 4 0 0 1 3.8 2.8L38 29.5h3v7h-3.5v3h-5v-3h-17v3h-5v-3H7v-7Z" />
      <path d="M13.5 28h21l-2.7-8H16.2l-2.7 8ZM15 32.5h.1m17.8 0h.1" />
    </svg>
  )
}

function VehicleCard({ vehicle, onEdit, onDelete, t }) {
  const vehicleName = [vehicle.brand_name, vehicle.model_name]
    .filter(Boolean)
    .join(' ')
  const vehicleDetails = [
    vehicle.type_name,
    vehicle.production_year,
    vehicle.color,
  ].filter(Boolean)

  return (
    <article className="vehicles-card">
      <div className="vehicles-card-top">
        <span className="vehicles-card-icon">
          <VehicleIcon />
        </span>
        {vehicle.status && (
          <span className={`vehicles-status${vehicle.status === 'ACTIVE' ? ' is-active' : ''}`}>
            {vehicle.status}
          </span>
        )}
      </div>
      <h2>{vehicleName || t('customer.common.vehicle')}</h2>
      <p className="vehicles-license-plate">{vehicle.license_plate}</p>
      {vehicleDetails.length > 0 && (
        <p className="vehicles-card-details">{vehicleDetails.join(' · ')}</p>
      )}
      {vehicle.province && (
        <p className="vehicles-card-location">{vehicle.province}</p>
      )}
      <div className="vehicles-card-actions">
        <a
          className="vehicles-edit-button"
          href={`/customer/vehicles/${vehicle.vehicle_id}/bookings`}
        >
          {t('customer.vehicles.serviceHistory')}
        </a>
        <button
          className="vehicles-edit-button"
          onClick={(event) => onEdit(vehicle, event)}
          type="button"
        >
          {t('customer.vehicles.edit')}
        </button>
        <button
          aria-label={t('customer.vehicles.deleteLabel', {
            vehicle: vehicleName || vehicle.license_plate,
          })}
          className="vehicles-delete-button"
          onClick={(event) => onDelete(vehicle, event)}
          type="button"
        >
          {t('customer.vehicles.delete')}
        </button>
      </div>
    </article>
  )
}

function VehicleFormDialog({
  catalogState,
  editingVehicle,
  error,
  form,
  models,
  onChange,
  onClose,
  onValidationError,
  onSubmit,
  submitting,
  vehicleBrands,
  vehicleTypes,
  t,
}) {
  const dialogRef = useRef(null)
  const availableModels = models.filter((model) =>
    (!form.vehicle_type_id ||
      Number(model.vehicle_type_id) === Number(form.vehicle_type_id)) &&
    (!form.brand_id || Number(model.brand_id) === Number(form.brand_id)),
  )
  const existingModelMissing =
    editingVehicle &&
    Number(form.model_id) === Number(editingVehicle.model_id) &&
    !models.some((model) => Number(model.model_id) === Number(editingVehicle.model_id))

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined

    dialog.showModal()
    dialog.querySelector('select[required]')?.focus()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
        aria-labelledby="vehicles-form-title"
        aria-describedby="vehicles-form-description"
        className="vehicles-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            if (!submitting) onClose()
          }
        }}
        onCancel={(event) => {
          event.preventDefault()
          if (!submitting) onClose()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !submitting) onClose()
        }}
        ref={dialogRef}
        role="dialog"
    >
        <div className="vehicles-dialog-heading">
          <div>
            <span className="customer-eyebrow">{t('customer.vehicles.eyebrow')}</span>
            <h2 id="vehicles-form-title">
              {t(editingVehicle ? 'customer.vehicles.editTitle' : 'customer.vehicles.addTitle')}
            </h2>
            <p id="vehicles-form-description">{t('customer.vehicles.dialogDescription')}</p>
          </div>
          <button
            aria-label={t('customer.vehicles.closeDialog')}
            className="vehicles-dialog-close"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        {catalogState === 'error' && (
          <p className="vehicles-inline-note">
            {t('customer.vehicles.catalogLoadNote')}
          </p>
        )}

        <form className="vehicles-form" onSubmit={onSubmit}>
          <div className="vehicles-form-grid">
            <label>
              {t('customer.vehicles.type')}
              <select
                onChange={(event) => onChange('vehicle_type_id', event.target.value)}
                value={form.vehicle_type_id}
              >
                <option value="">{t('customer.vehicles.allTypes')}</option>
                {vehicleTypes.map((type) => (
                  <option key={type.vehicle_type_id} value={type.vehicle_type_id}>
                    {type.type_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('customer.vehicles.brand')}
              <select
                onChange={(event) => onChange('brand_id', event.target.value)}
                value={form.brand_id}
              >
                <option value="">{t('customer.vehicles.allBrands')}</option>
                {vehicleBrands.map((brand) => (
                  <option key={brand.brand_id} value={brand.brand_id}>
                    {brand.brand_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="vehicles-form-wide">
              {t('customer.vehicles.model')} <span aria-hidden="true">*</span>
              <select
                autoFocus
                onChange={(event) => onChange('model_id', event.target.value)}
                onInvalid={(event) => {
                  event.preventDefault()
                  onValidationError('customer.vehicles.selectVehicleModel')
                }}
                required
                value={form.model_id}
              >
                <option value="">{t('customer.vehicles.selectModel')}</option>
                {existingModelMissing && (
                  <option disabled value={form.model_id}>
                    {t('customer.vehicles.currentModel', {
                      model: [editingVehicle.brand_name, editingVehicle.model_name]
                        .filter(Boolean)
                        .join(' ') || editingVehicle.model_id,
                    })}
                    {catalogState === 'ready' && ` (${t('customer.vehicles.notActiveCatalog')})`}
                  </option>
                )}
                {availableModels.map((model) => (
                  <option key={model.model_id} value={model.model_id}>
                    {[model.brand_name, model.model_name].filter(Boolean).join(' ')}
                    {model.type_name ? ` · ${model.type_name}` : ''}
                  </option>
                ))}
              </select>
              {catalogState === 'loading' && (
                <small className="vehicles-field-note">{t('customer.vehicles.loadingModels')}</small>
              )}
            </label>
            <label>
              {t('customer.vehicles.licensePlate')} <span aria-hidden="true">*</span>
              <input
                autoComplete="off"
                onChange={(event) => onChange('license_plate', event.target.value)}
                onInvalid={(event) => {
                  event.preventDefault()
                  onValidationError('customer.vehicles.enterPlate')
                }}
                required
                value={form.license_plate}
              />
            </label>
            <label>
              {t('customer.vehicles.productionYear')}
              <input
                max="2155"
                min="1901"
                onChange={(event) => onChange('production_year', event.target.value)}
                onInvalid={(event) => {
                  event.preventDefault()
                  onValidationError('customer.vehicles.invalidYear')
                }}
                type="number"
                value={form.production_year}
              />
              <small className="vehicles-field-note">
                {t('customer.vehicles.yearRange', { min: 1901, max: 2155 })}
              </small>
            </label>
            <label>
              {t('customer.vehicles.province')}
              <input
                onChange={(event) => onChange('province', event.target.value)}
                value={form.province}
              />
              <small className="vehicles-field-note">{t('customer.common.optional')}</small>
            </label>
            <label>
              {t('customer.vehicles.color')}
              <input
                onChange={(event) => onChange('color', event.target.value)}
                value={form.color}
              />
              <small className="vehicles-field-note">{t('customer.common.optional')}</small>
            </label>
          </div>

          {error && (
            <p className="vehicles-form-error" role="alert">
              {t(error, { min: 1901, max: 2155 })}
            </p>
          )}

          <div className="vehicles-dialog-actions">
            <LanguageToggle />
            <button
              className="vehicles-cancel-button"
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              {t('customer.vehicles.cancel')}
            </button>
            <button
              className="customer-button customer-button-primary"
              disabled={submitting || (catalogState === 'loading' && !editingVehicle)}
              type="submit"
            >
              {t(submitting
                ? 'customer.vehicles.saving'
                : editingVehicle
                  ? 'customer.vehicles.saveChanges'
                  : 'customer.vehicles.add')}
            </button>
          </div>
        </form>
    </dialog>
  )
}

function DeleteVehicleDialog({ error, onCancel, onConfirm, submitting, vehicle, t }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined

    dialog.showModal()
    dialog.querySelector('.vehicles-cancel-button')?.focus()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
        aria-labelledby="vehicles-delete-title"
        aria-describedby="vehicles-delete-description"
        className="vehicles-dialog vehicles-delete-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            if (!submitting) onCancel()
          }
        }}
        onCancel={(event) => {
          event.preventDefault()
          if (!submitting) onCancel()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !submitting) onCancel()
        }}
        ref={dialogRef}
        role="dialog"
    >
        <span className="vehicles-delete-symbol" aria-hidden="true">!</span>
        <h2 id="vehicles-delete-title">{t('customer.vehicles.removeTitle')}</h2>
        <p id="vehicles-delete-description">
          {t('customer.vehicles.removeDescription', { plate: vehicle.license_plate })}
        </p>
        {error && <p className="vehicles-form-error" role="alert">{t(error)}</p>}
        <div className="vehicles-dialog-actions">
          <LanguageToggle />
          <button
            autoFocus
            className="vehicles-cancel-button"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            {t('customer.vehicles.keep')}
          </button>
          <button
            className="vehicles-confirm-delete"
            disabled={submitting}
            onClick={onConfirm}
            type="button"
          >
            {t(submitting ? 'customer.vehicles.removing' : 'customer.vehicles.remove')}
          </button>
        </div>
    </dialog>
  )
}

function MyVehiclesPage({ user, onLogout }) {
  const { token, handleUnauthorized } = useAuth()
  const { t } = useLanguage()
  const api = useMemo(
    () => createApiClient(token, handleUnauthorized),
    [handleUnauthorized, token],
  )
  const [vehicles, setVehicles] = useState([])
  const [vehicleState, setVehicleState] = useState('loading')
  const [vehicleReload, setVehicleReload] = useState(0)
  const [vehicleTypes, setVehicleTypes] = useState([])
  const [vehicleBrands, setVehicleBrands] = useState([])
  const [vehicleModels, setVehicleModels] = useState([])
  const [catalogState, setCatalogState] = useState('loading')
  const [catalogReload, setCatalogReload] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState('')
  const addVehicleButtonRef = useRef(null)
  const dialogTriggerRef = useRef(null)
  const vehiclesHeadingRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    api('/api/customer/vehicles', { signal: controller.signal })
      .then((response) => {
        const items = response.data?.items
        if (!Array.isArray(items)) {
          throw new Error('The vehicle list returned an invalid response.')
        }
        setVehicles(items)
        setVehicleState('ready')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setVehicleState('error')
      })
    return () => controller.abort()
  }, [api, vehicleReload])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      api('/api/customer/catalog/vehicle-types', { signal: controller.signal }),
      api('/api/customer/catalog/vehicle-brands', { signal: controller.signal }),
      api('/api/customer/catalog/vehicle-models', { signal: controller.signal }),
    ])
      .then(([typeResponse, brandResponse, modelResponse]) => {
        const types = typeResponse.data?.items
        const brands = brandResponse.data?.items
        const models = modelResponse.data?.items
        if (![types, brands, models].every(Array.isArray)) {
          throw new Error('The vehicle catalog returned an invalid response.')
        }
        setVehicleTypes(types)
        setVehicleBrands(brands)
        setVehicleModels(models)
        setCatalogState('ready')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setCatalogState('error')
      })
    return () => controller.abort()
  }, [api, catalogReload])

  function restoreDialogFocus() {
    const trigger = dialogTriggerRef.current
    const addButton = addVehicleButtonRef.current
    const target = trigger?.isConnected
      ? trigger
      : addButton?.disabled
        ? vehiclesHeadingRef.current
        : addButton
    target?.focus()
    dialogTriggerRef.current = null
  }

  useEffect(() => {
    if (!formOpen && !pendingDelete && dialogTriggerRef.current) {
      restoreDialogFocus()
    }
  }, [formOpen, pendingDelete])

  function openAddDialog(event) {
    dialogTriggerRef.current = event.currentTarget
    setEditingVehicle(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setFormOpen(true)
  }

  function openEditDialog(vehicle, event) {
    dialogTriggerRef.current = event.currentTarget
    const model = vehicleModels.find(
      (item) => Number(item.model_id) === Number(vehicle.model_id),
    )
    setEditingVehicle(vehicle)
    setForm({
      vehicle_type_id: model ? String(model.vehicle_type_id) : '',
      brand_id: model ? String(model.brand_id) : '',
      model_id: String(vehicle.model_id),
      license_plate: vehicle.license_plate ?? '',
      production_year:
        vehicle.production_year === null || vehicle.production_year === undefined
          ? ''
          : String(vehicle.production_year),
      province: vehicle.province ?? '',
      color: vehicle.color ?? '',
    })
    setFormError('')
    setFormOpen(true)
  }

  function closeForm() {
    if (submitting) return
    setFormOpen(false)
    setEditingVehicle(null)
    setFormError('')
  }

  function updateForm(field, value) {
    setForm((current) => {
      if (field === 'vehicle_type_id' || field === 'brand_id') {
        return { ...current, [field]: value, model_id: '' }
      }
      if (field === 'model_id') {
        const model = vehicleModels.find(
          (item) => String(item.model_id) === value,
        )
        return {
          ...current,
          model_id: value,
          ...(model
            ? {
                vehicle_type_id: String(model.vehicle_type_id),
                brand_id: String(model.brand_id),
              }
            : {}),
        }
      }
      return { ...current, [field]: value }
    })
    setFormError('')
  }

  async function saveVehicle(event) {
    event.preventDefault()
    setFormError('')

    const licensePlate = normalizeText(form.license_plate)
    if (!licensePlate) {
      setFormError('customer.vehicles.enterPlate')
      return
    }
    if (!form.model_id) {
      setFormError('customer.vehicles.selectVehicleModel')
      return
    }

    const currentModelUnchanged =
      editingVehicle &&
      Number(form.model_id) === Number(editingVehicle.model_id)
    const selectedActiveModel = vehicleModels.some(
      (model) => Number(model.model_id) === Number(form.model_id),
    )
    if (!selectedActiveModel && !currentModelUnchanged) {
      setFormError('customer.vehicles.selectActiveModel')
      return
    }

    const yearText = normalizeText(form.production_year)
    const productionYear = yearText === '' ? null : Number(yearText)
    if (
      yearText !== '' &&
      (!Number.isInteger(productionYear) ||
        productionYear < 1901 ||
        productionYear > 2155)
    ) {
      setFormError('customer.vehicles.invalidYear')
      return
    }

    const payload = {}
    if (
      !editingVehicle ||
      Number(form.model_id) !== Number(editingVehicle.model_id)
    ) {
      payload.model_id = Number(form.model_id)
    }
    if (
      !editingVehicle ||
      licensePlate !== normalizeText(editingVehicle.license_plate)
    ) {
      payload.license_plate = licensePlate
    }
    if (
      !editingVehicle &&
      yearText !== ''
    ) {
      payload.production_year = productionYear
    } else if (
      editingVehicle &&
      yearText !== normalizeText(editingVehicle.production_year)
    ) {
      payload.production_year = productionYear
    }

    for (const field of ['province', 'color']) {
      const value = normalizeText(form[field])
      const originalValue = normalizeText(editingVehicle?.[field])
      if (!editingVehicle && value !== '') {
        payload[field] = value
      } else if (editingVehicle && value !== originalValue) {
        payload[field] = value || null
      }
    }

    if (editingVehicle && Object.keys(payload).length === 0) {
      setFormError('customer.vehicles.updateAtLeastOne')
      return
    }

    setSubmitting(true)
    try {
      const response = await api(
        editingVehicle
          ? `/api/customer/vehicles/${editingVehicle.vehicle_id}`
          : '/api/customer/vehicles',
        {
          method: editingVehicle ? 'PATCH' : 'POST',
          body: payload,
        },
      )
      const savedVehicle = response.data?.vehicle
      if (!savedVehicle) {
        setFormError('customer.vehicles.serverUnconfirmed')
        return
      }

      setVehicles((current) =>
        editingVehicle
          ? current.map((vehicle) =>
              Number(vehicle.vehicle_id) === Number(savedVehicle.vehicle_id)
                ? savedVehicle
                : vehicle,
            )
          : [savedVehicle, ...current],
      )
      setVehicleState('ready')
      setNotice(editingVehicle ? 'customer.vehicles.updated' : 'customer.vehicles.added')
      restoreDialogFocus()
      setFormOpen(false)
      setEditingVehicle(null)
    } catch {
      setFormError('customer.vehicles.saveError')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleteError('')
    setDeleting(true)
    try {
      await api(`/api/customer/vehicles/${pendingDelete.vehicle_id}`, {
        method: 'DELETE',
      })
      setVehicles((current) =>
        current.filter(
          (vehicle) =>
            Number(vehicle.vehicle_id) !== Number(pendingDelete.vehicle_id),
        ),
      )
      dialogTriggerRef.current = null
      restoreDialogFocus()
      setPendingDelete(null)
      setNotice('customer.vehicles.removed')
    } catch {
      setDeleteError('customer.vehicles.removeError')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="customer-home customer-vehicles">
      <CustomerHeader onLogout={onLogout} user={user} />
      <main className="vehicles-main">
        <div className="customer-container">
          <nav aria-label={t('customer.profile.breadcrumbLabel')} className="vehicles-breadcrumb">
            <a href="/customer">{t('customer.common.home')}</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{t('customer.vehicles.title')}</span>
          </nav>

          <div className="vehicles-heading">
            <div>
              <span className="customer-eyebrow">{t('customer.vehicles.eyebrow')}</span>
              <h1 ref={vehiclesHeadingRef} tabIndex="-1">{t('customer.vehicles.title')}</h1>
              <p>{t('customer.vehicles.description')}</p>
            </div>
            <button
              className="customer-button customer-button-primary"
              disabled={catalogState === 'loading' || vehicleModels.length === 0}
              onClick={openAddDialog}
              ref={addVehicleButtonRef}
              type="button"
            >
              <span aria-hidden="true" className="vehicles-plus">+</span>
              {t('customer.vehicles.add')}
            </button>
          </div>

          {notice && (
            <p className="vehicles-success" role="status">
              <span aria-hidden="true">✓</span>
              {t(notice)}
            </p>
          )}

          {catalogState === 'loading' && (
            <div aria-live="polite" className="vehicles-catalog-state">
              <span className="customer-loader" />
              {t('customer.vehicles.catalogLoading')}
            </div>
          )}
          {catalogState === 'error' && (
            <div className="vehicles-catalog-state vehicles-error-state" role="alert">
              <span>{t('customer.vehicles.catalogError')}</span>
              <button
                onClick={() => {
                  setCatalogState('loading')
                  setCatalogReload((value) => value + 1)
                }}
                type="button"
              >
                {t('customer.common.retry')}
              </button>
            </div>
          )}
          {catalogState === 'ready' && vehicleModels.length === 0 && (
            <div className="vehicles-catalog-state">
              {t('customer.vehicles.noActiveModels')}
            </div>
          )}

          {vehicleState === 'loading' && (
            <div aria-live="polite" className="vehicles-list-state">
              <span className="customer-loader" />
              {t('customer.vehicles.loadingVehicles')}
            </div>
          )}
          {vehicleState === 'error' && (
            <div className="vehicles-list-state vehicles-error-state" role="alert">
              <p>{t('customer.vehicles.loadError')}</p>
              <button
                onClick={() => {
                  setVehicleState('loading')
                  setVehicleReload((value) => value + 1)
                }}
                type="button"
              >
                {t('customer.common.retry')}
              </button>
            </div>
          )}
          {vehicleState === 'ready' && vehicles.length === 0 && (
            <section aria-labelledby="vehicles-empty-title" className="vehicles-empty">
              <span className="vehicles-empty-icon">
                <VehicleIcon />
              </span>
              <span className="customer-eyebrow">{t('customer.vehicles.emptyEyebrow')}</span>
              <h2 id="vehicles-empty-title">{t('customer.vehicles.emptyTitle')}</h2>
              <p>{t('customer.vehicles.emptyDescription')}</p>
              <button
                className="customer-button customer-button-primary"
                disabled={catalogState !== 'ready' || vehicleModels.length === 0}
                onClick={openAddDialog}
                type="button"
              >
                {t('customer.vehicles.addFirst')}
              </button>
            </section>
          )}
          {vehicleState === 'ready' && vehicles.length > 0 && (
            <div className="vehicles-card-grid">
              {vehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.vehicle_id}
                  onDelete={(selected, event) => {
                    dialogTriggerRef.current = event.currentTarget
                    setPendingDelete(selected)
                    setDeleteError('')
                  }}
                  onEdit={openEditDialog}
                  t={t}
                  vehicle={vehicle}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <CustomerFooter />

      {formOpen && (
        <VehicleFormDialog
          catalogState={catalogState}
          editingVehicle={editingVehicle}
          error={formError}
          form={form}
          models={vehicleModels}
          onChange={updateForm}
          onClose={closeForm}
          onValidationError={setFormError}
          onSubmit={saveVehicle}
          submitting={submitting}
          vehicleBrands={vehicleBrands}
          vehicleTypes={vehicleTypes}
          t={t}
        />
      )}
      {pendingDelete && (
        <DeleteVehicleDialog
          error={deleteError}
          onCancel={() => {
            if (!deleting) {
              setPendingDelete(null)
            }
          }}
          onConfirm={confirmDelete}
          submitting={deleting}
          t={t}
          vehicle={pendingDelete}
        />
      )}
    </div>
  )
}

export default MyVehiclesPage
