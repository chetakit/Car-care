const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const pool = require("../shared/config/db");
const dashboardService = require("../Admin/services/dashboardService");

const originalExecute = pool.execute;
const today = "2026-11-11";
const monthStart = "2026-11-01";
const nextMonthStart = "2026-12-01";

const payments = [
  { amount: 150, status: "PAID", method: "SIMULATED", paidAt: "2026-11-11 00:01:00" },
  { amount: 300, status: "PAID", method: "SIMULATED", paidAt: "2026-11-10 15:20:00" },
  { amount: 150, status: "PAID", method: "WALLET", paidAt: "2026-11-10 15:50:00" },
  { amount: 700, status: "PENDING", method: "SIMULATED", paidAt: "2026-11-11 00:02:00" },
  { amount: 900, status: "FAILED", method: "CASH", paidAt: "2026-11-11 00:03:00" },
  { amount: 200, status: "PAID", method: "BANK_TRANSFER", paidAt: "2026-10-31 23:59:59" },
];

const refunds = [
  { amount: 240, status: "REFUNDED", processedAt: "2026-11-11 00:05:00", paymentDate: "2026-11-10" },
  { amount: 110, status: "REFUND_PENDING", processedAt: "2026-11-11 00:06:00" },
  { amount: 50, status: "REFUND_FAILED", processedAt: "2026-11-11 00:07:00" },
  { amount: 30, status: "REFUNDED", processedAt: "2026-10-31 23:59:59" },
];

function sumForPeriod(items, amountKey, dateKey, start, end, statusKey, status) {
  return items.reduce((total, item) => {
    const date = item[dateKey];
    return item[statusKey] === status && date >= start && date < end
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

    assert.equal(summary.todayGrossRevenue, 150);
    assert.equal(summary.todayRefunds, 240);
    assert.equal(summary.todayRevenue, -90);
    assert.equal(summary.monthlyGrossRevenue, 600);
    assert.equal(summary.monthlyRefunds, 240);
    assert.equal(summary.monthlyRevenue, 360);
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
    assert.doesNotMatch(revenueQuery, /payment_method\s*=/);
  } finally {
    pool.execute = originalExecute;
  }
});

after(() => {
  pool.execute = originalExecute;
});
