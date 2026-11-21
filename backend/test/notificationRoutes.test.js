const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");
const notificationService = require("../shared/services/notificationService");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-notification-secret";
process.env.JWT_SECRET = testSecret;

const token = (role = "CUSTOMER", userId = 7) => jwt.sign({ user_id: userId, role }, testSecret, { expiresIn: "1h" });

function send(port, method, path, { auth, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request(
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
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

after(() => {
  pool.execute = originalExecute;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

test("Notifications need a login", async () => {
  await withServer(async (port) => {
    const response = await send(port, "GET", "/api/notifications");
    assert.equal(response.statusCode, 401);
  });
});

test("A user gets only their own notifications with the unread count", async () => {
  const seen = [];
  pool.execute = async (sql, values) => {
    seen.push({ sql, values });
    if (sql.includes("COUNT(*) AS unread")) return [[{ unread: 2 }]];
    assert.match(sql, /WHERE user_id = \?/);
    assert.match(sql, /LIMIT 5/);
    return [[
      { notification_id: 3, type: "SERVICE_COMPLETED", booking_id: 9, data: '{"plate":"1กข 1234"}', read_at: null, created_at: "2026-11-21T08:00:00Z" },
      { notification_id: 2, type: "PAYMENT_CONFIRMED", booking_id: 9, data: null, read_at: "2026-11-21T07:00:00Z", created_at: "2026-11-21T06:00:00Z" },
    ]];
  };
  await withServer(async (port) => {
    const response = await send(port, "GET", "/api/notifications?limit=5", { auth: token("CUSTOMER", 7) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.unread_count, 2);
    assert.deepEqual(response.payload.data.items[0].data, { plate: "1กข 1234" });
    assert.deepEqual(response.payload.data.items[1].data, {});
  });
  assert.ok(seen.every(({ values }) => values[0] === 7));
});

test("Marking notifications read only touches the caller's rows", async () => {
  const calls = [];
  pool.execute = async (sql, values) => {
    calls.push({ sql, values });
    return [{ affectedRows: values.length - 1 || 4 }];
  };
  await withServer(async (port) => {
    const some = await send(port, "POST", "/api/notifications/read", { auth: token("STAFF", 11), body: { ids: [4, 5] } });
    assert.equal(some.statusCode, 200);
    const all = await send(port, "POST", "/api/notifications/read", { auth: token("STAFF", 11), body: {} });
    assert.equal(all.statusCode, 200);
  });
  assert.match(calls[0].sql, /WHERE user_id = \? AND read_at IS NULL AND notification_id IN \(\?, \?\)/);
  assert.deepEqual(calls[0].values, [11, 4, 5]);
  assert.doesNotMatch(calls[1].sql, /notification_id IN/);
  assert.deepEqual(calls[1].values, [11]);
});

test("Invalid notification requests are rejected", async () => {
  let called = false;
  pool.execute = async () => {
    called = true;
    return [[]];
  };
  await withServer(async (port) => {
    for (const path of ["/api/notifications?limit=0", "/api/notifications?limit=51", "/api/notifications?user_id=1"]) {
      const response = await send(port, "GET", path, { auth: token() });
      assert.equal(response.statusCode, 400, path);
    }
    for (const body of [{ ids: "all" }, { ids: [0] }, { ids: [1.5] }, { user_id: 3 }]) {
      const response = await send(port, "POST", "/api/notifications/read", { auth: token(), body });
      assert.equal(response.statusCode, 400, JSON.stringify(body));
    }
  });
  assert.equal(called, false);
});

test("Before the migration is run the bell is simply empty", async () => {
  pool.execute = async () => {
    const error = new Error("Table 'car_care.notifications' doesn't exist");
    error.code = "ER_NO_SUCH_TABLE";
    error.errno = 1146;
    throw error;
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await withServer(async (port) => {
      const response = await send(port, "GET", "/api/notifications", { auth: token() });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.payload.data, { items: [], unread_count: 0 });
    });
  } finally {
    console.warn = originalWarn;
  }
});

test("notifyBooking tells the customer and, for today's bookings, the staff", async () => {
  const inserts = [];
  const connection = {
    async execute(sql, values) {
      if (sql.startsWith("SELECT b.user_id")) {
        return [[{ user_id: 7, date: "2026-11-21", start_time: "09:00", plate: "1กข 1234", is_today: 1 }]];
      }
      inserts.push({ sql, values });
      return [{ affectedRows: 1 }];
    },
  };
  await notificationService.notifyBooking(connection, 9, "PAYMENT_CONFIRMED", { amount: 300 }, {
    rolesIfToday: ["STAFF"],
    roleType: "NEW_BOOKING_TODAY",
  });
  assert.equal(inserts.length, 2);
  assert.deepEqual(inserts[0].values.slice(0, 3), [7, "PAYMENT_CONFIRMED", 9]);
  assert.deepEqual(JSON.parse(inserts[0].values[3]), { date: "2026-11-21", start_time: "09:00", plate: "1กข 1234", amount: 300 });
  assert.match(inserts[1].sql, /FROM users WHERE role = \? AND status = 'ACTIVE'/);
  assert.deepEqual([inserts[1].values[0], inserts[1].values[3]], ["NEW_BOOKING_TODAY", "STAFF"]);
});

test("A failing notification never breaks the action that triggered it", async () => {
  const connection = {
    async execute() {
      throw new Error("database hiccup");
    },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await notificationService.notifyBooking(connection, 9, "SERVICE_COMPLETED");
    await notificationService.notify(connection, { userId: 1, type: "NO_SHOW" });
  } finally {
    console.error = originalError;
  }
});
