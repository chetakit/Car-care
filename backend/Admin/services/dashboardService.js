const pool = require("../../shared/config/db");
const verifiedPaymentSql = require("../../shared/services/verifiedPaymentSql");
const { SHOP_TODAY_SQL: TODAY, toShopTimeSql } = require("../../shared/services/shopTime");

// "Today" and "this month" follow the shop's calendar (Thailand, UTC+7),
// not the database server's UTC date.
const PAID_AT = toShopTimeSql("p.paid_at");
const PROCESSED_AT = toShopTimeSql("r.processed_at");
const inToday = (column) => `${column} >= ${TODAY}
              AND ${column} < ${TODAY} + INTERVAL 1 DAY`;
const inThisMonth = (column) => `${column} >= DATE_FORMAT(${TODAY}, '%Y-%m-01')
              AND ${column} < DATE_FORMAT(${TODAY} + INTERVAL 1 MONTH, '%Y-%m-01')`;

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
    [revenueRows],
    [recentBookings],
  ] = await Promise.all([
    pool.execute(
      "SELECT COUNT(*) AS totalCustomers FROM users WHERE role = 'CUSTOMER'",
    ),
    pool.execute("SELECT COUNT(*) AS totalVehicles FROM vehicles"),
    pool.execute(
      `SELECT COUNT(*) AS todayBookings FROM bookings WHERE booking_date = ${TODAY}`,
    ),
    pool.execute(
      "SELECT booking_status, COUNT(*) AS count FROM bookings GROUP BY booking_status",
    ),
    pool.execute(
      `SELECT
        payments.todayGrossRevenue,
        refunds.todayRefunds,
        payments.todayGrossRevenue - refunds.todayRefunds AS todayRevenue,
        payments.monthlyGrossRevenue,
        refunds.monthlyRefunds,
        payments.monthlyGrossRevenue - refunds.monthlyRefunds AS monthlyRevenue
      FROM (
        SELECT
          COALESCE(SUM(CASE
            WHEN ${inToday(PAID_AT)}
            THEN p.amount ELSE 0
          END), 0) AS todayGrossRevenue,
          COALESCE(SUM(CASE
            WHEN ${inThisMonth(PAID_AT)}
            THEN p.amount ELSE 0
          END), 0) AS monthlyGrossRevenue
        FROM payments p
        INNER JOIN bookings b ON b.booking_id = p.booking_id
        WHERE ${verifiedPaymentSql}
      ) AS payments
      CROSS JOIN (
        SELECT
          COALESCE(SUM(CASE
            WHEN ${inToday(PROCESSED_AT)}
            THEN r.refund_amount ELSE 0
          END), 0) AS todayRefunds,
          COALESCE(SUM(CASE
            WHEN ${inThisMonth(PROCESSED_AT)}
            THEN r.refund_amount ELSE 0
          END), 0) AS monthlyRefunds
        FROM refunds r
        INNER JOIN payments p ON p.payment_id = r.payment_id AND p.booking_id = r.booking_id
        INNER JOIN bookings b ON b.booking_id = p.booking_id
        WHERE r.refund_status = 'REFUNDED'
          AND r.processed_at IS NOT NULL AND ${verifiedPaymentSql}
      ) AS refunds`,
    ).catch((error) => {
      const message = error.sqlMessage || error.message || "";
      if (
        (error.code === "ER_NO_SUCH_TABLE" || error.errno === 1146) &&
        /\bTable ['"`](?:[^'"`]+\.)?payment_verifications['"`] doesn't exist\b/i.test(message)
      ) {
        console.error("Admin dashboard revenue unavailable: payment_verifications is missing.", {
          message,
          code: error.code,
          errno: error.errno,
        });
        return [[]];
      }
      throw error;
    }),
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
    todayGrossRevenue: toNumber(revenueRows[0]?.todayGrossRevenue),
    todayRefunds: toNumber(revenueRows[0]?.todayRefunds),
    todayRevenue: toNumber(revenueRows[0]?.todayRevenue),
    monthlyGrossRevenue: toNumber(revenueRows[0]?.monthlyGrossRevenue),
    monthlyRefunds: toNumber(revenueRows[0]?.monthlyRefunds),
    monthlyRevenue: toNumber(revenueRows[0]?.monthlyRevenue),
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
