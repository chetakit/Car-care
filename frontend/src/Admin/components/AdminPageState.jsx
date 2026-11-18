import formatStatusLabel from '../utils/formatStatusLabel.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <section className="admin-page-intro">
      <div>
        <p className="admin-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description && <p className="admin-muted">{description}</p>}
      </div>
      {action}
    </section>
  )
}

export function RequestState({
  loading,
  error,
  empty,
  onRetry,
  loadingMessage,
  emptyTitle,
  emptyDescription,
}) {
  const { t } = useLanguage()
  if (loading) {
    return (
      <div aria-live="polite" className="admin-request-state">
        <span aria-hidden="true" className="admin-spinner" />
        <span>{loadingMessage ?? t('admin.state.loading')}</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="admin-alert admin-alert-error" role="alert">
        <span>{error}</span>
        {onRetry && (
          <button className="admin-inline-button" onClick={onRetry} type="button">
            {t('admin.common.retry')}
          </button>
        )}
      </div>
    )
  }
  if (empty) {
    return (
      <div className="admin-request-state">
        <strong>{emptyTitle ?? t('admin.state.emptyTitle')}</strong>
        <span>{emptyDescription ?? t('admin.state.emptyDescription')}</span>
      </div>
    )
  }
  return null
}

export function Pagination({ pagination, onPageChange }) {
  const { t } = useLanguage()
  if (!pagination || pagination.totalPages <= 1) return null

  // Changing page brings the top of the table back into view instead of
  // leaving the reader at the bottom of the new page.
  function goTo(event, nextPage) {
    onPageChange(nextPage)
    const panel = event.currentTarget.closest('.admin-panel') ?? event.currentTarget.parentElement
    window.requestAnimationFrame(() => panel?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  return (
    <div aria-label={t('admin.pagination.label')} className="admin-pagination">
      <span>
        {t('admin.pagination.summary', {
          page: pagination.page,
          totalPages: pagination.totalPages,
          total: pagination.total,
        })}
      </span>
      <div>
        <button
          disabled={pagination.page <= 1}
          onClick={(event) => goTo(event, pagination.page - 1)}
          type="button"
        >
          {t('admin.pagination.previous')}
        </button>
        <button
          disabled={pagination.page >= pagination.totalPages}
          onClick={(event) => goTo(event, pagination.page + 1)}
          type="button"
        >
          {t('admin.pagination.next')}
        </button>
      </div>
    </div>
  )
}

export function DataTable({ columns, rows, rowKey }) {
  const { t } = useLanguage()
  return (
    <div
      aria-keyshortcuts="ArrowLeft ArrowRight"
      aria-label={t('admin.table.ariaLabel')}
      className="admin-table-scroll-region admin-table-wrap"
      role="region"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        event.currentTarget.scrollBy({
          left: event.key === 'ArrowRight' ? 80 : -80,
          behavior: 'auto',
        })
      }}
    >
      <p className="admin-table-scroll-hint">{t('admin.table.scrollHint')}</p>
      <table className="admin-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row) : row.id ?? row.user_id ?? row.booking_id ?? index}>
              {columns.map((column) => (
                <td className={column.wrap ? 'admin-cell-wrap' : undefined} key={column.key}>
                  {column.render ? column.render(row) : (row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function StatusBadge({ value }) {
  const { language } = useLanguage()
  const tone = String(value ?? '').toLowerCase().replaceAll('_', '-')
  return <span className={`admin-status-badge status-${tone}`}>{formatStatusLabel(value, language)}</span>
}

export function PaymentStatusBadge({ payment }) {
  const { t } = useLanguage()
  return (
    <>
      <StatusBadge value={payment.payment_status} />
      {payment.payment_method === 'SIMULATED' && <span className="admin-payment-method-note">{t('admin.payment.online')}</span>}
    </>
  )
}
