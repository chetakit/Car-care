import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell,
  CalendarClock,
  CarFront,
  CheckCheck,
  CircleCheckBig,
  CircleX,
  Landmark,
  Sparkles,
  TimerOff,
  UserX,
  Wallet,
} from 'lucide-react'
import useApi from '../Admin/hooks/useApi.js'
import useAuth from '../auth/useAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import './notifications.css'

// The bell in the header for customers, staff and admins. It checks for new
// notifications every 20 seconds (not while the tab is hidden) and pops a
// short toast when something new arrives.
const POLL_MS = 20_000

const ICONS = {
  PAYMENT_CONFIRMED: CircleCheckBig,
  PAYMENT_EXPIRED: TimerOff,
  TRANSFER_PENDING: Landmark,
  NEW_BOOKING_TODAY: CalendarClock,
  VEHICLE_CHECKED_IN: CarFront,
  SERVICE_STARTED: Sparkles,
  SERVICE_COMPLETED: CheckCheck,
  NO_SHOW: UserX,
  BOOKING_CANCELLED: CircleX,
  APPOINTMENT_REMINDER: CalendarClock,
}
const GOOD = new Set(['PAYMENT_CONFIRMED', 'SERVICE_COMPLETED', 'VEHICLE_CHECKED_IN', 'SERVICE_STARTED'])
const BAD = new Set(['PAYMENT_EXPIRED', 'NO_SHOW', 'BOOKING_CANCELLED'])

function go(path) {
  if (`${window.location.pathname}${window.location.search}` === path) return
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function targetFor(role, item) {
  if (role === 'CUSTOMER') return '/customer/bookings'
  if (role === 'STAFF') return item.booking_id ? `/staff/bookings/${item.booking_id}` : '/staff'
  return item.type === 'TRANSFER_PENDING' ? '/admin/payments' : '/admin/bookings'
}

function NotificationBell({ role, variant = 'light' }) {
  const { token } = useAuth()
  const api = useApi()
  const { t, language } = useLanguage()
  const [data, setData] = useState({ items: [], unread_count: 0 })
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState(null)
  // "5 minutes ago" is measured from the last check, so rendering stays pure.
  const [now, setNow] = useState(() => Date.now())
  const lastSeenId = useRef(null)
  const rootRef = useRef(null)
  const locale = language === 'TH' ? 'th-TH' : 'en-GB'

  const load = useCallback(async () => {
    try {
      const response = await api('/api/notifications?limit=15')
      const next = response.data
      if (!next || !Array.isArray(next.items)) return
      const newestId = next.items[0]?.notification_id ?? 0
      if (lastSeenId.current !== null) {
        const fresh = next.items.find((item) => item.notification_id > lastSeenId.current && !item.read_at)
        if (fresh) setToast(fresh)
      }
      lastSeenId.current = Math.max(lastSeenId.current ?? 0, newestId)
      setNow(Date.now())
      setData(next)
    } catch {
      // A missed check is fine; the next one will catch up.
    }
  }, [api])

  useEffect(() => {
    if (!token) return undefined
    const first = window.setTimeout(load, 0)
    const timer = window.setInterval(() => {
      if (!document.hidden) load()
    }, POLL_MS)
    const onVisible = () => {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, token])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!token) return null

  const formatDate = (value) =>
    value
      ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
          new Date(`${value}T00:00:00Z`),
        )
      : ''
  const money = (value) => Number(value || 0).toLocaleString(locale, { maximumFractionDigits: 2 })
  const ago = (iso) => {
    const seconds = Math.round((Date.parse(iso) - now) / 1000)
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    const abs = Math.abs(seconds)
    if (abs < 60) return rtf.format(seconds, 'second')
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
    if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour')
    return rtf.format(Math.round(seconds / 86400), 'day')
  }
  const text = (item) => {
    const d = item.data || {}
    const params = {
      plate: d.plate || '-',
      date: formatDate(d.date),
      start_time: d.start_time || '',
      amount: money(d.amount),
      refund_amount: money(d.refund_amount),
    }
    const bodyKey =
      item.type === 'BOOKING_CANCELLED' && Number(d.refund_amount) > 0
        ? 'notifications.BOOKING_CANCELLED.bodyRefund'
        : `notifications.${item.type}.body`
    const title = t(`notifications.${item.type}.title`, params)
    return {
      title: title.startsWith('notifications.') ? t('notifications.generic') : title,
      body: t(bodyKey, params).startsWith('notifications.') ? '' : t(bodyKey, params),
    }
  }

  async function markAll() {
    setData((current) => ({ ...current, unread_count: 0 }))
    try {
      await api('/api/notifications/read', { method: 'POST', body: {} })
    } catch {
      // Shown as read locally; the server catches up on the next check.
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) setNow(Date.now())
    if (next && data.unread_count > 0) markAll()
    if (!next) {
      // Items opened in this visit lose their "new" highlight when closed.
      setData((current) => ({
        ...current,
        items: current.items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })),
      }))
    }
  }

  function openItem(item) {
    setOpen(false)
    setToast(null)
    go(targetFor(role, item))
  }

  const count = data.unread_count
  const kind = (type) => (GOOD.has(type) ? 'is-good' : BAD.has(type) ? 'is-bad' : 'is-info')

  return (
    <div className={`notif notif-${variant}`} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label={count ? t('notifications.bellUnread', { count }) : t('notifications.bell')}
        className={`notif-button${count ? ' has-unread' : ''}`}
        onClick={toggle}
        title={t('notifications.bell')}
        type="button"
      >
        <Bell aria-hidden="true" />
        {count > 0 && <span className="notif-badge">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div aria-label={t('notifications.title')} className="notif-panel" role="dialog">
          <div className="notif-panel-head">
            <strong>{t('notifications.title')}</strong>
            {data.items.some((item) => !item.read_at) && (
              <button className="notif-mark" onClick={markAll} type="button">
                {t('notifications.markAll')}
              </button>
            )}
          </div>
          {data.items.length === 0 ? (
            <p className="notif-empty">{t('notifications.empty')}</p>
          ) : (
            <ul className="notif-list">
              {data.items.map((item) => {
                const Icon = ICONS[item.type] || Bell
                const { title, body } = text(item)
                return (
                  <li key={item.notification_id}>
                    <button
                      className={`notif-item${item.read_at ? '' : ' is-unread'}`}
                      onClick={() => openItem(item)}
                      type="button"
                    >
                      <span className={`notif-icon ${kind(item.type)}`}>
                        {item.type === 'BOOKING_CANCELLED' && Number(item.data?.refund_amount) > 0 ? (
                          <Wallet aria-hidden="true" />
                        ) : (
                          <Icon aria-hidden="true" />
                        )}
                      </span>
                      <span className="notif-text">
                        <strong>{title}</strong>
                        {body && <span>{body}</span>}
                        <small>{ago(item.created_at)}</small>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {toast && !open && (
        <button className="notif-toast" onClick={() => openItem(toast)} role="status" type="button">
          <span className={`notif-icon ${kind(toast.type)}`}>
            {(() => {
              const Icon = ICONS[toast.type] || Bell
              return <Icon aria-hidden="true" />
            })()}
          </span>
          <span className="notif-text">
            <strong>{text(toast).title}</strong>
            {text(toast).body && <span>{text(toast).body}</span>}
          </span>
        </button>
      )}
    </div>
  )
}

export default NotificationBell
