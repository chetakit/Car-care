const pool = require("../../shared/config/db");
const { releaseCouponForBooking } = require("../../shared/services/couponPricing");
const { SHOP_NOW_SQL } = require("../../shared/services/shopTime");

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

const CANCELLABLE_STATUSES = ["PENDING_PAYMENT", "CONFIRMED"];

async function lockBooking(connection, bookingId, user) {
  const [rows] = await connection.execute(
    `SELECT booking_id, user_id, booking_status,
      TIMESTAMP(booking_date, start_time) <= ${SHOP_NOW_SQL} AS has_started
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
  if (!CANCELLABLE_STATUSES.includes(booking.booking_status)) {
    throw new CancellationConflictError(
      "Only unpaid or confirmed bookings can be cancelled.",
    );
  }
  // Customers cannot cancel once the appointment time has started; an admin
  // still can (for example to clean up a booking nobody showed up for).
  if (user.role !== "ADMIN" && Number(booking.has_started) === 1) {
    throw new CancellationConflictError(
      "This appointment has already started and can no longer be cancelled.",
    );
  }
  return booking;
}

async function lockPayment(connection, bookingId) {
  const [rows] = await connection.execute(
    `SELECT payment_id, booking_id, amount, payment_method, payment_status
    FROM payments
    WHERE booking_id = ?
    FOR UPDATE`,
    [bookingId],
  );
  return rows[0] || null;
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

// Refunds go to the customer's Wallet whatever the original payment method.
async function lockCustomerWallet(connection, userId) {
  await connection.execute(
    "INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, '0.00')",
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
    throw new Error("The customer Wallet could not be created.");
  }
  return rows[0];
}

async function markBookingCancelled(connection, booking, user, reason) {
  const [bookingUpdate] = await connection.execute(
    `UPDATE bookings
    SET booking_status = 'CANCELLED'
    WHERE booking_id = ? AND booking_status = ?`,
    [booking.booking_id, booking.booking_status],
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
    VALUES (?, ?, 'CANCELLED', ?, ?)`,
    [booking.booking_id, booking.booking_status, user.user_id, reason],
  );
}

async function cancel(bookingId, { reason }, user) {
  return withTransaction(async (connection) => {
    const booking = await lockBooking(connection, bookingId, user);
    const payment = await lockPayment(connection, bookingId);

    // Nothing was paid: cancel without a fee or refund.
    if (!payment || payment.payment_status !== "PAID") {
      if (payment && payment.payment_status === "PENDING") {
        await connection.execute(
          `UPDATE payments SET payment_status = 'FAILED'
          WHERE payment_id = ? AND payment_status = 'PENDING'`,
          [payment.payment_id],
        );
      }
      await markBookingCancelled(connection, booking, user, reason);
      // Nothing was paid, so the coupon use is given back.
      await releaseCouponForBooking(connection, bookingId);
      return {
        booking_id: bookingId,
        booking_status: "CANCELLED",
        refund: null,
        wallet: null,
      };
    }

    await assertNoExistingRefund(connection, payment.payment_id, bookingId);
    const { cancellationFee, refundAmount } = calculateRefund(payment.amount);
    const wallet = await lockCustomerWallet(connection, booking.user_id);

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

    if (decimalToCents(refundAmount) > 0n) {
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
    }
    const [refundUpdate] = await connection.execute(
      `UPDATE refunds
      SET refund_status = 'REFUNDED', processed_at = CURRENT_TIMESTAMP
      WHERE refund_id = ? AND refund_status = 'REFUND_PENDING'`,
      [refundResult.insertId],
    );
    if (refundUpdate.affectedRows !== 1) {
      throw new Error("Refund status could not be completed.");
    }

    await markBookingCancelled(connection, booking, user, reason);

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

// No-show: the customer forfeits 100% of a paid booking. Records a refunds
// row with refund_amount 0 and the full amount as the fee so the forfeit
// appears in refund history. Runs inside the caller's transaction.
async function recordNoShowForfeit(connection, bookingId, reason) {
  const payment = await lockPayment(connection, bookingId);
  if (!payment || payment.payment_status !== "PAID") {
    return null;
  }
  await assertNoExistingRefund(connection, payment.payment_id, bookingId);
  const [result] = await connection.execute(
    `INSERT INTO refunds (
      payment_id,
      booking_id,
      refund_amount,
      cancellation_fee,
      refund_reason,
      refund_status,
      processed_at
    )
    VALUES (?, ?, '0.00', ?, ?, 'REFUNDED', CURRENT_TIMESTAMP)`,
    [
      payment.payment_id,
      bookingId,
      payment.amount,
      `No-show (100% forfeited): ${reason}`,
    ],
  );
  return {
    refund_id: result.insertId,
    refund_amount: "0.00",
    cancellation_fee: payment.amount,
  };
}

module.exports = {
  CancellationNotFoundError,
  CancellationConflictError,
  CancellationValidationError,
  calculateRefund,
  cancel,
  recordNoShowForfeit,
};
