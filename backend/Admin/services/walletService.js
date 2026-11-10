const pool = require("../../shared/config/db");

async function getBalance(userId) {
  const [rows] = await pool.execute(
    `SELECT wallet_id, user_id, balance, created_at, updated_at
    FROM wallets
    WHERE user_id = ?`,
    [userId],
  );
  if (!rows[0]) {
    return {
      wallet_id: null,
      user_id: userId,
      balance: "0.00",
      created_at: null,
      updated_at: null,
    };
  }
  return rows[0];
}

async function getTransactions({
  userId,
  page,
  limit,
  offset,
  transaction_type,
}) {
  const conditions = ["w.user_id = ?"];
  const values = [userId];
  if (transaction_type !== undefined) {
    conditions.push("wt.transaction_type = ?");
    values.push(transaction_type);
  }
  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
    FROM wallet_transactions wt
    INNER JOIN wallets w ON w.wallet_id = wt.wallet_id
    ${whereClause}`,
    values,
  );
  const total = Number(countRows[0].total);
  const [rows] = await pool.execute(
    `SELECT
      wt.wallet_transaction_id,
      wt.amount,
      wt.transaction_type,
      wt.description,
      wt.refund_id,
      wt.booking_id,
      wt.created_at
    FROM wallet_transactions wt
    INNER JOIN wallets w ON w.wallet_id = wt.wallet_id
    ${whereClause}
    ORDER BY wt.created_at DESC, wt.wallet_transaction_id DESC
    LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );
  return {
    items: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getRefunds({ userId, page, limit, offset }) {
  const whereClause = "WHERE b.user_id = ?";
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
    FROM refunds r
    INNER JOIN bookings b ON b.booking_id = r.booking_id
    ${whereClause}`,
    [userId],
  );
  const total = Number(countRows[0].total);
  const [rows] = await pool.execute(
    `SELECT
      r.refund_id,
      r.booking_id,
      r.payment_id,
      r.refund_amount,
      r.cancellation_fee,
      r.refund_status,
      r.processed_at,
      r.created_at
    FROM refunds r
    INNER JOIN bookings b ON b.booking_id = r.booking_id
    ${whereClause}
    ORDER BY r.created_at DESC, r.refund_id DESC
    LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  return {
    items: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = { getBalance, getTransactions, getRefunds };
