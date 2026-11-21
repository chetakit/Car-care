import { useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { DataTable, PageHeading, Pagination, RequestState } from '../components/AdminPageState.jsx'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDateTime } from '../utils/formatDate.js'

// Audit log: every important change made by an admin or staff account,
// newest first. Read-only - nothing here can be edited or deleted.
const CATEGORIES = ['', 'USER', 'SERVICE', 'COUPON', 'PAYMENT', 'BOOKING', 'VEHICLE', 'SCHEDULE']

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// "role: CUSTOMER → STAFF", one line per changed field.
function changeLines(item) {
  const before = item.old_value && typeof item.old_value === 'object' ? item.old_value : null
  const after = item.new_value && typeof item.new_value === 'object' ? item.new_value : null
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
  return keys.slice(0, 6).map((key) => ({
    key,
    text: before ? `${formatValue(before[key])} → ${formatValue(after?.[key])}` : formatValue(after?.[key]),
  }))
}

function AuditLogPage() {
  const { language, t } = useLanguage()
  const [category, setCategory] = useState('')
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (category) params.set('action', category)
  if (query) params.set('q', query)
  const { data, loading, error, refresh } = useRemoteData(`/api/admin/audit-logs?${params}`)
  const rows = data?.items ?? []

  const actionLabel = (action) => {
    const key = `admin.audit.action.${action}`
    const text = t(key)
    return text === key ? action : text
  }

  return (
    <div className="admin-audit-page">
      <PageHeading
        description={t('admin.audit.description')}
        eyebrow={t('admin.audit.eyebrow')}
        title={t('admin.audit.title')}
      />

      <form
        className="admin-filter-bar admin-audit-filters"
        onSubmit={(event) => {
          event.preventDefault()
          setQuery(searchText.trim())
          setPage(1)
        }}
      >
        <label>
          {t('admin.audit.filter.category')}
          <select
            onChange={(event) => {
              setCategory(event.target.value)
              setPage(1)
            }}
            value={category}
          >
            {CATEGORIES.map((value) => (
              <option key={value || 'all'} value={value}>
                {t(`admin.audit.category.${value || 'ALL'}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('admin.audit.filter.actor')}
          <input
            maxLength="100"
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t('admin.audit.filter.actorPlaceholder')}
            type="search"
            value={searchText}
          />
        </label>
        <button className="admin-primary-button" type="submit">{t('admin.payments.search.submit')}</button>
      </form>

      <section className="admin-panel admin-data-panel">
        <RequestState
          empty={!rows.length}
          emptyDescription={t('admin.audit.emptyDescription')}
          emptyTitle={t('admin.audit.emptyTitle')}
          error={error}
          loading={loading}
          loadingMessage={t('admin.audit.loading')}
          onRetry={refresh}
        />
        {!loading && !error && rows.length > 0 && (
          <DataTable
            columns={[
              { key: 'created_at', label: t('admin.audit.table.time'), render: (row) => formatDateTime(row.created_at, language) },
              {
                key: 'actor',
                label: t('admin.audit.table.actor'),
                render: (row) => (
                  <span className="admin-audit-actor">
                    <strong>{row.actor?.full_name || '—'}</strong>
                    <small>{row.actor ? `${row.actor.role} · ${row.actor.email}` : t('admin.audit.systemActor')}</small>
                  </span>
                ),
              },
              { key: 'action', label: t('admin.audit.table.action'), render: (row) => <span className="admin-audit-action">{actionLabel(row.action)}</span> },
              { key: 'record', label: t('admin.audit.table.record'), render: (row) => `${row.table_name} #${row.record_id}` },
              {
                key: 'changes',
                label: t('admin.audit.table.changes'),
                render: (row) => {
                  const lines = changeLines(row)
                  return lines.length ? (
                    <ul className="admin-audit-changes">
                      {lines.map((line) => (
                        <li key={line.key}><code>{line.key}</code> {line.text}</li>
                      ))}
                    </ul>
                  ) : '—'
                },
              },
              { key: 'reason', label: t('admin.audit.table.reason'), render: (row) => row.reason || '—' },
            ]}
            rowKey={(row) => row.audit_log_id}
            rows={rows}
          />
        )}
        {!loading && !error && <Pagination onPageChange={setPage} pagination={data?.pagination} />}
      </section>
    </div>
  )
}

export default AuditLogPage
