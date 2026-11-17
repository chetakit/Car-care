import { useState } from 'react'
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
  start_date: '',
  end_date: '',
}

function CouponUsages({ couponId, onClose }) {
  const [page, setPage] = useState(1)
  const params = new URLSearchParams({ page: String(page), limit: String(ADMIN_PAGE_SIZE) })
  const { data, loading, error, refresh } = useRemoteData(
    `/api/admin/coupons/${couponId}/usages?${params}`,
  )
  const rows = data?.items ?? []
  return (
    <section className="admin-panel admin-data-panel admin-coupon-usages">
      <div className="admin-panel-heading">
        <div><h3>Usage history · Coupon #{couponId}</h3><p>Bookings that have used this coupon</p></div>
        <button className="admin-inline-button" onClick={onClose} type="button">Close</button>
      </div>
      <RequestState
        empty={!rows.length}
        emptyDescription="No coupon usage records were returned for this coupon."
        emptyTitle="No usage history"
        error={error}
        loading={loading}
        loadingMessage="Loading coupon usage…"
        onRetry={refresh}
      />
      {!loading && !error && !!rows.length && (
        <>
          <DataTable columns={[
            { key: 'coupon_usage_id', label: 'Usage ID' },
            { key: 'booking_id', label: 'Booking' },
            { key: 'full_name', label: 'Customer' },
            { key: 'discount_amount', label: 'Discount' },
            { key: 'used_at', label: 'Used at', render: (row) => formatDateTime(row.used_at) },
          ]} rows={rows} />
          <Pagination onPageChange={setPage} pagination={data?.pagination} />
        </>
      )}
    </section>
  )
}

function CouponsPage() {
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
      start_date: row.start_date ? String(row.start_date).replace('T', ' ').slice(0, 16) : '',
      end_date: row.end_date ? String(row.end_date).replace('T', ' ').slice(0, 16) : '',
    })
  }

  async function submitCoupon(event) {
    event.preventDefault()
    setActionError('')
    setMessage('')
    if (form.start_date && form.end_date && form.end_date <= form.start_date) {
      setActionError('End date and time must be after the start date and time.')
      return
    }
    setBusy(true)
    const body = {
      ...form,
      discount_value: String(form.discount_value),
      max_discount: form.max_discount === '' ? null : String(form.max_discount),
      usage_limit: form.usage_limit === '' ? null : Number(form.usage_limit),
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
      setMessage(editing ? 'Coupon updated.' : 'Coupon created.')
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
    const action = nextStatus === 'ACTIVE' ? 'activate' : 'deactivate'
    if (!window.confirm(`Are you sure you want to ${action} coupon ${row.coupon_code}?`)) return

    setBusy(true)
    setActionError('')
    setMessage('')
    try {
      await api(`/api/admin/coupons/${row.coupon_id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      setMessage(`Coupon ${row.coupon_code} ${nextStatus === 'ACTIVE' ? 'activated' : 'deactivated'}.`)
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
            <button className="admin-primary-button" onClick={openCreateForm} type="button">+ Add coupon</button>
          </div>
        )}
        description="Create discount codes and see how often each one is used."
        eyebrow="PROMOTIONS"
        title="Coupons"
      />
      {formOpen && (
        <AdminModal
          description="Enter the coupon details below."
          error={actionError}
          onClose={() => {
            if (busy) return
            setFormOpen(false)
            setEditing(null)
            setForm(blankCoupon)
            setActionError('')
          }}
          onSubmit={submitCoupon}
          open={formOpen}
          submitLabel={editing ? 'Save changes' : 'Create coupon'}
          submitting={busy}
          title={editing ? `Edit coupon #${editing}` : 'Add a coupon'}
        >
          <div className="admin-form-grid">
            <label>Coupon code<input autoFocus maxLength="50" onChange={(e) => setForm({ ...form, coupon_code: e.target.value })} required value={form.coupon_code} /></label>
            <label>Discount type<select onChange={(e) => setForm({ ...form, discount_type: e.target.value })} value={form.discount_type}><option value="PERCENT">Percent</option><option value="FIXED">Fixed amount</option></select></label>
            <label>Discount value<input min="0" onChange={(e) => setForm({ ...form, discount_value: e.target.value })} required step="0.01" type="number" value={form.discount_value} /></label>
            <label>Max discount<input min="0" onChange={(e) => setForm({ ...form, max_discount: e.target.value })} step="0.01" type="number" value={form.max_discount} /></label>
            <label>Minimum order<input min="0" onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })} step="0.01" type="number" value={form.min_order_amount} /></label>
            <label>Usage limit<input min="0" onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} type="number" value={form.usage_limit} /></label>
            <label>Start date<input onChange={(e) => { setForm({ ...form, start_date: e.target.value }); setActionError('') }} required type="datetime-local" value={form.start_date.replace(' ', 'T')} /></label>
            <label>End date<input onChange={(e) => { setForm({ ...form, end_date: e.target.value }); setActionError('') }} required type="datetime-local" value={form.end_date.replace(' ', 'T')} /></label>
            <label className="admin-form-wide">Description<textarea onChange={(e) => setForm({ ...form, description: e.target.value })} value={form.description} /></label>
          </div>
        </AdminModal>
      )}
      {!formOpen && (message || actionError) && <div className={`admin-alert ${actionError ? 'admin-alert-error' : 'admin-alert-success'}`} role={actionError ? 'alert' : 'status'}>{actionError || message}</div>}
      <form className="admin-filter-bar" onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied(Object.fromEntries(Object.entries(filters).filter(([, value]) => value))) }}>
        <input aria-label="Search coupons" maxLength="100" onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search coupon code" value={filters.search} />
        <select aria-label="Coupon status filter" onChange={(e) => setFilters({ ...filters, status: e.target.value })} value={filters.status}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
        <select aria-label="Discount type filter" onChange={(e) => setFilters({ ...filters, discount_type: e.target.value })} value={filters.discount_type}><option value="">All types</option><option value="PERCENT">Percent</option><option value="FIXED">Fixed amount</option></select>
        <button className="admin-primary-button" type="submit">Apply</button>
      </form>
      <section className="admin-panel admin-data-panel">
        <RequestState
          empty={!rows.length}
          emptyDescription="Try a different coupon code, status, or discount type."
          emptyTitle="No coupons match these filters"
          error={error}
          loading={loading}
          loadingMessage="Loading coupons…"
          onRetry={refresh}
        />
        {!loading && !error && !!rows.length && (
          <>
            <DataTable columns={[
              { key: 'coupon_id', label: 'ID' },
              { key: 'coupon_code', label: 'Code' },
              { key: 'discount_type', label: 'Type', render: (row) => row.discount_type === 'PERCENT' ? 'Percent' : 'Fixed amount' },
              { key: 'discount_value', label: 'Discount', render: (row) => row.discount_type === 'PERCENT' ? `${row.discount_value}%` : formatMoney(row.discount_value) },
              { key: 'used_count', label: 'Used / limit', render: (row) => `${row.used_count ?? 0} / ${row.usage_limit ?? 'Unlimited'}` },
              { key: 'end_date', label: 'Ends', render: (row) => formatDateTime(row.end_date) },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { key: 'actions', label: 'Actions', render: (row) => <div className="admin-row-actions"><button className="admin-inline-button" disabled={busy} onClick={() => { beginEdit(row); setActionError(''); setFormOpen(true) }} type="button">Edit</button><button className="admin-inline-button" onClick={() => setUsagesCouponId(row.coupon_id)} type="button">Usages</button><button className={`admin-inline-button ${row.status === 'ACTIVE' ? 'admin-action-danger' : 'admin-action-success'}`} disabled={busy} onClick={() => toggleStatus(row)} type="button">{row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button></div> },
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
