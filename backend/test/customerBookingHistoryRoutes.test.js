const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-customer-booking-history-secret";
process.env.JWT_SECRET = testSecret;

function createToken(role = "CUSTOMER", userId = 50) {
  return jwt.sign({ user_id: userId, role }, testSecret, { expiresIn: "1h" });
}

function sendRequest(port, path, token) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
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
    request.end();
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

function booking(overrides = {}) {
  return {
    booking_id: 101,
    vehicle_id: 70,
    booking_date: "2026-11-20",
    start_time: "09:00:00",
    end_time: "10:00:00",
    booking_status: "CONFIRMED",
    total_amount: "1500.00",
    discount_amount: "100.00",
    final_amount: "1400.00",
    license_plate: "PLATE-70",
    production_year: 2020,
    province: "Bangkok",
    color: "Blue",
    model_name: "Model 7",
    brand_name: "Brand 7",
    type_name: "Sedan",
    payment_id: 301,
    payment_amount: "1400.00",
    payment_method: "CARD",
    payment_status: "PAID",
    paid_at: "2026-11-01 09:00:00",
    ...overrides,
  };
}

after(() => {
  pool.execute = originalExecute;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test("Customer booking history is scoped to the JWT user and includes safe details", async () => {
  pool.execute = async (sql, values) => {
    assert.match(sql, /b\.user_id = \?/);
    if (sql.includes("COUNT(*)")) {
      assert.deepEqual(values, [50]);
      return [[{ total: 1 }]];
    }
    if (sql.includes("FROM booking_services")) {
      assert.match(sql, /b\.user_id = \?/);
      assert.deepEqual(values, [50, 101]);
      return [[{
        booking_id: 101,
        booking_service_id: 501,
        service_id: 8,
        service_name: "Oil change",
        unit_price: "1400.00",
        duration_minutes: 60,
      }]];
    }

    assert.deepEqual(values, [50, 20, 0]);
    return [[booking({ transaction_ref: "must-not-be-returned" })]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/bookings",
      createToken("CUSTOMER", 50),
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.items.length, 1);
    const [item] = response.payload.data.items;
    assert.equal(item.booking_id, 101);
    assert.equal(item.booking_date, "2026-11-20");
    assert.equal(item.start_time, "09:00:00");
    assert.equal(item.booking_status, "CONFIRMED");
    assert.equal(item.vehicle.license_plate, "PLATE-70");
    assert.equal(item.services[0].service_name, "Oil change");
    assert.deepEqual(item.payment, {
      payment_id: 301,
      amount: 1400,
      payment_method: "CARD",
      payment_status: "PAID",
      paid_at: "2026-11-01 09:00:00",
    });
    assert.equal(JSON.stringify(item).includes("transaction_ref"), false);
    assert.equal(Object.hasOwn(item, "user_id"), false);
  });
});

test("Vehicle-specific history verifies ownership and scopes bookings", async () => {
  let bookingQueries = 0;
  pool.execute = async (sql, values) => {
    if (sql.includes("FROM vehicles")) {
      assert.match(sql, /vehicle_id = \? AND user_id = \?/);
      assert.deepEqual(values, [70, 50]);
      return [[{ vehicle_id: 70 }]];
    }
    bookingQueries += 1;
    assert.match(sql, /b\.user_id = \?/);
    if (sql.includes("FROM booking_services")) {
      assert.deepEqual(values, [50, 101]);
      return [[]];
    }
    assert.match(sql, /b\.vehicle_id = \?/);
    if (sql.includes("COUNT(*)")) {
      assert.deepEqual(values, [50, 70]);
      return [[{ total: 1 }]];
    }
    assert.deepEqual(values, [50, 70, 20, 0]);
    return [[booking({ payment_id: null })]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/vehicles/70/bookings",
      createToken("CUSTOMER", 50),
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.items[0].vehicle.vehicle_id, 70);
    assert.equal(response.payload.data.items[0].payment, null);
    assert.equal(bookingQueries, 3);
  });
});

test("Customer cannot read another customer's vehicle history", async () => {
  let queryCount = 0;
  pool.execute = async (sql, values) => {
    queryCount += 1;
    assert.match(sql, /vehicle_id = \? AND user_id = \?/);
    assert.deepEqual(values, [70, 50]);
    return [[]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/vehicles/70/bookings",
      createToken("CUSTOMER", 50),
    );
    assert.equal(response.statusCode, 404);
    assert.equal(response.payload.message, "Vehicle not found.");
    assert.equal(queryCount, 1);
  });
});

test("Booking history supports status filtering and pagination", async () => {
  pool.execute = async (sql, values) => {
    if (sql.includes("FROM booking_services")) {
      assert.match(sql, /b\.user_id = \?/);
      assert.deepEqual(values, [50, 202]);
      return [[]];
    }
    assert.match(sql, /b\.user_id = \?/);
    assert.match(sql, /b\.booking_status = \?/);
    if (sql.includes("COUNT(*)")) {
      assert.deepEqual(values, [50, "COMPLETED"]);
      return [[{ total: 3 }]];
    }
    assert.deepEqual(values, [50, "COMPLETED", 1, 1]);
    assert.match(sql, /ORDER BY b\.created_at ASC/);
    return [[booking({ booking_id: 202, booking_status: "COMPLETED" })]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/bookings?page=2&limit=1&booking_status=COMPLETED&sort=oldest",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.items[0].booking_id, 202);
    assert.deepEqual(response.payload.data.pagination, {
      page: 2,
      limit: 1,
      total: 3,
      totalPages: 3,
    });
  });
});

test("Invalid IDs, filters, and client-supplied identity are rejected", async () => {
  let queryCount = 0;
  pool.execute = async () => {
    queryCount += 1;
    throw new Error("Invalid input must not query the database.");
  };

  await withServer(async (port) => {
    for (const path of [
      "/api/customer/vehicles/0/bookings",
      "/api/customer/vehicles/nope/bookings",
      "/api/customer/bookings?page=0",
      "/api/customer/bookings?limit=101",
      "/api/customer/bookings?booking_status=UNKNOWN",
      "/api/customer/bookings?sort=sideways",
      "/api/customer/bookings?user_id=51",
    ]) {
      const response = await sendRequest(port, path, createToken());
      assert.equal(response.statusCode, 400, path);
    }
  });
  assert.equal(queryCount, 0);
});

test("An empty booking list is safe, and the Admin booking route remains available", async () => {
  pool.execute = async (sql, values) => {
    if (sql.includes("SELECT role, status FROM users")) {
      assert.deepEqual(values, [50]);
      return [[{ role: "ADMIN", status: "ACTIVE" }]];
    }
    if (
      sql.includes("COUNT(*)") &&
      sql.includes("WHERE b.user_id = ?")
    ) {
      assert.deepEqual(values, [50]);
      return [[{ total: 0 }]];
    }
    if (sql.includes("COUNT(*)")) {
      return [[{ total: 0 }]];
    }
    if (sql.includes("FROM bookings b")) {
      return [[]];
    }
    throw new Error(`Unexpected booking query: ${sql}`);
  };

  await withServer(async (port) => {
    const customerResponse = await sendRequest(
      port,
      "/api/customer/bookings",
      createToken(),
    );
    assert.equal(customerResponse.statusCode, 200);
    assert.deepEqual(customerResponse.payload.data.items, []);

    const adminResponse = await sendRequest(
      port,
      "/api/admin/bookings",
      createToken("ADMIN"),
    );
    assert.equal(adminResponse.statusCode, 200);
    assert.deepEqual(adminResponse.payload.data.items, []);
  });
});
