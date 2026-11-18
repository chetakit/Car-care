import { useEffect, useId, useRef } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

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
  // View-only dialogs show a single close button instead of Cancel + Save.
  viewOnly = false,
}) {
  const { t } = useLanguage()
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
            aria-label={t('admin.modal.close')}
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
            {viewOnly ? (
              <button className="admin-primary-button" form={formId} type="submit">
                {submitLabel === 'Close' ? t('admin.common.close') : submitLabel || t('admin.common.close')}
              </button>
            ) : (
              <>
                <button
                  className="admin-secondary-button"
                  disabled={submitting}
                  onClick={onClose}
                  type="button"
                >
                  {t('admin.common.cancel')}
                </button>
                <button className="admin-primary-button" disabled={submitting} form={formId} type="submit">
                  {submitting ? t('admin.common.saving') : submitLabel}
                </button>
              </>
            )}
          </footer>
        </form>
      </div>
    </dialog>
  )
}

export default AdminModal
