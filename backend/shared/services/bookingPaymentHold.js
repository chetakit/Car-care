const { releaseCouponForBooking } = require("./couponPricing");

// A PENDING_PAYMENT booking holds its schedule slot for this many minutes.
// After that it no longer counts toward capacity, cannot be paid, and is
// cancelled by expireUnpaidBookings().
const PAYMENT_HOLD_MINUTES = 15;

const HOLD_EXPIRED_SQL = (alias = "b") =>
  `(${alias}.booking_status = 'PENDING_PAYMENT'
    AND ${alias}.created_at < NOW() - INTERVAL ${PAYMENT_HOLD_MINUTES} MINUTE)`;

// Bookings that occupy a schedule slot.
const HOLDS_SLOT_SQL = (alias = "b") =>
  `(${alias}.booking_status <> 'CANCELLED' AND NOT ${HOLD_EXPIRED_SQL(alias)})`;

const EXPIRY_REASON = `Payment not received within ${PAYMENT_HOLD_MINUTES} minutes.`;

async function expireUnpaidBookings(pool) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT b.booking_id FROM bookings b
      WHERE ${HOLD_EXPIRED_SQL("b")}
      FOR UPDATE`,
    );
    for (const { booking_id: bookingId } of rows) {
      await connection.execute(
        `UPDATE bookings SET booking_status = 'CANCELLED'
        WHERE booking_id = ? AND booking_status = 'PENDING_PAYMENT'`,
        [bookingId],
      );
      await connection.execute(
        `UPDATE payments SET payment_status = 'FAILED'
        WHERE booking_id = ? AND payment_status = 'PENDING'`,
        [bookingId],
      );
      await connection.execute(
        `INSERT INTO booking_status_history
          (booking_id, old_status, new_status, changed_by, reason)
        VALUES (?, 'PENDING_PAYMENT', 'CANCELLED', NULL, ?)`,
        [bookingId, EXPIRY_REASON],
      );
      await releaseCouponForBooking(connection, bookingId);
    }
    await connection.commit();
    return rows.length;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

function startPaymentHoldSweeper(pool, intervalMs = 60_000) {
  const run = () =>
    expireUnpaidBookings(pool).catch((error) => {
      console.error("Expiring unpaid bookings failed:", error.message);
    });
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = {
  PAYMENT_HOLD_MINUTES,
  HOLD_EXPIRED_SQL,
  HOLDS_SLOT_SQL,
  EXPIRY_REASON,
  expireUnpaidBookings,
  startPaymentHoldSweeper,
};
