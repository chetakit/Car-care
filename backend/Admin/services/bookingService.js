const pool = require("../../shared/config/db");

class BookingNotFoundError extends Error {}
class BookingValidationError extends Error {}

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

function escapeLikeLiteral(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildFilters({ search, booking_status, payment_status, date_from, date_to }) {
  const conditions = [];
  const values = [];

  if (search) {
    const pattern = `%${escapeLikeLiteral(search)}%`;
    conditions.push(`(
      CAST(b.booking_id AS CHAR) LIKE ? OR
      u.full_name LIKE ? ESCAPE '\\\\' OR
      u.email LIKE ? ESCAPE '\\\\' OR
      u.phone LIKE ? ESCAPE '\\\\' OR
      v.license_plate LIKE ? ESCAPE '\\\\'
    )`);
    values.push(pattern, pattern, pattern, pattern, pattern);
  }
  if (booking_status !== undefined) {
    conditions.push("b.booking_status = ?");
    values.push(booking_status);
  }
  if (payment_status !== undefined) {
    conditions.push("p.payment_status = ?");
    values.push(payment_status);
  }
  if (date_from !== undefined) {
    conditions.push("b.booking_date >= ?");
    values.push(date_from);
  }
  if (date_to !== undefined) {
    conditions.push("b.booking_date <= ?");
    values.push(date_to);
  }

  return {
    whereClause: conditions.length
      ? ` WHERE ${conditions.join(" AND ")}`
      : "",
    values,
  };
}

const BOOKING_LIST_FROM = `
  FROM bookings b
  LEFT JOIN users u ON u.user_id = b.user_id
  LEFT JOIN vehicles v ON v.vehicle_id = b.vehicle_id
  LEFT JOIN vehicle_models vm ON vm.model_id = v.model_id
  LEFT JOIN vehicle_brands vb ON vb.brand_id = vm.brand_id
  LEFT JOIN vehicle_types vt ON vt.vehicle_type_id = vm.vehicle_type_id
  LEFT JOIN payments p ON p.booking_id = b.booking_id`;

async function list({ page, limit, offset, search, booking_status, payment_status, date_from, date_to, sort }) {
  const { whereClause, values } = buildFilters({
    search,
    booking_status,
    payment_status,
    date_from,
    date_to,
  });
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total ${BOOKING_LIST_FROM}${whereClause}`,
    values,
  );
  const total = Number(countRows[0].total);
  const direction = sort === "oldest" ? "ASC" : "DESC";
  const [rows] = await pool.execute(
    `SELECT
      b.booking_id,
      b.user_id,
      u.full_name,
      u.email,
      u.phone,
      b.vehicle_id,
      v.license_plate,
      v.production_year,
      vm.model_name,
      vb.brand_name,
      vt.type_name,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.booking_status,
      p.payment_status,
      b.total_amount,
      b.discount_amount,
      b.final_amount
    ${BOOKING_LIST_FROM}${whereClause}
    ORDER BY b.created_at ${direction}, b.booking_id ${direction}
    LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  return {
    items: rows.map((row) => ({
      ...row,
      total_amount: toNumber(row.total_amount),
      discount_amount: toNumber(row.discount_amount),
      final_amount: toNumber(row.final_amount),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(bookingId) {
  const [bookingRows] = await pool.execute(
    `SELECT
      b.booking_id,
      b.user_id,
      b.vehicle_id,
      b.schedule_id,
      b.coupon_id,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.total_amount,
      b.discount_amount,
      b.final_amount,
      b.booking_status,
      b.notes,
      b.created_at,
      b.updated_at,
      u.full_name,
      u.email,
      u.phone,
      v.license_plate,
      v.production_year,
      v.province,
      v.color,
      vm.model_name,
      vb.brand_name,
      vt.vehicle_type_id,
      vt.type_name,
      s.schedule_date,
      s.start_time AS schedule_start_time,
      s.end_time AS schedule_end_time,
      s.capacity,
      s.status AS schedule_status,
      p.payment_id,
      p.amount AS payment_amount,
      p.payment_method,
      p.payment_status,
      p.transaction_ref,
      p.paid_at,
      p.created_at AS payment_created_at,
      c.coupon_code,
      c.discount_type,
      c.discount_value
    FROM bookings b
    LEFT JOIN users u ON u.user_id = b.user_id
    LEFT JOIN vehicles v ON v.vehicle_id = b.vehicle_id
    LEFT JOIN vehicle_models vm ON vm.model_id = v.model_id
    LEFT JOIN vehicle_brands vb ON vb.brand_id = vm.brand_id
    LEFT JOIN vehicle_types vt ON vt.vehicle_type_id = vm.vehicle_type_id
    LEFT JOIN schedules s ON s.schedule_id = b.schedule_id
    LEFT JOIN payments p ON p.booking_id = b.booking_id
    LEFT JOIN coupons c ON c.coupon_id = b.coupon_id
    WHERE b.booking_id = ?`,
    [bookingId],
  );
  const row = bookingRows[0];
  if (!row) {
    throw new BookingNotFoundError();
  }

  const [serviceRows] = await pool.execute(
    `SELECT
      booking_service_id,
      service_id,
      service_name,
      unit_price,
      duration_minutes,
      created_at
    FROM booking_services
    WHERE booking_id = ?
    ORDER BY booking_service_id ASC`,
    [bookingId],
  );

  return {
    booking: {
      booking_id: row.booking_id,
      booking_date: row.booking_date,
      start_time: row.start_time,
      end_time: row.end_time,
      booking_status: row.booking_status,
      notes: row.notes,
      total_amount: toNumber(row.total_amount),
      discount_amount: toNumber(row.discount_amount),
      final_amount: toNumber(row.final_amount),
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    customer: {
      user_id: row.user_id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
    },
    vehicle: {
      vehicle_id: row.vehicle_id,
      license_plate: row.license_plate,
      production_year: row.production_year,
      province: row.province,
      color: row.color,
      brand_name: row.brand_name,
      model_name: row.model_name,
      vehicle_type_id: row.vehicle_type_id,
      type_name: row.type_name,
    },
    schedule: {
      schedule_id: row.schedule_id,
      schedule_date: row.schedule_date,
      start_time: row.schedule_start_time,
      end_time: row.schedule_end_time,
      capacity: row.capacity,
      status: row.schedule_status,
    },
    services: serviceRows.map((service) => ({
      ...service,
      unit_price: toNumber(service.unit_price),
    })),
    payment: row.payment_id === null
      ? null
      : {
          payment_id: row.payment_id,
          amount: toNumber(row.payment_amount),
          payment_method: row.payment_method,
          payment_status: row.payment_status,
          transaction_ref: row.transaction_ref,
          paid_at: row.paid_at,
          created_at: row.payment_created_at,
        },
    coupon: row.coupon_id === null
      ? null
      : {
          coupon_id: row.coupon_id,
          coupon_code: row.coupon_code,
          discount_type: row.discount_type,
          discount_value: row.discount_value === null
            ? null
            : toNumber(row.discount_value),
        },
  };
}

async function getHistory(bookingId) {
  const [bookingRows] = await pool.execute(
    "SELECT booking_id FROM bookings WHERE booking_id = ?",
    [bookingId],
  );
  if (bookingRows.length === 0) {
    throw new BookingNotFoundError();
  }

  const [rows] = await pool.execute(
    `SELECT
      h.history_id,
      h.old_status,
      h.new_status,
      h.changed_by,
      u.full_name AS changed_by_name,
      h.reason,
      h.created_at
    FROM booking_status_history h
    LEFT JOIN users u ON u.user_id = h.changed_by
    WHERE h.booking_id = ?
    ORDER BY h.created_at ASC, h.history_id ASC`,
    [bookingId],
  );
  return rows;
}

module.exports = {
  BookingNotFoundError,
  BookingValidationError,
  BOOKING_STATUSES,
  list,
  getById,
  getHistory,
};
