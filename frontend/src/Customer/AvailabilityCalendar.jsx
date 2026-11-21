import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import { apiRequest } from '../Admin/api/client.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'

// Weekly calendar of free places, for anyone (no login needed).
// It only shows how many places are left in each slot, never who booked.
// Tapping a free slot opens the booking page on that day.
// This week plus the next two (three weeks, like the booking window).
const WEEKS_AHEAD = 2

function shopToday() {
  // The shop works in Thai time whatever the visitor's clock says.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function cellState(slot) {
  if (!slot) return 'none'
  if (slot.status === 'PAST') return 'past'
  if (slot.status === 'CLOSED') return 'closed'
  if (slot.remaining_capacity <= 0) return 'full'
  if (slot.remaining_capacity === 1 && slot.capacity > 1) return 'few'
  return 'free'
}

const short = (time) => String(time).slice(0, 5)

function AvailabilityCalendar() {
  const { t, language } = useLanguage()
  const [today] = useState(shopToday)
  const lastStart = addDays(today, WEEKS_AHEAD * 7)
  const [weekStart, setWeekStart] = useState(today)
  const [state, setState] = useState({ status: 'loading', items: [], from: '' })
  const [reload, setReload] = useState(0)
  const [activeDay, setActiveDay] = useState(today)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest(`/api/public/availability?from=${weekStart}&days=7`, { signal: controller.signal })
      .then((response) => {
        const items = response.data?.items
        if (!Array.isArray(items)) throw new Error('Incomplete availability response.')
        setState({ status: 'ready', items, from: weekStart })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ status: 'error', items: [], from: weekStart })
      })
    return () => controller.abort()
  }, [weekStart, reload])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const locale = language === 'TH' ? 'th-TH' : 'en-GB'
  const dayName = (date, style) =>
    new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
  const dayNumber = (date) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

  const ready = state.status === 'ready' && state.from === weekStart
  const loading = !ready && state.status !== 'error'
  const { times, lookup, freeByDay, openDays } = useMemo(() => {
    const map = new Map()
    const timeSet = new Set()
    const free = {}
    const open = new Set()
    for (const slot of ready ? state.items : []) {
      map.set(`${slot.date}|${slot.start_time}`, slot)
      timeSet.add(slot.start_time)
      if (['free', 'few'].includes(cellState(slot))) free[slot.date] = (free[slot.date] || 0) + slot.remaining_capacity
      if (slot.status !== 'PAST') open.add(slot.date)
    }
    return { times: [...timeSet].sort(), lookup: map, freeByDay: free, openDays: open }
  }, [ready, state.items])

  const currentDay = days.includes(activeDay) ? activeDay : days[0]
  const label = (key) => t(`customer.availability.${key}`)

  const changeWeek = (step) => {
    const next = addDays(weekStart, step * 7)
    setWeekStart(next)
    setActiveDay(next)
  }

  function renderCell(date, time) {
    const slot = lookup.get(`${date}|${time}`)
    const kind = cellState(slot)
    const text =
      kind === 'free' || kind === 'few'
        ? t('customer.availability.left', { count: slot.remaining_capacity })
        : kind === 'none'
          ? '–'
          : label(kind)
    const title = `${dayName(date, 'long')} ${dayNumber(date)} · ${short(time)} · ${text}`
    if (kind === 'free' || kind === 'few') {
      return (
        <a aria-label={title} className={`avail-cell is-${kind}`} href={`/customer/booking?date=${date}`} key={date} title={title}>
          {text}
        </a>
      )
    }
    return (
      <span aria-label={title} className={`avail-cell is-${kind}`} key={date} title={title}>
        {text}
      </span>
    )
  }

  return (
    <section aria-labelledby="availability-title" className="avail-section" id="availability">
      <div className="customer-container">
        <div className="avail-head" data-reveal>
          <div>
            <span className="avail-eyebrow">{label('eyebrow')}</span>
            <h2 id="availability-title">{label('title')}</h2>
            <p>{label('description')}</p>
          </div>
          <div className="avail-nav">
            <button
              aria-label={label('previousWeek')}
              className="avail-nav-button"
              disabled={weekStart <= today}
              onClick={() => changeWeek(-1)}
              type="button"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <span aria-live="polite" className="avail-range">
              {dayNumber(days[0])} – {dayNumber(days[6])}
            </span>
            <button
              aria-label={label('nextWeek')}
              className="avail-nav-button"
              disabled={addDays(weekStart, 7) > lastStart}
              onClick={() => changeWeek(1)}
              type="button"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="avail-board" data-reveal>
          {state.status === 'error' && (
            <div className="avail-message" role="alert">
              <span>{label('error')}</span>
              <button className="avail-retry" onClick={() => setReload((n) => n + 1)} type="button">
                <RotateCw aria-hidden="true" />
                {label('retry')}
              </button>
            </div>
          )}
          {ready && times.length === 0 && (
            <div className="avail-message" role="status">{label('empty')}</div>
          )}

          {/* Desktop / tablet: the whole week as a grid. */}
          {(loading || (ready && times.length > 0)) && (
            <div className={`avail-grid${loading ? ' is-loading' : ''}`} style={{ '--avail-rows': loading ? 6 : times.length }}>
              <span className="avail-corner">{label('time')}</span>
              {days.map((date) => (
                <span className={`avail-day${date === today ? ' is-today' : ''}`} key={date}>
                  <small>{dayName(date, 'short')}</small>
                  <strong>{dayNumber(date)}</strong>
                </span>
              ))}
              {(loading ? ['a', 'b', 'c', 'd', 'e', 'f'] : times).map((time) => (
                <div className="avail-row" key={time}>
                  <span className="avail-time">{loading ? '' : short(time)}</span>
                  {days.map((date) =>
                    loading ? (
                      <span className="avail-cell is-skeleton" key={date} />
                    ) : (
                      renderCell(date, time)
                    ),
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Phones: pick a day, then see its slots. */}
          {ready && times.length > 0 && (
            <div className="avail-mobile">
              <div className="avail-day-tabs" role="tablist">
                {days.map((date) => (
                  <button
                    aria-selected={date === currentDay}
                    className={`avail-day-tab${date === currentDay ? ' is-active' : ''}`}
                    key={date}
                    onClick={() => setActiveDay(date)}
                    role="tab"
                    type="button"
                  >
                    <small>{dayName(date, 'short')}</small>
                    <strong>{dayNumber(date)}</strong>
                    <em className={freeByDay[date] ? 'has-free' : ''}>
                      {freeByDay[date]
                        ? t('customer.availability.left', { count: freeByDay[date] })
                        : label(openDays.has(date) ? 'full' : 'past')}
                    </em>
                  </button>
                ))}
              </div>
              <div className="avail-day-list" role="tabpanel">
                {times.map((time) => (
                  <div className="avail-day-row" key={time}>
                    <span className="avail-time">{short(time)}</span>
                    {renderCell(currentDay, time)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <ul className="avail-legend" data-reveal>
          {['free', 'few', 'full', 'past'].map((kind) => (
            <li key={kind}>
              <span className={`avail-swatch is-${kind}`} />
              {label(`legend.${kind}`)}
            </li>
          ))}
          <li className="avail-legend-note">{label('note')}</li>
        </ul>
      </div>
    </section>
  )
}

export default AvailabilityCalendar
