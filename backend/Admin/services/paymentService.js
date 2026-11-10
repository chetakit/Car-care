const { randomUUID } = require("crypto");
const pool = require("../../shared/config/db");

class PaymentNotFoundError extends Error {}
class PaymentConflictError extends Error {}
class PaymentValidationError extends Error {}

function isDuplicateEntryError(error) {
  return error.code === "ER_DUP_ENTRY" || error.errno === 1062;
}

function toPayment(row) {
  return {
    payment_id: row.payment_id,
    booking_id: row.booking_id,
    amount: row.amount,
    payment_method: row.payment_method,
    payment_status: row.payment_status,
    transaction_ref: row.transaction_ref,
    paid_at: row.paid_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateBookingAmount(value) {
  if (typeof value !== "string" || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) {
    throw new PaymentValidationError(
      "The booking has an invalid amount and cannot be paid.",
    );
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(`${whole}${fraction.padEnd(2, "0")}`);
  if (cents === 0n) {
    throw new PaymentValidationError(
      "The booking amount must be greater than zero.",
    );
  }
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function decimalToCents(value) {
  const normalized = String(value);
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new PaymentValidationError(
      "The Wallet has an invalid balance and cannot be used for payment.",
    );
  }
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(`${whole}${fraction.padEnd(2, "0")}`);
}

function assertBookingAccess(booking, user) {
  if (
    user.role !== "ADMIN" &&
    Number(booking.user_id) !== Number(user.user_id)
  ) {
    throw new PaymentNotFoundError();
  }
}

async function withTransaction(operation) {
  let connection;
  let transactionStarted = false;
  let connectionReusable = true;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const result = await operation(connection);
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        connectionReusable = false;
        console.error("Payment transaction rollback failed.");
      }
    }
    if (isDuplicateEntryError(error)) {
      throw new PaymentConflictError(
        "A payment already exists for this booking.",
      );
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
          console.error("Payment connection destruction failed.");
        }
      }
    }
  }
}

async function getLockedBooking(connection, bookingId, user) {
  const [rows] = await connection.execute(
    `SELECT booking_id, user_id, final_amount, booking_status
    FROM bookings
    WHERE booking_id = ?
    FOR UPDATE`,
    [bookingId],
  );
  const booking = rows[0];
  if (!booking) {
    throw new PaymentNotFoundError();
  }
  assertBookingAccess(booking, user);
  return booking;
}

async function getLockedPayment(connection, bookingId) {
  const [rows] = await connection.execute(
    `SELECT payment_id, booking_id, amount, payment_method, payment_status,
      transaction_ref, paid_at, created_at, updated_at
    FROM payments
    WHERE booking_id = ?
    FOR UPDATE`,
    [bookingId],
  );
  return rows[0] || null;
}

async function createWalletTransactionRef(connection) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const transactionRef = `WAL-${randomUUID()}`;
    const [rows] = await connection.execute(
      "SELECT payment_id FROM payments WHERE transaction_ref = ? LIMIT 1",
      [transactionRef],
    );
    if (rows.length === 0) {
      return transactionRef;
    }
  }
  throw new PaymentConflictError(
    "Unable to generate a unique Wallet transaction reference.",
  );
}

async function getByBookingId(bookingId, user) {
  const [rows] = await pool.execute(
    `SELECT
      p.payment_id,
      p.booking_id,
      p.amount,
      p.payment_method,
      p.payment_status,
      p.transaction_ref,
      p.paid_at,
      p.created_at,
      p.updated_at,
      b.user_id
    FROM payments p
    INNER JOIN bookings b ON b.booking_id = p.booking_id
    WHERE p.booking_id = ?`,
    [bookingId],
  );
  const payment = rows[0];
  if (!payment || (user.role !== "ADMIN" &&
      Number(payment.user_id) !== Number(user.user_id))) {
    throw new PaymentNotFoundError();
  }
  return toPayment(payment);
}

async function createForBooking(bookingId, { payment_method }, user) {
  return withTransaction(async (connection) => {
    const booking = await getLockedBooking(connection, bookingId, user);
    if (
      booking.booking_status === "CANCELLED" ||
      booking.booking_status === "NO_SHOW"
    ) {
      throw new PaymentValidationError(
        "Payment is not allowed for cancelled or no-show bookings.",
      );
    }
    const amount = validateBookingAmount(booking.final_amount);
    const existingPayment = await getLockedPayment(connection, bookingId);
    if (existingPayment) {
      throw new PaymentConflictError(
        "A payment already exists for this booking.",
      );
    }

    const [result] = await connection.execute(
      `INSERT INTO payments (booking_id, amount, payment_method, payment_status)
      VALUES (?, ?, ?, 'PENDING')`,
      [bookingId, amount, payment_method],
    );
    const [rows] = await connection.execute(
      `SELECT payment_id, booking_id, amount, payment_method, payment_status,
        transaction_ref, paid_at, created_at, updated_at
      FROM payments
      WHERE payment_id = ?`,
      [result.insertId],
    );
    if (!rows[0]) {
      throw new Error("Inserted payment could not be retrieved.");
    }
    return toPayment(rows[0]);
  });
}

async function simulate(bookingId, { payment_status }, user) {
  return withTransaction(async (connection) => {
    await getLockedBooking(connection, bookingId, user);
    const payment = await getLockedPayment(connection, bookingId);
    if (!payment) {
      throw new PaymentNotFoundError();
    }
    if (payment.payment_method !== "SIMULATED") {
      throw new PaymentValidationError(
        "Only SIMULATED payments can use the simulation endpoint.",
      );
    }
    if (payment.payment_status === payment_status) {
      return toPayment(payment);
    }
    if (payment.payment_status !== "PENDING") {
      throw new PaymentConflictError(
        "A completed payment cannot change to another status.",
      );
    }

    const transactionRef = `SIM-${randomUUID()}`;
    await connection.execute(
      `UPDATE payments
      SET payment_status = ?,
        transaction_ref = ?,
        paid_at = CASE WHEN ? = 'PAID' THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE payment_id = ? AND payment_status = 'PENDING'`,
      [payment_status, transactionRef, payment_status, payment.payment_id],
    );
    const [rows] = await connection.execute(
      `SELECT payment_id, booking_id, amount, payment_method, payment_status,
        transaction_ref, paid_at, created_at, updated_at
      FROM payments
      WHERE payment_id = ?`,
      [payment.payment_id],
    );
    if (!rows[0]) {
      throw new Error("Updated payment could not be retrieved.");
    }
    return toPayment(rows[0]);
  });
}

async function payWithWallet(bookingId, user) {
  return withTransaction(async (connection) => {
    const booking = await getLockedBooking(connection, bookingId, user);
    if (
      booking.booking_status === "CANCELLED" ||
      booking.booking_status === "NO_SHOW"
    ) {
      throw new PaymentValidationError(
        "Payment is not allowed for cancelled or no-show bookings.",
      );
    }

    const amount = validateBookingAmount(booking.final_amount);
    const amountCents = decimalToCents(amount);
    const payment = await getLockedPayment(connection, bookingId);
    if (payment && payment.payment_status === "PAID") {
      throw new PaymentConflictError(
        "This booking has already been paid.",
      );
    }
    if (payment && payment.payment_status === "FAILED") {
      throw new PaymentConflictError(
        "A failed payment cannot be replaced or retried with Wallet.",
      );
    }
    if (
      payment &&
      payment.payment_method !== "SIMULATED" &&
      payment.payment_method !== "WALLET"
    ) {
      throw new PaymentConflictError(
        "An existing payment with this method cannot be changed to Wallet.",
      );
    }

    const [existingDebits] = await connection.execute(
      `SELECT wallet_transaction_id
      FROM wallet_transactions
      WHERE booking_id = ? AND transaction_type = 'DEBIT'
      LIMIT 1
      FOR UPDATE`,
      [bookingId],
    );
    if (existingDebits.length > 0) {
      throw new PaymentConflictError(
        "A Wallet debit already exists for this booking.",
      );
    }

    const [walletRows] = await connection.execute(
      `SELECT wallet_id, balance
      FROM wallets
      WHERE user_id = ?
      FOR UPDATE`,
      [booking.user_id],
    );
    const wallet = walletRows[0];
    if (!wallet) {
      throw new PaymentValidationError(
        "A Wallet with sufficient balance is required for this payment.",
      );
    }
    const balanceCents = decimalToCents(wallet.balance);
    if (balanceCents < amountCents) {
      throw new PaymentValidationError(
        "Wallet balance is insufficient for this booking.",
      );
    }
    const transactionRef = await createWalletTransactionRef(connection);

    const [walletUpdate] = await connection.execute(
      `UPDATE wallets
      SET balance = balance - ?
      WHERE wallet_id = ? AND balance >= ?`,
      [amount, wallet.wallet_id, amount],
    );
    if (walletUpdate.affectedRows !== 1) {
      throw new PaymentConflictError(
        "Wallet balance changed before payment could be completed.",
      );
    }

    await connection.execute(
      `INSERT INTO wallet_transactions (
        wallet_id,
        refund_id,
        booking_id,
        transaction_type,
        amount,
        description
      )
      VALUES (?, NULL, ?, 'DEBIT', ?, ?)`,
      [
        wallet.wallet_id,
        bookingId,
        amount,
        `Wallet payment for booking ${bookingId}`,
      ],
    );

    let paymentId;
    if (payment) {
      const [paymentUpdate] = await connection.execute(
        `UPDATE payments
        SET amount = ?,
          payment_method = 'WALLET',
          payment_status = 'PAID',
          transaction_ref = ?,
          paid_at = CURRENT_TIMESTAMP
        WHERE payment_id = ? AND payment_status = 'PENDING'`,
        [amount, transactionRef, payment.payment_id],
      );
      if (paymentUpdate.affectedRows !== 1) {
        throw new PaymentConflictError(
          "Payment status changed before Wallet payment could be completed.",
        );
      }
      paymentId = payment.payment_id;
    } else {
      const [result] = await connection.execute(
        `INSERT INTO payments (
          booking_id,
          amount,
          payment_method,
          payment_status,
          transaction_ref,
          paid_at
        )
        VALUES (?, ?, 'WALLET', 'PAID', ?, CURRENT_TIMESTAMP)`,
        [bookingId, amount, transactionRef],
      );
      paymentId = result.insertId;
    }

    const [paymentRows] = await connection.execute(
      `SELECT payment_id, booking_id, amount, payment_method, payment_status,
        transaction_ref, paid_at, created_at, updated_at
      FROM payments
      WHERE payment_id = ?`,
      [paymentId],
    );
    const [updatedWalletRows] = await connection.execute(
      "SELECT wallet_id, balance FROM wallets WHERE wallet_id = ?",
      [wallet.wallet_id],
    );
    if (!paymentRows[0] || !updatedWalletRows[0]) {
      throw new Error("Wallet payment result could not be retrieved.");
    }
    return {
      payment: toPayment(paymentRows[0]),
      wallet: updatedWalletRows[0],
    };
  });
}

module.exports = {
  PaymentNotFoundError,
  PaymentConflictError,
  PaymentValidationError,
  getByBookingId,
  createForBooking,
  simulate,
  payWithWallet,
};
