import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { STATUS_KEYS } from '../utils/staffFormat.js'

export function StatusBadge({ status }) {
  const { t } = useLanguage()
  const label = STATUS_KEYS.includes(status)
    ? t(`staff.status.${status}`)
    : status

  return (
    <span className={`staff-badge staff-badge-${String(status).toLowerCase()}`}>
      {label}
    </span>
  )
}

export function StaffModal({ title, onClose, children }) {
  const { t } = useLanguage()

  return (
    <div className="staff-modal-backdrop" onClick={onClose}>
      <div
        aria-label={title}
        className="staff-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="staff-modal-head">
          <h3>{title}</h3>
          <button aria-label={t('staff.common.close')} className="staff-icon-btn" onClick={onClose} type="button">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function LoadState({ loading, error, empty, emptyText, onRetry }) {
  const { t } = useLanguage()

  if (loading) return <div className="staff-empty">{t('staff.common.loading')}</div>
  if (error) {
    return (
      <div className="staff-alert" role="alert">
        {error}
        {onRetry && (
          <button className="staff-link-btn" onClick={onRetry} type="button"> {t('staff.common.retry')}</button>
        )}
      </div>
    )
  }
  if (empty) return <div className="staff-empty">{emptyText ?? t('staff.common.noData')}</div>
  return null
}

// ลิงก์ภายในหน้าพนักงาน (ใช้ navigate แบบเดียวกับ App.jsx ไม่ reload หน้า)
export function StaffLink({ to, navigate, className, children }) {
  return (
    <a
      className={className}
      href={to}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
