// [STAFF] ข้อความภาษาไทย + ตัวช่วยจัดรูปแบบ สำหรับหน้าพนักงาน

// ต้องตรงกับ bookings.booking_status ใน database
export const STATUS_LABEL = {
  CONFIRMED: 'รอรับรถ',
  CHECKED_IN: 'รับรถแล้ว',
  IN_SERVICE: 'กำลังให้บริการ',
  COMPLETED: 'บริการเสร็จสิ้น',
  NO_SHOW: 'ไม่มาตามนัด',
  CANCELLED: 'ลูกค้ายกเลิก',
}

// ต้องตรงกับ ENUM vehicle_check_ins.fuel_level
export const FUEL_LABEL = {
  EMPTY: 'E (หมด)',
  QUARTER: '1/4',
  HALF: '1/2',
  THREE_QUARTER: '3/4',
  FULL: 'เต็มถัง',
}

export const PAYMENT_LABEL = {
  PENDING: 'รอชำระ',
  PAID: 'ชำระแล้ว',
  FAILED: 'ชำระไม่สำเร็จ',
}

const pad = (n) => String(n).padStart(2, '0')

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const todayKey = () => toDateKey(new Date())

export function shiftDays(key, days) {
  const date = new Date(`${key}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

export function formatThaiDate(key) {
  if (!key) return '—'
  return new Date(`${key}T00:00:00`).toLocaleDateString('th-TH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatShortDate(key) {
  if (!key) return '—'
  return new Date(`${key}T00:00:00`).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })
}

export function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatMoney(value) {
  return `${Number(value ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })} ฿`
}

export function vehicleName(vehicle) {
  return [vehicle?.brand_name, vehicle?.model_name].filter(Boolean).join(' ') || '—'
}

export function plateText(item) {
  return [item?.license_plate, item?.province].filter(Boolean).join(' ') || '—'
}
