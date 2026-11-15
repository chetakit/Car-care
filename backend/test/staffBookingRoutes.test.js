const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalGetConnection = pool.getConnection;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-staff-booking-secret-with-at-least-32-bytes";
process.env.JWT_SECRET = testSecret;

function createToken(role, userId = 50) {
  return jwt.sign({ user_id: userId, role }, testSecret, { expiresIn: "1h" });
}

function sendRequest(port, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const request = http.request(
      { hostname: "127.0.0.1", port, path, method, headers },
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
    request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function withServer(callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await callback(server.address().port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function installRoleMock(role) {
  let bookingQueries = 0;
  pool.execute = async (sql, values) => {
    if (sql.includes("SELECT role, status FROM users")) {
      assert.deepEqual(values, [50]);
      return [[{ role, status: "ACTIVE" }]];
    }
    bookingQueries += 1;
    if (sql.startsWith("SELECT COUNT(*) AS total")) {
      return [[{ total: 1 }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  return () => bookingQueries;
}

test("Staff booking list returns only operational fields in chronological order", async () => {
  const booking = {
    booking_id: 501,
    full_name: "Test Customer",
    email: "customer@example.test",
    phone: "0123456789",
    license_plate: "ABC123",
    booking_date: "2026-03-20",
    start_time: "09:00:00",
    end_time: "10:00:00",
    booking_status: "CONFIRMED",
  };
  installRoleMock("STAFF");
  pool.execute = async (sql, values) => {
    if (sql.includes("SELECT role, status FROM users")) {
      assert.deepEqual(values, [50]);
      return [[{ role: "STAFF", status: "ACTIVE" }]];
    }
    if (sql.startsWith("SELECT COUNT(*) AS total")) {
      return [[{ total: 1 }]];
    }
    assert.match(sql, /ORDER BY b\.booking_date ASC, b\.start_time ASC/);
    assert.doesNotMatch(sql, /payment|password_hash|coupon/i);
    assert.deepEqual(values, [20, 0]);
    return [[booking]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "GET",
      "/api/staff/bookings",
      createToken("STAFF"),
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data.items, [booking]);
    assert.deepEqual(response.payload.data.pagination, {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    assert.equal(
      Object.hasOwn(response.payload.data.items[0], "payment_status"),
      false,
    );
  });
});

test("Staff booking details include customer, vehicle and services but no payment data", async () => {
  installRoleMock("STAFF");
  pool.execute = async (sql) => {
    if (sql.includes("SELECT role, status FROM users")) {
      return [[{ role: "STAFF", status: "ACTIVE" }]];
    }
    if (sql.includes("FROM bookings b") && sql.includes("WHERE b.booking_id = ?")) {
      assert.doesNotMatch(sql, /payment|password_hash|coupon/i);
      return [[{
        booking_id: 501,
        booking_date: "2026-03-20",
        start_time: "09:00:00",
        end_time: "10:00:00",
        booking_status: "CONFIRMED",
        notes: "Please check the brakes.",
        user_id: 21,
        full_name: "Test Customer",
        email: "customer@example.test",
        phone: "0123456789",
        vehicle_id: 30,
        license_plate: "ABC123",
        production_year: 2020,
        province: "Bangkok",
        color: "Blue",
        model_name: "Model",
        brand_name: "Brand",
        type_name: "Sedan",
      }]];
    }
    if (sql.includes("FROM booking_services")) {
      return [[{
        booking_service_id: 80,
        service_name: "Brake inspection",
        duration_minutes: 30,
      }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "GET",
      "/api/staff/bookings/501",
      createToken("STAFF"),
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.customer.full_name, "Test Customer");
    assert.equal(response.payload.data.vehicle.license_plate, "ABC123");
    assert.equal(response.payload.data.services[0].service_name, "Brake inspection");
    assert.equal(Object.hasOwn(response.payload.data, "payment"), false);
    assert.equal(Object.hasOwn(response.payload.data, "coupon"), false);
  });
});

test("only an active current Staff account can access Staff booking APIs", async () => {
  let databaseRole = "CUSTOMER";
  const getBookingQueryCount = installRoleMock(databaseRole);
  pool.execute = async (sql) => {
    if (sql.includes("SELECT role, status FROM users")) {
      return [[{ role: databaseRole, status: "ACTIVE" }]];
    }
    throw new Error("Unauthorized requests must not query bookings.");
  };

  await withServer(async (port) => {
    const customer = await sendRequest(
      port,
      "GET",
      "/api/staff/bookings",
      createToken("CUSTOMER"),
    );
    databaseRole = "ADMIN";
    const admin = await sendRequest(
      port,
      "GET",
      "/api/staff/bookings",
      createToken("ADMIN"),
    );
    databaseRole = "ADMIN";
    const staleStaffToken = await sendRequest(
      port,
      "GET",
      "/api/staff/bookings",
      createToken("STAFF"),
    );

    assert.equal(customer.statusCode, 403);
    assert.equal(admin.statusCode, 403);
    assert.equal(staleStaffToken.statusCode, 401);
    assert.equal(getBookingQueryCount(), 0);
  });
});

test("Staff and demoted Admin sessions cannot call Admin booking APIs", async () => {
  let databaseRole = "STAFF";
  pool.execute = async (sql) => {
    if (sql.includes("SELECT role, status FROM users")) {
      return [[{ role: databaseRole, status: "ACTIVE" }]];
    }
    throw new Error("Denied requests must not query Admin bookings.");
  };

  await withServer(async (port) => {
    const staff = await sendRequest(
      port,
      "GET",
      "/api/admin/bookings",
      createToken("STAFF"),
    );
    databaseRole = "STAFF";
    const staleAdmin = await sendRequest(
      port,
      "GET",
      "/api/admin/bookings",
      createToken("ADMIN"),
    );

    assert.equal(staff.statusCode, 403);
    assert.equal(staleAdmin.statusCode, 401);
  });
});

test("Staff can advance service status and the change is recorded atomically", async () => {
  installRoleMock("STAFF");
  const statements = [];
  let committed = false;
  pool.execute = async (sql) => {
    if (sql.includes("SELECT role, status FROM users")) {
      return [[{ role: "STAFF", status: "ACTIVE" }]];
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes("FROM bookings") && sql.includes("FOR UPDATE")) {
        return [[{ booking_id: 501, booking_status: "CONFIRMED" }]];
      }
      if (sql.startsWith("UPDATE bookings")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO booking_status_history")) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    commit: async () => {
      committed = true;
    },
    rollback: async () => {},
    release: () => {},
    destroy: () => {},
  });

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "PATCH",
      "/api/staff/bookings/501/status",
      createToken("STAFF"),
      { status: "CHECKED_IN" },
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data, {
      booking_id: 501,
      booking_status: "CHECKED_IN",
    });
    assert.equal(committed, true);
    assert.match(statements[0].sql, /FOR UPDATE/);
    assert.deepEqual(statements[1].values, ["CHECKED_IN", 501, "CONFIRMED"]);
    assert.deepEqual(statements[2].values, [
      501,
      "CONFIRMED",
      "CHECKED_IN",
      50,
      "Staff service progress update.",
    ]);
  });
});

test("Staff cannot skip service stages or change cancellation statuses", async () => {
  installRoleMock("STAFF");
  let transactionStarted = false;
  let historyInserted = false;
  pool.execute = async (sql) => {
    if (sql.includes("SELECT role, status FROM users")) {
      return [[{ role: "STAFF", status: "ACTIVE" }]];
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  pool.getConnection = async () => ({
    beginTransaction: async () => {
      transactionStarted = true;
    },
    execute: async (sql) => {
      if (sql.includes("FROM bookings") && sql.includes("FOR UPDATE")) {
        return [[{ booking_id: 501, booking_status: "CONFIRMED" }]];
      }
      if (sql.includes("INSERT INTO booking_status_history")) {
        historyInserted = true;
      }
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    commit: async () => {},
    rollback: async () => {
      transactionStarted = false;
    },
    release: () => {},
    destroy: () => {},
  });

  await withServer(async (port) => {
    const skip = await sendRequest(
      port,
      "PATCH",
      "/api/staff/bookings/501/status",
      createToken("STAFF"),
      { status: "IN_SERVICE" },
    );
    const cancel = await sendRequest(
      port,
      "PATCH",
      "/api/staff/bookings/501/status",
      createToken("STAFF"),
      { status: "CANCELLED" },
    );

    assert.equal(skip.statusCode, 409);
    assert.equal(cancel.statusCode, 400);
    assert.equal(transactionStarted, false);
    assert.equal(historyInserted, false);
  });
});

after(() => {
  pool.execute = originalExecute;
  pool.getConnection = originalGetConnection;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});
