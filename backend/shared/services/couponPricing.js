// Coupon rules shared by the customer preview endpoint and booking creation.
// Amounts are handled in integer cents (BigInt) to avoid rounding drift.

const { SHOP_NOW_SQL } = require("./shopTime");

class CouponError extends Error {}

const MAX_CODE_LENGTH = 50;

function normalizeCouponCode(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return code.length > 0 && code.length <= MAX_CODE_LENGTH ? code : null;
}

function toCents(value) {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new CouponError("The coupon has an invalid amount.");
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function centsToDecimal(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

const COUPON_COLUMNS = `coupon_id, coupon_code, description, discount_type, discount_value,
  max_discount, min_order_amount, usage_limit, per_user_limit, used_count, status,
  (${SHOP_NOW_SQL} >= start_date AND ${SHOP_NOW_SQL} <= end_date) AS is_live,
  (${SHOP_NOW_SQL} < start_date) AS not_started`;

async function findCoupon(executor, code, { lock = false } = {}) {
  const [rows] = await executor.execute(
    `SELECT ${COUPON_COLUMNS} FROM coupons WHERE coupon_code = ?${lock ? " FOR UPDATE" : ""}`,
    [code],
  );
  return rows[0] || null;
}

// Returns the discount in cents for this order, or throws CouponError with a
// message the customer can act on.
function calculateDiscount(coupon, subtotalCents) {
  if (!coupon || coupon.status !== "ACTIVE") {
    throw new CouponError("This coupon code is not valid.");
  }
  if (Number(coupon.not_started) === 1) {
    throw new CouponError("This coupon is not active yet.");
  }
  if (Number(coupon.is_live) !== 1) {
    throw new CouponError("This coupon has expired.");
  }
  if (coupon.usage_limit !== null && Number(coupon.used_count) >= Number(coupon.usage_limit)) {
    throw new CouponError("This coupon has reached its usage limit.");
  }
  const minimumCents = toCents(coupon.min_order_amount ?? "0");
  if (subtotalCents < minimumCents) {
    throw new CouponError(`This coupon needs a minimum order of THB ${centsToDecimal(minimumCents)}.`);
  }

  let discountCents;
  if (coupon.discount_type === "PERCENT") {
    // Percent of the subtotal, rounded to the nearest cent.
    const basisPoints = toCents(coupon.discount_value); // 10.00% -> 1000
    discountCents = (subtotalCents * basisPoints + 5000n) / 10000n;
    if (coupon.max_discount !== null && coupon.max_discount !== undefined) {
      const capCents = toCents(coupon.max_discount);
      if (discountCents > capCents) discountCents = capCents;
    }
  } else {
    discountCents = toCents(coupon.discount_value);
  }
  // Payments need a positive amount, so a coupon never makes a booking free.
  if (discountCents >= subtotalCents) discountCents = subtotalCents - 1n;
  if (discountCents < 0n) discountCents = 0n;
  return discountCents;
}

// Throws when this customer has already used the coupon as often as its
// per-account limit allows. A use counts while its coupon_usages row exists
// (a booking cancelled before payment gives the use back).
async function assertPerUserLimit(executor, coupon, userId) {
  if (!coupon || coupon.per_user_limit === null || coupon.per_user_limit === undefined) return;
  const [rows] = await executor.execute(
    "SELECT COUNT(*) AS uses FROM coupon_usages WHERE coupon_id = ? AND user_id = ?",
    [coupon.coupon_id, userId],
  );
  if (Number(rows[0]?.uses ?? 0) >= Number(coupon.per_user_limit)) {
    throw new CouponError(
      Number(coupon.per_user_limit) === 1
        ? "You have already used this coupon."
        : `You have already used this coupon ${coupon.per_user_limit} times.`,
    );
  }
}

// Reserve one use of the coupon for a booking. Runs inside the caller's transaction.
async function recordCouponUse(connection, coupon, { bookingId, userId, discountCents }) {
  const [update] = await connection.execute(
    `UPDATE coupons SET used_count = used_count + 1
    WHERE coupon_id = ? AND (usage_limit IS NULL OR used_count < usage_limit)`,
    [coupon.coupon_id],
  );
  if (update.affectedRows !== 1) {
    throw new CouponError("This coupon has reached its usage limit.");
  }
  await connection.execute(
    `INSERT INTO coupon_usages (coupon_id, booking_id, user_id, discount_amount)
    VALUES (?, ?, ?, ?)`,
    [coupon.coupon_id, bookingId, userId, centsToDecimal(discountCents)],
  );
}

// Give the use back when a booking is cancelled before it was paid.
async function releaseCouponForBooking(connection, bookingId) {
  const [rows] = await connection.execute(
    "SELECT coupon_id FROM coupon_usages WHERE booking_id = ? FOR UPDATE",
    [bookingId],
  );
  if (rows.length === 0) return false;
  await connection.execute("DELETE FROM coupon_usages WHERE booking_id = ?", [bookingId]);
  await connection.execute(
    "UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE coupon_id = ?",
    [rows[0].coupon_id],
  );
  return true;
}

module.exports = {
  CouponError,
  normalizeCouponCode,
  toCents,
  centsToDecimal,
  findCoupon,
  calculateDiscount,
  assertPerUserLimit,
  recordCouponUse,
  releaseCouponForBooking,
};
