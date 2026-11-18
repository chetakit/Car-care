import { useEffect, useRef, useState } from 'react'
import formatStatusLabel from '../utils/formatStatusLabel.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

// Width of an element, kept current with a ResizeObserver, so SVG charts can
// draw at real pixel size (text never stretches).
function useElementWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

// A round axis step (1, 2, 5 × 10^n) so grid labels read cleanly.
function niceMax(value) {
  if (!(value > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].find((candidate) => candidate * power >= value)
  return step * power
}

// Bar with 4px rounded top, square base on the baseline.
function barPath(x, y, width, height) {
  const radius = Math.min(4, width / 2, height)
  if (height <= 0) return ''
  return [
    `M${x},${y + height}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + width - radius}`,
    `Q${x + width},${y} ${x + width},${y + radius}`,
    `V${y + height}`,
    'Z',
  ].join(' ')
}

/**
 * Daily bar chart with a hover tooltip.
 * points: [{ key, label, shortLabel, value }]
 */
export function TrendBarChart({ points, formatValue, formatAxis = formatValue, label, height = 300 }) {
  const { t } = useLanguage()
  const [wrapRef, width] = useElementWidth()
  const [active, setActive] = useState(null)
  const padding = { top: 12, right: 8, bottom: 28, left: 56 }
  const plotWidth = Math.max(0, width - padding.left - padding.right)
  const plotHeight = height - padding.top - padding.bottom
  // Four even steps of a round size, e.g. 0 / 1k / 2k / 3k / 4k.
  const step = Math.max(1, niceMax(Math.max(0, ...points.map((point) => point.value)) / 4))
  const max = step * 4
  const ticks = [0, 1, 2, 3, 4].map((index) => index * step)
  const slot = points.length ? plotWidth / points.length : 0
  const barWidth = Math.max(2, Math.min(28, slot - 2))
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotWidth / 56))))
  const activePoint = active === null ? null : points[active]

  return (
    <div className="admin-chart" ref={wrapRef}>
      {width > 0 && (
        <svg aria-hidden="true" height={height} onMouseLeave={() => setActive(null)} width={width}>
          {ticks.map((tick) => {
            const y = padding.top + plotHeight - (tick / max) * plotHeight
            return (
              <g key={tick}>
                <line className={tick === 0 ? 'admin-chart-baseline' : 'admin-chart-grid'} x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
                <text className="admin-chart-axis" dominantBaseline="middle" textAnchor="end" x={padding.left - 8} y={y}>{formatAxis(tick)}</text>
              </g>
            )
          })}
          {points.map((point, index) => {
            const barHeight = (point.value / max) * plotHeight
            const x = padding.left + index * slot + (slot - barWidth) / 2
            const y = padding.top + plotHeight - barHeight
            const dimmed = active !== null && active !== index
            return (
              <g key={point.key}>
                <path className={`admin-chart-bar${dimmed ? ' is-dimmed' : ''}`} d={barPath(x, y, barWidth, barHeight)} />
                {index % labelEvery === 0 && (
                  <text className="admin-chart-axis" textAnchor="middle" x={x + barWidth / 2} y={height - 8}>{point.shortLabel}</text>
                )}
                <rect
                  className="admin-chart-hit"
                  height={plotHeight + padding.top}
                  onMouseEnter={() => setActive(index)}
                  width={slot}
                  x={padding.left + index * slot}
                  y={0}
                />
              </g>
            )
          })}
        </svg>
      )}
      {activePoint && (
        <div
          className="admin-chart-tooltip"
          style={{
            left: Math.min(Math.max(padding.left + active * slot + slot / 2, 70), width - 70),
            top: Math.max(0, padding.top + plotHeight - (activePoint.value / max) * plotHeight - 52),
          }}
        >
          <span>{activePoint.label}</span>
          <strong>{formatValue(activePoint.value)}</strong>
        </div>
      )}
      <table className="admin-visually-hidden">
        <caption>{label}</caption>
        <thead><tr><th>{t('admin.dashboard.chart.date')}</th><th>{t('admin.dashboard.chart.value')}</th></tr></thead>
        <tbody>
          {points.map((point) => <tr key={point.key}><td>{point.label}</td><td>{formatValue(point.value)}</td></tr>)}
        </tbody>
      </table>
    </div>
  )
}

// Status colours: one hue per state, checked for colour-blind separation in
// this order (green and red never touch; grey sits between them).
const STATUS_CHART_ORDER = ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'NO_SHOW', 'CANCELLED']
const STATUS_CHART_COLORS = {
  PENDING_PAYMENT: '#e07b10',
  CONFIRMED: '#2f6fd0',
  CHECKED_IN: '#b8900a',
  IN_SERVICE: '#7b56c9',
  COMPLETED: '#2f8a57',
  NO_SHOW: '#9a9fa0',
  CANCELLED: '#c62832',
}

/**
 * Donut of bookings by status with a clickable legend.
 * rows: [{ booking_status, count }]
 */
export function StatusDonut({ rows, onSelect }) {
  const { language, t } = useLanguage()
  const [active, setActive] = useState(null)
  const counts = new Map(rows.map((row) => [row.booking_status, row.count]))
  const items = STATUS_CHART_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 }))
  const total = items.reduce((sum, item) => sum + item.count, 0)
  const size = 168
  const stroke = 22
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const gap = total > 0 && items.filter((item) => item.count).length > 1 ? 2 : 0
  const activeItem = items.find((item) => item.status === active)

  const segments = items.filter((item) => item.count > 0).reduce((list, item) => {
    const previous = list[list.length - 1]
    const offset = previous ? previous.offset + previous.length : 0
    const length = (item.count / total) * circumference
    return [...list, { ...item, length, offset, dash: Math.max(0, length - gap) }]
  }, [])

  return (
    <div className="admin-donut">
      <div className="admin-donut-figure">
        <svg aria-hidden="true" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
          <circle className="admin-donut-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
          {segments.map((segment) => (
            <circle
              className={`admin-donut-segment${active && active !== segment.status ? ' is-dimmed' : ''}`}
              cx={size / 2}
              cy={size / 2}
              key={segment.status}
              onMouseEnter={() => setActive(segment.status)}
              onMouseLeave={() => setActive(null)}
              r={radius}
              stroke={STATUS_CHART_COLORS[segment.status]}
              strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
              strokeDashoffset={-segment.offset}
              strokeWidth={stroke}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ))}
        </svg>
        <div className="admin-donut-center">
          <strong>{activeItem ? activeItem.count : total}</strong>
          <span>{activeItem ? formatStatusLabel(activeItem.status, language) : t('admin.dashboard.chart.total')}</span>
        </div>
      </div>
      <ul className="admin-donut-legend">
        {items.map((item) => (
          <li className={item.count ? '' : 'is-empty'} key={item.status}>
            <button
              aria-label={`${t('admin.dashboard.status.viewBookings', { status: formatStatusLabel(item.status, language) })} (${item.count})`}
              onBlur={() => setActive(null)}
              onClick={() => onSelect(item.status)}
              onFocus={() => setActive(item.status)}
              onMouseEnter={() => setActive(item.status)}
              onMouseLeave={() => setActive(null)}
              type="button"
            >
              <span aria-hidden="true" className="admin-donut-swatch" style={{ background: STATUS_CHART_COLORS[item.status] }} />
              <span className="admin-donut-label">{formatStatusLabel(item.status, language)}</span>
              <strong>{item.count}</strong>
              <small>{total ? Math.round((item.count / total) * 100) : 0}%</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
