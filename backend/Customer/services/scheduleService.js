const pool = require("../../shared/config/db");
const { OVERLAPPING_BOOKINGS_SQL, planFromSlot } = require("../../shared/services/slotPlanner");

// Lists every schedule so customers can see occupied and elapsed times as
// disabled options. With duration_minutes, selectable starts must have enough
// back-to-back open slots; end_time and remaining_capacity reflect that plan.
async function listAvailability({ from, to, duration_minutes: durationMinutes }) {
  const [rows] = await pool.execute(
    `SELECT
      s.schedule_id,
      s.schedule_date,
      s.start_time,
      s.end_time,
      s.capacity,
      s.status,
      ${OVERLAPPING_BOOKINGS_SQL("s")} AS booked_count,
      CASE
        WHEN s.schedule_date < CURRENT_DATE()
          OR (
            s.schedule_date = CURRENT_DATE()
            AND s.start_time <= CURRENT_TIME()
          )
        THEN 1
        ELSE 0
      END AS has_started
    FROM schedules s
    WHERE s.schedule_date BETWEEN ? AND ?
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
      const currentRemaining = Math.max(
        0,
        Number(slot.capacity) - Number(slot.booked_count),
      );
      const isPast = Number(slot.has_started) === 1;
      const hasPlan = Boolean(plan.slots);
      let status = slot.status || "AVAILABLE";
      let remainingCapacity = currentRemaining;
      if (isPast) {
        status = "PAST";
      } else if (slot.status && slot.status !== "AVAILABLE") {
        remainingCapacity = 0;
      } else if (hasPlan) {
        remainingCapacity = plan.remaining;
      } else {
        status = currentRemaining === 0 ? "FULL" : "UNAVAILABLE";
        remainingCapacity = 0;
      }

      items.push({
        schedule_id: slot.schedule_id,
        schedule_date: slot.schedule_date,
        start_time: slot.start_time,
        end_time: hasPlan ? plan.endTime : slot.end_time,
        capacity: slot.capacity,
        booked_count: Number(slot.booked_count),
        remaining_capacity: remainingCapacity,
        status,
      });
    });
  }
  return items;
}

module.exports = { listAvailability };
