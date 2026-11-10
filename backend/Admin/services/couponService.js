const pool = require("../../shared/config/db");

class CouponNotFoundError extends Error {}
class DuplicateCouponCodeError extends Error {}
class CouponValidationError extends Error {}

const COUPON_COLUMNS =
  "coupon_id, coupon_code, description, discount_type, discount_value, max_discount, min_order_amount, usage_limit, used_count, start_date, end_date, status, created_at, updated_at";
const CREATE_FIELDS = Object.freeze({
  coupon_code: "coupon_code",
  description: "description",
  discount_type: "discount_type",
  discount_value: "discount_value",
  max_discount: "max_discount",
  min_order_amount: "min_order_amount",
  usage_limit: "usage_limit",
  start_date: "start_date",
  end_date: "end_date",
  status: "status",
});
const UPDATE_FIELDS = Object.freeze({
  coupon_code: "coupon_code",
  description: "description",
  discount_type: "discount_type",
  discount_value: "discount_value",
  max_discount: "max_discount",
  min_order_amount: "min_order_amount",
  usage_limit: "usage_limit",
  start_date: "start_date",
  end_date: "end_date",
});

function isDuplicateEntryError(error) {
  return error.code === "ER_DUP_ENTRY" || error.errno === 1062;
}

function escapeLikeLiteral(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function toSqlDateTime(value) {
  if (!(value instanceof Date)) {
    return value;
  }
  const pad = (part) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

async function findById(couponId) {
  const [rows] = await pool.execute(
    `SELECT ${COUPON_COLUMNS} FROM coupons WHERE coupon_id = ?`,
    [couponId],
  );
  return rows[0] || null;
}

async function list({ page, limit, offset, search, status, discount_type }) {
  const conditions = [];
  const values = [];
  if (search) {
    conditions.push("coupon_code LIKE ? ESCAPE '\\\\'");
    values.push(`%${escapeLikeLiteral(search)}%`);
  }
  if (status !== undefined) {
    conditions.push("status = ?");
    values.push(status);
  }
  if (discount_type !== undefined) {
    conditions.push("discount_type = ?");
    values.push(discount_type);
  }
  const whereClause = conditions.length
    ? ` WHERE ${conditions.join(" AND ")}`
    : "";
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM coupons${whereClause}`,
    values,
  );
  const total = Number(countRows[0].total);
  const [rows] = await pool.execute(
    `SELECT ${COUPON_COLUMNS} FROM coupons${whereClause}
    ORDER BY coupon_code ASC, coupon_id ASC
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

async function getById(couponId) {
  const coupon = await findById(couponId);
  if (!coupon) {
    throw new CouponNotFoundError();
  }
  return coupon;
}

async function assertUniqueCode(couponCode, couponId) {
  const [rows] =
    couponId === undefined
      ? await pool.execute(
          "SELECT coupon_id FROM coupons WHERE coupon_code = ? LIMIT 1",
          [couponCode],
        )
      : await pool.execute(
          "SELECT coupon_id FROM coupons WHERE coupon_code = ? AND coupon_id <> ? LIMIT 1",
          [couponCode, couponId],
        );
  if (rows.length > 0) {
    throw new DuplicateCouponCodeError();
  }
}

async function create(data) {
  await assertUniqueCode(data.coupon_code);
  const fields = Object.keys(CREATE_FIELDS).filter((field) =>
    Object.hasOwn(data, field),
  );
  const columns = fields.map((field) => CREATE_FIELDS[field]);
  const values = fields.map((field) => data[field]);
  let result;
  try {
    [result] = await pool.execute(
      `INSERT INTO coupons (${columns.join(", ")})
      VALUES (${fields.map(() => "?").join(", ")})`,
      values,
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new DuplicateCouponCodeError();
    }
    throw error;
  }

  const created = await findById(result.insertId);
  if (!created) {
    throw new Error("Created coupon could not be retrieved.");
  }
  return created;
}

async function update(couponId, changes) {
  const existing = await findById(couponId);
  if (!existing) {
    throw new CouponNotFoundError();
  }
  if (
    Object.hasOwn(changes, "usage_limit") &&
    changes.usage_limit !== null &&
    changes.usage_limit < Number(existing.used_count)
  ) {
    throw new CouponValidationError(
      "usage_limit cannot be lower than the coupon's existing used_count.",
    );
  }
  if (
    Object.hasOwn(changes, "coupon_code") &&
    changes.coupon_code !== existing.coupon_code
  ) {
    await assertUniqueCode(changes.coupon_code, couponId);
  }

  const startDate = Object.hasOwn(changes, "start_date")
    ? changes.start_date
    : toSqlDateTime(existing.start_date);
  const endDate = Object.hasOwn(changes, "end_date")
    ? changes.end_date
    : toSqlDateTime(existing.end_date);
  if (startDate >= endDate) {
    throw new CouponValidationError("start_date must be before end_date.");
  }

  const discountType = Object.hasOwn(changes, "discount_type")
    ? changes.discount_type
    : existing.discount_type;
  const discountValue = Object.hasOwn(changes, "discount_value")
    ? changes.discount_value
    : String(existing.discount_value);
  const [discountInteger, discountFraction = "00"] = discountValue.split(".");
  if (
    discountType === "PERCENT" &&
    (Number(discountInteger) > 100 ||
      (discountInteger === "100" && discountFraction !== "00"))
  ) {
    throw new CouponValidationError(
      "PERCENT discount_value cannot exceed 100.",
    );
  }

  const fields = Object.keys(UPDATE_FIELDS).filter((field) =>
    Object.hasOwn(changes, field),
  );
  const assignments = fields.map((field) => `${UPDATE_FIELDS[field]} = ?`);
  const values = fields.map((field) => changes[field]);
  try {
    await pool.execute(
      `UPDATE coupons SET ${assignments.join(", ")} WHERE coupon_id = ?`,
      [...values, couponId],
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new DuplicateCouponCodeError();
    }
    throw error;
  }
  return getById(couponId);
}

async function updateStatus(couponId, status) {
  const [result] = await pool.execute(
    "UPDATE coupons SET status = ? WHERE coupon_id = ?",
    [status, couponId],
  );
  if (result.affectedRows === 0 && !(await findById(couponId))) {
    throw new CouponNotFoundError();
  }
  return getById(couponId);
}

async function listUsages(
  couponId,
  { page, limit, offset },
) {
  if (!(await findById(couponId))) {
    throw new CouponNotFoundError();
  }

  const [countRows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM coupon_usages WHERE coupon_id = ?",
    [couponId],
  );
  const total = Number(countRows[0].total);
  const [rows] = await pool.execute(
    `SELECT
      cu.coupon_usage_id,
      cu.coupon_id,
      cu.booking_id,
      cu.user_id,
      cu.discount_amount,
      cu.used_at,
      b.booking_date,
      b.booking_status,
      b.total_amount,
      b.final_amount,
      u.full_name,
      u.email
    FROM coupon_usages cu
    INNER JOIN bookings b ON b.booking_id = cu.booking_id
    INNER JOIN users u ON u.user_id = cu.user_id
    WHERE cu.coupon_id = ?
    ORDER BY cu.used_at DESC, cu.coupon_usage_id DESC
    LIMIT ? OFFSET ?`,
    [couponId, limit, offset],
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

module.exports = {
  CouponNotFoundError,
  DuplicateCouponCodeError,
  CouponValidationError,
  list,
  getById,
  create,
  update,
  updateStatus,
  listUsages,
};
