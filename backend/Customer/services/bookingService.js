const pool = require("../../shared/config/db");
const { HOLDS_SLOT_SQL } = require("../../shared/services/bookingPaymentHold");
const coupons = require("../../shared/services/couponPricing");
const { OVERLAPPING_BOOKINGS_SQL, planFromSlot } = require("../../shared/services/slotPlanner");

class BookingNotFoundError extends Error {}
class BookingValidationError extends Error {}
class BookingConflictError extends Error {}
class BookingDataError extends Error {}

const MAX_MYSQL_INT = 2147483647;
const MAX_BOOKING_CENTS = 9999999999n;

function toPositiveDuration(value) {
  const duration = Number(value);
  if (
    !Number.isSafeInteger(duration) ||
    duration <= 0 ||
    duration > MAX_MYSQL_INT
  ) {
    throw new BookingDataError("A service has an invalid duration.");
  }
  return duration;
}

function timeToSeconds(value) {
  if (typeof value !== "string") {
    throw new BookingDataError("A schedule has an invalid time.");
  }
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (!match) {
    throw new BookingDataError("A schedule has an invalid time.");
  }
  const [, hours, minutes, seconds = "0"] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function decimalToCents(value) {
  const text = String(value);
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    throw new BookingDataError("A service has an invalid price.");
  }
  const [, whole, fraction = ""] = match;
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function centsToDecimal(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

function toApiBooking(row, serviceRows) {
  return {
    booking_id: row.booking_id,
    booking_date: row.booking_date,
    start_time: row.start_time,
    end_time: row.end_time,
    booking_status: row.booking_status,
    total_amount: Number(row.total_amount),
    discount_amount: Number(row.discount_amount),
    final_amount: Number(row.final_amount),
    vehicle: {
      vehicle_id: row.vehicle_id,
      license_plate: row.license_plate,
      production_year: row.production_year,
      province: row.province,
      color: row.color,
      model_name: row.model_name,
      brand_name: row.brand_name,
      type_name: row.type_name,
    },
    services: serviceRows.map((service) => ({
      booking_service_id: service.booking_service_id,
      service_id: service.service_id,
      service_name: service.service_name,
      unit_price: Number(service.unit_price),
      duration_minutes: service.duration_minutes,
    })),
    payment: null,
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
        console.error("Customer booking rollback failed.");
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
          console.error("Customer booking connection destruction failed.");
        }
      }
    }
  }
}

async function create(
  userId,
  {
    vehicle_id: vehicleId,
    schedule_id: scheduleId,
    service_ids: serviceIds,
    coupon_code: couponCode = null,
  },
) {
  return withTransaction(async (connection) => {
    const [scheduleRows] = await connection.execute(
      `SELECT schedule_id, schedule_date, start_time, end_time, capacity, status,
        CASE
          WHEN schedule_date < CURRENT_DATE()
            OR (
              schedule_date = CURRENT_DATE()
              AND start_time <= CURRENT_TIME()
            )
          THEN 1
          ELSE 0
        END AS has_started
      FROM schedules
      WHERE schedule_id = ?
      FOR UPDATE`,
      [scheduleId],
    );
    const schedule = scheduleRows[0];
    if (!schedule) {
      throw new BookingNotFoundError("Schedule not found.");
    }
    if (schedule.status !== "AVAILABLE") {
      throw new BookingConflictError(
        "The selected schedule is not available.",
      );
    }
    if (Number(schedule.has_started) === 1) {
      throw new BookingValidationError(
        "The selected schedule is in the past or has already started.",
      );
    }

    const startSeconds = timeToSeconds(schedule.start_time);
    const endSeconds = timeToSeconds(schedule.end_time);
    const scheduleDurationSeconds = endSeconds - startSeconds;
    if (scheduleDurationSeconds <= 0) {
      throw new BookingDataError("A schedule has an invalid time interval.");
    }

    const capacity = Number(schedule.capacity);
    if (!Number.isSafeInteger(capacity) || capacity < 0) {
      throw new BookingDataError("A schedule has an invalid capacity.");
    }
    const [capacityRows] = await connection.execute(
      // Counts bookings overlapping this slot, including longer bookings that
      // started in an earlier slot and run into this one.
      `SELECT COUNT(*) AS booking_count
      FROM bookings b
      WHERE b.booking_date = ? AND b.start_time < ? AND b.end_time > ?
        AND ${HOLDS_SLOT_SQL("b")}`,
      [schedule.schedule_date, schedule.end_time, schedule.start_time],
    );
    const bookingCount = Number(capacityRows[0]?.booking_count);
    if (!Number.isSafeInteger(bookingCount) || bookingCount < 0) {
      throw new BookingDataError("Schedule capacity could not be verified.");
    }
    if (bookingCount >= capacity) {
      throw new BookingConflictError(
        "The selected schedule has reached capacity.",
      );
    }

    const [vehicleRows] = await connection.execute(
      `SELECT vehicle_id, model_id, license_plate, production_year,
        province, color, status
      FROM vehicles
      WHERE vehicle_id = ? AND user_id = ?
      FOR UPDATE`,
      [vehicleId, userId],
    );
    const vehicle = vehicleRows[0];
    if (!vehicle) {
      throw new BookingNotFoundError("Vehicle not found.");
    }
    if (vehicle.status !== "ACTIVE") {
      throw new BookingConflictError(
        "The selected vehicle is not active.",
      );
    }

    const [modelRows] = await connection.execute(
      `SELECT model_id, vehicle_type_id, status
      FROM vehicle_models
      WHERE model_id = ?
      FOR UPDATE`,
      [vehicle.model_id],
    );
    const model = modelRows[0];
    if (!model || model.status !== "ACTIVE") {
      throw new BookingConflictError(
        "The selected vehicle model is not active.",
      );
    }

    const sortedServiceIds = [...serviceIds].sort((left, right) => left - right);
    const sortedServicePlaceholders = sortedServiceIds.map(() => "?").join(", ");
    const [serviceRows] = await connection.execute(
      `SELECT service_id, service_name, duration_minutes, status
      FROM services
      WHERE service_id IN (${sortedServicePlaceholders})
      ORDER BY service_id ASC
      FOR UPDATE`,
      sortedServiceIds,
    );
    const servicesById = new Map(
      serviceRows.map((service) => [Number(service.service_id), service]),
    );
    if (serviceIds.some((serviceId) => !servicesById.has(serviceId))) {
      throw new BookingNotFoundError(
        "One or more selected services were not found.",
      );
    }
    if (serviceRows.some((service) => service.status !== "ACTIVE")) {
      throw new BookingNotFoundError(
        "One or more selected services were not found.",
      );
    }

    const [vehicleTypeRows] = await connection.execute(
      `SELECT vehicle_type_id, status
      FROM vehicle_types
      WHERE vehicle_type_id = ?
      FOR UPDATE`,
      [model.vehicle_type_id],
    );
    const vehicleType = vehicleTypeRows[0];
    if (!vehicleType || vehicleType.status !== "ACTIVE") {
      throw new BookingConflictError(
        "The selected vehicle type is not active.",
      );
    }

    const [priceRows] = await connection.execute(
      `SELECT service_id, price
      FROM service_prices
      WHERE vehicle_type_id = ?
        AND service_id IN (${sortedServicePlaceholders})
      ORDER BY service_id ASC
      FOR UPDATE`,
      [model.vehicle_type_id, ...sortedServiceIds],
    );
    const pricesByServiceId = new Map(
      priceRows.map((price) => [Number(price.service_id), price.price]),
    );
    if (
      serviceIds.some(
        (serviceId) =>
          !pricesByServiceId.has(serviceId) ||
          pricesByServiceId.get(serviceId) === null ||
          pricesByServiceId.get(serviceId) === undefined,
      )
    ) {
      throw new BookingConflictError(
        "A selected service has no price for this vehicle type.",
      );
    }

    let totalCents = 0n;
    let totalDurationMinutes = 0n;
    const bookingServices = serviceIds.map((serviceId) => {
      const service = servicesById.get(serviceId);
      const durationMinutes = toPositiveDuration(service.duration_minutes);
      const unitPriceCents = decimalToCents(
        pricesByServiceId.get(serviceId),
      );
      totalCents += unitPriceCents;
      totalDurationMinutes += BigInt(durationMinutes);

      if (totalCents > MAX_BOOKING_CENTS) {
        throw new BookingValidationError(
          "The selected services exceed the supported booking total.",
        );
      }

      return {
        service_id: serviceId,
        service_name: service.service_name,
        unit_price: centsToDecimal(unitPriceCents),
        duration_minutes: durationMinutes,
      };
    });

    // Services longer than one slot continue into the following slots.
    let bookingEndTime = schedule.end_time;
    if (totalDurationMinutes * 60n > BigInt(scheduleDurationSeconds)) {
      const [laterSlots] = await connection.execute(
        `SELECT s.schedule_id, s.start_time, s.end_time, s.capacity, s.status,
          ${OVERLAPPING_BOOKINGS_SQL("s")} AS booked_count
        FROM schedules s
        WHERE s.schedule_date = ? AND s.start_time >= ?
        ORDER BY s.start_time ASC
        FOR UPDATE`,
        [schedule.schedule_date, schedule.end_time],
      );
      const plan = planFromSlot(
        [{ ...schedule, booked_count: bookingCount }, ...laterSlots],
        0,
        Number(totalDurationMinutes),
      );
      if (plan.reason === "full") {
        throw new BookingConflictError(
          `These services take ${totalDurationMinutes} minutes, and a later slot they need is fully booked. Choose another time.`,
        );
      }
      if (plan.reason) {
        throw new BookingValidationError(
          `These services take ${totalDurationMinutes} minutes, which runs past the open slots at this time. Choose an earlier time or fewer services.`,
        );
      }
      bookingEndTime = plan.endTime;
    }

    if (totalCents === 0n) {
      throw new BookingValidationError(
        "Booking final_amount must be greater than zero.",
      );
    }

    let coupon = null;
    let discountCents = 0n;
    if (couponCode) {
      coupon = await coupons.findCoupon(connection, couponCode, { lock: true });
      try {
        discountCents = coupons.calculateDiscount(coupon, totalCents);
      } catch (error) {
        if (error instanceof coupons.CouponError) {
          throw new BookingValidationError(error.message);
        }
        throw error;
      }
    }

    const totalAmount = centsToDecimal(totalCents);
    const bookingInsert = coupon
      ? connection.execute(
          `INSERT INTO bookings (
            user_id, vehicle_id, schedule_id, coupon_id, booking_date, start_time,
            end_time, total_amount, discount_amount, final_amount, booking_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT')`,
          [
            userId,
            vehicleId,
            scheduleId,
            coupon.coupon_id,
            schedule.schedule_date,
            schedule.start_time,
            bookingEndTime,
            totalAmount,
            centsToDecimal(discountCents),
            centsToDecimal(totalCents - discountCents),
          ],
        )
      : null;
    const [bookingResult] = bookingInsert ? await bookingInsert : await connection.execute(
      `INSERT INTO bookings (
        user_id,
        vehicle_id,
        schedule_id,
        booking_date,
        start_time,
        end_time,
        total_amount,
        discount_amount,
        final_amount,
        booking_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, '0.00', ?, 'PENDING_PAYMENT')`,
      [
        userId,
        vehicleId,
        scheduleId,
        schedule.schedule_date,
        schedule.start_time,
        bookingEndTime,
        totalAmount,
        totalAmount,
      ],
    );

    const serviceValues = [];
    for (const service of bookingServices) {
      serviceValues.push(
        bookingResult.insertId,
        service.service_id,
        service.service_name,
        service.unit_price,
        service.duration_minutes,
      );
    }
    const serviceValueRows = bookingServices
      .map(() => "(?, ?, ?, ?, ?)")
      .join(", ");
    await connection.execute(
      `INSERT INTO booking_services (
        booking_id,
        service_id,
        service_name,
        unit_price,
        duration_minutes
      )
      VALUES ${serviceValueRows}`,
      serviceValues,
    );

    if (coupon) {
      try {
        await coupons.recordCouponUse(connection, coupon, {
          bookingId: bookingResult.insertId,
          userId,
          discountCents,
        });
      } catch (error) {
        if (error instanceof coupons.CouponError) {
          throw new BookingConflictError(error.message);
        }
        throw error;
      }
    }

    const [createdRows] = await connection.execute(
      `SELECT
        b.booking_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.booking_status,
        b.total_amount,
        b.discount_amount,
        b.final_amount,
        v.vehicle_id,
        v.license_plate,
        v.production_year,
        v.province,
        v.color,
        vm.model_name,
        vb.brand_name,
        vt.type_name
      FROM bookings b
      INNER JOIN vehicles v
        ON v.vehicle_id = b.vehicle_id AND v.user_id = b.user_id
      LEFT JOIN vehicle_models vm ON vm.model_id = v.model_id
      LEFT JOIN vehicle_brands vb ON vb.brand_id = vm.brand_id
      LEFT JOIN vehicle_types vt ON vt.vehicle_type_id = vm.vehicle_type_id
      WHERE b.booking_id = ? AND b.user_id = ?`,
      [bookingResult.insertId, userId],
    );
    if (!createdRows[0]) {
      throw new BookingDataError("Created booking could not be retrieved.");
    }

    const [createdServiceRows] = await connection.execute(
      `SELECT
        booking_service_id,
        service_id,
        service_name,
        unit_price,
        duration_minutes
      FROM booking_services
      WHERE booking_id = ?
      ORDER BY booking_service_id ASC`,
      [bookingResult.insertId],
    );
    if (createdServiceRows.length !== bookingServices.length) {
      throw new BookingDataError(
        "Created booking services could not be retrieved.",
      );
    }

    return toApiBooking(createdRows[0], createdServiceRows);
  });
}

module.exports = {
  BookingNotFoundError,
  BookingValidationError,
  BookingConflictError,
  create,
};
