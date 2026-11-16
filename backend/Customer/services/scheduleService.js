const pool = require("../../shared/config/db");
const { OVERLAPPING_BOOKINGS_SQL, planFromSlot } = require("../../shared/services/slotPlanner");

// Lists start times a customer can book. With duration_minutes, a start time
// is offered only when enough back-to-back open slots follow it; end_time is
// then the end of the last slot the booking would use, and remaining_capacity
// the smallest number of free places across those slots.
async function listAvailability({ from, to, duration_minutes: durationMinutes }) {
  const [rows] = await pool.execute(
    `SELECT
      s.schedule_id,
      s.schedule_date,
      s.start_time,
      s.end_time,
      s.capacity,
      ${OVERLAPPING_BOOKINGS_SQL("s")} AS booked_count
    FROM schedules s
    WHERE s.schedule_date BETWEEN ? AND ?
      AND s.status = 'AVAILABLE'
      AND (
        s.schedule_date > CURRENT_DATE()
        OR (
          s.schedule_date = CURRENT_DATE()
          AND s.start_time > CURRENT_TIME()
        )
      )
    ORDER BY s.schedule_date ASC, s.start_time ASC, s.schedule_id ASC`,
    [from, to],
  );

  const byDate = new Map();
  for (const row of rows) {
    const key = String(row.schedule_date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(row);
  }

  const items = [];
  for (const daySlots of byDate.values()) {
    daySlots.forEach((slot, index) => {
      const plan = planFromSlot(daySlots, index, durationMinutes || 1);
      if (!plan.slots) return;
      items.push({
        schedule_id: slot.schedule_id,
        schedule_date: slot.schedule_date,
        start_time: slot.start_time,
        end_time: plan.endTime,
        capacity: slot.capacity,
        booked_count: Number(slot.booked_count),
        remaining_capacity: plan.remaining,
      });
    });
  }
  return items;
}

module.exports = { listAvailability };
