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

function statusDatabase({ payment = null, debits = [], verifications = [], status = "IN_SERVICE" } = {}) {
  const state = { status, commits: 0, rollbacks: 0, history: 0, queries: [] };
  const connection = {
    beginTransaction: async () => {},
    commit: async () => { state.commits += 1; },
    rollback: async () => { state.rollbacks += 1; },
    release: () => {},
    execute: async (sql, values) => {
      state.queries.push({ sql, values });
      if (sql.includes("FROM bookings") && sql.includes("FOR UPDATE")) {
        return [[{ booking_id: 5, user_id: 8, final_amount: "25.00", booking_status: state.status }]];
      }
      if (sql.includes("FROM payments") && sql.includes("FOR UPDATE")) {
        assert.deepEqual(values, ["25.00", 5]);
        assert.match(sql, /amount = \? AND amount > 0/);
        return [Array.isArray(payment) ? payment : payment ? [payment] : []];
      }
      if (sql.includes("FROM wallet_transactions")) {
        assert.deepEqual(values, [payment.amount, 5, 8]);
        assert.match(sql, /wt\.amount = \?/);
        assert.match(sql, /wt\.booking_id = \?/);
        assert.match(sql, /wt\.refund_id IS NULL AND w\.user_id = \?/);
        assert.match(sql, /FOR UPDATE/);
        return [debits];
      }
      if (sql.includes("FROM payment_verifications")) {
        assert.deepEqual(values, [payment.payment_id, payment.payment_method, payment.amount]);
        assert.match(sql, /FOR UPDATE/);
        return [verifications];
      }
      if (sql.startsWith("UPDATE bookings")) {
        assert.deepEqual(values, ["COMPLETED", 5, "IN_SERVICE"]);
        state.status = "COMPLETED";
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO booking_status_history")) {
        state.history += 1;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  pool.getConnection = async () => connection;
  pool.execute = async (sql) => {
    if (sql.includes("FROM bookings b")) {
      return [[{ booking_id: 5, booking_status: state.status, payment_status: "PAID",
        payment_method: "WALLET", final_amount: "25.00" }]];
    }
    if (sql.includes("FROM booking_services") || sql.includes("FROM vehicle_check_ins") ||
        sql.includes("FROM booking_status_history") || sql.includes("FROM booking_notes")) return [[]];
    throw new Error(`Unexpected detail query: ${sql}`);
  };
  return state;
}

test("completion requires a full verified Wallet payment and a matching owner debit", async () => {
  const paid = { payment_id: 3, payment_status: "PAID", payment_method: "WALLET", amount: "25.00", amount_matches: 1, paid_at: "2026-11-15" };
  const debit = { wallet_id: 3, amount_matches: 1 };
  const cases = [
    { name: "no payment", payment: null },
    { name: "pending", payment: { ...paid, payment_status: "PENDING" } },
    { name: "failed", payment: { ...paid, payment_status: "FAILED" } },
    { name: "simulated pending", payment: { ...paid, payment_method: "SIMULATED", payment_status: "PENDING" } },
    { name: "unverified cash", payment: { ...paid, payment_method: "CASH" } },
    { name: "unverified transfer", payment: { ...paid, payment_method: "BANK_TRANSFER" } },
    { name: "missing paid timestamp", payment: { ...paid, paid_at: null } },
    { name: "duplicate payments", payment: [paid, paid] },
    { name: "wrong payment amount", payment: { ...paid, amount_matches: 0 } },
    { name: "missing debit", payment: paid },
    { name: "wrong debit amount", payment: paid, debits: [{ ...debit, amount_matches: 0 }] },
    { name: "duplicate debits", payment: paid, debits: [debit, debit] },
  ];
  await withServer(async (port) => {
    for (const fixture of cases) {
      const state = statusDatabase(fixture);
      const response = await sendRequest(port, "PATCH", "/api/staff/bookings/5/status", createToken(), {
        status: "COMPLETED", reason: "Service finished",
      });
      assert.equal(response.statusCode, 409, fixture.name);
      assert.equal(state.status, "IN_SERVICE", fixture.name);
      assert.equal(state.history, 0, fixture.name);
      assert.equal(state.rollbacks, 1, fixture.name);
      assert.equal(state.commits, 0, fixture.name);
    }
  });
});

test("verified Wallet payment permits completion once, with transactional history", async () => {
  const state = statusDatabase({
    payment: { payment_id: 3, payment_status: "PAID", payment_method: "WALLET", amount: "25.00", amount_matches: 1, paid_at: "2026-11-15" },
    debits: [{ wallet_id: 3, amount_matches: 1 }],
  });
  await withServer(async (port) => {
    const body = { status: "COMPLETED", reason: "Service finished" };
    const response = await sendRequest(port, "PATCH", "/api/staff/bookings/5/status", createToken(), body);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.booking.booking_status, "COMPLETED");
    const duplicate = await sendRequest(port, "PATCH", "/api/staff/bookings/5/status", createToken(), body);
    assert.equal(duplicate.statusCode, 409);
  });
  assert.equal(state.commits, 1);
  assert.equal(state.rollbacks, 1);
  assert.equal(state.history, 1);
  assert.match(state.queries[0].sql, /FROM bookings[\s\S]*FOR UPDATE/);
  assert.match(state.queries[1].sql, /FROM payments[\s\S]*FOR UPDATE/);
});

test("authorized cash and transfer verifications permit completion", async () => {
  await withServer(async (port) => {
    for (const method of ["CASH", "BANK_TRANSFER"]) {
      const state = statusDatabase({
        payment: { payment_id: 3, payment_status: "PAID", payment_method: method,
          amount: "25.00", amount_matches: 1, paid_at: "2026-11-15" },
        verifications: [{ payment_id: 3 }],
      });
      const response = await sendRequest(port, "PATCH", "/api/staff/bookings/5/status", createToken(), {
        status: "COMPLETED", reason: "Service finished",
      });
      assert.equal(response.statusCode, 200);
      assert.equal(state.commits, 1);
      assert.equal(state.history, 1);
    }
  });
});

test("a paid simulated payment permits completion", async () => {
  const state = statusDatabase({
    payment: { payment_id: 3, payment_status: "PAID", payment_method: "SIMULATED",
      amount: "25.00", amount_matches: 1, paid_at: "2026-11-15" },
  });
  await withServer(async (port) => {
    const response = await sendRequest(port, "PATCH", "/api/staff/bookings/5/status", createToken(), {
      status: "COMPLETED", reason: "Service finished",
    });
    assert.equal(response.statusCode, 200);
  });
  assert.equal(state.commits, 1);
  assert.equal(state.history, 1);
});

test("no-show of a paid booking forfeits 100% (refund 0, fee = full amount)", async () => {
  const state = { status: "CONFIRMED", refunds: [], history: [], commits: 0 };
  const connection = {
    beginTransaction: async () => {},
    commit: async () => { state.commits += 1; },
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values) => {
      if (sql.includes("FROM bookings") && sql.includes("FOR UPDATE")) {
        return [[{ booking_id: 5, user_id: 8, final_amount: "25.00", booking_status: state.status, appointment_started: 1 }]];
      }
      if (sql.startsWith("UPDATE bookings")) {
        assert.deepEqual(values, ["NO_SHOW", 5, "CONFIRMED"]);
        state.status = "NO_SHOW";
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO booking_status_history")) {
        state.history.push(values);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("FROM payments") && sql.includes("FOR UPDATE")) {
        return [[{ payment_id: 3, booking_id: 5, amount: "25.00", payment_method: "SIMULATED", payment_status: "PAID" }]];
      }
      if (sql.includes("FROM refunds") && sql.includes("FOR UPDATE")) return [[]];
      if (sql.includes("INSERT INTO refunds")) {
        state.refunds.push({ sql, values });
        return [{ insertId: 70, affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  pool.getConnection = async () => connection;
  pool.execute = async (sql) => {
    if (sql.includes("FROM bookings b")) {
      return [[{ booking_id: 5, booking_status: state.status, final_amount: "25.00" }]];
    }
    return [[]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(port, "POST", "/api/staff/bookings/5/no-show", createToken(), {
      reason: "Did not arrive",
    });
    assert.equal(response.statusCode, 200);
  });
  assert.equal(state.status, "NO_SHOW");
  assert.equal(state.commits, 1);
  assert.equal(state.refunds.length, 1);
  assert.match(state.refunds[0].sql, /'0\.00'/);
  assert.deepEqual(state.refunds[0].values.slice(0, 3), [3, 5, "25.00"]);
  assert.match(state.refunds[0].values[3], /No-show \(100% forfeited\)/);
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
