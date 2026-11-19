// [STAFF] 2)-7) รายละเอียดการจอง — GET /api/staff/bookings/:id
//   2) ลูกค้าและรถ   3) บริการที่จอง   4) รับรถ   5) 6) เปลี่ยนสถานะ + หมายเหตุ   7) No-show
//   ไม่มีปุ่มยกเลิกการจอง (พนักงานไม่มีสิทธิ์)
import { useState } from 'react'
import useApi from '../../Admin/hooks/useApi.js'
import {
  addBookingNote,
  changeBookingStatus,
  checkInBooking,
  getStaffBooking,
  listStaffBookings,
  markBookingNoShow,
  STAFF_MOCK,
} from '../api/staffBookingApi.js'
import { LoadState, StaffLink, StaffModal, StatusBadge } from '../components/StaffUi.jsx'
import useStaffRequest from '../hooks/useStaffRequest.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import {
  FUEL_LEVEL_KEYS,
  PAYMENT_STATUS_KEYS,
  STATUS_KEYS,
  formatDateTime,
  formatMoney,
  formatShortDate,
  formatDate,
  plateText,
  vehicleName,
} from '../utils/staffFormat.js'

export default function StaffBookingDetailPage({ bookingId, navigate }) {
  const { language, t } = useLanguage()
  const api = useApi()
  const { data, setData, loading, error, reload } = useStaffRequest(bookingId, (signal) =>
    getStaffBooking(api, bookingId, signal),
  )
  const vehicleId = data?.vehicle?.vehicle_id
  const { data: vehicleBookings } = useStaffRequest(`vehicle-${vehicleId}`, (signal) =>
    vehicleId
      ? listStaffBookings(api, { vehicle_id: vehicleId, limit: 20 }, signal)
      : Promise.resolve({ items: [] }),
  )
  const [modal, setModal] = useState(null) // 'checkin' | 'status' | 'noshow'

  if (!data) {
    return (
      <>
        <StaffLink className="staff-back" navigate={navigate} to="/staff">‹ {t('staff.detail.backToQueue')}</StaffLink>
        <LoadState error={error} loading={loading} onRetry={reload} />
      </>
    )
  }

  const { booking, customer, vehicle, services, payment, check_in: checkIn } = data
  const status = booking.booking_status
  const paymentStatusLabel = payment
    ? PAYMENT_STATUS_KEYS.includes(payment.payment_status)
      ? t(`staff.paymentStatus.${payment.payment_status}`)
      : payment.payment_status
    : t('staff.payment.none')
  const nextStatuses = data.allowed_next_statuses ?? []
  const pastVisits = (vehicleBookings?.items ?? []).filter((b) => b.booking_id !== booking.booking_id)
  const totalMinutes = services.reduce((sum, s) => sum + Number(s.duration_minutes ?? 0), 0)

  // รวมประวัติสถานะ (booking_status_history) กับหมายเหตุ (booking_notes) เป็นไทม์ไลน์เดียว
  const timeline = [
    ...data.status_history.map((h) => ({
      key: `h${h.history_id}`,
      at: h.created_at,
      status: h.new_status,
      text: h.reason,
      by: h.changed_by_name,
    })),
    ...data.notes.map((n) => ({
      key: `n${n.note_id}`,
      at: n.created_at,
      status: null,
      text: n.note,
      by: n.created_by_name,
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at))

  // ทุก action ได้ข้อมูลการจองที่อัปเดตแล้วกลับมาจาก backend
  const runAction = async (request) => {
    const updated = await request()
    setData(updated)
    setModal(null)
  }

  return (
    <>
      <StaffLink className="staff-back" navigate={navigate} to={`/staff?date=${booking.booking_date}`}>
        ‹ {t('staff.detail.backToQueue')}
      </StaffLink>

      <div className="staff-page-head">
        <div>
          <span className="staff-eyebrow">{t('staff.detail.eyebrow')}</span>
          <h1>{t('staff.detail.title', { id: booking.booking_id })} <StatusBadge status={status} /></h1>
          <p className="staff-muted">
            {t('staff.detail.appointment', {
              date: formatDate(booking.booking_date, language),
              start: booking.start_time,
              end: booking.end_time,
            })}
          </p>
        </div>
        <div className="staff-actions">
          {status === 'CONFIRMED' && (
            <>
              <button className="staff-btn primary" onClick={() => setModal('checkin')} type="button">
                {t('staff.detail.checkIn')}
              </button>
              <button
                className="staff-btn danger-outline"
                disabled={!booking.appointment_started}
                onClick={() => setModal('noshow')}
                title={booking.appointment_started ? '' : t('staff.detail.noShowDisabled')}
                type="button"
              >
                {t('staff.detail.noShow')}
              </button>
            </>
          )}
          {nextStatuses.length > 0 && (
            <button className="staff-btn primary" onClick={() => setModal('status')} type="button">
              {t('staff.detail.changeStatus')}
            </button>
          )}
        </div>
      </div>

      {status === 'CANCELLED' && (
        <div className="staff-alert">{t('staff.detail.cancelledNotice')}</div>
      )}

      <div className="staff-grid">
        <section className="staff-card">
          <h2>{t('staff.detail.customer')}</h2>
          <dl>
            <dt>{t('staff.detail.name')}</dt><dd>{customer.full_name}</dd>
            <dt>{t('staff.detail.phone')}</dt><dd>{customer.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : '—'}</dd>
            <dt>{t('staff.detail.email')}</dt><dd>{customer.email}</dd>
          </dl>
        </section>

        <section className="staff-card">
          <h2>{t('staff.detail.vehicle')}</h2>
          <div className="staff-plate">{plateText(vehicle)}</div>
          <dl>
            <dt>{t('staff.detail.makeModel')}</dt><dd>{vehicleName(vehicle)}</dd>
            <dt>{t('staff.detail.type')}</dt><dd>{vehicle.type_name ?? '—'}</dd>
            <dt>{t('staff.detail.year')}</dt><dd>{vehicle.production_year ?? '—'}</dd>
            <dt>{t('staff.detail.color')}</dt><dd>{vehicle.color ?? '—'}</dd>
          </dl>
        </section>

        <section className="staff-card span-2">
          <h2>{t('staff.detail.bookedServices')}</h2>
          <table className="staff-table">
            <thead>
              <tr><th>{t('staff.detail.service')}</th><th className="r">{t('staff.detail.duration')}</th><th className="r">{t('staff.detail.price')}</th></tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.booking_service_id}>
                  <td>{s.service_name}</td>
                  <td className="r">{t('staff.unit.minutes', { count: s.duration_minutes })}</td>
                  <td className="r">{formatMoney(s.unit_price, language)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {booking.discount_amount > 0 && (
                <tr className="staff-muted">
                  <td>{t('staff.detail.discount')}</td><td /><td className="r">−{formatMoney(booking.discount_amount, language)}</td>
                </tr>
              )}
              <tr>
                <td>{t('staff.detail.total')}</td>
                <td className="r">{t('staff.unit.minutes', { count: totalMinutes })}</td>
                <td className="r">{formatMoney(booking.final_amount, language)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="staff-muted staff-small">
            {t('staff.detail.payment')}: {paymentStatusLabel}
            {payment?.payment_method === 'SIMULATED' && ` (${t('staff.detail.simulatedPayment')})`}
          </p>
          {status === 'IN_SERVICE' && (
            <p className="staff-muted staff-small">
              {t('staff.detail.completionRequirement')}
            </p>
          )}
          {!STAFF_MOCK && payment?.payment_status === 'PENDING' &&
            ['CASH', 'BANK_TRANSFER'].includes(payment.payment_method) &&
            ['CONFIRMED', 'CHECKED_IN', 'IN_SERVICE'].includes(status) && (
              <button className="staff-btn" onClick={() => setModal('payment')} type="button">
                {t('staff.detail.verifyPayment')}
              </button>
            )}
          {booking.notes && (
            <p className="staff-customer-note"><strong>{t('staff.detail.customerNote')}</strong> {booking.notes}</p>
          )}
        </section>

        {checkIn && (
          <section className="staff-card span-2 span-full">
            <h2>{t('staff.detail.checkInInfo')}</h2>
            <dl className="staff-dl-row">
              <dt>{t('staff.detail.checkedInAt')}</dt><dd>{formatDateTime(checkIn.checked_in_at, language)}</dd>
              <dt>{t('staff.detail.mileage')}</dt><dd>{t('staff.unit.kilometers', { count: Number(checkIn.mileage).toLocaleString(language === 'TH' ? 'th-TH' : 'en-US') })}</dd>
              <dt>{t('staff.detail.fuel')}</dt><dd>{FUEL_LEVEL_KEYS.includes(checkIn.fuel_level) ? t(`staff.fuel.${checkIn.fuel_level}`) : checkIn.fuel_level}</dd>
              <dt>{t('staff.detail.checkedInBy')}</dt><dd>{checkIn.checked_in_by_name ?? '—'}</dd>
              <dt>{t('staff.detail.condition')}</dt><dd>{checkIn.condition_note || '—'}</dd>
            </dl>
          </section>
        )}

        <section className="staff-card span-2 span-wide">
          <h2>{t('staff.detail.timeline')}</h2>
          {timeline.length === 0 && <p className="staff-muted">{t('staff.detail.noTimeline')}</p>}
          <ol className="staff-timeline">
            {timeline.map((item) => (
              <li className={item.status ? `t-${item.status.toLowerCase()}` : 't-note'} key={item.key}>
                <div className="staff-t-dot" />
                <div>
                  <div className="staff-t-head">
                    {item.status ? <StatusBadge status={item.status} /> : <span className="staff-chip">📝 {t('staff.detail.note')}</span>}
                    <span className="staff-muted staff-small">
                      {formatDateTime(item.at, language)} · {t('staff.detail.by', { name: item.by ?? t('staff.detail.system') })}
                    </span>
                  </div>
                  {item.text && <p>{item.text}</p>}
                </div>
              </li>
            ))}
          </ol>
          {status !== 'CANCELLED' && (
            <NoteForm onSubmit={(note) => runAction(() => addBookingNote(api, booking.booking_id, note))} />
          )}
        </section>

        <section className="staff-card span-2">
          <h2>{t('staff.detail.vehicleHistory')}</h2>
          {pastVisits.length === 0 ? (
            <p className="staff-muted">{t('staff.detail.noOtherVisits')}</p>
          ) : (
            <ul className="staff-mini-list">
              {pastVisits.map((b) => (
                <li key={b.booking_id}>
                  <StaffLink navigate={navigate} to={`/staff/bookings/${b.booking_id}`}>#{b.booking_id}</StaffLink>
                  <span>{formatShortDate(b.booking_date, language)} {b.start_time}</span>
                  <span className="staff-muted">{b.service_names.join(', ')}</span>
                  <StatusBadge status={b.booking_status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {modal === 'checkin' && (
        <CheckInModal
          onClose={() => setModal(null)}
          onSubmit={(body) => runAction(() => checkInBooking(api, booking.booking_id, body))}
        />
      )}
      {modal === 'status' && (
        <StatusModal
          current={status}
          onClose={() => setModal(null)}
          onSubmit={(next, reason) =>
            runAction(() => changeBookingStatus(api, booking.booking_id, next, reason))
          }
          options={nextStatuses}
        />
      )}
      {modal === 'noshow' && (
        <NoShowModal
          onClose={() => setModal(null)}
          onSubmit={(reason) => runAction(() => markBookingNoShow(api, booking.booking_id, reason))}
        />
      )}
      {modal === 'payment' && (
        <PaymentVerificationModal
          amount={booking.final_amount}
          method={payment.payment_method}
          onClose={() => setModal(null)}
          onSubmit={(body) => runAction(async () => {
            await api(`/api/payments/${booking.booking_id}/verify`, { method: 'POST', body })
            return getStaffBooking(api, booking.booking_id)
          })}
        />
      )}
    </>
  )
}

/* ------------------------------ ฟอร์ม / Modal ------------------------------ */

// จัดการสถานะ saving / error ระหว่างรอ backend
function useSubmit(onSubmit) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (...args) => {
    setError('')
    setSaving(true)
    try {
      await onSubmit(...args)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  return { error, setError, saving, submit }
}

function PaymentVerificationModal({ amount, method, onClose, onSubmit }) {
  const [reference, setReference] = useState('')
  const { error, saving, submit } = useSubmit(onSubmit)
  const { language, t } = useLanguage()
  const isTransfer = method === 'BANK_TRANSFER'
  return (
    <StaffModal onClose={onClose} title={t('staff.payment.title')}>
      <form className="staff-form" onSubmit={(event) => {
        event.preventDefault()
        submit({
          payment_method: method,
          amount: Number(amount).toFixed(2),
          ...(isTransfer ? { transfer_reference: reference.trim() } : {}),
        })
      }}>
        <p>{t(isTransfer ? 'staff.payment.transferDescription' : 'staff.payment.cashDescription', { amount: formatMoney(amount, language) })}</p>
        {isTransfer && (
          <label>{t('staff.payment.reference')} *
            <input maxLength={128} onChange={(event) => setReference(event.target.value)} required value={reference} />
          </label>
        )}
        {error && <p className="staff-error" role="alert">{error}</p>}
        <div className="staff-modal-actions">
          <button className="staff-btn ghost" onClick={onClose} type="button">{t('staff.common.cancel')}</button>
          <button className="staff-btn primary" disabled={saving || (isTransfer && !reference.trim())} type="submit">
            {saving ? t('staff.common.saving') : t('staff.common.confirm')}
          </button>
        </div>
      </form>
    </StaffModal>
  )
}

function NoteForm({ onSubmit }) {
  const [note, setNote] = useState('')
  const { error, saving, submit } = useSubmit(async (text) => {
    await onSubmit(text)
    setNote('')
  })
  const { t } = useLanguage()
  return (
    <>
      <form
        className="staff-note-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit(note)
        }}
      >
        <input
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('staff.note.placeholder')}
          value={note}
        />
        <button className="staff-btn" disabled={!note.trim() || saving} type="submit">
          {saving ? t('staff.common.saving') : t('staff.common.save')}
        </button>
      </form>
      {error && <p className="staff-error">{error}</p>}
    </>
  )
}

function CheckInModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ mileage: '', fuel_level: 'HALF', condition_note: '', note: '' })
  const [validationErrorKey, setValidationErrorKey] = useState('')
  const { error, saving, submit } = useSubmit(onSubmit)
  const { t } = useLanguage()
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handle = (e) => {
    e.preventDefault()
    setValidationErrorKey('')
    const mileage = Number(form.mileage)
    if (form.mileage === '' || !Number.isInteger(mileage) || mileage < 0) {
      setValidationErrorKey('staff.validation.mileage')
      return
    }
    submit({
      mileage,
      fuel_level: form.fuel_level,
      condition_note: form.condition_note.trim() || null,
      note: form.note.trim() || null,
    })
  }

  return (
    <StaffModal onClose={onClose} title={t('staff.checkIn.title')}>
      <form className="staff-form" onSubmit={handle}>
        <label>{t('staff.checkIn.mileage')} *
          <input autoFocus min="0" onChange={set('mileage')} step="1" type="number" value={form.mileage} />
        </label>
        <label>{t('staff.checkIn.fuel')}
          <select onChange={set('fuel_level')} value={form.fuel_level}>
            {FUEL_LEVEL_KEYS.map((value) => (
              <option key={value} value={value}>{t(`staff.fuel.${value}`)}</option>
            ))}
          </select>
        </label>
        <label>{t('staff.checkIn.condition')}
          <textarea maxLength={1000} onChange={set('condition_note')} rows="3" value={form.condition_note} />
        </label>
        <label>{t('staff.checkIn.note')}
          <input maxLength={1000} onChange={set('note')} placeholder={t('staff.checkIn.notePlaceholder')} value={form.note} />
        </label>
        {(validationErrorKey || error) && (
          <p className="staff-error" role="alert">
            {validationErrorKey ? t(validationErrorKey) : error}
          </p>
        )}
        <div className="staff-modal-actions">
          <button className="staff-btn ghost" onClick={onClose} type="button">{t('staff.common.cancel')}</button>
          <button className="staff-btn primary" disabled={saving} type="submit">
            {saving ? t('staff.common.saving') : t('staff.checkIn.confirm')}
          </button>
        </div>
      </form>
    </StaffModal>
  )
}

const QUICK_REASONS = {
  IN_SERVICE: [
    { key: 'staff.statusReason.started', value: 'เริ่มดำเนินการ' },
    { key: 'staff.statusReason.workStarted', value: 'ช่างเริ่มงานแล้ว' },
  ],
  COMPLETED: [
    { key: 'staff.statusReason.allServicesDone', value: 'ดำเนินการครบทุกรายการ' },
    { key: 'staff.statusReason.qualityChecked', value: 'ตรวจสอบคุณภาพแล้ว พร้อมส่งมอบ' },
  ],
}

function StatusModal({ current, options, onClose, onSubmit }) {
  const [next, setNext] = useState(options[0])
  const [reason, setReason] = useState('')
  const [validationErrorKey, setValidationErrorKey] = useState('')
  const { error, saving, submit } = useSubmit(onSubmit)
  const { t } = useLanguage()

  const handle = (e) => {
    e.preventDefault()
    setValidationErrorKey('')
    if (!reason.trim()) {
      setValidationErrorKey('staff.validation.statusReason')
      return
    }
    submit(next, reason.trim())
  }

  return (
    <StaffModal onClose={onClose} title={t('staff.statusChange.title')}>
      <form className="staff-form" onSubmit={handle}>
        <p className="staff-muted">{t('staff.statusChange.current')}: <StatusBadge status={current} /></p>
        <div className="staff-radio-group">
          {options.map((s) => (
            <label className={`staff-radio ${next === s ? 'checked' : ''}`} key={s}>
              <input checked={next === s} name="status" onChange={() => setNext(s)} type="radio" />
              {STATUS_KEYS.includes(s) ? t(`staff.status.${s}`) : s}
            </label>
          ))}
        </div>
        <label>{t('staff.statusChange.reason')} *
          <textarea autoFocus maxLength={1000} onChange={(e) => setReason(e.target.value)} rows="3" value={reason} />
        </label>
        <div className="staff-chips">
          {(QUICK_REASONS[next] ?? []).map(({ key, value }) => (
            <button className="staff-chip clickable" key={key} onClick={() => setReason(value)} type="button">{t(key)}</button>
          ))}
        </div>
        {(validationErrorKey || error) && (
          <p className="staff-error" role="alert">
            {validationErrorKey ? t(validationErrorKey) : error}
          </p>
        )}
        <div className="staff-modal-actions">
          <button className="staff-btn ghost" onClick={onClose} type="button">{t('staff.common.cancel')}</button>
          <button className="staff-btn primary" disabled={saving} type="submit">
            {saving ? t('staff.common.saving') : t('staff.statusChange.save')}
          </button>
        </div>
      </form>
    </StaffModal>
  )
}

function NoShowModal({ onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const [validationErrorKey, setValidationErrorKey] = useState('')
  const { error, saving, submit } = useSubmit(onSubmit)
  const { t } = useLanguage()

  const handle = (e) => {
    e.preventDefault()
    setValidationErrorKey('')
    if (!reason.trim()) {
      setValidationErrorKey('staff.validation.noShowReason')
      return
    }
    submit(reason.trim())
  }

  return (
    <StaffModal onClose={onClose} title={t('staff.noShow.title')}>
      <form className="staff-form" onSubmit={handle}>
        <label>{t('staff.noShow.details')} *
          <textarea
            autoFocus
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('staff.noShow.placeholder')}
            rows="3"
            value={reason}
          />
        </label>
        <p className="staff-muted staff-small">
          {t('staff.noShow.disclaimer')}
        </p>
        {(validationErrorKey || error) && (
          <p className="staff-error" role="alert">
            {validationErrorKey ? t(validationErrorKey) : error}
          </p>
        )}
        <div className="staff-modal-actions">
          <button className="staff-btn ghost" onClick={onClose} type="button">{t('staff.common.close')}</button>
          <button className="staff-btn danger" disabled={saving} type="submit">
            {saving ? t('staff.common.saving') : t('staff.noShow.confirm')}
          </button>
        </div>
      </form>
    </StaffModal>
  )
}
