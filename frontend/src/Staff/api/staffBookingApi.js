// [STAFF] เรียก backend /api/staff/bookings — ใช้ api client ของทีม (แนบ token ให้อัตโนมัติ)
// api = ค่าจาก useApi() ใน src/Admin/hooks/useApi.js
//
// [STAFF][MOCK] ถ้าตั้ง VITE_STAFF_MOCK=true ใน frontend/.env.local จะใช้ข้อมูลจำลองจาก staffMockApi.js แทน
import * as mock from './staffMockApi.js'

export const STAFF_MOCK = import.meta.env.VITE_STAFF_MOCK === 'true'

function listStaffBookingsReal(api, params = {}, signal) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const query = search.toString()
  return api(`/api/staff/bookings${query ? `?${query}` : ''}`, { signal }).then((r) => r.data)
}

function getStaffBookingReal(api, bookingId, signal) {
  return api(`/api/staff/bookings/${bookingId}`, { signal }).then((r) => r.data)
}

function checkInBookingReal(api, bookingId, body) {
  return api(`/api/staff/bookings/${bookingId}/check-in`, { method: 'POST', body }).then((r) => r.data)
}

function changeBookingStatusReal(api, bookingId, status, reason) {
  return api(`/api/staff/bookings/${bookingId}/status`, {
    method: 'PATCH',
    body: { status, reason },
  }).then((r) => r.data)
}

function markBookingNoShowReal(api, bookingId, reason) {
  return api(`/api/staff/bookings/${bookingId}/no-show`, {
    method: 'POST',
    body: { reason },
  }).then((r) => r.data)
}

function addBookingNoteReal(api, bookingId, note) {
  return api(`/api/staff/bookings/${bookingId}/notes`, {
    method: 'POST',
    body: { note },
  }).then((r) => r.data)
}

// [STAFF][MOCK] เลือกใช้ของจริงหรือของจำลอง — หน้าอื่น ๆ import จากไฟล์นี้ไฟล์เดียว
export const listStaffBookings = STAFF_MOCK ? mock.listStaffBookings : listStaffBookingsReal
export const getStaffBooking = STAFF_MOCK ? mock.getStaffBooking : getStaffBookingReal
export const checkInBooking = STAFF_MOCK ? mock.checkInBooking : checkInBookingReal
export const changeBookingStatus = STAFF_MOCK ? mock.changeBookingStatus : changeBookingStatusReal
export const markBookingNoShow = STAFF_MOCK ? mock.markBookingNoShow : markBookingNoShowReal
export const addBookingNote = STAFF_MOCK ? mock.addBookingNote : addBookingNoteReal
