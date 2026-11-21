const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-payment-lookup-secret";
process.env.JWT_SECRET = testSecret;

const ROLE_IDS = { ADMIN: 1, CUSTOMER: 2, STAFF: 3 };
const token = (role) => jwt.sign({ user_id: ROLE_IDS[role], role }, testSecret, { expiresIn: "1h" });

// requireAdmin re-reads the user's current role from the database.
function withUsers(handler) {
  return async (sql, values) => {
    if (sql.includes("FROM users WHERE user_id = ?")) {
      const role = Object.keys(ROLE_IDS).find((key) => ROLE_IDS[key] === values[0]);
      return [[{ role, status: "ACTIVE" }]];
    }
    return handler(sql, values);
  };
}

function get(port, path, auth) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET", headers: auth ? { Authorization: `Bearer ${auth}` } : {} },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve({ statusCode: response.statusCode, payload: JSON.parse(body) });
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
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

after(() => {
  pool.execute = originalExecute;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

const row = {
  booking_id: 640,
  booking_date: "2026-11-23",
  start_time: "10:30",
  booking_status: "CONFIRMED",
  final_amount: "350.00",
  user_id: 70,
  full_name: "ธนวัฒน์ ศรีประเสริฐ",
  email: "demo.customer@carcare.test",
  phone: "0800000100",
  license_plate: "2กร 4519",
  payment_id: 512,
  payment_method: "SIMULATED",
  payment_status: "PAID",
  transaction_ref: "SIM-abc",
  transfer_reference: null,
};

test("Admin finds a booking by payment number (or phone digits)", async () => {
  pool.execute = withUsers(async (sql, values) => {
    assert.ok(sql.includes("p.payment_id = ? OR u.phone LIKE ?"));
    assert.deepEqual(values, [512, "%512%"]);
    return [[row]];
  });
  await withServer(async (port) => {
    const response = await get(port, "/api/admin/payments/lookup?q=512", token("ADMIN"));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data.items[0], {
      booking_id: 640,
      booking_date: "2026-11-23",
      start_time: "10:30",
      booking_status: "CONFIRMED",
      amount: 350,
      customer: { user_id: 70, full_name: "ธนวัฒน์ ศรีประเสริฐ", email: "demo.customer@carcare.test", phone: "0800000100" },
      license_plate: "2กร 4519",
      payment_id: 512,
      payment_method: "SIMULATED",
      payment_status: "PAID",
      transaction_ref: "SIM-abc",
      transfer_reference: null,
    });
  });
});

test("Admin finds bookings by reference, customer name, e-mail, phone or plate", async () => {
  pool.execute = withUsers(async (sql, values) => {
    for (const part of [
      "p.transaction_ref = ? OR pv.transfer_reference = ?",
      "u.full_name LIKE ?",
      "u.email LIKE ?",
      "u.phone LIKE ?",
      "v.license_plate LIKE ?",
    ]) {
      assert.ok(sql.includes(part), part);
    }
    assert.deepEqual(values, ["ธนวัฒน์", "ธนวัฒน์", "%ธนวัฒน์%", "%ธนวัฒน์%", "%ธนวัฒน์%", "%ธนวัฒน์%"]);
    return [[row, { ...row, booking_id: 641, payment_id: null, payment_method: null, payment_status: null }]];
  });
  await withServer(async (port) => {
    const response = await get(port, `/api/admin/payments/lookup?q=${encodeURIComponent(" ธนวัฒน์ ")}`, token("ADMIN"));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data.items.map((item) => item.booking_id), [640, 641]);
    assert.equal(response.payload.data.items[1].payment_id, null);
  });
});

test("LIKE wildcards typed by the Admin are matched literally", async () => {
  pool.execute = withUsers(async (sql, values) => {
    // "50%" is escaped to 50\% inside the LIKE pattern.
    assert.equal(values[2], String.raw`%50\%%`);
    return [[]];
  });
  await withServer(async (port) => {
    const response = await get(port, "/api/admin/payments/lookup?q=50%25", token("ADMIN"));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data.items, []);
  });
});

test("Payment lookup is for admins only and validates the query", async () => {
  let called = false;
  pool.execute = withUsers(async () => {
    called = true;
    return [[]];
  });
  await withServer(async (port) => {
    assert.equal((await get(port, "/api/admin/payments/lookup?q=1")).statusCode, 401);
    assert.equal((await get(port, "/api/admin/payments/lookup?q=1", token("CUSTOMER"))).statusCode, 403);
    assert.equal((await get(port, "/api/admin/payments/lookup?q=1", token("STAFF"))).statusCode, 403);
    assert.equal((await get(port, "/api/admin/payments/lookup", token("ADMIN"))).statusCode, 400);
    assert.equal((await get(port, `/api/admin/payments/lookup?q=${"x".repeat(129)}`, token("ADMIN"))).statusCode, 400);
    assert.equal((await get(port, "/api/admin/payments/lookup?q=1&x=2", token("ADMIN"))).statusCode, 400);
  });
  assert.equal(called, false);
});
