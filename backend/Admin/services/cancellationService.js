const pool = require("../../shared/config/db");

class CancellationNotFoundError extends Error {}
class CancellationConflictError extends Error {}
class CancellationValidationError extends Error {}

function isDuplicateEntryError(error) {
  return error.code === "ER_DUP_ENTRY" || error.errno === 1062;
}

function decimalToCents(value) {
  if (
    typeof value !== "string" ||
    !/^\d{1,8}(?:\.\d{1,2})?$/.test(value)
  ) {
    throw new CancellationValidationError(
      "The payment has an invalid amount and cannot be refunded.",
    );
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(2, "0")}`);
}

function centsToDecimal(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

function calculateRefund(amount) {
  const amountCents = decimalToCents(amount);
  if (amountCents <= 0n) {
    throw new CancellationValidationError(
      "The paid amount must be greater than zero to process a wallet refund.",
    );
  }

  const cancellationFeeCents = (amountCents * 20n + 50n) / 100n;
  const refundAmountCents = amountCents - cancellationFeeCents;
  return {
    cancellationFee: centsToDecimal(cancellationFeeCents),
    refundAmount: centsToDecimal(refundAmountCents),
  };
}

function assertBookingAccess(booking, user) {
  if (
    user.role !== "ADMIN" &&
    Number(booking.user_id) !== Number(user.user_id)
  ) {
    throw new CancellationNotFoundError();
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
        console.error("Cancellation transaction rollback failed.");
      }
    }
    if (isDuplicateEntryError(error)) {
      throw new CancellationConflictError(
        "A refund or wallet credit already exists for this booking.",
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
          console.error("Cancellation connection destruction failed.");
        }
      }
    }
  }
}

async function lockBooking(connection, bookingId, user) {
  const [rows] = await connection.execute(
    `SELECT booking_id, user_id, booking_status
    FROM bookings
    WHERE booking_id = ?
    FOR UPDATE`,
    [bookingId],
  );
  const booking = rows[0];
  if (!booking) {
    throw new CancellationNotFoundError();
  }
  assertBookingAccess(booking, user);
  if (booking.booking_status !== "CONFIRMED") {
    throw new CancellationConflictError(
      "Only confirmed bookings can be cancelled.",
    );
  }
  return booking;
}

async function lockPaidPayment(connection, bookingId) {
  const [rows] = await connection.execute(
    `SELECT payment_id, booking_id, amount, payment_status
    FROM payments
    WHERE booking_id = ?
    FOR UPDATE`,
    [bookingId],
  );
  const payment = rows[0];
  if (!payment || payment.payment_status !== "PAID") {
    throw new CancellationValidationError(
      "A paid payment is required to cancel this booking.",
    );
  }
  return payment;
}

async function assertNoExistingRefund(connection, paymentId, bookingId) {
  const [rows] = await connection.execute(
    `SELECT refund_id, refund_status
    FROM refunds
    WHERE payment_id = ? OR booking_id = ?
    LIMIT 1
    FOR UPDATE`,
    [paymentId, bookingId],
  );
  if (rows.length > 0) {
    throw new CancellationConflictError(
      "A refund has already been created for this payment or booking.",
    );
  }
}

async function lockOrCreateWallet(connection, userId) {
  await connection.execute(
    `INSERT INTO wallets (user_id, balance)
    VALUES (?, 0.00)
    ON DUPLICATE KEY UPDATE wallet_id = LAST_INSERT_ID(wallet_id)`,
    [userId],
  );
  const [rows] = await connection.execute(
    `SELECT wallet_id, balance
    FROM wallets
    WHERE user_id = ?
    FOR UPDATE`,
    [userId],
  );
  if (!rows[0]) {
    throw new Error("Wallet could not be retrieved after creation.");
  }
  return rows[0];
}

async function cancel(bookingId, { reason }, user) {
  return withTransaction(async (connection) => {
    const booking = await lockBooking(connection, bookingId, user);
    const payment = await lockPaidPayment(connection, bookingId);
    await assertNoExistingRefund(connection, payment.payment_id, bookingId);
    const { cancellationFee, refundAmount } = calculateRefund(payment.amount);
    const wallet = await lockOrCreateWallet(connection, booking.user_id);

    const [refundResult] = await connection.execute(
      `INSERT INTO refunds (
        payment_id,
        booking_id,
        refund_amount,
        cancellation_fee,
        refund_reason,
        refund_status
      )
      VALUES (?, ?, ?, ?, ?, 'REFUND_PENDING')`,
      [
        payment.payment_id,
        bookingId,
        refundAmount,
        cancellationFee,
        reason,
      ],
    );

    const [walletUpdate] = await connection.execute(
      "UPDATE wallets SET balance = balance + ? WHERE wallet_id = ?",
      [refundAmount, wallet.wallet_id],
    );
    if (walletUpdate.affectedRows !== 1) {
      throw new Error("Wallet balance could not be credited.");
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
      VALUES (?, ?, NULL, 'CREDIT', ?, ?)`,
      [
        wallet.wallet_id,
        refundResult.insertId,
        refundAmount,
        `Refund for booking ${bookingId}`,
      ],
    );
    const [refundUpdate] = await connection.execute(
      `UPDATE refunds
      SET refund_status = 'REFUNDED', processed_at = CURRENT_TIMESTAMP
      WHERE refund_id = ? AND refund_status = 'REFUND_PENDING'`,
      [refundResult.insertId],
    );
    if (refundUpdate.affectedRows !== 1) {
      throw new Error("Refund status could not be completed.");
    }

    const [bookingUpdate] = await connection.execute(
      `UPDATE bookings
      SET booking_status = 'CANCELLED'
      WHERE booking_id = ? AND booking_status = 'CONFIRMED'`,
      [bookingId],
    );
    if (bookingUpdate.affectedRows !== 1) {
      throw new CancellationConflictError(
        "Booking status changed before cancellation could be completed.",
      );
    }
    await connection.execute(
      `INSERT INTO booking_status_history (
        booking_id,
        old_status,
        new_status,
        changed_by,
        reason
      )
      VALUES (?, 'CONFIRMED', 'CANCELLED', ?, ?)`,
      [bookingId, user.user_id, reason],
    );

    const [walletRows] = await connection.execute(
      "SELECT balance FROM wallets WHERE wallet_id = ?",
      [wallet.wallet_id],
    );
    const [refundRows] = await connection.execute(
      `SELECT refund_id, payment_id, booking_id, refund_amount,
        cancellation_fee, refund_reason, refund_status, processed_at, created_at
      FROM refunds
      WHERE refund_id = ?`,
      [refundResult.insertId],
    );
    if (!walletRows[0] || !refundRows[0]) {
      throw new Error("Cancellation result could not be retrieved.");
    }

    return {
      booking_id: bookingId,
      booking_status: "CANCELLED",
      refund: refundRows[0],
      wallet: {
        wallet_id: wallet.wallet_id,
        balance: walletRows[0].balance,
      },
    };
  });
}

module.exports = {
  CancellationNotFoundError,
  CancellationConflictError,
  CancellationValidationError,
  cancel,
};
