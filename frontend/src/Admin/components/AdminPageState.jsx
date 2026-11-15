import formatStatusLabel from '../utils/formatStatusLabel.js'

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
  loadingMessage = 'Loading data from the backend…',
  emptyTitle = 'No records found',
  emptyDescription = 'Try changing the search or filters.',
}) {
  if (loading) {
    return (
      <div aria-live="polite" className="admin-request-state">
        <span aria-hidden="true" className="admin-spinner" />
        <span>{loadingMessage}</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="admin-alert admin-alert-error" role="alert">
        <span>{error}</span>
        {onRetry && (
          <button className="admin-inline-button" onClick={onRetry} type="button">
            Try again
          </button>
        )}
      </div>
    )
  }
  if (empty) {
    return <div className="admin-request-state"><strong>{emptyTitle}</strong><span>{emptyDescription}</span></div>
  }
  return null
}

export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null
  return (
    <div aria-label="Pagination" className="admin-pagination">
      <span>
        Page {pagination.page} of {pagination.totalPages} · {pagination.total} records
      </span>
      <div>
        <button
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          type="button"
        >
          Previous
        </button>
        <button
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export function DataTable({ columns, rows, rowKey }) {
  return (
    <div
      aria-keyshortcuts="ArrowLeft ArrowRight"
      aria-label="Data table; use the left and right arrow keys to view all columns"
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
      <p className="admin-table-scroll-hint">Scroll horizontally to view all columns</p>
      <table className="admin-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row) : row.id ?? row.user_id ?? row.booking_id ?? index}>
              {columns.map((column) => (
                <td key={column.key}>
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
  const tone = String(value ?? '').toLowerCase().replaceAll('_', '-')
  return <span className={`admin-status-badge status-${tone}`}>{formatStatusLabel(value)}</span>
}

export function PaymentStatusBadge({ payment }) {
  return (
    <>
      <StatusBadge value={payment.payment_status} />
      {payment.payment_method === 'SIMULATED' && <span> (Demo — not a real payment)</span>}
    </>
  )
}
