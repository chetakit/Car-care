const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const pool = require("../shared/config/db");
const dashboardService = require("../Admin/services/dashboardService");
const reportService = require("../Admin/services/reportService");

const originalExecute = pool.execute;
const today = "2026-11-11";
const monthStart = "2026-11-01";
const nextMonthStart = "2026-12-01";

const payments = [
  { amount: 150, status: "PAID", method: "SIMULATED", paidAt: "2026-11-11 00:01:00" },
  { amount: 300, status: "PAID", method: "SIMULATED", paidAt: "2026-11-10 15:20:00" },
  { amount: 150, status: "PAID", method: "WALLET", verified: true, paidAt: "2026-11-10 15:50:00" },
  { amount: 200, status: "PAID", method: "CASH", verified: true, paidAt: "2026-11-11 13:00:00" },
  { amount: 300, status: "PAID", method: "BANK_TRANSFER", verified: true, paidAt: "2026-11-11 14:00:00" },
  { amount: 999, status: "PAID", method: "CASH", paidAt: "2026-11-11 16:00:00" },
  { amount: 700, status: "PENDING", method: "SIMULATED", paidAt: "2026-11-11 00:02:00" },
  { amount: 900, status: "FAILED", method: "CASH", paidAt: "2026-11-11 00:03:00" },
  { amount: 200, status: "PAID", method: "BANK_TRANSFER", paidAt: "2026-10-31 23:59:59" },
];

const refunds = [
  { amount: 120, status: "REFUNDED", verified: true, processedAt: "2026-11-11 00:05:00" },
  { amount: 240, status: "REFUNDED", verified: false, processedAt: "2026-11-11 00:05:00" },
  { amount: 110, status: "REFUND_PENDING", processedAt: "2026-11-11 00:06:00" },
  { amount: 50, status: "REFUND_FAILED", processedAt: "2026-11-11 00:07:00" },
  { amount: 30, status: "REFUNDED", processedAt: "2026-10-31 23:59:59" },
];

function sumForPeriod(items, amountKey, dateKey, start, end, statusKey, status) {
  return items.reduce((total, item) => {
    const date = item[dateKey];
    return item.verified === true && item[statusKey] === status && date >= start && date < end
      ? total + item[amountKey]
      : total;
  }, 0);
}

function buildRevenueFixture() {
  const tomorrow = "2026-11-12";
  return {
    todayGrossRevenue: sumForPeriod(payments, "amount", "paidAt", today, tomorrow, "status", "PAID"),
    todayRefunds: sumForPeriod(refunds, "amount", "processedAt", today, tomorrow, "status", "REFUNDED"),
    monthlyGrossRevenue: sumForPeriod(payments, "amount", "paidAt", monthStart, nextMonthStart, "status", "PAID"),
    monthlyRefunds: sumForPeriod(refunds, "amount", "processedAt", monthStart, nextMonthStart, "status", "REFUNDED"),
  };
}

test("Dashboard revenue uses paid and processed timestamps with exclusive end dates", async () => {
  let revenueQuery;
  const revenue = buildRevenueFixture();
  pool.execute = async (sql) => {
    if (sql.includes("AS todayGrossRevenue")) {
      revenueQuery = sql;
      return [[{
        ...revenue,
        todayRevenue: revenue.todayGrossRevenue - revenue.todayRefunds,
        monthlyRevenue: revenue.monthlyGrossRevenue - revenue.monthlyRefunds,
      }]];
    }
    if (sql.includes("AS totalCustomers")) return [[{ totalCustomers: 0 }]];
    if (sql.includes("AS totalVehicles")) return [[{ totalVehicles: 0 }]];
    if (sql.includes("AS todayBookings")) return [[{ todayBookings: 0 }]];
    if (sql.includes("GROUP BY booking_status")) return [[]];
    if (sql.includes("FROM bookings b")) return [[]];
    throw new Error(`Unexpected dashboard query: ${sql}`);
  };

  try {
    const summary = await dashboardService.getSummary();

    assert.equal(summary.todayGrossRevenue, 500);
    assert.equal(summary.todayRefunds, 120);
    assert.equal(summary.todayRevenue, 380);
    assert.equal(summary.monthlyGrossRevenue, 650);
    assert.equal(summary.monthlyRefunds, 120);
    assert.equal(summary.monthlyRevenue, 530);
    assert.match(revenueQuery, /payment_status = 'PAID'/);
    assert.match(revenueQuery, /paid_at >= CURRENT_DATE\(\)/);
    assert.match(revenueQuery, /paid_at < CURRENT_DATE\(\) \+ INTERVAL 1 DAY/);
    assert.match(revenueQuery, /paid_at >= DATE_FORMAT\(CURRENT_DATE\(\), '%Y-%m-01'\)/);
    assert.match(revenueQuery, /paid_at < DATE_FORMAT\(CURRENT_DATE\(\) \+ INTERVAL 1 MONTH, '%Y-%m-01'\)/);
    assert.match(revenueQuery, /refund_status = 'REFUNDED'/);
    assert.match(revenueQuery, /processed_at >= CURRENT_DATE\(\)/);
    assert.match(revenueQuery, /processed_at < CURRENT_DATE\(\) \+ INTERVAL 1 DAY/);
    assert.match(revenueQuery, /processed_at >= DATE_FORMAT\(CURRENT_DATE\(\), '%Y-%m-01'\)/);
    assert.match(revenueQuery, /processed_at < DATE_FORMAT\(CURRENT_DATE\(\) \+ INTERVAL 1 MONTH, '%Y-%m-01'\)/);
    assert.match(revenueQuery, /payments\.todayGrossRevenue - refunds\.todayRefunds AS todayRevenue/);
    assert.match(revenueQuery, /payments\.monthlyGrossRevenue - refunds\.monthlyRefunds AS monthlyRevenue/);
    assert.match(revenueQuery, /p\.payment_method = 'WALLET'/);
    assert.match(revenueQuery, /p\.payment_method IN \('CASH', 'BANK_TRANSFER'\)/);
    assert.match(revenueQuery, /FROM payment_verifications pv/);
    assert.match(revenueQuery, /booking_payments\.booking_id = b\.booking_id/);
    assert.match(revenueQuery, /wt\.amount = p\.amount/);
    assert.match(revenueQuery, /p\.payment_id = r\.payment_id AND p\.booking_id = r\.booking_id/);
  } finally {
    pool.execute = originalExecute;
  }
});

test("revenue reports exclude failed and pending payments", async () => {
  const queries = [];
  pool.execute = async (sql) => {
    queries.push(sql);
    if (sql.includes("AS totalRevenue")) return [[{ totalRevenue: 150, successfulPayments: 1 }]];
    return [[{ period: today, revenue: 150, successfulPayments: 1 }]];
  };
  try {
    const report = await reportService.revenue({ date_from: today, date_to: today, group_by: "day" });
    assert.equal(report.totalRevenue, 150);
    assert.equal(report.successfulPayments, 1);
    assert.equal(queries.length, 2);
    for (const query of queries) {
      assert.match(query, /payment_status = 'PAID'/);
      assert.match(query, /paid_at IS NOT NULL/);
      assert.match(query, /p\.payment_method = 'WALLET'/);
      assert.match(query, /p\.payment_method IN \('CASH', 'BANK_TRANSFER'\)/);
      assert.match(query, /FROM payment_verifications pv/);
      assert.match(query, /booking_payments\.booking_id = b\.booking_id/);
      assert.match(query, /wt\.amount = p\.amount/);
    }
  } finally {
    pool.execute = originalExecute;
  }
});

after(() => {
  pool.execute = originalExecute;
});
