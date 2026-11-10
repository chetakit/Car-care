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
      `SELECT
        b.booking_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.booking_status,
        b.total_amount,
        b.discount_amount,
        b.final_amount,
        u.user_id,
        u.full_name,
        v.vehicle_id,
        v.license_plate,
        vm.model_name,
        vb.brand_name,
        vt.type_name
      FROM bookings b
      LEFT JOIN users u ON u.user_id = b.user_id
      LEFT JOIN vehicles v ON v.vehicle_id = b.vehicle_id
      LEFT JOIN vehicle_models vm ON vm.model_id = v.model_id
      LEFT JOIN vehicle_brands vb ON vb.brand_id = vm.brand_id
      LEFT JOIN vehicle_types vt ON vt.vehicle_type_id = vm.vehicle_type_id
      ORDER BY b.created_at DESC, b.booking_id DESC
      LIMIT 5`,
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
      start_time: booking.start_time,
      end_time: booking.end_time,
      booking_status: booking.booking_status,
      total_amount: toNumber(booking.total_amount),
      discount_amount: toNumber(booking.discount_amount),
      final_amount: toNumber(booking.final_amount),
      full_name: booking.full_name,
      customer: {
        user_id: booking.user_id,
        full_name: booking.full_name,
      },
      vehicle: booking.vehicle_id === null
        ? null
        : {
            vehicle_id: booking.vehicle_id,
            license_plate: booking.license_plate,
            brand_name: booking.brand_name,
            model_name: booking.model_name,
            type_name: booking.type_name,
          },
    })),
  };
}

module.exports = { getSummary };
