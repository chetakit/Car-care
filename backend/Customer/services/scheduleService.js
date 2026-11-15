const pool = require("../../shared/config/db");

async function listAvailability({ from, to }) {
  const [rows] = await pool.execute(
    `SELECT
      s.schedule_id,
      s.schedule_date,
      s.start_time,
      s.end_time,
      s.capacity,
      COUNT(b.booking_id) AS booked_count,
      s.capacity - COUNT(b.booking_id) AS remaining_capacity
    FROM schedules s
    LEFT JOIN bookings b
      ON b.schedule_id = s.schedule_id
      AND b.booking_status <> 'CANCELLED'
    WHERE s.schedule_date BETWEEN ? AND ?
      AND s.status = 'AVAILABLE'
      AND (
        s.schedule_date > CURRENT_DATE()
        OR (
          s.schedule_date = CURRENT_DATE()
          AND s.start_time > CURRENT_TIME()
        )
      )
    GROUP BY
      s.schedule_id,
      s.schedule_date,
      s.start_time,
      s.end_time,
      s.capacity
    HAVING s.capacity - COUNT(b.booking_id) > 0
    ORDER BY s.schedule_date ASC, s.start_time ASC, s.schedule_id ASC`,
    [from, to],
  );
  return rows;
}

module.exports = { listAvailability };
