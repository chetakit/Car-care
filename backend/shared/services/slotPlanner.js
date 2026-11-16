// A booking may need more time than one schedule slot. It then uses the
// following slots of the same day, as long as they are back to back,
// open, and not full. A booking always occupies whole slots: its end_time is
// the end of the last slot it uses.
const { HOLDS_SLOT_SQL } = require("./bookingPaymentHold");

// Bookings that overlap slot `s` in time (works for one-slot and multi-slot bookings).
const OVERLAPPING_BOOKINGS_SQL = (slotAlias = "s", bookingAlias = "b") =>
  `(SELECT COUNT(*) FROM bookings ${bookingAlias}
    WHERE ${bookingAlias}.booking_date = ${slotAlias}.schedule_date
      AND ${bookingAlias}.start_time < ${slotAlias}.end_time
      AND ${bookingAlias}.end_time > ${slotAlias}.start_time
      AND ${HOLDS_SLOT_SQL(bookingAlias)})`;

function timeToSeconds(value) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value));
  if (!match) return NaN;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
}

// slots: one day's slots sorted by start_time, each with start_time, end_time,
// capacity, booked_count and (optionally) status.
// Returns { slots, endTime, remaining } or { reason } when the time does not fit.
function planFromSlot(slots, startIndex, durationMinutes) {
  const needed = Math.max(1, Number(durationMinutes) || 0) * 60;
  const first = slots[startIndex];
  if (!first) return { reason: "missing" };
  const startSeconds = timeToSeconds(first.start_time);
  const used = [];
  let coveredUntil = startSeconds;
  let remaining = Infinity;

  for (let index = startIndex; index < slots.length; index += 1) {
    const slot = slots[index];
    const slotStart = timeToSeconds(slot.start_time);
    if (index > startIndex && slotStart !== coveredUntil) {
      return { reason: "gap" };
    }
    if (slot.status !== undefined && slot.status !== "AVAILABLE") {
      return { reason: "closed" };
    }
    const free = Number(slot.capacity) - Number(slot.booked_count);
    if (!(free > 0)) {
      return { reason: "full" };
    }
    used.push(slot);
    remaining = Math.min(remaining, free);
    coveredUntil = timeToSeconds(slot.end_time);
    if (coveredUntil - startSeconds >= needed) {
      return { slots: used, endTime: slot.end_time, remaining };
    }
  }
  return { reason: "day_end" };
}

module.exports = {
  OVERLAPPING_BOOKINGS_SQL,
  timeToSeconds,
  planFromSlot,
};
