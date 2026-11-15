const pool = require("../../shared/config/db");

class VehicleNotFoundError extends Error {}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildBookingFilter(userId, vehicleId, bookingStatus) {
  const conditions = ["b.user_id = ?"];
  const values = [userId];

  if (vehicleId !== undefined) {
    conditions.push("b.vehicle_id = ?");
    values.push(vehicleId);
  }
  if (bookingStatus !== undefined) {
    conditions.push("b.booking_status = ?");
    values.push(bookingStatus);
  }

  return {
    whereClause: ` WHERE ${conditions.join(" AND ")}`,
    values,
  };
}

function toBooking(row, services) {
  return {
    booking_id: row.booking_id,
    booking_date: row.booking_date,
    start_time: row.start_time,
    end_time: row.end_time,
    booking_status: row.booking_status,
    total_amount: toNumber(row.total_amount),
    discount_amount: toNumber(row.discount_amount),
    final_amount: toNumber(row.final_amount),
    vehicle: row.vehicle_id === null
      ? null
      : {
          vehicle_id: row.vehicle_id,
          license_plate: row.license_plate,
          production_year: row.production_year,
          province: row.province,
          color: row.color,
          model_name: row.model_name,
          brand_name: row.brand_name,
          type_name: row.type_name,
        },
    services: services.map((service) => ({
      booking_service_id: service.booking_service_id,
      service_id: service.service_id,
      service_name: service.service_name,
      unit_price: toNumber(service.unit_price),
      duration_minutes: service.duration_minutes,
    })),
    payment: row.payment_id === null
      ? null
      : {
          payment_id: row.payment_id,
          amount: toNumber(row.payment_amount),
          payment_method: row.payment_method,
          payment_status: row.payment_status,
          paid_at: row.paid_at,
        },
  };
}

async function list({
  userId,
  vehicleId,
  page,
  limit,
  offset,
  booking_status: bookingStatus,
  sort,
}) {
  if (vehicleId !== undefined) {
    const [vehicles] = await pool.execute(
      `SELECT vehicle_id
      FROM vehicles
      WHERE vehicle_id = ? AND user_id = ?
      LIMIT 1`,
      [vehicleId, userId],
    );
    if (vehicles.length === 0) {
      throw new VehicleNotFoundError();
    }
  }

  const { whereClause, values } = buildBookingFilter(
    userId,
    vehicleId,
    bookingStatus,
  );
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM bookings b${whereClause}`,
    values,
  );
  const total = Number(countRows[0].total);
  const direction = sort === "oldest" ? "ASC" : "DESC";
  const [rows] = await pool.execute(
    `SELECT
      b.booking_id,
      b.vehicle_id,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.booking_status,
      b.total_amount,
      b.discount_amount,
      b.final_amount,
      v.license_plate,
      v.production_year,
      v.province,
      v.color,
      vm.model_name,
      vb.brand_name,
      vt.type_name,
      p.payment_id,
      p.amount AS payment_amount,
      p.payment_method,
      p.payment_status,
      p.paid_at
    FROM bookings b
    LEFT JOIN vehicles v
      ON v.vehicle_id = b.vehicle_id AND v.user_id = b.user_id
    LEFT JOIN vehicle_models vm ON vm.model_id = v.model_id
    LEFT JOIN vehicle_brands vb ON vb.brand_id = vm.brand_id
    LEFT JOIN vehicle_types vt ON vt.vehicle_type_id = vm.vehicle_type_id
    LEFT JOIN payments p ON p.booking_id = b.booking_id${whereClause}
    ORDER BY b.created_at ${direction}, b.booking_id ${direction}
    LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  const servicesByBooking = new Map();
  if (rows.length > 0) {
    const bookingIds = rows.map((row) => row.booking_id);
    const placeholders = bookingIds.map(() => "?").join(", ");
    const [serviceRows] = await pool.execute(
      `SELECT
        bs.booking_id,
        bs.booking_service_id,
        bs.service_id,
        bs.service_name,
        bs.unit_price,
        bs.duration_minutes
      FROM booking_services bs
      INNER JOIN bookings b ON b.booking_id = bs.booking_id
      WHERE b.user_id = ? AND bs.booking_id IN (${placeholders})
      ORDER BY bs.booking_id ASC, bs.booking_service_id ASC`,
      [userId, ...bookingIds],
    );
    for (const service of serviceRows) {
      const bookingKey = String(service.booking_id);
      if (!servicesByBooking.has(bookingKey)) {
        servicesByBooking.set(bookingKey, []);
      }
      servicesByBooking.get(bookingKey).push(service);
    }
  }

  return {
    items: rows.map((row) =>
      toBooking(row, servicesByBooking.get(String(row.booking_id)) || []),
    ),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = { VehicleNotFoundError, list };
