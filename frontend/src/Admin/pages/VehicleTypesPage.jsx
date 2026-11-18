import { useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDateTime } from '../utils/formatDate.js'
import { ADMIN_PAGE_SIZE } from '../utils/pageSize.js'

const blankForm = { type_name: '', description: '' }

function messageText(message, t) {
  return message?.key ? t(message.key, message.params) : message
}

function VehicleTypesPage({ onNavigate }) {
  const { language, t } = useLanguage()
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
      setActionError({ key: 'admin.vehicleTypes.validation.nameRequired' })
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await api(editing ? `/api/admin/vehicle-types/${editing.vehicle_type_id}` : '/api/admin/vehicle-types', {
        method: editing ? 'PATCH' : 'POST',
        body: { type_name: typeName, description: description || null },
      })
      setMessage({
        key: editing
          ? 'admin.vehicleTypes.feedback.updated'
          : 'admin.vehicleTypes.feedback.created',
        params: { name: typeName },
        showPricingLink: !editing,
      })
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
    const question = t(nextStatus === 'INACTIVE'
      ? 'admin.vehicleTypes.confirm.deactivate'
      : 'admin.vehicleTypes.confirm.activate', { name: row.type_name })
    if (!window.confirm(question)) return
    setBusy(true)
    setActionError('')
    setMessage('')
    try {
      await api(`/api/admin/vehicle-types/${row.vehicle_type_id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      setMessage({
        key: nextStatus === 'ACTIVE'
          ? 'admin.vehicleTypes.feedback.activated'
          : 'admin.vehicleTypes.feedback.deactivated',
        params: { name: row.type_name },
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
            <button className="admin-secondary-button admin-refresh-button" onClick={refresh} type="button">{t('admin.vehicleTypes.refresh')}</button>
            <button className="admin-primary-button" onClick={() => openForm()} type="button">{t('admin.vehicleTypes.add')}</button>
          </div>
        )}
        description={t('admin.vehicleTypes.description')}
        eyebrow={t('admin.vehicleTypes.eyebrow')}
        title={t('admin.vehicleTypes.title')}
      />
      {formOpen && (
        <AdminModal
          description={t(editing
            ? 'admin.vehicleTypes.modal.editDescription'
            : 'admin.vehicleTypes.modal.addDescription')}
          error={messageText(actionError, t)}
          onClose={closeForm}
          onSubmit={submit}
          open
          submitLabel={t(editing
            ? 'admin.vehicleTypes.modal.save'
            : 'admin.vehicleTypes.modal.add')}
          submitting={busy}
          title={t(editing
            ? 'admin.vehicleTypes.modal.editTitle'
            : 'admin.vehicleTypes.modal.addTitle', {
            name: editing?.type_name ?? '',
          })}
        >
          <div className="admin-form-grid">
            <label className="admin-form-wide">
              {t('admin.vehicleTypes.form.name')}
              <input autoFocus maxLength="50" onChange={(e) => setForm({ ...form, type_name: e.target.value })} placeholder={t('admin.vehicleTypes.form.namePlaceholder')} required value={form.type_name} />
            </label>
            <label className="admin-form-wide">
              {t('admin.vehicleTypes.form.descriptionOptional')}
              <textarea maxLength="255" onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('admin.vehicleTypes.form.descriptionPlaceholder')} value={form.description} />
            </label>
          </div>
        </AdminModal>
      )}
      {!formOpen && (message || actionError) && (
        <div className={`admin-alert ${actionError ? 'admin-alert-error' : 'admin-alert-success'}`} role={actionError ? 'alert' : 'status'}>
          {messageText(actionError || message, t)}
          {!actionError && message?.showPricingLink && (
            <> <button className="admin-inline-button" onClick={() => onNavigate?.('services')} type="button">{t('admin.vehicleTypes.goToServices')}</button></>
          )}
        </div>
      )}
      <form className="admin-filter-bar" onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied(Object.fromEntries(Object.entries(filters).filter(([, value]) => value.trim()))) }}>
        <input aria-label={t('admin.vehicleTypes.search.label')} maxLength="100" onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder={t('admin.vehicleTypes.search.placeholder')} value={filters.search} />
        <select aria-label={t('admin.vehicleTypes.status.label')} onChange={(e) => setFilters({ ...filters, status: e.target.value })} value={filters.status}>
          <option value="">{t('admin.vehicleTypes.status.all')}</option>
          <option value="ACTIVE">{t('admin.status.active')}</option>
          <option value="INACTIVE">{t('admin.status.inactive')}</option>
        </select>
        <button className="admin-primary-button" type="submit">{t('admin.vehicleTypes.search.submit')}</button>
      </form>
      <section className="admin-panel admin-data-panel">
        <RequestState
          empty={!rows.length}
          emptyDescription={t('admin.vehicleTypes.state.emptyDescription')}
          emptyTitle={t('admin.vehicleTypes.state.emptyTitle')}
          error={error}
          loading={loading}
          loadingMessage={t('admin.vehicleTypes.state.loading')}
          onRetry={refresh}
        />
        {!loading && !error && !!rows.length && (
          <>
            <DataTable
              columns={[
                { key: 'vehicle_type_id', label: t('admin.vehicleTypes.table.id') },
                { key: 'type_name', label: t('admin.vehicleTypes.table.name'), render: (row) => <strong>{row.type_name}</strong> },
                { key: 'description', label: t('admin.vehicleTypes.table.description'), render: (row) => row.description || '—', wrap: true },
                { key: 'updated_at', label: t('admin.vehicleTypes.table.updated'), render: (row) => formatDateTime(row.updated_at, language) },
                { key: 'status', label: t('admin.vehicleTypes.table.status'), render: (row) => <StatusBadge value={row.status} /> },
                {
                  key: 'actions',
                  label: t('admin.vehicleTypes.table.actions'),
                  render: (row) => (
                    <div className="admin-row-actions">
                      <button className="admin-inline-button" disabled={busy} onClick={() => openForm(row)} type="button">{t('admin.vehicleTypes.table.edit')}</button>
                      <button
                        className={`admin-inline-button ${row.status === 'ACTIVE' ? 'admin-action-danger' : 'admin-action-success'}`}
                        disabled={busy}
                        onClick={() => toggleStatus(row)}
                        type="button"
                      >
                        {t(row.status === 'ACTIVE'
                          ? 'admin.vehicleTypes.action.deactivate'
                          : 'admin.vehicleTypes.action.activate')}
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
