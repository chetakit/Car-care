// [STAFF] เรียก backend /api/staff/bookings — ใช้ api client ของทีม (แนบ token ให้อัตโนมัติ)
// api = ค่าจาก useApi() ใน src/Admin/hooks/useApi.js

export function listStaffBookings(api, params = {}, signal) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const query = search.toString()
  return api(`/api/staff/bookings${query ? `?${query}` : ''}`, { signal }).then((r) => r.data)
}

export function getStaffBooking(api, bookingId, signal) {
  return api(`/api/staff/bookings/${bookingId}`, { signal }).then((r) => r.data)
}

export function checkInBooking(api, bookingId, body) {
  return api(`/api/staff/bookings/${bookingId}/check-in`, { method: 'POST', body }).then((r) => r.data)
}

export function changeBookingStatus(api, bookingId, status, reason) {
  return api(`/api/staff/bookings/${bookingId}/status`, {
    method: 'PATCH',
    body: { status, reason },
  }).then((r) => r.data)
}

export function markBookingNoShow(api, bookingId, reason) {
  return api(`/api/staff/bookings/${bookingId}/no-show`, {
    method: 'POST',
    body: { reason },
  }).then((r) => r.data)
}

export function addBookingNote(api, bookingId, note) {
  return api(`/api/staff/bookings/${bookingId}/notes`, {
    method: 'POST',
    body: { note },
  }).then((r) => r.data)
}
