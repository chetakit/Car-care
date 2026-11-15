const pool = require("../../shared/config/db");

class BookingNotFoundError extends Error {}
class BookingTransitionError extends Error {}

const BOOKING_STATUS_TRANSITIONS = Object.freeze({
  CONFIRMED: "CHECKED_IN",
  CHECKED_IN: "IN_SERVICE",
  IN_SERVICE: "COMPLETED",
});

function escapeLikeLiteral(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildFilters({ search, booking_status, date_from, date_to }) {
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

const STAFF_BOOKING_FROM = `
  FROM bookings b
  LEFT JOIN users u ON u.user_id = b.user_id
  LEFT JOIN vehicles v ON v.vehicle_id = b.vehicle_id`;

async function list({
  page,
  limit,
  offset,
  search,
  booking_status,
  date_from,
  date_to,
}) {
  const { whereClause, values } = buildFilters({
    search,
    booking_status,
    date_from,
    date_to,
  });
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total ${STAFF_BOOKING_FROM}${whereClause}`,
    values,
  );
  const total = Number(countRows[0].total);
  const [rows] = await pool.execute(
    `SELECT
      b.booking_id,
      u.full_name,
      u.email,
      u.phone,
      v.license_plate,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.booking_status
    ${STAFF_BOOKING_FROM}${whereClause}
    ORDER BY b.booking_date ASC, b.start_time ASC, b.booking_id ASC
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

async function getById(bookingId) {
  const [bookingRows] = await pool.execute(
    `SELECT
      b.booking_id,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.booking_status,
      b.notes,
      u.user_id,
      u.full_name,
      u.email,
      u.phone,
      v.vehicle_id,
      v.license_plate,
      v.production_year,
      v.province,
      v.color,
      vm.model_name,
      vb.brand_name,
      vt.type_name
    FROM bookings b
    LEFT JOIN users u ON u.user_id = b.user_id
    LEFT JOIN vehicles v ON v.vehicle_id = b.vehicle_id
    LEFT JOIN vehicle_models vm ON vm.model_id = v.model_id
    LEFT JOIN vehicle_brands vb ON vb.brand_id = vm.brand_id
    LEFT JOIN vehicle_types vt ON vt.vehicle_type_id = vm.vehicle_type_id
    WHERE b.booking_id = ?`,
    [bookingId],
  );
  const row = bookingRows[0];
  if (!row) {
    throw new BookingNotFoundError();
  }

  const [serviceRows] = await pool.execute(
    `SELECT booking_service_id, service_name, duration_minutes
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
      type_name: row.type_name,
    },
    services: serviceRows,
  };
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
        console.error("Staff booking transaction rollback failed.");
      }
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
          console.error("Staff booking connection destruction failed.");
        }
      }
    }
  }
}

async function updateStatus(bookingId, nextStatus, staffUserId) {
  return withTransaction(async (connection) => {
    const [bookingRows] = await connection.execute(
      `SELECT booking_id, booking_status
      FROM bookings
      WHERE booking_id = ?
      FOR UPDATE`,
      [bookingId],
    );
    const booking = bookingRows[0];
    if (!booking) {
      throw new BookingNotFoundError();
    }

    if (BOOKING_STATUS_TRANSITIONS[booking.booking_status] !== nextStatus) {
      throw new BookingTransitionError(
        `A booking in ${booking.booking_status} status cannot move to ${nextStatus}.`,
      );
    }

    const [result] = await connection.execute(
      `UPDATE bookings
      SET booking_status = ?
      WHERE booking_id = ? AND booking_status = ?`,
      [nextStatus, bookingId, booking.booking_status],
    );
    if (result.affectedRows !== 1) {
      throw new BookingTransitionError(
        "Booking status changed before the update could be completed.",
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
      VALUES (?, ?, ?, ?, ?)`,
      [
        bookingId,
        booking.booking_status,
        nextStatus,
        staffUserId,
        "Staff service progress update.",
      ],
    );

    return {
      booking_id: bookingId,
      booking_status: nextStatus,
    };
  });
}

module.exports = {
  BookingNotFoundError,
  BookingTransitionError,
  list,
  getById,
  updateStatus,
};
