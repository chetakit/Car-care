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

export function RequestState({ loading, error, empty, onRetry }) {
  if (loading) {
    return (
      <div aria-live="polite" className="admin-request-state">
        <span className="admin-spinner" />
        <span>Loading data from the backend…</span>
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
    return (
      <div className="admin-request-state">
        <strong>No records found</strong>
        <span>Try changing the search or filters.</span>
      </div>
    )
  }
  return null
}

export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null
  return (
    <div className="admin-pagination">
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
    <div className="admin-table-wrap">
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
  return <span className={`admin-status-badge status-${tone}`}>{value ?? '—'}</span>
}
