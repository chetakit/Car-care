const assert = require("node:assert/strict");
const { test } = require("node:test");
const bookingValidator = require("../Customer/validators/bookingValidator");

function runValidator(body) {
  const req = { body };
  let statusCode;
  let payload;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
  };

  bookingValidator.validateCreate(req, res, () => {
    nextCalled = true;
  });
  return { req, statusCode, payload, nextCalled };
}

test("Booking validator accepts only positive IDs and unique services", () => {
  const result = runValidator({
    vehicle_id: 42,
    schedule_id: 7,
    service_ids: [3, 5],
  });

  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.req.bookingInput, {
    vehicle_id: 42,
    schedule_id: 7,
    service_ids: [3, 5],
  });
});

test("Booking validator rejects missing, empty, duplicate, or invalid services", () => {
  for (const body of [
    { vehicle_id: 42, schedule_id: 7 },
    { vehicle_id: 42, schedule_id: 7, service_ids: [] },
    { vehicle_id: 42, schedule_id: 7, service_ids: [3, 3] },
    { vehicle_id: 42, schedule_id: 7, service_ids: [0] },
    { vehicle_id: "42", schedule_id: 7, service_ids: [3] },
  ]) {
    const result = runValidator(body);
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 400);
  }
});

test("Booking validator rejects identity and all client-calculated fields", () => {
  for (const field of [
    "user_id",
    "price",
    "duration_minutes",
    "total_amount",
    "discount_amount",
    "final_amount",
    "booking_status",
    "booking_date",
    "start_time",
    "end_time",
    "payment",
  ]) {
    const result = runValidator({
      vehicle_id: 42,
      schedule_id: 7,
      service_ids: [3],
      [field]: field === "payment" ? {} : 1,
    });
    assert.equal(result.nextCalled, false, field);
    assert.equal(result.statusCode, 400, field);
  }
});
