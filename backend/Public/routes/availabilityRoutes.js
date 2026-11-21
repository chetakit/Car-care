const express = require("express");
const scheduleService = require("../../Customer/services/scheduleService");

// Public weekly availability for the calendar on /services.
// GET /api/public/availability?from=YYYY-MM-DD&days=7
// Returns only how many places are left in each slot, never who booked it.
const router = express.Router();

const ALLOWED_QUERY_FIELDS = new Set(["from", "days"]);
const DEFAULT_DAYS = 7;
const MAX_DAYS = 14;

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function sendValidationError(res, message) {
  return res.status(400).json({ status: "error", message });
}

function validateAvailabilityQuery(req, res, next) {
  if (Object.keys(req.query).some((field) => !ALLOWED_QUERY_FIELDS.has(field))) {
    return sendValidationError(res, "Only from and days query parameters are supported.");
  }
  const { from } = req.query;
  if (!isValidDate(from)) {
    return sendValidationError(res, "from must be a valid date in YYYY-MM-DD format.");
  }
  let days = DEFAULT_DAYS;
  if (req.query.days !== undefined) {
    days = Number(req.query.days);
    if (!/^\d+$/.test(String(req.query.days)) || days < 1 || days > MAX_DAYS) {
      return sendValidationError(res, `days must be a whole number from 1 to ${MAX_DAYS}.`);
    }
  }
  req.availabilityRange = { from, to: addDays(from, days - 1) };
  return next();
}

async function availability(req, res) {
  try {
    const items = await scheduleService.listAvailability(req.availabilityRange);
    return res.status(200).json({
      status: "success",
      data: {
        from: req.availabilityRange.from,
        to: req.availabilityRange.to,
        items: items.map((slot) => ({
          date: slot.schedule_date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          capacity: Number(slot.capacity),
          remaining_capacity: Number(slot.remaining_capacity),
          status: slot.status,
        })),
      },
    });
  } catch {
    console.error("Public availability request failed.");
    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve availability.",
    });
  }
}

router.get("/", validateAvailabilityQuery, availability);

module.exports = router;
