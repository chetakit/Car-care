const pool = require("../../shared/config/db");
const { HOLDS_SLOT_SQL } = require("../../shared/services/bookingPaymentHold");
const { OVERLAPPING_BOOKINGS_SQL } = require("../../shared/services/slotPlanner");

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
      -- Bookings overlapping the slot in time: includes visits that started in
      -- an earlier slot and run into this one; expired unpaid holds are excluded.
      ${OVERLAPPING_BOOKINGS_SQL("s")} AS booked_count,
      s.capacity - ${OVERLAPPING_BOOKINGS_SQL("s")} AS remaining_capacity
    FROM schedules s
    WHERE s.schedule_date BETWEEN ? AND ?
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
      FROM bookings b
      WHERE b.booking_date = ? AND b.start_time < ? AND b.end_time > ?
        AND ${HOLDS_SLOT_SQL("b")}`,
      [schedule.schedule_date, schedule.end_time, schedule.start_time],
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
