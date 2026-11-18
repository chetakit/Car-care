// =====================================================================
// [STAFF][MOCK] ข้อมูลจำลอง ใช้ดูหน้าพนักงานได้โดยยังไม่ต้องมี backend
//
// เปิดใช้: สร้างไฟล์ frontend/.env.local แล้วใส่บรรทัด  VITE_STAFF_MOCK=true
// ปิดใช้: ลบบรรทัดนั้นออก -> หน้าพนักงานจะเรียก backend จริงที่ /api/staff/bookings
//
// ฟังก์ชันทุกตัวรับ/คืนค่ารูปแบบเดียวกับ backend จริง (ดู staffBookingApi.js)
// ข้อมูลเก็บในหน่วยความจำ — รีเฟรชหน้าแล้วจะกลับเป็นค่าเริ่มต้น
// =====================================================================
import messages from '../../i18n/messages.js'
import { shiftDays, todayKey } from '../utils/staffFormat.js'

const LANGUAGE_STORAGE_KEY = 'car-care-language'

// This adapter runs outside React; read the language preference persisted by LanguageProvider.
function getMockErrorMessage(key) {
  let language = 'TH'
  if (typeof window !== 'undefined') {
    try {
      language = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'EN' ? 'EN' : 'TH'
    } catch {
      language = 'TH'
    }
  }

  const message = messages[language]?.[key]
  if (typeof message !== 'string') {
    throw new Error(`Missing Staff mock error translation "${key}".`)
  }
  return message
}

// ต้องตรงกับกติกาฝั่ง backend: พนักงานเปลี่ยนสถานะได้แค่ตามลำดับนี้ และยกเลิกไม่ได้
const STATUS_TRANSITIONS = {
  CHECKED_IN: ['IN_SERVICE'],
  IN_SERVICE: ['COMPLETED'],
}

const STAFF_NAME = 'พนักงานทดสอบ'

const CUSTOMERS = [
  { user_id: 11, full_name: 'สมชาย ใจดี', phone: '0812345678', email: 'somchai@example.com' },
  { user_id: 12, full_name: 'สุดา รักรถ', phone: '0898765432', email: 'suda@example.com' },
  { user_id: 13, full_name: 'อนันต์ มีสุข', phone: '0861112222', email: 'anan@example.com' },
  { user_id: 14, full_name: 'พิมพ์ชนก แสงทอง', phone: null, email: 'pim@example.com' },
]

const VEHICLES = [
  { vehicle_id: 21, user_id: 11, license_plate: 'กข 1234', province: 'กรุงเทพมหานคร', brand_name: 'Toyota', model_name: 'Yaris', type_name: 'รถเก๋ง', production_year: 2020, color: 'ขาว' },
  { vehicle_id: 22, user_id: 12, license_plate: '1กค 5678', province: 'นนทบุรี', brand_name: 'Honda', model_name: 'City', type_name: 'รถเก๋ง', production_year: 2022, color: 'เทา' },
  { vehicle_id: 23, user_id: 13, license_plate: 'บง 9090', province: 'ปทุมธานี', brand_name: 'Isuzu', model_name: 'D-Max', type_name: 'รถกระบะ', production_year: 2019, color: 'ดำ' },
  { vehicle_id: 24, user_id: 14, license_plate: '3ขข 4455', province: 'กรุงเทพมหานคร', brand_name: 'Mazda', model_name: 'CX-5', type_name: 'SUV', production_year: 2023, color: 'แดง' },
]

const SERVICES = {
  wash: { service_id: 1, service_name: 'ล้างรถภายนอก', unit_price: 250, duration_minutes: 45 },
  vacuum: { service_id: 2, service_name: 'ดูดฝุ่นภายใน', unit_price: 150, duration_minutes: 30 },
  wax: { service_id: 3, service_name: 'เคลือบแว็กซ์', unit_price: 600, duration_minutes: 60 },
  engine: { service_id: 4, service_name: 'ล้างห้องเครื่อง', unit_price: 400, duration_minutes: 40 },
}

// [วันที่ห่างจากวันนี้, เวลาเริ่ม, สถานะ, ลูกค้า index, บริการ]
const SEED = [
  [0, '08:30', 'COMPLETED', 0, ['wash', 'vacuum']],
  [0, '09:30', 'IN_SERVICE', 1, ['wash', 'wax']],
  [0, '10:30', 'CHECKED_IN', 2, ['engine']],
  [0, '11:00', 'CONFIRMED', 3, ['wash']],
  [0, '13:00', 'CONFIRMED', 0, ['wax']],
  [0, '15:00', 'CANCELLED', 1, ['vacuum']],
  [0, '16:30', 'CONFIRMED', 2, ['wash', 'vacuum']],
  [1, '09:00', 'CONFIRMED', 1, ['wash']],
  [1, '14:00', 'CONFIRMED', 3, ['wax', 'vacuum']],
  [-1, '10:00', 'COMPLETED', 2, ['wash']],
  [-1, '13:30', 'NO_SHOW', 3, ['engine']],
  [-7, '09:00', 'COMPLETED', 0, ['wash', 'wax']],
  [-14, '11:00', 'COMPLETED', 1, ['vacuum']],
]

const pad = (n) => String(n).padStart(2, '0')

function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

function isoAt(date, time) {
  return new Date(`${date}T${time}:00`).toISOString()
}

let nextId = 1000
const db = buildSeed()

function buildSeed() {
  const today = todayKey()
  return SEED.map(([offset, start, status, customerIndex, serviceKeys], index) => {
    const bookingId = 101 + index
    const date = shiftDays(today, offset)
    const services = serviceKeys.map((key, i) => ({
      booking_service_id: bookingId * 10 + i,
      ...SERVICES[key],
    }))
    const minutes = services.reduce((sum, s) => sum + s.duration_minutes, 0)
    const total = services.reduce((sum, s) => sum + s.unit_price, 0)
    const discount = index % 4 === 1 ? 50 : 0
    const customer = CUSTOMERS[customerIndex]
    const vehicle = VEHICLES[customerIndex]

    const history = [{ new_status: 'CONFIRMED', reason: 'ลูกค้าจองผ่านระบบ', by: null, at: isoAt(shiftDays(date, -2), '18:00') }]
    let checkIn = null
    const steps = { CHECKED_IN: 1, IN_SERVICE: 2, COMPLETED: 3 }[status] ?? 0
    if (steps >= 1) {
      history.push({ new_status: 'CHECKED_IN', reason: 'รับรถเข้าร้าน', by: STAFF_NAME, at: isoAt(date, addMinutes(start, -5)) })
      checkIn = {
        mileage: 35000 + bookingId * 37,
        fuel_level: 'HALF',
        condition_note: index % 2 ? 'มีรอยขีดข่วนเล็กน้อยที่กันชนหลัง' : null,
        checked_in_by_name: STAFF_NAME,
        checked_in_at: isoAt(date, addMinutes(start, -5)),
      }
    }
    if (steps >= 2) history.push({ new_status: 'IN_SERVICE', reason: 'เริ่มดำเนินการ', by: STAFF_NAME, at: isoAt(date, addMinutes(start, 5)) })
    if (steps >= 3) history.push({ new_status: 'COMPLETED', reason: 'ดำเนินการครบทุกรายการ', by: STAFF_NAME, at: isoAt(date, addMinutes(start, minutes)) })
    if (status === 'CANCELLED') history.push({ new_status: 'CANCELLED', reason: 'ลูกค้ายกเลิกผ่านระบบ', by: customer.full_name, at: isoAt(shiftDays(date, -1), '20:00') })
    if (status === 'NO_SHOW') history.push({ new_status: 'NO_SHOW', reason: 'โทรติดต่อ 2 ครั้ง ไม่รับสาย', by: STAFF_NAME, at: isoAt(date, addMinutes(start, 30)) })

    return {
      booking: {
        booking_id: bookingId,
        booking_date: date,
        start_time: start,
        end_time: addMinutes(start, minutes),
        booking_status: status,
        total_amount: total,
        discount_amount: discount,
        final_amount: total - discount,
        notes: index === 3 ? 'ช่วยเช็กลมยางให้ด้วยครับ' : null,
      },
      customer,
      vehicle,
      services,
      payment: { payment_status: steps >= 3 || index % 3 === 0 ? 'PAID' : 'PENDING', payment_method: 'QR' },
      check_in: checkIn,
      status_history: history.map((h, i) => ({
        history_id: bookingId * 10 + i,
        old_status: i === 0 ? null : history[i - 1].new_status,
        new_status: h.new_status,
        reason: h.reason,
        changed_by_name: h.by,
        created_at: h.at,
      })),
      notes: [],
    }
  })
}

/* ------------------------------ ตัวช่วยภายใน ------------------------------ */

const delay = (signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 250)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

const clone = (value) => JSON.parse(JSON.stringify(value))

function find(bookingId) {
  const record = db.find((r) => r.booking.booking_id === Number(bookingId))
  if (!record) throw new Error(getMockErrorMessage('staff.mock.error.bookingNotFound'))
  return record
}

// สร้างข้อมูลรายละเอียดแบบเดียวกับ GET /api/staff/bookings/:id
function toDetail(record) {
  const { booking } = record
  return clone({
    ...record,
    booking: {
      ...booking,
      appointment_started: new Date() >= new Date(`${booking.booking_date}T${booking.start_time}:00`),
    },
    allowed_next_statuses: STATUS_TRANSITIONS[booking.booking_status] ?? [],
  })
}

function pushHistory(record, newStatus, reason) {
  record.status_history.push({
    history_id: nextId++,
    old_status: record.booking.booking_status,
    new_status: newStatus,
    reason,
    changed_by_name: STAFF_NAME,
    created_at: new Date().toISOString(),
  })
  record.booking.booking_status = newStatus
}

/* ------------------------------ API จำลอง ------------------------------ */

export async function listStaffBookings(_api, params = {}, signal) {
  await delay(signal)
  const term = (params.search ?? '').toLowerCase()
  const rows = db
    .filter(({ booking, customer, vehicle }) => {
      if (params.date && booking.booking_date !== params.date) return false
      if (params.date_from && booking.booking_date < params.date_from) return false
      if (params.date_to && booking.booking_date > params.date_to) return false
      if (params.booking_status && booking.booking_status !== params.booking_status) return false
      if (params.vehicle_id && vehicle.vehicle_id !== Number(params.vehicle_id)) return false
      if (term) {
        const text = `${booking.booking_id} ${customer.full_name} ${customer.phone} ${vehicle.license_plate}`
        if (!text.toLowerCase().includes(term)) return false
      }
      return true
    })
    // รายวันเรียงตามเวลา, ประวัติเรียงใหม่ -> เก่า
    .sort((a, b) => {
      const ka = `${a.booking.booking_date} ${a.booking.start_time}`
      const kb = `${b.booking.booking_date} ${b.booking.start_time}`
      return params.date ? ka.localeCompare(kb) : kb.localeCompare(ka)
    })
    .map(({ booking, customer, vehicle, services }) => ({
      ...booking,
      user_id: customer.user_id,
      full_name: customer.full_name,
      phone: customer.phone,
      vehicle_id: vehicle.vehicle_id,
      license_plate: vehicle.license_plate,
      province: vehicle.province,
      brand_name: vehicle.brand_name,
      model_name: vehicle.model_name,
      service_names: services.map((s) => s.service_name),
    }))

  const limit = Number(params.limit) || 50
  const page = Number(params.page) || 1
  return clone({
    items: rows.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
  })
}

export async function getStaffBooking(_api, bookingId, signal) {
  await delay(signal)
  return toDetail(find(bookingId))
}

export async function checkInBooking(_api, bookingId, body) {
  await delay()
  const record = find(bookingId)
  if (record.booking.booking_status !== 'CONFIRMED') {
    throw new Error(getMockErrorMessage('staff.mock.error.checkInNotConfirmed'))
  }
  record.check_in = {
    mileage: body.mileage,
    fuel_level: body.fuel_level,
    condition_note: body.condition_note,
    checked_in_by_name: STAFF_NAME,
    checked_in_at: new Date().toISOString(),
  }
  pushHistory(record, 'CHECKED_IN', body.note || 'รับรถเข้าร้าน')
  return toDetail(record)
}

export async function changeBookingStatus(_api, bookingId, status, reason) {
  await delay()
  const record = find(bookingId)
  if (status === 'CANCELLED') {
    throw new Error(getMockErrorMessage('staff.mock.error.cancelNotAllowed'))
  }
  const allowed = STATUS_TRANSITIONS[record.booking.booking_status] ?? []
  if (!allowed.includes(status)) {
    throw new Error(getMockErrorMessage('staff.mock.error.invalidStatusTransition'))
  }
  pushHistory(record, status, reason)
  return toDetail(record)
}

export async function markBookingNoShow(_api, bookingId, reason) {
  await delay()
  const record = find(bookingId)
  const detail = toDetail(record)
  if (record.booking.booking_status !== 'CONFIRMED') {
    throw new Error(getMockErrorMessage('staff.mock.error.noShowNotConfirmed'))
  }
  if (!detail.booking.appointment_started) {
    throw new Error(getMockErrorMessage('staff.mock.error.noShowTooEarly'))
  }
  pushHistory(record, 'NO_SHOW', reason)
  return toDetail(record)
}

export async function addBookingNote(_api, bookingId, note) {
  await delay()
  const record = find(bookingId)
  if (record.booking.booking_status === 'CANCELLED') {
    throw new Error(getMockErrorMessage('staff.mock.error.cancelledNoteNotAllowed'))
  }
  record.notes.push({
    note_id: nextId++,
    note,
    created_by_name: STAFF_NAME,
    created_at: new Date().toISOString(),
  })
  return toDetail(record)
}
