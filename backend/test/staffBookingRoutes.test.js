// [STAFF] เทสต์ /api/staff/bookings — จำลอง database ด้วยการแทน pool.execute / getConnection
const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalGetConnection = pool.getConnection;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-staff-booking-secret";
process.env.JWT_SECRET = testSecret;

// user_id ของแต่ละ role ในเทสต์ — ใช้ตอบคำถาม "role ปัจจุบันใน DB" ของ requireCurrentStaff
const TEST_USER_IDS = { STAFF: 7, CUSTOMER: 8, ADMIN: 9 };
const TEST_ROLE_BY_ID = Object.fromEntries(
  Object.entries(TEST_USER_IDS).map(([role, id]) => [id, role]),
);

function createToken(role = "STAFF") {
  return jwt.sign({ user_id: TEST_USER_IDS[role], role }, testSecret, { expiresIn: "1h" });
}

// requireCurrentStaff ถาม DB ว่า role ล่าสุดของผู้ใช้คืออะไร
// ตัวห่อนี้ตอบคำถามนั้นให้ทุกเทสต์ ส่วนคำสั่ง SQL อื่นส่งต่อให้ pool.execute ที่แต่ละเทสต์กำหนด
let testExecute = originalExecute;
Object.defineProperty(pool, "execute", {
  configurable: true,
  get() {
    return async (sql, params) => {
      if (sql.includes("SELECT role, status FROM users")) {
        return [[{ role: TEST_ROLE_BY_ID[params[0]], status: "ACTIVE" }], []];
      }
      return testExecute(sql, params);
    };
  },
  set(fn) {
    testExecute = fn;
  },
});

function sendRequest(port, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          try {
            resolve({ statusCode: response.statusCode, payload: JSON.parse(text) });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on("error", reject);
    if (payload) request.write(payload);
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

function failIfDatabaseUsed() {
  pool.execute = async () => {
    throw new Error("Database should not be queried.");
  };
  pool.getConnection = async () => {
    throw new Error("Database should not be queried.");
  };
}

test("customers cannot use staff booking APIs", async () => {
  failIfDatabaseUsed();
  await withServer(async (port) => {
    const response = await sendRequest(port, "GET", "/api/staff/bookings", createToken("CUSTOMER"));
    assert.equal(response.statusCode, 403);
  });
});

test("staff cannot cancel bookings", async () => {
  failIfDatabaseUsed();
  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "PATCH",
      "/api/staff/bookings/5/status",
      createToken(),
      { status: "CANCELLED", reason: "Customer asked by phone" },
    );
    assert.equal(response.statusCode, 403);
  });
});

test("status change requires a reason", async () => {
  failIfDatabaseUsed();
  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "PATCH",
      "/api/staff/bookings/5/status",
      createToken(),
      { status: "IN_SERVICE", reason: "   " },
    );
    assert.equal(response.statusCode, 400);
  });
});

test("check-in validates mileage and fuel level", async () => {
  failIfDatabaseUsed();
  await withServer(async (port) => {
    const badMileage = await sendRequest(
      port,
      "POST",
      "/api/staff/bookings/5/check-in",
      createToken(),
      { mileage: -1, fuel_level: "HALF" },
    );
    assert.equal(badMileage.statusCode, 400);

    const badFuel = await sendRequest(
      port,
      "POST",
      "/api/staff/bookings/5/check-in",
      createToken(),
      { mileage: 1000, fuel_level: "SOME" },
    );
    assert.equal(badFuel.statusCode, 400);
  });
});

test("status change rejects transitions outside the allowed flow", async () => {
  const executed = [];
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values) => {
      executed.push(sql);
      if (sql.includes("FOR UPDATE")) {
        return [[{ booking_id: 5, booking_status: "CONFIRMED", appointment_started: 1 }]];
      }
      throw new Error(`Unexpected query: ${sql} ${values}`);
    },
  };
  pool.getConnection = async () => connection;
  pool.execute = async () => {
    throw new Error("Pool should not be queried directly.");
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "PATCH",
      "/api/staff/bookings/5/status",
      createToken(),
      { status: "COMPLETED", reason: "Skipping steps" },
    );
    assert.equal(response.statusCode, 409);
  });
  assert.equal(executed.length, 1);
});

test("no-show is rejected before the appointment time", async () => {
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql) => {
      if (sql.includes("FOR UPDATE")) {
        return [[{ booking_id: 5, booking_status: "CONFIRMED", appointment_started: 0 }]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  pool.getConnection = async () => connection;

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/staff/bookings/5/no-show",
      createToken(),
      { reason: "Called twice, no answer" },
    );
    assert.equal(response.statusCode, 409);
  });
});

test("daily list filters by date and returns service names", async () => {
  const calls = [];
  pool.execute = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("COUNT(*)")) return [[{ total: 1 }]];
    if (sql.includes("FROM booking_services")) {
      return [[{ booking_id: 9, service_name: "Wash" }]];
    }
    return [[{
      booking_id: 9,
      booking_date: "2026-11-15",
      start_time: "09:00",
      end_time: "10:00",
      booking_status: "CONFIRMED",
      final_amount: "300.00",
      full_name: "A Customer",
      license_plate: "AB 1234",
    }]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "GET",
      "/api/staff/bookings?date=2026-11-15",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data.items[0].service_names, ["Wash"]);
    assert.equal(response.payload.data.items[0].final_amount, 300);
  });
  assert.ok(calls[0].sql.includes("b.booking_date = ?"));
  assert.equal(calls[0].values[0], "2026-11-15");
});

after(() => {
  delete pool.execute;
  pool.execute = originalExecute;
  pool.getConnection = originalGetConnection;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});
