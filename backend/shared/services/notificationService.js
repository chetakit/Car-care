// In-app notifications (the bell in the header).
//
// A notification stores only a type and some data; the browser turns it
// into Thai or English text. Writers run inside the caller's transaction, so
// a notification is saved only if the change it describes is saved too.
//
// Notifications are a convenience: a failure to save one (for example before
// database/migrations/2026-11-21_notifications.sql has been run) is logged
// and never breaks the booking, payment or status change itself.
const { SHOP_TODAY_SQL } = require("./shopTime");

const TYPES = Object.freeze({
  PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED", // customer: paid, booking confirmed
  PAYMENT_EXPIRED: "PAYMENT_EXPIRED", // customer: not paid within 15 minutes
  TRANSFER_PENDING: "TRANSFER_PENDING", // staff/admin: a bank transfer waits for checking
  NEW_BOOKING_TODAY: "NEW_BOOKING_TODAY", // staff: a booking for today was just confirmed
  VEHICLE_CHECKED_IN: "VEHICLE_CHECKED_IN", // customer
  SERVICE_STARTED: "SERVICE_STARTED", // customer
  SERVICE_COMPLETED: "SERVICE_COMPLETED", // customer: car ready to collect
  NO_SHOW: "NO_SHOW", // customer
  BOOKING_CANCELLED: "BOOKING_CANCELLED", // customer + admin (with refund, if any)
  APPOINTMENT_REMINDER: "APPOINTMENT_REMINDER", // customer: appointment tomorrow
});

const MAX_LIST = 50;
let missingTableLogged = false;

function isMissingTable(error) {
  const message = (error && (error.sqlMessage || error.message)) || "";
  return Boolean(error) && (error.code === "ER_NO_SUCH_TABLE" || error.errno === 1146) && /notifications/.test(message);
}

function logFailure(error) {
  if (isMissingTable(error)) {
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.warn("Notifications are off: run database/migrations/2026-11-21_notifications.sql.");
    }
    return;
  }
  console.error("A notification could not be saved:", error && error.message);
}

const toJson = (data) => (data && Object.keys(data).length ? JSON.stringify(data) : null);

/** Notify one user. */
async function notify(connection, { userId, type, bookingId = null, data = null }) {
  if (!userId || !type) return;
  try {
    await connection.execute(
      "INSERT INTO notifications (user_id, type, booking_id, data) VALUES (?, ?, ?, ?)",
      [userId, type, bookingId, toJson(data)],
    );
  } catch (error) {
    logFailure(error);
  }
}

/** Notify every active user with a role (STAFF or ADMIN). */
async function notifyRole(connection, role, { type, bookingId = null, data = null }) {
  try {
    await connection.execute(
      `INSERT INTO notifications (user_id, type, booking_id, data)
      SELECT user_id, ?, ?, ? FROM users WHERE role = ? AND status = 'ACTIVE'`,
      [type, bookingId, toJson(data), role],
    );
  } catch (error) {
    logFailure(error);
  }
}

/**
 * Notify about a booking: reads the booking's customer, date, time and plate
 * so every message can say which appointment it is about.
 *   toCustomer      send to the booking's customer (default true)
 *   roles           also send to these roles, e.g. ["ADMIN"]
 *   rolesIfToday    send to these roles only when the booking is for today
 *   roleType        a different type for the role recipients (default: type)
 */
async function notifyBooking(connection, bookingId, type, extra = {}, options = {}) {
  const { toCustomer = true, roles = [], rolesIfToday = [], roleType = type } = options;
  try {
    const [rows] = await connection.execute(
      `SELECT b.user_id, DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS date,
        TIME_FORMAT(b.start_time, '%H:%i') AS start_time, v.license_plate AS plate,
        b.booking_date = ${SHOP_TODAY_SQL} AS is_today
      FROM bookings b
      LEFT JOIN vehicles v ON v.vehicle_id = b.vehicle_id
      WHERE b.booking_id = ?`,
      [bookingId],
    );
    const booking = rows && rows[0];
    if (!booking) return;
    const data = { date: booking.date, start_time: booking.start_time, plate: booking.plate, ...extra };
    if (toCustomer) await notify(connection, { userId: booking.user_id, type, bookingId, data });
    const targets = [...roles, ...(Number(booking.is_today) === 1 ? rolesIfToday : [])];
    for (const role of new Set(targets)) {
      await notifyRole(connection, role, { type: roleType, bookingId, data });
    }
  } catch (error) {
    logFailure(error);
  }
}

/** Remind customers the day before their appointment (runs every minute). */
async function sendAppointmentReminders(pool) {
  try {
    const [result] = await pool.execute(
      `INSERT INTO notifications (user_id, type, booking_id, data)
      SELECT b.user_id, '${TYPES.APPOINTMENT_REMINDER}', b.booking_id,
        JSON_OBJECT('date', DATE_FORMAT(b.booking_date, '%Y-%m-%d'),
          'start_time', TIME_FORMAT(b.start_time, '%H:%i'), 'plate', v.license_plate)
      FROM bookings b
      LEFT JOIN vehicles v ON v.vehicle_id = b.vehicle_id
      WHERE b.booking_status = 'CONFIRMED'
        AND b.booking_date = ${SHOP_TODAY_SQL} + INTERVAL 1 DAY
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.booking_id = b.booking_id AND n.type = '${TYPES.APPOINTMENT_REMINDER}'
        )`,
    );
    return result.affectedRows;
  } catch (error) {
    logFailure(error);
    return 0;
  }
}

function startNotificationJobs(pool, intervalMs = 60_000) {
  const run = () => sendAppointmentReminders(pool);
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

function parseData(value) {
  if (value === null || value === undefined) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/** Latest notifications of one user, plus how many are unread. */
async function listForUser(pool, userId, limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIST);
  try {
    const [[rows], [[counts]]] = await Promise.all([
      pool.execute(
        `SELECT notification_id, type, booking_id, data,
          DATE_FORMAT(read_at, '%Y-%m-%dT%H:%i:%sZ') AS read_at,
          DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC, notification_id DESC
        LIMIT ${safeLimit}`,
        [userId],
      ),
      pool.execute(
        "SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL",
        [userId],
      ),
    ]);
    return {
      items: rows.map((row) => ({ ...row, data: parseData(row.data) })),
      unread_count: Number(counts.unread) || 0,
    };
  } catch (error) {
    if (isMissingTable(error)) {
      logFailure(error);
      return { items: [], unread_count: 0 };
    }
    throw error;
  }
}

/** Mark some (ids) or all of a user's notifications as read. */
async function markRead(pool, userId, ids) {
  const params = [userId];
  let filter = "";
  if (Array.isArray(ids) && ids.length) {
    filter = ` AND notification_id IN (${ids.map(() => "?").join(", ")})`;
    params.push(...ids);
  }
  try {
    const [result] = await pool.execute(
      `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND read_at IS NULL${filter}`,
      params,
    );
    return result.affectedRows;
  } catch (error) {
    if (isMissingTable(error)) return 0;
    throw error;
  }
}

module.exports = {
  TYPES,
  notify,
  notifyRole,
  notifyBooking,
  sendAppointmentReminders,
  startNotificationJobs,
  listForUser,
  markRead,
};
