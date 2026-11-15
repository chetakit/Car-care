const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const bcrypt = require("bcryptjs");
const app = require("../app");
const pool = require("../shared/config/db");
const registrationService = require("../Auth/services/customerRegistrationService");

const originalExecute = pool.execute;
const registration = {
  full_name: "Customer Name",
  email: "customer@example.test",
  phone: "0123456789",
  password: "valid-password",
};

function postJson(port, path, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          try {
            resolve({
              statusCode: response.statusCode,
              payload: JSON.parse(responseBody),
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on("error", reject);
    request.end(JSON.stringify(body));
  });
}

after(() => {
  pool.execute = originalExecute;
});

test("POST /api/customer/auth/register creates a public customer response", async () => {
  let storedPasswordHash;
  pool.execute = async (sql, values) => {
    if (sql.startsWith("SELECT user_id")) return [[]];
    const insertColumns = sql
      .match(/INSERT INTO users \(([^)]+)\)/)[1]
      .split(", ");
    storedPasswordHash = values[insertColumns.indexOf("password_hash")];
    return [{ insertId: 42, affectedRows: 1 }];
  };

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await postJson(server.address().port, "/api/customer/auth/register", {
      ...registration,
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.data.user.user_id, 42);
    assert.equal(response.payload.data.user.role, "CUSTOMER");
    assert.equal(response.payload.data.user.status, "ACTIVE");
    assert.equal(
      Object.hasOwn(response.payload.data.user, "password_hash"),
      false,
    );
    assert.equal(
      await bcrypt.compare(registration.password, storedPasswordHash),
      true,
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("registration hashes the password and assigns customer account fields", async () => {
  let insertSql;
  let insertValues;
  pool.execute = async (sql, values) => {
    if (sql.startsWith("SELECT user_id")) {
      assert.deepEqual(values, [registration.email]);
      return [[]];
    }
    insertSql = sql;
    insertValues = values;
    return [{ insertId: 42, affectedRows: 1 }];
  };

  const user = await registrationService.registerCustomer({
    ...registration,
    role: "ADMIN",
    status: "INACTIVE",
    user_id: 7,
  });
  const insertColumns = insertSql
    .match(/INSERT INTO users \(([^)]+)\)/)[1]
    .split(", ");
  const passwordHashIndex = insertColumns.indexOf("password_hash");
  const storedPasswordHash = insertValues[passwordHashIndex];

  assert.equal(await bcrypt.compare(registration.password, storedPasswordHash), true);
  assert.notEqual(storedPasswordHash, registration.password);
  assert.equal(user.user_id, 42);
  assert.equal(user.role, "CUSTOMER");
  assert.equal(user.status, "ACTIVE");
  assert.equal(user.email, registration.email);
  assert.equal(Object.hasOwn(user, "password_hash"), false);
  assert.equal(insertColumns.includes("user_id"), false);
});

test("registration rejects an email found by the duplicate pre-check", async () => {
  let insertAttempted = false;
  pool.execute = async (sql) => {
    if (sql.startsWith("SELECT user_id")) return [[{ user_id: 9 }]];
    insertAttempted = true;
    throw new Error("Insert should not be attempted.");
  };

  await assert.rejects(
    registrationService.registerCustomer(registration),
    registrationService.DuplicateCustomerEmailError,
  );
  assert.equal(insertAttempted, false);
});

test("registration maps a concurrent duplicate-key error safely", async () => {
  pool.execute = async (sql) => {
    if (sql.startsWith("SELECT user_id")) return [[]];
    const error = new Error("Duplicate entry");
    error.code = "ER_DUP_ENTRY";
    throw error;
  };

  await assert.rejects(
    registrationService.registerCustomer(registration),
    registrationService.DuplicateCustomerEmailError,
  );
});
