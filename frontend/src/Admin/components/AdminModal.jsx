import { useEffect, useId, useRef } from 'react'

function AdminModal({
  open,
  title,
  description,
  submitLabel,
  submitting,
  error,
  onClose,
  onSubmit,
  children,
}) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const formId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) return undefined

    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [open])

  function handleCancel(event) {
    event.preventDefault()
    if (!submitting) onClose()
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget && !submitting) onClose()
  }

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className="admin-modal"
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      ref={dialogRef}
    >
      <div className="admin-modal-card">
        <header className="admin-modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            aria-label="Close dialog"
            className="admin-modal-close"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <form id={formId} onSubmit={onSubmit}>
          <div className="admin-modal-body">
            {error && <div className="admin-alert admin-alert-error" role="alert">{error}</div>}
            {children}
          </div>
          <footer className="admin-modal-footer">
            <button
              className="admin-secondary-button"
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button className="admin-primary-button" disabled={submitting} form={formId} type="submit">
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </footer>
        </form>
      </div>
    </dialog>
  )
}

export default AdminModal
