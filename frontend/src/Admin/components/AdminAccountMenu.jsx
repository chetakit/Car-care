import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const ROLE_LABEL_KEYS = {
  ADMIN: 'admin.members.role.option.admin',
  CUSTOMER: 'admin.members.role.option.customer',
  STAFF: 'admin.members.role.option.staff',
}

function AdminAccountMenu({ user, onLogout, variant = 'workspace' }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const accountRef = useRef(null)
  const triggerRef = useRef(null)
  const isWorkspace = variant === 'workspace'
  const displayName = user?.full_name?.trim() || user?.email || t('admin.account.fallbackName')
  const roleLabel = ROLE_LABEL_KEYS[user?.role]
    ? t(ROLE_LABEL_KEYS[user.role])
    : user?.role || t('admin.account.fallbackRole')
  const initials = displayName.slice(0, 1).toUpperCase()
  const menuId = isWorkspace ? 'admin-user-dropdown' : 'customer-account-menu'

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (!accountRef.current?.contains(event.target)) setOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function closeMenu() {
    setOpen(false)
  }

  return (
    <div
      className={isWorkspace ? 'admin-user-menu' : 'customer-account'}
      ref={accountRef}
    >
      <button
        aria-controls={menuId}
        aria-expanded={open}
        className={isWorkspace ? 'admin-user-button' : 'customer-account-trigger'}
        onClick={() => setOpen((isOpen) => !isOpen)}
        ref={triggerRef}
        type="button"
      >
        <span className={isWorkspace ? 'admin-user-avatar' : 'customer-avatar'}>
          {initials}
        </span>
        <span className={isWorkspace ? 'admin-user-copy' : 'customer-account-name'}>
          {isWorkspace ? (
            <>
              <strong>{displayName}</strong>
              <small>{roleLabel}</small>
            </>
          ) : (
            displayName
          )}
        </span>
        <svg
          aria-hidden="true"
          className={isWorkspace ? 'admin-user-chevron' : 'customer-chevron'}
          fill="none"
          viewBox="0 0 16 16"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      <div
        className={isWorkspace ? 'admin-user-dropdown' : 'customer-account-menu'}
        hidden={!open}
        id={menuId}
      >
        <a href="/" onClick={closeMenu}>
          {t('customer.common.home')}
        </a>
        <a href="/admin/dashboard" onClick={closeMenu}>
          {t('admin.account.manage')}
        </a>
        <button
          onClick={() => {
            closeMenu()
            void onLogout()
          }}
          type="button"
        >
          {t('customer.header.signOut')}
        </button>
      </div>
    </div>
  )
}

export default AdminAccountMenu
