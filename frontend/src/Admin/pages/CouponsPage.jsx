import { useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import AdminModal from '../components/AdminModal.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDateTime } from '../utils/formatDate.js'
import formatMoney from '../utils/formatMoney.js'
import { ADMIN_PAGE_SIZE } from '../utils/pageSize.js'

const blankCoupon = {
  coupon_code: '',
  description: '',
  discount_type: 'PERCENT',
  discount_value: '',
  max_discount: '',
  min_order_amount: '',
  usage_limit: '',
  per_user_limit: '',
  start_date: '',
  end_date: '',
}

function messageText(message, t) {
  return message?.key ? t(message.key, message.params) : message
}

function CouponUsages({ couponId, onClose }) {
  const { language, t } = useLanguage()
  const [page, setPage] = useState(1)
  const params = new URLSearchParams({ page: String(page), limit: String(ADMIN_PAGE_SIZE) })
  const { data, loading, error, refresh } = useRemoteData(
    `/api/admin/coupons/${couponId}/usages?${params}`,
  )
  const rows = data?.items ?? []
  return (
    <section className="admin-panel admin-data-panel admin-coupon-usages">
      <div className="admin-panel-heading">
        <div><h3>{t('admin.coupons.usages.title', { id: couponId })}</h3><p>{t('admin.coupons.usages.description')}</p></div>
        <button className="admin-inline-button" onClick={onClose} type="button">{t('admin.common.close')}</button>
      </div>
      <RequestState
        empty={!rows.length}
        emptyDescription={t('admin.coupons.usages.emptyDescription')}
        emptyTitle={t('admin.coupons.usages.emptyTitle')}
        error={error}
        loading={loading}
        loadingMessage={t('admin.coupons.usages.loading')}
        onRetry={refresh}
      />
      {!loading && !error && !!rows.length && (
        <>
          <DataTable columns={[
            { key: 'coupon_usage_id', label: t('admin.coupons.usages.table.id') },
            { key: 'booking_id', label: t('admin.coupons.usages.table.booking') },
            { key: 'full_name', label: t('admin.coupons.usages.table.customer') },
            { key: 'discount_amount', label: t('admin.coupons.usages.table.discount'), render: (row) => formatMoney(row.discount_amount, language) },
            { key: 'used_at', label: t('admin.coupons.usages.table.usedAt'), render: (row) => formatDateTime(row.used_at, language) },
          ]} rows={rows} />
          <Pagination onPageChange={setPage} pagination={data?.pagination} />
        </>
      )}
    </section>
  )
}

function CouponsPage() {
  const { language, t } = useLanguage()
  const [filters, setFilters] = useState({ search: '', status: '', discount_type: '' })
  const [applied, setApplied] = useState({})
  const [page, setPage] = useState(1)
  const [form, setForm] = useState(blankCoupon)
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [usagesCouponId, setUsagesCouponId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const api = useApi()
  const params = new URLSearchParams({ page: String(page), limit: String(ADMIN_PAGE_SIZE), ...applied })
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/coupons?${params}`)
  const rows = data?.items ?? []

  function openCreateForm() {
    setEditing(null)
    setForm(blankCoupon)
    setActionError('')
    setFormOpen(true)
  }

  function beginEdit(row) {
    setEditing(row.coupon_id)
    setForm({
      coupon_code: row.coupon_code ?? '',
      description: row.description ?? '',
      discount_type: row.discount_type ?? 'PERCENT',
      discount_value: String(row.discount_value ?? ''),
      max_discount: row.max_discount == null ? '' : String(row.max_discount),
      min_order_amount: row.min_order_amount == null ? '' : String(row.min_order_amount),
      usage_limit: row.usage_limit == null ? '' : String(row.usage_limit),
      per_user_limit: row.per_user_limit == null ? '' : String(row.per_user_limit),
      start_date: row.start_date ? String(row.start_date).replace('T', ' ').slice(0, 16) : '',
      end_date: row.end_date ? String(row.end_date).replace('T', ' ').slice(0, 16) : '',
    })
  }

  async function submitCoupon(event) {
    event.preventDefault()
    setActionError('')
    setMessage('')
    if (form.start_date && form.end_date && form.end_date <= form.start_date) {
      setActionError({ key: 'admin.coupons.validation.dateRange' })
      return
    }
    setBusy(true)
    const body = {
      ...form,
      discount_value: String(form.discount_value),
      max_discount: form.max_discount === '' ? null : String(form.max_discount),
      usage_limit: form.usage_limit === '' ? null : Number(form.usage_limit),
      per_user_limit: form.per_user_limit === '' ? null : Number(form.per_user_limit),
      start_date: form.start_date.replace('T', ' '),
      end_date: form.end_date.replace('T', ' '),
    }
    if (form.min_order_amount === '') delete body.min_order_amount
    else body.min_order_amount = String(form.min_order_amount)
    try {
      await api(editing ? `/api/admin/coupons/${editing}` : '/api/admin/coupons', {
        method: editing ? 'PATCH' : 'POST',
        body,
      })
      setMessage({
        key: editing ? 'admin.coupons.feedback.updated' : 'admin.coupons.feedback.created',
      })
      setForm(blankCoupon)
      setEditing(null)
      setFormOpen(false)
      refresh()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(row) {
    const nextStatus = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const action = t(nextStatus === 'ACTIVE'
      ? 'admin.coupons.action.activateVerb'
      : 'admin.coupons.action.deactivateVerb')
    if (!window.confirm(t('admin.coupons.confirm.status', {
      action,
      code: row.coupon_code,
    }))) return

    setBusy(true)
    setActionError('')
    setMessage('')
    try {
      await api(`/api/admin/coupons/${row.coupon_id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      setMessage({
        key: nextStatus === 'ACTIVE'
          ? 'admin.coupons.feedback.activated'
          : 'admin.coupons.feedback.deactivated',
        params: { code: row.coupon_code },
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
            <button className="admin-secondary-button admin-refresh-button" onClick={refresh} type="button">{t('admin.coupons.refresh')}</button>
            <button className="admin-primary-button" onClick={openCreateForm} type="button">{t('admin.coupons.add')}</button>
          </div>
        )}
        description={t('admin.coupons.description')}
        eyebrow={t('admin.coupons.eyebrow')}
        title={t('admin.coupons.title')}
      />
      {formOpen && (
        <AdminModal
          description={t('admin.coupons.modal.description')}
          error={messageText(actionError, t)}
          onClose={() => {
            if (busy) return
            setFormOpen(false)
            setEditing(null)
            setForm(blankCoupon)
            setActionError('')
          }}
          onSubmit={submitCoupon}
          open={formOpen}
          submitLabel={t(editing ? 'admin.coupons.modal.save' : 'admin.coupons.modal.create')}
          submitting={busy}
          title={t(editing ? 'admin.coupons.modal.editTitle' : 'admin.coupons.modal.addTitle', {
            id: editing,
          })}
        >
          <div className="admin-form-grid">
            <label>{t('admin.coupons.form.code')}<input autoFocus maxLength="50" onChange={(e) => setForm({ ...form, coupon_code: e.target.value })} required value={form.coupon_code} /></label>
            <label>{t('admin.coupons.form.discountType')}<select onChange={(e) => setForm({ ...form, discount_type: e.target.value })} value={form.discount_type}><option value="PERCENT">{t('admin.coupons.discountType.percent')}</option><option value="FIXED">{t('admin.coupons.discountType.fixed')}</option></select></label>
            <label>{t('admin.coupons.form.discountValue')}<input min="0" onChange={(e) => setForm({ ...form, discount_value: e.target.value })} required step="0.01" type="number" value={form.discount_value} /></label>
            <label>{t('admin.coupons.form.maxDiscount')}<input min="0" onChange={(e) => setForm({ ...form, max_discount: e.target.value })} step="0.01" type="number" value={form.max_discount} /></label>
            <label>{t('admin.coupons.form.minimumOrder')}<input min="0" onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })} step="0.01" type="number" value={form.min_order_amount} /></label>
            <label>{t('admin.coupons.form.usageLimit')}<input min="0" onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} type="number" value={form.usage_limit} /></label>
            <label>
              {t('admin.coupons.form.perUserLimit')}
              <input min="1" onChange={(e) => setForm({ ...form, per_user_limit: e.target.value })} placeholder={t('admin.coupons.form.perUserLimitPlaceholder')} type="number" value={form.per_user_limit} />
            </label>
            <label>{t('admin.coupons.form.startDate')}<input onChange={(e) => { setForm({ ...form, start_date: e.target.value }); setActionError('') }} required type="datetime-local" value={form.start_date.replace(' ', 'T')} /></label>
            <label>{t('admin.coupons.form.endDate')}<input onChange={(e) => { setForm({ ...form, end_date: e.target.value }); setActionError('') }} required type="datetime-local" value={form.end_date.replace(' ', 'T')} /></label>
            <label className="admin-form-wide">{t('admin.coupons.form.description')}<textarea onChange={(e) => setForm({ ...form, description: e.target.value })} value={form.description} /></label>
          </div>
        </AdminModal>
      )}
      {!formOpen && (message || actionError) && <div className={`admin-alert ${actionError ? 'admin-alert-error' : 'admin-alert-success'}`} role={actionError ? 'alert' : 'status'}>{messageText(actionError || message, t)}</div>}
      <form className="admin-filter-bar" onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied(Object.fromEntries(Object.entries(filters).filter(([, value]) => value))) }}>
        <input aria-label={t('admin.coupons.search.label')} maxLength="100" onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder={t('admin.coupons.search.placeholder')} value={filters.search} />
        <select aria-label={t('admin.coupons.status.label')} onChange={(e) => setFilters({ ...filters, status: e.target.value })} value={filters.status}><option value="">{t('admin.coupons.status.all')}</option><option value="ACTIVE">{t('admin.status.active')}</option><option value="INACTIVE">{t('admin.status.inactive')}</option></select>
        <select aria-label={t('admin.coupons.discountType.label')} onChange={(e) => setFilters({ ...filters, discount_type: e.target.value })} value={filters.discount_type}><option value="">{t('admin.coupons.discountType.all')}</option><option value="PERCENT">{t('admin.coupons.discountType.percent')}</option><option value="FIXED">{t('admin.coupons.discountType.fixed')}</option></select>
        <button className="admin-primary-button" type="submit">{t('admin.coupons.search.submit')}</button>
      </form>
      <section className="admin-panel admin-data-panel">
        <RequestState
          empty={!rows.length}
          emptyDescription={t('admin.coupons.state.emptyDescription')}
          emptyTitle={t('admin.coupons.state.emptyTitle')}
          error={error}
          loading={loading}
          loadingMessage={t('admin.coupons.state.loading')}
          onRetry={refresh}
        />
        {!loading && !error && !!rows.length && (
          <>
            <DataTable columns={[
              { key: 'coupon_id', label: t('admin.coupons.table.id') },
              { key: 'coupon_code', label: t('admin.coupons.table.code') },
              { key: 'discount_type', label: t('admin.coupons.table.type'), render: (row) => t(row.discount_type === 'PERCENT' ? 'admin.coupons.discountType.percent' : 'admin.coupons.discountType.fixed') },
              { key: 'discount_value', label: t('admin.coupons.table.discount'), render: (row) => row.discount_type === 'PERCENT' ? `${row.discount_value}%` : formatMoney(row.discount_value, language) },
              { key: 'used_count', label: t('admin.coupons.table.usedLimit'), render: (row) => `${row.used_count ?? 0} / ${row.usage_limit ?? t('admin.coupons.table.unlimited')}` },
              { key: 'per_user_limit', label: t('admin.coupons.table.perUser'), render: (row) => (row.per_user_limit == null ? t('admin.coupons.table.unlimited') : t('admin.coupons.table.perUserValue', { count: row.per_user_limit })) },
              { key: 'end_date', label: t('admin.coupons.table.ends'), render: (row) => formatDateTime(row.end_date, language) },
              { key: 'status', label: t('admin.coupons.table.status'), render: (row) => <StatusBadge value={row.status} /> },
              { key: 'actions', label: t('admin.coupons.table.actions'), render: (row) => <div className="admin-row-actions"><button className="admin-inline-button" disabled={busy} onClick={() => { beginEdit(row); setActionError(''); setFormOpen(true) }} type="button">{t('admin.coupons.table.edit')}</button><button className="admin-inline-button" onClick={() => setUsagesCouponId(row.coupon_id)} type="button">{t('admin.coupons.table.usages')}</button><button className={`admin-inline-button ${row.status === 'ACTIVE' ? 'admin-action-danger' : 'admin-action-success'}`} disabled={busy} onClick={() => toggleStatus(row)} type="button">{t(row.status === 'ACTIVE' ? 'admin.coupons.action.deactivate' : 'admin.coupons.action.activate')}</button></div> },
            ]} rows={rows} />
            <Pagination onPageChange={setPage} pagination={data?.pagination} />
          </>
        )}
      </section>
      {usagesCouponId && <CouponUsages couponId={usagesCouponId} onClose={() => setUsagesCouponId(null)} />}
    </div>
  )
}

export default CouponsPage
