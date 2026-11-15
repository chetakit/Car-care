const assert = require("node:assert/strict");
const { test } = require("node:test");
const validateCustomerRegistration = require("../Auth/validators/customerRegistrationValidator");

function runValidator(body) {
  const req = { body };
  let statusCode;
  let responseBody;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      responseBody = payload;
      return this;
    },
  };

  validateCustomerRegistration(req, res, () => {
    nextCalled = true;
  });

  return { req, statusCode, responseBody, nextCalled };
}

const validRegistration = {
  full_name: "Customer Name",
  email: "customer@example.test",
  password: "valid-password",
};

test("registration validates and normalizes supported profile fields", () => {
  const result = runValidator({
    ...validRegistration,
    full_name: "  Customer Name  ",
    email: "  CUSTOMER@EXAMPLE.TEST ",
    phone: "0123456789",
  });

  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.req.customerRegistration, {
    full_name: "Customer Name",
    email: "customer@example.test",
    password: "valid-password",
    phone: "0123456789",
  });
});

test("registration rejects invalid email", () => {
  const result = runValidator({
    ...validRegistration,
    email: "not-an-email",
  });

  assert.equal(result.statusCode, 400);
  assert.equal(result.nextCalled, false);
});

test("registration rejects missing required fields", () => {
  const result = runValidator({
    email: validRegistration.email,
    password: validRegistration.password,
  });

  assert.equal(result.statusCode, 400);
  assert.equal(result.nextCalled, false);
});

test("registration accepts a one-character password", () => {
  const result = runValidator({
    ...validRegistration,
    password: "x",
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.customerRegistration.password, "x");
});

test("registration rejects an empty password", () => {
  const result = runValidator({
    ...validRegistration,
    password: "",
  });

  assert.equal(result.statusCode, 400);
  assert.equal(result.nextCalled, false);
});

test("registration accepts a null optional phone number", () => {
  const result = runValidator({
    ...validRegistration,
    phone: null,
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.customerRegistration.phone, null);
});

test("registration rejects phone numbers that are not exactly ten ASCII digits", () => {
  for (const phone of [
    "",
    "012345678",
    "01234567890",
    "012345678a",
    "+123456789",
    1234567890,
    " 0123456789",
    "0123456789 ",
  ]) {
    const result = runValidator({
      ...validRegistration,
      phone,
    });

    assert.equal(result.statusCode, 400, `${JSON.stringify(phone)} should be rejected`);
    assert.equal(result.nextCalled, false, `${JSON.stringify(phone)} should not reach service`);
  }
});

test("registration rejects client-supplied identity and privilege fields", () => {
  for (const field of ["role", "status", "user_id"]) {
    const result = runValidator({
      ...validRegistration,
      [field]: field === "user_id" ? 1 : "ADMIN",
    });
    assert.equal(result.statusCode, 400, `${field} should be rejected`);
    assert.equal(result.nextCalled, false, `${field} should not reach service`);
  }
});
