const pool = require("../../shared/config/db");

class ScheduleNotFoundError extends Error {}
class ScheduleCapacityConflictError extends Error {}

async function listCapacity({ from, to }) {
  const [rows] = await pool.execute(
    `SELECT
      s.schedule_id,
      DATE_FORMAT(s.schedule_date, '%Y-%m-%d') AS schedule_date,
      TIME_FORMAT(s.start_time, '%H:%i:%s') AS start_time,
      TIME_FORMAT(s.end_time, '%H:%i:%s') AS end_time,
      s.capacity,
      s.status,
      COUNT(b.booking_id) AS booked_count,
      s.capacity - COUNT(b.booking_id) AS remaining_capacity
    FROM schedules s
    LEFT JOIN bookings b
      ON b.schedule_id = s.schedule_id
      AND b.booking_status <> 'CANCELLED'
    WHERE s.schedule_date BETWEEN ? AND ?
    GROUP BY
      s.schedule_id,
      s.schedule_date,
      s.start_time,
      s.end_time,
      s.capacity,
      s.status
    ORDER BY s.schedule_date ASC, s.start_time ASC, s.schedule_id ASC`,
    [from, to],
  );
  return rows;
}

async function updateCapacity(scheduleId, capacity) {
  let connection;
  let transactionStarted = false;
  let connectionReusable = true;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [scheduleRows] = await connection.execute(
      `SELECT
        schedule_id,
        DATE_FORMAT(schedule_date, '%Y-%m-%d') AS schedule_date,
        TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
        TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
        status
      FROM schedules
      WHERE schedule_id = ?
      FOR UPDATE`,
      [scheduleId],
    );
    const schedule = scheduleRows[0];
    if (!schedule) {
      throw new ScheduleNotFoundError();
    }

    const [bookingRows] = await connection.execute(
      `SELECT COUNT(*) AS booked_count
      FROM bookings
      WHERE schedule_id = ? AND booking_status <> 'CANCELLED'`,
      [scheduleId],
    );
    const bookedCount = Number(bookingRows[0]?.booked_count);
    if (!Number.isSafeInteger(bookedCount) || bookedCount < 0) {
      throw new Error("Schedule bookings could not be verified.");
    }
    if (capacity < bookedCount) {
      throw new ScheduleCapacityConflictError(
        "Capacity cannot be lower than the number of active bookings.",
      );
    }

    await connection.execute(
      "UPDATE schedules SET capacity = ? WHERE schedule_id = ?",
      [capacity, scheduleId],
    );
    await connection.commit();
    transactionStarted = false;

    return {
      ...schedule,
      capacity,
      booked_count: bookedCount,
      remaining_capacity: capacity - bookedCount,
    };
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        connectionReusable = false;
        console.error("Schedule capacity rollback failed.");
      }
    }
    throw error;
  } finally {
    if (connection) {
      if (connectionReusable) {
        connection.release();
      } else {
        try {
          connection.destroy();
        } catch {
          console.error("Schedule capacity connection destruction failed.");
        }
      }
    }
  }
}

module.exports = {
  ScheduleNotFoundError,
  ScheduleCapacityConflictError,
  listCapacity,
  updateCapacity,
};
