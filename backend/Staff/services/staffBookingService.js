// =====================================================================
// [STAFF] Staff & Service Management — ดึง/บันทึกข้อมูลจาก database
//
// ตารางเดิมที่ใช้:  bookings, users, vehicles, vehicle_models, vehicle_brands,
//                   vehicle_types, booking_services, payments, booking_status_history
// ตารางใหม่ที่ใช้:  vehicle_check_ins, booking_notes
//                   (สร้างจาก database/migrations/2026-11-15_staff_service.sql)
// =====================================================================
const pool = require("../../shared/config/db");
const { notifyBooking, TYPES: NOTIFY } = require("../../shared/services/notificationService");
const {
  CancellationConflictError,
  recordNoShowForfeit,
} = require("../../Admin/services/cancellationService");

class StaffBookingNotFoundError extends Error {}
class StaffBookingConflictError extends Error {} // 409: สถานะไม่อนุญาต
class StaffForbiddenActionError extends Error {} // 403: เช่น พยายามยกเลิกการจอง

// ลำดับสถานะที่พนักงานเปลี่ยนผ่าน PATCH /status ได้
//   CONFIRMED -> CHECKED_IN  ใช้ POST /check-in (ต้องกรอกข้อมูลรับรถ)
//   CONFIRMED -> NO_SHOW     ใช้ POST /no-show
//   ห้ามเปลี่ยนเป็น CANCELLED (ลูกค้ายกเลิกเองผ่าน /api/cancellations เท่านั้น)
const STATUS_TRANSITIONS = {
  CHECKED_IN: ["IN_SERVICE"],
  IN_SERVICE: ["COMPLETED"],
};

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function escapeLikeLiteral(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function withTransaction(operation) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      console.error("Staff booking transaction rollback failed.");
    }
    throw error;
  } finally {
    connection.release();
  }
}

// ล็อกแถวการจองไว้ระหว่างเปลี่ยนสถานะ กันพนักงาน 2 คนกดพร้อมกัน
async function lockBooking(connection, bookingId) {
  const [rows] = await connection.execute(
    `SELECT booking_id, user_id, final_amount, booking_status,
      TIMESTAMP(booking_date, start_time) <= NOW() AS appointment_started
    FROM bookings
    WHERE booking_id = ?
    FOR UPDATE`,
    [bookingId],
  );
  if (rows.length === 0) throw new StaffBookingNotFoundError();
  return rows[0];
}

async function assertVerifiedPayment(connection, booking) {
  const [payments] = await connection.execute(
    `SELECT payment_id, payment_status, payment_method, amount, paid_at,
      (amount = ? AND amount > 0) AS amount_matches
    FROM payments
    WHERE booking_id = ?
    FOR UPDATE`,
    [booking.final_amount, booking.booking_id],
  );
  const payment = payments[0];
  if (
    payments.length !== 1 ||
    payment.payment_status !== "PAID" ||
    !payment.paid_at ||
    !["WALLET", "CASH", "BANK_TRANSFER", "SIMULATED"].includes(payment.payment_method) ||
    Number(payment.amount_matches) !== 1
  ) {
    throw new StaffBookingConflictError(
      "A verified payment for the full booking amount is required to complete the booking.",
    );
  }

  // SIMULATED คือการจ่ายออนไลน์จำลองของโปรเจกต์นี้ ถือว่าจ่ายแล้วเมื่อสถานะเป็น PAID
  if (payment.payment_method === "SIMULATED") return;

  if (payment.payment_method !== "WALLET") {
    const [verifications] = await connection.execute(
      `SELECT payment_id FROM payment_verifications
      WHERE payment_id = ? AND payment_method = ? AND verified_amount = ?
      FOR UPDATE`,
      [payment.payment_id, payment.payment_method, payment.amount],
    );
    if (verifications.length !== 1) {
      throw new StaffBookingConflictError("An authorized payment verification is required to complete the booking.");
    }
    return;
  }

  const [debits] = await connection.execute(
    `SELECT wt.wallet_id, (wt.amount = ?) AS amount_matches
    FROM wallet_transactions wt
    INNER JOIN wallets w ON w.wallet_id = wt.wallet_id
    WHERE wt.booking_id = ? AND wt.transaction_type = 'DEBIT'
      AND wt.refund_id IS NULL AND w.user_id = ?
    FOR UPDATE`,
    [payment.amount, booking.booking_id, booking.user_id],
  );
  if (debits.length !== 1 || Number(debits[0].amount_matches) !== 1) {
    throw new StaffBookingConflictError(
      "A matching debit from the customer's Wallet is required to complete the booking.",
    );
  }
}

async function insertStatusHistory(connection, { bookingId, oldStatus, newStatus, userId, reason }) {
  await connection.execute(
    `INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by, reason)
    VALUES (?, ?, ?, ?, ?)`,
    [bookingId, oldStatus, newStatus, userId, reason],
  );
}

async function updateStatus(connection, bookingId, oldStatus, newStatus) {
  const [result] = await connection.execute(
    "UPDATE bookings SET booking_status = ? WHERE booking_id = ? AND booking_status = ?",
    [newStatus, bookingId, oldStatus],
  );
  if (result.affectedRows !== 1) {
    throw new StaffBookingConflictError("Booking status changed. Please reload and try again.");
  }
}

// ---------------------------------------------------------------------
// 1) + 8) รายการจองรายวัน / ประวัติการให้บริการ
// ---------------------------------------------------------------------
const LIST_FROM = `
  FROM bookings b
  LEFT JOIN users u ON u.user_id = b.user_id
  LEFT JOIN vehicles v ON v.vehicle_id = b.vehicle_id
  LEFT JOIN vehicle_models vm ON vm.model_id = v.model_id
  LEFT JOIN vehicle_brands vb ON vb.brand_id = vm.brand_id
  LEFT JOIN payments p ON p.booking_id = b.booking_id`;

async function list(query) {
  // การจองที่ยังไม่ชำระเงินยังไม่ใช่คิวงานของร้าน
  const conditions = ["b.booking_status <> 'PENDING_PAYMENT'"];
  const values = [];

  if (query.date) {
    conditions.push("b.booking_date = ?");
    values.push(query.date);
  }
  if (query.date_from) {
    conditions.push("b.booking_date >= ?");
    values.push(query.date_from);
  }
  if (query.date_to) {
    conditions.push("b.booking_date <= ?");
    values.push(query.date_to);
  }
  if (query.booking_status) {
    conditions.push("b.booking_status = ?");
    values.push(query.booking_status);
  }
  if (query.vehicle_id) {
    conditions.push("b.vehicle_id = ?");
    values.push(query.vehicle_id);
  }
  if (query.search) {
    const pattern = `%${escapeLikeLiteral(query.search)}%`;
    conditions.push(`(
      CAST(b.booking_id AS CHAR) LIKE ? OR
      u.full_name LIKE ? ESCAPE '\\\\' OR
      u.phone LIKE ? ESCAPE '\\\\' OR
      v.license_plate LIKE ? ESCAPE '\\\\'
    )`);
    values.push(pattern, pattern, pattern, pattern);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";

  // รายการรายวัน: เรียงตามเวลานัด / ประวัติ: ใหม่สุดก่อน
  const order = query.date
    ? "b.start_time ASC, b.booking_id ASC"
    : "b.booking_date DESC, b.start_time DESC, b.booking_id DESC";

  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total ${LIST_FROM}${where}`, values);
  const total = Number(countRows[0].total);

  const [rows] = await pool.execute(
    `SELECT
      b.booking_id,
      DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
      TIME_FORMAT(b.start_time, '%H:%i') AS start_time,
      TIME_FORMAT(b.end_time, '%H:%i') AS end_time,
      b.booking_status,
      b.final_amount,
      b.user_id,
      u.full_name,
      u.phone,
      b.vehicle_id,
      v.license_plate,
      v.province,
      vb.brand_name,
      vm.model_name,
      p.payment_status
    ${LIST_FROM}${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?`,
    [...values, String(query.limit), String(query.offset)],
  );

  // ดึงชื่อบริการของทุกการจองในหน้านี้ทีเดียว
  const servicesByBooking = new Map();
  if (rows.length > 0) {
    const ids = rows.map((row) => row.booking_id);
    const [serviceRows] = await pool.execute(
      `SELECT booking_id, service_name
      FROM booking_services
      WHERE booking_id IN (${ids.map(() => "?").join(", ")})
      ORDER BY booking_service_id ASC`,
      ids,
    );
    for (const service of serviceRows) {
      const names = servicesByBooking.get(service.booking_id) ?? [];
      names.push(service.service_name);
      servicesByBooking.set(service.booking_id, names);
    }
  }

  return {
    items: rows.map((row) => ({
      ...row,
      final_amount: toNumber(row.final_amount),
      service_names: servicesByBooking.get(row.booking_id) ?? [],
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ---------------------------------------------------------------------
// 2) + 3) รายละเอียดลูกค้า รถ บริการ + ข้อมูลรับรถ + ไทม์ไลน์
// ---------------------------------------------------------------------
async function getById(bookingId) {
  const [rows] = await pool.execute(
    `SELECT
      b.booking_id,
      DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
      TIME_FORMAT(b.start_time, '%H:%i') AS start_time,
      TIME_FORMAT(b.end_time, '%H:%i') AS end_time,
      b.booking_status,
      b.notes,
      b.total_amount,
      b.discount_amount,
      b.final_amount,
      b.created_at,
      TIMESTAMP(b.booking_date, b.start_time) <= NOW() AS appointment_started,
      b.user_id,
      u.full_name,
      u.email,
      u.phone,
      b.vehicle_id,
      v.license_plate,
      v.province,
      v.color,
      v.production_year,
      vb.brand_name,
      vm.model_name,
      vt.type_name,
      p.payment_status,
      p.payment_method,
      p.paid_at
    FROM bookings b
    LEFT JOIN users u ON u.user_id = b.user_id
    LEFT JOIN vehicles v ON v.vehicle_id = b.vehicle_id
    LEFT JOIN vehicle_models vm ON vm.model_id = v.model_id
    LEFT JOIN vehicle_brands vb ON vb.brand_id = vm.brand_id
    LEFT JOIN vehicle_types vt ON vt.vehicle_type_id = vm.vehicle_type_id
    LEFT JOIN payments p ON p.booking_id = b.booking_id
    WHERE b.booking_id = ?`,
    [bookingId],
  );
  const row = rows[0];
  if (!row) throw new StaffBookingNotFoundError();

  const [serviceRows] = await pool.execute(
    `SELECT booking_service_id, service_id, service_name, unit_price, duration_minutes
    FROM booking_services
    WHERE booking_id = ?
    ORDER BY booking_service_id ASC`,
    [bookingId],
  );

  // ตารางใหม่ vehicle_check_ins
  const [checkInRows] = await pool.execute(
    `SELECT c.check_in_id, c.mileage, c.fuel_level, c.condition_note,
      c.checked_in_at, c.checked_in_by, u.full_name AS checked_in_by_name
    FROM vehicle_check_ins c
    LEFT JOIN users u ON u.user_id = c.checked_in_by
    WHERE c.booking_id = ?`,
    [bookingId],
  );

  const [historyRows] = await pool.execute(
    `SELECT h.history_id, h.old_status, h.new_status, h.reason, h.created_at,
      h.changed_by, u.full_name AS changed_by_name, u.role AS changed_by_role
    FROM booking_status_history h
    LEFT JOIN users u ON u.user_id = h.changed_by
    WHERE h.booking_id = ?
    ORDER BY h.created_at ASC, h.history_id ASC`,
    [bookingId],
  );

  // ตารางใหม่ booking_notes
  const [noteRows] = await pool.execute(
    `SELECT n.note_id, n.note, n.created_at, n.created_by, u.full_name AS created_by_name
    FROM booking_notes n
    LEFT JOIN users u ON u.user_id = n.created_by
    WHERE n.booking_id = ?
    ORDER BY n.created_at ASC, n.note_id ASC`,
    [bookingId],
  );

  return {
    booking: {
      booking_id: row.booking_id,
      booking_date: row.booking_date,
      start_time: row.start_time,
      end_time: row.end_time,
      booking_status: row.booking_status,
      notes: row.notes, // หมายเหตุจากลูกค้าตอนจอง
      total_amount: toNumber(row.total_amount),
      discount_amount: toNumber(row.discount_amount),
      final_amount: toNumber(row.final_amount),
      created_at: row.created_at,
      appointment_started: Boolean(row.appointment_started),
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
      province: row.province,
      color: row.color,
      production_year: row.production_year,
      brand_name: row.brand_name,
      model_name: row.model_name,
      type_name: row.type_name,
    },
    services: serviceRows.map((service) => ({
      ...service,
      unit_price: toNumber(service.unit_price),
    })),
    payment: row.payment_status
      ? {
          payment_status: row.payment_status,
          payment_method: row.payment_method,
          paid_at: row.paid_at,
        }
      : null,
    check_in: checkInRows[0] ?? null,
    status_history: historyRows,
    notes: noteRows,
    allowed_next_statuses: STATUS_TRANSITIONS[row.booking_status] ?? [],
  };
}

// ---------------------------------------------------------------------
// 4) บันทึกการรับรถเข้าร้าน  CONFIRMED -> CHECKED_IN
// ---------------------------------------------------------------------
async function checkIn(bookingId, data, user) {
  await withTransaction(async (connection) => {
    const booking = await lockBooking(connection, bookingId);
    if (booking.booking_status !== "CONFIRMED") {
      throw new StaffBookingConflictError("Only CONFIRMED bookings can be checked in.");
    }

    await connection.execute(
      `INSERT INTO vehicle_check_ins
        (booking_id, mileage, fuel_level, condition_note, checked_in_by)
      VALUES (?, ?, ?, ?, ?)`,
      [bookingId, data.mileage, data.fuel_level, data.condition_note, user.user_id],
    );
    await updateStatus(connection, bookingId, "CONFIRMED", "CHECKED_IN");
    await insertStatusHistory(connection, {
      bookingId,
      oldStatus: "CONFIRMED",
      newStatus: "CHECKED_IN",
      userId: user.user_id,
      reason: data.note ?? "Vehicle checked in.",
    });
    await notifyBooking(connection, bookingId, NOTIFY.VEHICLE_CHECKED_IN);
  });
  return getById(bookingId);
}

// ---------------------------------------------------------------------
// 5) + 6) เปลี่ยนสถานะ พร้อมเหตุผล (บังคับ)
// ---------------------------------------------------------------------
async function changeStatus(bookingId, { status, reason }, user) {
  if (status === "CANCELLED") {
    // ขอบเขตงาน: พนักงานไม่มีสิทธิ์ยกเลิกการจองแทนลูกค้า
    throw new StaffForbiddenActionError("Staff cannot cancel bookings on behalf of customers.");
  }
  await withTransaction(async (connection) => {
    const booking = await lockBooking(connection, bookingId);
    const allowed = STATUS_TRANSITIONS[booking.booking_status] ?? [];
    if (!allowed.includes(status)) {
      throw new StaffBookingConflictError(
        `Cannot change status from ${booking.booking_status} to ${status}.`,
      );
    }
    if (status === "COMPLETED") {
      await assertVerifiedPayment(connection, booking);
    }
    await updateStatus(connection, bookingId, booking.booking_status, status);
    await insertStatusHistory(connection, {
      bookingId,
      oldStatus: booking.booking_status,
      newStatus: status,
      userId: user.user_id,
      reason,
    });
    if (status === "IN_SERVICE") await notifyBooking(connection, bookingId, NOTIFY.SERVICE_STARTED);
    if (status === "COMPLETED") await notifyBooking(connection, bookingId, NOTIFY.SERVICE_COMPLETED);
  });
  return getById(bookingId);
}

// ---------------------------------------------------------------------
// 7) ลูกค้าไม่มาตามนัด  CONFIRMED -> NO_SHOW  (ต้องเลยเวลานัดแล้ว)
// ---------------------------------------------------------------------
async function markNoShow(bookingId, reason, user) {
  await withTransaction(async (connection) => {
    const booking = await lockBooking(connection, bookingId);
    if (booking.booking_status !== "CONFIRMED") {
      throw new StaffBookingConflictError("Only CONFIRMED bookings can be marked as no-show.");
    }
    if (!booking.appointment_started) {
      throw new StaffBookingConflictError("Cannot mark no-show before the appointment time.");
    }
    await updateStatus(connection, bookingId, "CONFIRMED", "NO_SHOW");
    await insertStatusHistory(connection, {
      bookingId,
      oldStatus: "CONFIRMED",
      newStatus: "NO_SHOW",
      userId: user.user_id,
      reason,
    });
    await notifyBooking(connection, bookingId, NOTIFY.NO_SHOW);
    // ไม่มาตามนัด = ริบเงิน 100% (บันทึกใน refunds: คืน 0 บาท, ค่าธรรมเนียมเต็มจำนวน)
    try {
      await recordNoShowForfeit(connection, bookingId, reason);
    } catch (error) {
      if (error instanceof CancellationConflictError) {
        throw new StaffBookingConflictError(error.message);
      }
      throw error;
    }
  });
  return getById(bookingId);
}

// ---------------------------------------------------------------------
// 6) หมายเหตุที่ไม่เปลี่ยนสถานะ -> ตาราง booking_notes
// ---------------------------------------------------------------------
async function addNote(bookingId, note, user) {
  const [rows] = await pool.execute(
    "SELECT booking_status FROM bookings WHERE booking_id = ?",
    [bookingId],
  );
  if (rows.length === 0) throw new StaffBookingNotFoundError();
  if (rows[0].booking_status === "CANCELLED") {
    throw new StaffBookingConflictError("Cannot add notes to a cancelled booking.");
  }
  await pool.execute(
    "INSERT INTO booking_notes (booking_id, note, created_by) VALUES (?, ?, ?)",
    [bookingId, note, user.user_id],
  );
  return getById(bookingId);
}

module.exports = {
  StaffBookingNotFoundError,
  StaffBookingConflictError,
  StaffForbiddenActionError,
  STATUS_TRANSITIONS,
  list,
  getById,
  checkIn,
  changeStatus,
  markNoShow,
  addNote,
};
