const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");
const { matchRule, changedFields, clean } = require("../shared/middleware/auditTrail");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-audit-secret";
process.env.JWT_SECRET = testSecret;

const ROLE_IDS = { ADMIN: 1, CUSTOMER: 2, STAFF: 3 };
const token = (role) => jwt.sign({ user_id: ROLE_IDS[role], role }, testSecret, { expiresIn: "1h" });

function request(port, method, path, auth, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
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
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

after(() => {
  pool.execute = originalExecute;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

test("Important admin and staff routes map to readable audit actions", () => {
  assert.equal(matchRule("PATCH", "/api/admin/users/9/role").rule.action, "USER_ROLE_CHANGED");
  assert.equal(matchRule("PUT", "/api/admin/services/3/prices").rule.action, "SERVICE_PRICES_UPDATED");
  assert.equal(matchRule("PATCH", "/api/admin/coupons/2/status").rule.action, "COUPON_STATUS_CHANGED");
  assert.equal(matchRule("POST", "/api/admin/coupons").rule.action, "COUPON_CREATED");
  assert.equal(matchRule("POST", "/api/payments/77/verify").rule.action, "PAYMENT_VERIFIED");
  assert.equal(matchRule("POST", "/api/cancellations/77").rule.action, "BOOKING_CANCELLED");
  assert.equal(matchRule("PATCH", "/api/staff/bookings/77/status").rule.action, "BOOKING_STATUS_CHANGED");
  assert.equal(matchRule("PATCH", "/api/admin/users/9/role").id, "9");
  assert.equal(matchRule("GET", "/api/admin/users/9"), null);
  assert.equal(matchRule("POST", "/api/customer/bookings"), null);
});

test("Only changed fields are kept, and secrets never reach the log", () => {
  assert.deepEqual(
    changedFields({ role: "CUSTOMER", status: "ACTIVE", email: "a@b.c" }, { role: "STAFF", status: "ACTIVE", email: "a@b.c" }),
    { before: { role: "CUSTOMER" }, after: { role: "STAFF" } },
  );
  assert.deepEqual(clean({ email: "a@b.c", password: "x", password_hash: "y", nested: { token: "z", ok: 1 } }), {
    email: "a@b.c",
    nested: { ok: 1 },
  });
});

test("An admin changing a user's role is logged with the before and after values", async () => {
  let role = "CUSTOMER";
  const inserts = [];
  pool.execute = async (sql, values) => {
    if (sql.includes("SELECT role, status FROM users WHERE user_id = ?")) return [[{ role: "ADMIN", status: "ACTIVE" }]];
    if (sql.startsWith("SELECT * FROM users WHERE user_id = ?")) {
      return [[{ user_id: 9, full_name: "Somchai", role, status: "ACTIVE", password_hash: "secret" }]];
    }
    if (sql.startsWith("INSERT INTO audit_logs")) {
      inserts.push(values);
      return [{ affectedRows: 1 }];
    }
    // The role change itself (userService): read the user, update, read again.
    if (sql.startsWith("UPDATE users SET role")) {
      role = values[0];
      return [{ affectedRows: 1 }];
    }
    return [[{ user_id: 9, full_name: "Somchai", email: "s@x.test", phone: null, role, status: "ACTIVE" }]];
  };
  await withServer(async (port) => {
    const response = await request(port, "PATCH", "/api/admin/users/9/role", token("ADMIN"), { role: "STAFF" });
    assert.equal(response.statusCode, 200, JSON.stringify(response.payload));
    await wait(300);
  });
  assert.equal(inserts.length, 1);
  const [userId, action, table, recordId, oldValue, newValue] = inserts[0];
  assert.deepEqual([userId, action, table, recordId], [1, "USER_ROLE_CHANGED", "users", "9"]);
  assert.deepEqual(JSON.parse(oldValue), { role: "CUSTOMER" });
  assert.deepEqual(JSON.parse(newValue), { role: "STAFF" });
  assert.ok(!oldValue.includes("secret") && !newValue.includes("secret"));
});

test("Rejected or customer requests are not logged and cost no audit query", async () => {
  const calls = [];
  pool.execute = async (sql) => {
    calls.push(sql);
    if (sql.includes("SELECT role, status FROM users")) return [[{ role: "CUSTOMER", status: "ACTIVE" }]];
    return [[]];
  };
  await withServer(async (port) => {
    const response = await request(port, "PATCH", "/api/admin/users/9/role", token("CUSTOMER"), { role: "ADMIN" });
    assert.equal(response.statusCode, 403);
    await wait(30);
  });
  assert.ok(calls.every((sql) => !sql.includes("audit_logs") && !sql.startsWith("SELECT * FROM users")));
});

test("Admins can read the audit log; nobody else can", async () => {
  pool.execute = async (sql, values) => {
    if (sql.includes("SELECT role, status FROM users WHERE user_id = ?")) {
      const role = Object.keys(ROLE_IDS).find((key) => ROLE_IDS[key] === values[0]);
      return [[{ role, status: "ACTIVE" }]];
    }
    if (sql.includes("COUNT(*) AS total")) return [[{ total: 1 }]];
    assert.match(sql, /a\.action LIKE \?/);
    assert.equal(values[0], "PAYMENT%");
    return [[{
      audit_log_id: 5,
      action: "PAYMENT_VERIFIED",
      table_name: "payments",
      record_id: "77",
      old_value: '{"payment_status":"PENDING"}',
      new_value: '{"payment_status":"PAID"}',
      reason: null,
      created_at: "2026-11-22T03:00:00Z",
      user_id: 3,
      full_name: "Staff",
      email: "staff@x.test",
      role: "STAFF",
    }]];
  };
  await withServer(async (port) => {
    const ok = await request(port, "GET", "/api/admin/audit-logs?action=payment", token("ADMIN"));
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.payload.data.items[0].old_value, { payment_status: "PENDING" });
    assert.equal(ok.payload.data.items[0].actor.role, "STAFF");
    assert.equal(ok.payload.data.pagination.total, 1);
    assert.equal((await request(port, "GET", "/api/admin/audit-logs", token("STAFF"))).statusCode, 403);
    assert.equal((await request(port, "GET", "/api/admin/audit-logs")).statusCode, 401);
    assert.equal((await request(port, "GET", "/api/admin/audit-logs?limit=500", token("ADMIN"))).statusCode, 400);
    assert.equal((await request(port, "GET", "/api/admin/audit-logs?action=1;DROP", token("ADMIN"))).statusCode, 400);
  });
});
