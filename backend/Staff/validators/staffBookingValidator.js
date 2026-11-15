// =====================================================================
// [STAFF] ตรวจสอบ input ของ /api/staff/bookings/*
// =====================================================================
const {
  parseId,
  isValidDate,
} = require("../../Admin/validators/bookingValidator");

const BOOKING_STATUSES = new Set([
  "CONFIRMED",
  "CHECKED_IN",
  "IN_SERVICE",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);
// ต้องตรงกับ ENUM ของ vehicle_check_ins.fuel_level ใน migration
const FUEL_LEVELS = new Set(["EMPTY", "QUARTER", "HALF", "THREE_QUARTER", "FULL"]);
const MAX_TEXT_LENGTH = 1000;
const MAX_MILEAGE = 9999999;
const MAX_MYSQL_INT = 2147483647;

function sendValidationError(res, message) {
  return res.status(400).json({ status: "error", message });
}

function parsePositiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_MYSQL_INT ? parsed : null;
}

function hasOnlyKeys(body, allowed) {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).every((key) => allowed.includes(key))
  );
}

// คืนค่า string ที่ trim แล้ว, null ถ้าไม่ได้ส่งมา หรือ false ถ้าไม่ถูกต้อง
function readText(value, { required }) {
  if (value === undefined || value === null) return required ? false : null;
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length === 0) return required ? false : null;
  if (Array.from(text).length > MAX_TEXT_LENGTH) return false;
  return text;
}

// GET /api/staff/bookings
//   ?date=YYYY-MM-DD                 (รายการจองของวันนั้น)
//   ?date_from=&date_to=             (ช่วงวันที่ สำหรับหน้าประวัติ)
//   &booking_status=&search=&vehicle_id=&page=&limit=
function validateListQuery(req, res, next) {
  const {
    date,
    date_from: dateFrom,
    date_to: dateTo,
    booking_status: bookingStatus,
    search,
    vehicle_id: rawVehicleId,
    page: rawPage,
    limit: rawLimit,
  } = req.query;

  const page = rawPage === undefined ? 1 : parsePositiveInteger(rawPage);
  const limit = rawLimit === undefined ? 50 : parsePositiveInteger(rawLimit);
  if (page === null || limit === null || limit > 200) {
    return sendValidationError(res, "Invalid pagination parameters.");
  }
  if (date !== undefined && !isValidDate(date)) {
    return sendValidationError(res, "date must be a valid YYYY-MM-DD date.");
  }
  if (dateFrom !== undefined && !isValidDate(dateFrom)) {
    return sendValidationError(res, "date_from must be a valid YYYY-MM-DD date.");
  }
  if (dateTo !== undefined && !isValidDate(dateTo)) {
    return sendValidationError(res, "date_to must be a valid YYYY-MM-DD date.");
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return sendValidationError(res, "date_from must not be after date_to.");
  }
  if (
    bookingStatus !== undefined &&
    (typeof bookingStatus !== "string" || !BOOKING_STATUSES.has(bookingStatus))
  ) {
    return sendValidationError(res, "Invalid booking_status.");
  }
  if (
    search !== undefined &&
    (typeof search !== "string" || Array.from(search.trim()).length > 100)
  ) {
    return sendValidationError(res, "Search must be a string of at most 100 characters.");
  }
  const vehicleId =
    rawVehicleId === undefined ? undefined : parsePositiveInteger(rawVehicleId);
  if (vehicleId === null) {
    return sendValidationError(res, "vehicle_id must be a positive integer.");
  }

  req.staffBookingQuery = {
    date,
    date_from: dateFrom,
    date_to: dateTo,
    booking_status: bookingStatus,
    search: typeof search === "string" ? search.trim() : "",
    vehicle_id: vehicleId,
    page,
    limit,
    offset: (page - 1) * limit,
  };
  return next();
}

// POST /:id/check-in  { mileage, fuel_level, condition_note?, note? }
function validateCheckIn(req, res, next) {
  const body = req.body;
  if (!hasOnlyKeys(body, ["mileage", "fuel_level", "condition_note", "note"])) {
    return sendValidationError(
      res,
      "Only mileage, fuel_level, condition_note and note are accepted.",
    );
  }
  const { mileage, fuel_level: fuelLevel } = body;
  if (!Number.isInteger(mileage) || mileage < 0 || mileage > MAX_MILEAGE) {
    return sendValidationError(res, "mileage must be an integer between 0 and 9999999.");
  }
  if (typeof fuelLevel !== "string" || !FUEL_LEVELS.has(fuelLevel)) {
    return sendValidationError(res, "Invalid fuel_level.");
  }
  const conditionNote = readText(body.condition_note, { required: false });
  const note = readText(body.note, { required: false });
  if (conditionNote === false || note === false) {
    return sendValidationError(res, `Text fields must be at most ${MAX_TEXT_LENGTH} characters.`);
  }

  req.staffCheckIn = {
    mileage,
    fuel_level: fuelLevel,
    condition_note: conditionNote,
    note,
  };
  return next();
}

// PATCH /:id/status  { status, reason }   — reason บังคับ
function validateStatusChange(req, res, next) {
  const body = req.body;
  if (!hasOnlyKeys(body, ["status", "reason"])) {
    return sendValidationError(res, "Only status and reason are accepted.");
  }
  if (typeof body.status !== "string" || !BOOKING_STATUSES.has(body.status)) {
    return sendValidationError(res, "Invalid status.");
  }
  const reason = readText(body.reason, { required: true });
  if (reason === false) {
    return sendValidationError(
      res,
      `reason is required (1-${MAX_TEXT_LENGTH} characters).`,
    );
  }
  req.staffStatusChange = { status: body.status, reason };
  return next();
}

// POST /:id/no-show  { reason }   และ   POST /:id/notes  { note }
function validateRequiredText(field) {
  return (req, res, next) => {
    const body = req.body;
    if (!hasOnlyKeys(body, [field])) {
      return sendValidationError(res, `Only ${field} is accepted.`);
    }
    const text = readText(body[field], { required: true });
    if (text === false) {
      return sendValidationError(
        res,
        `${field} is required (1-${MAX_TEXT_LENGTH} characters).`,
      );
    }
    req.staffText = text;
    return next();
  };
}

module.exports = {
  parseId,
  validateListQuery,
  validateCheckIn,
  validateStatusChange,
  validateNoShow: validateRequiredText("reason"),
  validateNote: validateRequiredText("note"),
  FUEL_LEVELS,
};
