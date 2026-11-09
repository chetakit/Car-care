const pool = require("../../shared/config/db");

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function getSummary() {
  const [
    [customerRows],
    [vehicleRows],
    [todayBookingRows],
    [bookingStatusSummary],
    [todayRevenueRows],
    [monthlyRevenueRows],
    [recentBookings],
  ] = await Promise.all([
    pool.execute(
      "SELECT COUNT(*) AS totalCustomers FROM users WHERE role = 'CUSTOMER'",
    ),
    pool.execute("SELECT COUNT(*) AS totalVehicles FROM vehicles"),
    pool.execute(
      "SELECT COUNT(*) AS todayBookings FROM bookings WHERE booking_date = CURRENT_DATE()",
    ),
    pool.execute(
      "SELECT booking_status, COUNT(*) AS count FROM bookings GROUP BY booking_status",
    ),
    pool.execute(
      "SELECT COALESCE(SUM(amount), 0) AS todayRevenue FROM payments WHERE payment_status = 'PAID' AND paid_at >= CURRENT_DATE() AND paid_at < CURRENT_DATE() + INTERVAL 1 DAY",
    ),
    pool.execute(
      "SELECT COALESCE(SUM(amount), 0) AS monthlyRevenue FROM payments WHERE payment_status = 'PAID' AND paid_at >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01') AND paid_at < DATE_FORMAT(CURRENT_DATE() + INTERVAL 1 MONTH, '%Y-%m-01')",
    ),
    pool.execute(
      "SELECT b.booking_id, b.booking_date, b.booking_status, b.total_amount, b.final_amount, u.full_name FROM bookings b INNER JOIN users u ON u.user_id = b.user_id ORDER BY b.created_at DESC LIMIT 5",
    ),
  ]);

  return {
    totalCustomers: toNumber(customerRows[0]?.totalCustomers),
    totalVehicles: toNumber(vehicleRows[0]?.totalVehicles),
    todayBookings: toNumber(todayBookingRows[0]?.todayBookings),
    bookingStatusSummary: bookingStatusSummary.map((row) => ({
      booking_status: row.booking_status,
      count: toNumber(row.count),
    })),
    todayRevenue: toNumber(todayRevenueRows[0]?.todayRevenue),
    monthlyRevenue: toNumber(monthlyRevenueRows[0]?.monthlyRevenue),
    recentBookings: recentBookings.map((booking) => ({
      booking_id: booking.booking_id,
      booking_date: booking.booking_date,
      booking_status: booking.booking_status,
      total_amount: toNumber(booking.total_amount),
      final_amount: toNumber(booking.final_amount),
      full_name: booking.full_name,
    })),
  };
}

module.exports = { getSummary };
