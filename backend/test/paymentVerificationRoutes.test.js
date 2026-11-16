const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalGetConnection = pool.getConnection;
const originalSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "test-only-verification-secret";

function token(role, userId = 7) {
  return jwt.sign({ user_id: userId, role }, process.env.JWT_SECRET);
}

function request(port, body, auth) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, path: "/api/payments/5/verify", method: "POST",
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

async function withServer(run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await run(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function database({ method = "CASH", status = "PENDING", role = "STAFF", active = true,
  bookingStatus = "IN_SERVICE", amount = "25.00", usedReference = false, failUpdate = false } = {}) {
  const state = {
    payment: { payment_id: 10, booking_id: 5, amount, payment_method: method, payment_status: status },
    verification: null, commits: 0, rollbacks: 0, queries: [],
  };
  let tail = Promise.resolve();
  pool.execute = async (sql) => {
    if (sql.includes("SELECT role, status FROM users")) {
      return [[{ role, status: active ? "ACTIVE" : "INACTIVE" }]];
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  pool.getConnection = async () => {
    let release, saved;
    return {
      async beginTransaction() {
        const previous = tail;
        tail = new Promise((resolve) => { release = resolve; });
        await previous;
        saved = { payment: { ...state.payment }, verification: state.verification };
      },
      async execute(sql, values) {
        const query = sql.replace(/\s+/g, " ").trim();
        state.queries.push({ query, values });
        if (query.includes("FROM bookings") && query.includes("FOR UPDATE")) {
          return [[{ booking_id: 5, user_id: 22, final_amount: "25.00", booking_status: bookingStatus }]];
        }
        if (query.includes("FROM payments") && query.includes("FOR UPDATE")) return [[{ ...state.payment }]];
        if (query.startsWith("INSERT INTO payment_verifications")) {
          if (state.verification || (usedReference && values[4])) {
            const error = new Error("duplicate");
            error.code = "ER_DUP_ENTRY";
            throw error;
          }
          state.verification = values;
          return [{ affectedRows: 1 }];
        }
        if (query.startsWith("UPDATE payments")) {
          if (failUpdate) return [{ affectedRows: 0 }];
          state.payment.payment_status = "PAID";
          state.payment.paid_at = "2026-11-15 12:00:00";
          return [{ affectedRows: 1 }];
        }
        if (query.includes("FROM payments WHERE payment_id = ?")) return [[{ ...state.payment }]];
        throw new Error(`Unexpected transaction query: ${query}`);
      },
      async commit() { state.commits += 1; release(); },
      async rollback() {
        state.rollbacks += 1;
        state.payment = saved.payment;
        state.verification = saved.verification;
        release();
      },
      release() {},
      destroy() {},
    };
  };
  return state;
}

test("only active staff may confirm cash; staff or admin may verify transfers", async () => {
  await withServer(async (port) => {
    for (const fixture of [
      { method: "CASH", role: "STAFF", expected: 200 },
      { method: "CASH", role: "ADMIN", expected: 403 },
      { method: "BANK_TRANSFER", role: "STAFF", expected: 200 },
      { method: "BANK_TRANSFER", role: "ADMIN", expected: 200 },
      { method: "BANK_TRANSFER", role: "CUSTOMER", expected: 403 },
      { method: "BANK_TRANSFER", role: "STAFF", active: false, expected: 401 },
    ]) {
      const state = database(fixture);
      const body = { payment_method: fixture.method, amount: "25.00",
        ...(fixture.method === "BANK_TRANSFER" ? { transfer_reference: "BANK-123" } : {}) };
      const response = await request(port, body, token(fixture.role));
      assert.equal(response.status, fixture.expected, JSON.stringify(fixture));
      assert.equal(state.commits, fixture.expected === 200 ? 1 : 0);
      if (fixture.expected === 200) {
        assert.deepEqual(state.verification, [10, 7, fixture.method, "25.00",
          fixture.method === "BANK_TRANSFER" ? "BANK-123" : null]);
        assert.equal(state.payment.payment_status, "PAID");
        assert.match(state.queries[0].query, /FROM bookings.*FOR UPDATE/);
        assert.match(state.queries[1].query, /FROM payments.*FOR UPDATE/);
      }
    }
    database();
    assert.equal((await request(port, { payment_method: "CASH", amount: "25.00" })).status, 401);
  });
});

test("verification fails closed for terminal, mismatched and duplicate payments", async () => {
  await withServer(async (port) => {
    for (const fixture of [
      { status: "PAID" }, { status: "FAILED" }, { method: "SIMULATED" },
      { bookingStatus: "COMPLETED" }, { amount: "20.00" },
      { method: "BANK_TRANSFER", usedReference: true }, { failUpdate: true },
    ]) {
      const state = database(fixture);
      const method = fixture.method === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH";
      const response = await request(port, {
        payment_method: method, amount: "25.00",
        ...(method === "BANK_TRANSFER" ? { transfer_reference: "BANK-123" } : {}),
      }, token("STAFF"));
      assert.equal(response.status, 409, JSON.stringify(fixture));
      assert.equal(state.verification, null);
      assert.equal(state.payment.payment_status, fixture.status || "PENDING");
      assert.equal(state.rollbacks, 1);
    }
    database({ method: "BANK_TRANSFER" });
    assert.equal((await request(port, { payment_method: "BANK_TRANSFER", amount: "25.00" }, token("STAFF"))).status, 400);
    assert.equal((await request(port, { payment_method: "CASH", amount: "24.00" }, token("STAFF"))).status, 409);
  });
});

test("concurrent confirmation records one verification", async () => {
  const state = database();
  await withServer(async (port) => {
    const body = { payment_method: "CASH", amount: "25.00" };
    const results = await Promise.all([request(port, body, token("STAFF")), request(port, body, token("STAFF"))]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  });
  assert.equal(state.commits, 1);
  assert.equal(state.rollbacks, 1);
  assert.equal(state.payment.payment_status, "PAID");
  assert.ok(state.verification);
});

after(() => {
  pool.execute = originalExecute;
  pool.getConnection = originalGetConnection;
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});
