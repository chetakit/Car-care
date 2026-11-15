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
} from '../api/staffBookingApi.js'
import { LoadState, StaffLink, StaffModal, StatusBadge } from '../components/StaffUi.jsx'
import useStaffRequest from '../hooks/useStaffRequest.js'
import {
  FUEL_LABEL,
  PAYMENT_LABEL,
  STATUS_LABEL,
  formatDateTime,
  formatMoney,
  formatShortDate,
  formatThaiDate,
  plateText,
  vehicleName,
} from '../utils/staffFormat.js'

export default function StaffBookingDetailPage({ bookingId, navigate }) {
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
        <StaffLink className="staff-back" navigate={navigate} to="/staff">‹ กลับไปคิวงาน</StaffLink>
        <LoadState error={error} loading={loading} onRetry={reload} />
      </>
    )
  }

  const { booking, customer, vehicle, services, payment, check_in: checkIn } = data
  const status = booking.booking_status
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
        ‹ กลับไปคิวงาน
      </StaffLink>

      <div className="staff-page-head">
        <div>
          <span className="staff-eyebrow">Staff · Booking Detail</span>
          <h1>การจอง #{booking.booking_id} <StatusBadge status={status} /></h1>
          <p className="staff-muted">
            นัดหมาย {formatThaiDate(booking.booking_date)} เวลา {booking.start_time}–{booking.end_time} น.
          </p>
        </div>
        <div className="staff-actions">
          {status === 'CONFIRMED' && (
            <>
              <button className="staff-btn primary" onClick={() => setModal('checkin')} type="button">
                รับรถเข้าร้าน
              </button>
              <button
                className="staff-btn danger-outline"
                disabled={!booking.appointment_started}
                onClick={() => setModal('noshow')}
                title={booking.appointment_started ? '' : 'บันทึกได้หลังเลยเวลานัด'}
                type="button"
              >
                ลูกค้าไม่มา (No-show)
              </button>
            </>
          )}
          {nextStatuses.length > 0 && (
            <button className="staff-btn primary" onClick={() => setModal('status')} type="button">
              เปลี่ยนสถานะ
            </button>
          )}
        </div>
      </div>

      {status === 'CANCELLED' && (
        <div className="staff-alert">การจองนี้ถูกยกเลิกโดยลูกค้า — พนักงานดูข้อมูลได้อย่างเดียว</div>
      )}

      <div className="staff-grid">
        <section className="staff-card">
          <h2>ข้อมูลลูกค้า</h2>
          <dl>
            <dt>ชื่อ</dt><dd>{customer.full_name}</dd>
            <dt>โทร</dt><dd>{customer.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : '—'}</dd>
            <dt>อีเมล</dt><dd>{customer.email}</dd>
          </dl>
        </section>

        <section className="staff-card">
          <h2>ข้อมูลรถยนต์</h2>
          <div className="staff-plate">{plateText(vehicle)}</div>
          <dl>
            <dt>ยี่ห้อ/รุ่น</dt><dd>{vehicleName(vehicle)}</dd>
            <dt>ประเภท</dt><dd>{vehicle.type_name ?? '—'}</dd>
            <dt>ปี</dt><dd>{vehicle.production_year ?? '—'}</dd>
            <dt>สี</dt><dd>{vehicle.color ?? '—'}</dd>
          </dl>
        </section>

        <section className="staff-card span-2">
          <h2>รายการบริการที่จอง</h2>
          <table className="staff-table">
            <thead>
              <tr><th>บริการ</th><th className="r">เวลา</th><th className="r">ราคา</th></tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.booking_service_id}>
                  <td>{s.service_name}</td>
                  <td className="r">{s.duration_minutes} นาที</td>
                  <td className="r">{formatMoney(s.unit_price)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {booking.discount_amount > 0 && (
                <tr className="staff-muted">
                  <td>ส่วนลด</td><td /><td className="r">−{formatMoney(booking.discount_amount)}</td>
                </tr>
              )}
              <tr>
                <td>รวม</td>
                <td className="r">{totalMinutes} นาที</td>
                <td className="r">{formatMoney(booking.final_amount)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="staff-muted staff-small">
            การชำระเงิน: {payment ? PAYMENT_LABEL[payment.payment_status] ?? payment.payment_status : 'ยังไม่มีรายการชำระ'}
          </p>
          {booking.notes && (
            <p className="staff-customer-note"><strong>หมายเหตุจากลูกค้า:</strong> {booking.notes}</p>
          )}
        </section>

        {checkIn && (
          <section className="staff-card span-2">
            <h2>ข้อมูลการรับรถ</h2>
            <dl className="staff-dl-row">
              <dt>เวลารับรถ</dt><dd>{formatDateTime(checkIn.checked_in_at)}</dd>
              <dt>เลขไมล์</dt><dd>{Number(checkIn.mileage).toLocaleString()} กม.</dd>
              <dt>น้ำมัน</dt><dd>{FUEL_LABEL[checkIn.fuel_level] ?? checkIn.fuel_level}</dd>
              <dt>ผู้รับรถ</dt><dd>{checkIn.checked_in_by_name ?? '—'}</dd>
              <dt>สภาพรถ</dt><dd>{checkIn.condition_note || '—'}</dd>
            </dl>
          </section>
        )}

        <section className="staff-card span-2">
          <h2>ไทม์ไลน์สถานะและหมายเหตุ</h2>
          {timeline.length === 0 && <p className="staff-muted">ยังไม่มีประวัติ</p>}
          <ol className="staff-timeline">
            {timeline.map((item) => (
              <li className={item.status ? `t-${item.status.toLowerCase()}` : 't-note'} key={item.key}>
                <div className="staff-t-dot" />
                <div>
                  <div className="staff-t-head">
                    {item.status ? <StatusBadge status={item.status} /> : <span className="staff-chip">📝 หมายเหตุ</span>}
                    <span className="staff-muted staff-small">
                      {formatDateTime(item.at)} · โดย {item.by ?? 'ระบบ'}
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
          <h2>ประวัติการให้บริการของรถคันนี้</h2>
          {pastVisits.length === 0 ? (
            <p className="staff-muted">ไม่มีประวัติอื่น</p>
          ) : (
            <ul className="staff-mini-list">
              {pastVisits.map((b) => (
                <li key={b.booking_id}>
                  <StaffLink navigate={navigate} to={`/staff/bookings/${b.booking_id}`}>#{b.booking_id}</StaffLink>
                  <span>{formatShortDate(b.booking_date)} {b.start_time}</span>
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

function NoteForm({ onSubmit }) {
  const [note, setNote] = useState('')
  const { error, saving, submit } = useSubmit(async (text) => {
    await onSubmit(text)
    setNote('')
  })
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
          placeholder="เพิ่มหมายเหตุ (ไม่เปลี่ยนสถานะ)…"
          value={note}
        />
        <button className="staff-btn" disabled={!note.trim() || saving} type="submit">
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </form>
      {error && <p className="staff-error">{error}</p>}
    </>
  )
}

function CheckInModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ mileage: '', fuel_level: 'HALF', condition_note: '', note: '' })
  const { error, setError, saving, submit } = useSubmit(onSubmit)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handle = (e) => {
    e.preventDefault()
    const mileage = Number(form.mileage)
    if (form.mileage === '' || !Number.isInteger(mileage) || mileage < 0) {
      setError('กรุณากรอกเลขไมล์เป็นจำนวนเต็ม')
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
    <StaffModal onClose={onClose} title="บันทึกการรับรถเข้าร้าน">
      <form className="staff-form" onSubmit={handle}>
        <label>เลขไมล์ (กม.) *
          <input autoFocus min="0" onChange={set('mileage')} step="1" type="number" value={form.mileage} />
        </label>
        <label>ระดับน้ำมัน
          <select onChange={set('fuel_level')} value={form.fuel_level}>
            {Object.entries(FUEL_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>สภาพรถก่อนรับ (รอย / ความเสียหาย / ของในรถ)
          <textarea maxLength={1000} onChange={set('condition_note')} rows="3" value={form.condition_note} />
        </label>
        <label>หมายเหตุ
          <input maxLength={1000} onChange={set('note')} placeholder="รับรถเข้าร้าน" value={form.note} />
        </label>
        {error && <p className="staff-error">{error}</p>}
        <div className="staff-modal-actions">
          <button className="staff-btn ghost" onClick={onClose} type="button">ยกเลิก</button>
          <button className="staff-btn primary" disabled={saving} type="submit">
            {saving ? 'กำลังบันทึก…' : 'ยืนยันรับรถ'}
          </button>
        </div>
      </form>
    </StaffModal>
  )
}

const QUICK_REASONS = {
  IN_SERVICE: ['เริ่มดำเนินการ', 'ช่างเริ่มงานแล้ว'],
  COMPLETED: ['ดำเนินการครบทุกรายการ', 'ตรวจสอบคุณภาพแล้ว พร้อมส่งมอบ'],
}

function StatusModal({ current, options, onClose, onSubmit }) {
  const [next, setNext] = useState(options[0])
  const [reason, setReason] = useState('')
  const { error, setError, saving, submit } = useSubmit(onSubmit)

  const handle = (e) => {
    e.preventDefault()
    if (!reason.trim()) {
      setError('กรุณาระบุหมายเหตุ/เหตุผลในการเปลี่ยนสถานะ')
      return
    }
    submit(next, reason.trim())
  }

  return (
    <StaffModal onClose={onClose} title="เปลี่ยนสถานะการให้บริการ">
      <form className="staff-form" onSubmit={handle}>
        <p className="staff-muted">สถานะปัจจุบัน: <StatusBadge status={current} /></p>
        <div className="staff-radio-group">
          {options.map((s) => (
            <label className={`staff-radio ${next === s ? 'checked' : ''}`} key={s}>
              <input checked={next === s} name="status" onChange={() => setNext(s)} type="radio" />
              {STATUS_LABEL[s]}
            </label>
          ))}
        </div>
        <label>หมายเหตุ / เหตุผล *
          <textarea autoFocus maxLength={1000} onChange={(e) => setReason(e.target.value)} rows="3" value={reason} />
        </label>
        <div className="staff-chips">
          {(QUICK_REASONS[next] ?? []).map((r) => (
            <button className="staff-chip clickable" key={r} onClick={() => setReason(r)} type="button">{r}</button>
          ))}
        </div>
        {error && <p className="staff-error">{error}</p>}
        <div className="staff-modal-actions">
          <button className="staff-btn ghost" onClick={onClose} type="button">ยกเลิก</button>
          <button className="staff-btn primary" disabled={saving} type="submit">
            {saving ? 'กำลังบันทึก…' : 'บันทึกสถานะ'}
          </button>
        </div>
      </form>
    </StaffModal>
  )
}

function NoShowModal({ onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const { error, setError, saving, submit } = useSubmit(onSubmit)

  const handle = (e) => {
    e.preventDefault()
    if (!reason.trim()) {
      setError('กรุณาระบุรายละเอียด เช่น การติดต่อลูกค้า')
      return
    }
    submit(reason.trim())
  }

  return (
    <StaffModal onClose={onClose} title="บันทึกลูกค้าไม่มาตามนัด (No-show)">
      <form className="staff-form" onSubmit={handle}>
        <label>รายละเอียด / การติดต่อลูกค้า *
          <textarea
            autoFocus
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น โทรติดต่อ 2 ครั้ง ไม่รับสาย"
            rows="3"
            value={reason}
          />
        </label>
        <p className="staff-muted staff-small">
          การบันทึก No-show ไม่ใช่การยกเลิกการจอง — พนักงานไม่มีสิทธิ์ยกเลิกแทนลูกค้า
        </p>
        {error && <p className="staff-error">{error}</p>}
        <div className="staff-modal-actions">
          <button className="staff-btn ghost" onClick={onClose} type="button">ปิด</button>
          <button className="staff-btn danger" disabled={saving} type="submit">
            {saving ? 'กำลังบันทึก…' : 'ยืนยัน No-show'}
          </button>
        </div>
      </form>
    </StaffModal>
  )
}
