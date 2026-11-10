const pool = require("../../shared/config/db");

const BOOKING_STATUSES = [
  "CONFIRMED",
  "CHECKED_IN",
  "IN_SERVICE",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function dateConditions(column, dateFrom, dateTo) {
  const conditions = [];
  const values = [];
  if (dateFrom !== undefined) {
    conditions.push(`${column} >= ?`);
    values.push(dateFrom);
  }
  if (dateTo !== undefined) {
    conditions.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`);
    values.push(dateTo);
  }
  return {
    whereClause: conditions.length
      ? ` WHERE ${conditions.join(" AND ")}`
      : "",
    values,
  };
}

function bucketExpression(groupBy, column) {
  return groupBy === "month"
    ? `DATE_FORMAT(${column}, '%Y-%m-01')`
    : `DATE(${column})`;
}

async function bookings({ date_from, date_to, group_by }) {
  const filters = dateConditions("booking_date", date_from, date_to);
  const [[totalRows], [statusRows], [trendRows]] = await Promise.all([
    pool.execute(
      `SELECT COUNT(*) AS total FROM bookings${filters.whereClause}`,
      filters.values,
    ),
    pool.execute(
      `SELECT booking_status, COUNT(*) AS count
      FROM bookings${filters.whereClause}
      GROUP BY booking_status`,
      filters.values,
    ),
    pool.execute(
      `SELECT ${bucketExpression(group_by, "booking_date")} AS period,
        COUNT(*) AS count
      FROM bookings${filters.whereClause}
      GROUP BY period
      ORDER BY period ASC`,
      filters.values,
    ),
  ]);
  const countsByStatus = new Map(
    statusRows.map((row) => [row.booking_status, toNumber(row.count)]),
  );
  return {
    totalBookings: toNumber(totalRows[0].total),
    bookingCountsByStatus: BOOKING_STATUSES.map((status) => ({
      booking_status: status,
      count: countsByStatus.get(status) || 0,
    })),
    bookingCountsByPeriod: trendRows.map((row) => ({
      period: row.period,
      count: toNumber(row.count),
    })),
  };
}

async function revenue({ date_from, date_to, group_by }) {
  const filters = dateConditions("paid_at", date_from, date_to);
  const whereClause = filters.whereClause
    ? `${filters.whereClause} AND payment_status = 'PAID' AND paid_at IS NOT NULL`
    : " WHERE payment_status = 'PAID' AND paid_at IS NOT NULL";
  const [[totalRows], [trendRows]] = await Promise.all([
    pool.execute(
      `SELECT COALESCE(SUM(amount), 0) AS totalRevenue,
        COUNT(*) AS successfulPayments
      FROM payments${whereClause}`,
      filters.values,
    ),
    pool.execute(
      `SELECT ${bucketExpression(group_by, "paid_at")} AS period,
        COALESCE(SUM(amount), 0) AS revenue,
        COUNT(*) AS successfulPayments
      FROM payments${whereClause}
      GROUP BY period
      ORDER BY period ASC`,
      filters.values,
    ),
  ]);
  return {
    totalRevenue: toNumber(totalRows[0].totalRevenue),
    successfulPayments: toNumber(totalRows[0].successfulPayments),
    revenueByPeriod: trendRows.map((row) => ({
      period: row.period,
      revenue: toNumber(row.revenue),
      successfulPayments: toNumber(row.successfulPayments),
    })),
  };
}

module.exports = { bookings, revenue };
