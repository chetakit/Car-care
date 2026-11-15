// [STAFF] คอมโพเนนต์เล็ก ๆ ที่ใช้ร่วมกันในหน้าพนักงาน
import { STATUS_LABEL } from '../utils/staffFormat.js'

export function StatusBadge({ status }) {
  return (
    <span className={`staff-badge staff-badge-${String(status).toLowerCase()}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function StaffModal({ title, onClose, children }) {
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
          <button aria-label="ปิด" className="staff-icon-btn" onClick={onClose} type="button">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function LoadState({ loading, error, empty, emptyText = 'ไม่มีข้อมูล', onRetry }) {
  if (loading) return <div className="staff-empty">กำลังโหลด…</div>
  if (error) {
    return (
      <div className="staff-alert" role="alert">
        {error}
        {onRetry && (
          <button className="staff-link-btn" onClick={onRetry} type="button"> ลองใหม่</button>
        )}
      </div>
    )
  }
  if (empty) return <div className="staff-empty">{emptyText}</div>
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
