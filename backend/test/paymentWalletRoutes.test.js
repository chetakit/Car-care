const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalGetConnection = pool.getConnection;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-payment-wallet-route-secret";
process.env.JWT_SECRET = testSecret;

function createToken(role = "CUSTOMER", userId = 101) {
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

function toCents(value) {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function fromCents(value) {
  const amount = BigInt(value);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}

function createDatabase(options = {}) {
  const state = {
    booking: options.booking === null
      ? null
      : {
          booking_id: 77,
          user_id: 101,
          final_amount: "25.00",
          booking_status: "CONFIRMED",
          ...options.booking,
        },
    payments: (options.payments || []).map((payment, index) => ({
      payment_id: 301 + index,
      booking_id: 77,
      amount: "25.00",
      payment_method: "SIMULATED",
      payment_status: "PENDING",
      transaction_ref: null,
      paid_at: null,
      created_at: "2026-11-14 10:00:00",
      updated_at: "2026-11-14 10:00:00",
      ...payment,
    })),
    wallets: (options.wallets === undefined
      ? [{ wallet_id: 501, user_id: 101, balance: "100.00" }]
      : options.wallets
    ).map((wallet) => ({
      created_at: "2026-11-01 10:00:00",
      updated_at: "2026-11-14 10:00:00",
      ...wallet,
    })),
    walletTransactions: [],
    queries: [],
    poolQueries: [],
    commits: 0,
    rollbacks: 0,
    releases: 0,
    connections: 0,
    paymentStatusUpdates: 0,
    nextPaymentId: 900,
    nextWalletTransactionId: 1200,
    failOn: options.failOn,
  };

  function snapshot() {
    return {
      payments: state.payments.map((row) => ({ ...row })),
      wallets: state.wallets.map((row) => ({ ...row })),
      walletTransactions: state.walletTransactions.map((row) => ({ ...row })),
      nextPaymentId: state.nextPaymentId,
      nextWalletTransactionId: state.nextWalletTransactionId,
    };
  }

  function restore(saved) {
    state.payments = saved.payments;
    state.wallets = saved.wallets;
    state.walletTransactions = saved.walletTransactions;
    state.nextPaymentId = saved.nextPaymentId;
    state.nextWalletTransactionId = saved.nextWalletTransactionId;
  }

  let transactionTail = Promise.resolve();

  function rowsOf(row) {
    return row ? [{ ...row }] : [];
  }

  function executeQuery(sql, values = []) {
    const query = sql.replace(/\s+/g, " ").trim();
    const normalized = query.toUpperCase();
    state.queries.push({ sql: query, values });

    if (normalized.includes("FROM BOOKINGS") && normalized.includes("FOR UPDATE")) {
      return [rowsOf(
        state.booking && Number(state.booking.booking_id) === Number(values[0])
          ? state.booking
          : null,
      )];
    }

    if (
      normalized.startsWith("SELECT PAYMENT_ID FROM PAYMENTS WHERE TRANSACTION_REF")
    ) {
      return [rowsOf(
        state.payments.find((payment) => payment.transaction_ref === values[0]),
      )];
    }

    if (
      normalized.includes("FROM WALLET_TRANSACTIONS") &&
      normalized.includes("TRANSACTION_TYPE = 'DEBIT'")
    ) {
      return [rowsOf(
        state.walletTransactions.find(
          (transaction) =>
            Number(transaction.booking_id) === Number(values[0]) &&
            transaction.transaction_type === "DEBIT",
        ),
      )];
    }

    if (
      normalized.startsWith("SELECT PAYMENT_ID, BOOKING_ID") &&
      normalized.includes("FROM PAYMENTS") &&
      normalized.includes("WHERE BOOKING_ID = ? FOR UPDATE")
    ) {
      return [rowsOf(
        state.payments.find(
          (payment) => Number(payment.booking_id) === Number(values[0]),
        ),
      )];
    }

    if (
      normalized.startsWith("SELECT PAYMENT_ID, BOOKING_ID") &&
      normalized.includes("FROM PAYMENTS") &&
      normalized.includes("WHERE PAYMENT_ID = ?")
    ) {
      if (state.failOn === "paymentSelectById") {
        throw new Error("simulated payment lookup failure");
      }
      return [rowsOf(
        state.payments.find(
          (payment) => Number(payment.payment_id) === Number(values[0]),
        ),
      )];
    }

    if (
      normalized.includes("FROM PAYMENTS P INNER JOIN BOOKINGS B") &&
      normalized.includes("WHERE P.BOOKING_ID = ?")
    ) {
      const payment = state.payments.find(
        (row) => Number(row.booking_id) === Number(values[0]),
      );
      if (!payment || !state.booking) return [[]];
      return [[{ ...payment, user_id: state.booking.user_id }]];
    }

    if (
      normalized.startsWith("SELECT WALLET_ID, BALANCE") &&
      normalized.includes("FROM WALLETS") &&
      normalized.includes("WHERE USER_ID = ?")
    ) {
      return [rowsOf(
        state.wallets.find(
          (wallet) => Number(wallet.user_id) === Number(values[0]),
        ),
      )];
    }

    if (
      normalized.startsWith("SELECT WALLET_ID, BALANCE") &&
      normalized.includes("FROM WALLETS") &&
      normalized.includes("WHERE WALLET_ID = ?")
    ) {
      return [rowsOf(
        state.wallets.find(
          (wallet) => Number(wallet.wallet_id) === Number(values[0]),
        ),
      )];
    }

    if (normalized.startsWith("SELECT WALLET_ID, USER_ID, BALANCE")) {
      state.poolQueries.push({ sql: query, values });
      return [rowsOf(
        state.wallets.find(
          (wallet) => Number(wallet.user_id) === Number(values[0]),
        ),
      )];
    }

    if (normalized.startsWith("UPDATE WALLETS SET BALANCE = BALANCE - ?")) {
      const wallet = state.wallets.find(
        (row) => Number(row.wallet_id) === Number(values[1]),
      );
      const amountCents = toCents(values[0]);
      if (!wallet || toCents(wallet.balance) < amountCents) {
        return [{ affectedRows: 0 }];
      }
      wallet.balance = fromCents(toCents(wallet.balance) - amountCents);
      return [{ affectedRows: 1 }];
    }

    if (normalized.startsWith("INSERT INTO WALLET_TRANSACTIONS")) {
      if (state.failOn === "walletTransactionInsert") {
        throw new Error("simulated wallet transaction insert failure");
      }
      state.walletTransactions.push({
        wallet_transaction_id: state.nextWalletTransactionId++,
        wallet_id: values[0],
        booking_id: values[1],
        transaction_type: "DEBIT",
        amount: values[2],
        description: values[3],
      });
      return [{ insertId: state.nextWalletTransactionId - 1, affectedRows: 1 }];
    }

    if (normalized.startsWith("INSERT INTO PAYMENTS")) {
      const walletPayment = normalized.includes("TRANSACTION_REF");
      const payment = walletPayment
        ? {
            payment_id: state.nextPaymentId++,
            booking_id: values[0],
            amount: values[1],
            payment_method: "WALLET",
            payment_status: "PAID",
            transaction_ref: values[2],
            paid_at: "2026-11-14 10:00:00",
            created_at: "2026-11-14 10:00:00",
            updated_at: "2026-11-14 10:00:00",
          }
        : {
            payment_id: state.nextPaymentId++,
            booking_id: values[0],
            amount: values[1],
            payment_method: values[2],
            payment_status: "PENDING",
            transaction_ref: null,
            paid_at: null,
            created_at: "2026-11-14 10:00:00",
            updated_at: "2026-11-14 10:00:00",
          };
      state.payments.push(payment);
      return [{ insertId: payment.payment_id, affectedRows: 1 }];
    }

    if (normalized.startsWith("UPDATE PAYMENTS SET PAYMENT_STATUS = ?")) {
      state.paymentStatusUpdates += 1;
      const payment = state.payments.find(
        (row) => Number(row.payment_id) === Number(values[3]),
      );
      if (payment && payment.payment_status === "PENDING") {
        payment.payment_status = values[0];
        payment.transaction_ref = values[1];
        payment.paid_at = values[2] === "PAID" ? "2026-11-14 10:00:00" : null;
        payment.updated_at = "2026-11-14 10:01:00";
      }
      return [{ affectedRows: payment ? 1 : 0 }];
    }

    if (normalized.startsWith("UPDATE PAYMENTS SET AMOUNT = ?")) {
      const payment = state.payments.find(
        (row) => Number(row.payment_id) === Number(values[2]),
      );
      if (payment && payment.payment_status === "PENDING") {
        payment.amount = values[0];
        payment.payment_method = "WALLET";
        payment.payment_status = "PAID";
        payment.transaction_ref = values[1];
        payment.paid_at = "2026-11-14 10:00:00";
        payment.updated_at = "2026-11-14 10:01:00";
      }
      return [{ affectedRows: payment ? 1 : 0 }];
    }

    throw new Error(`Unexpected mocked database query: ${query}`);
  }

  return {
    state,
    async poolExecute(sql, values) {
      return executeQuery(sql, values);
    },
    async getConnection() {
      state.connections += 1;
      let saved;
      let releaseTransaction;
      return {
        async beginTransaction() {
          const previous = transactionTail;
          transactionTail = new Promise((resolve) => {
            releaseTransaction = resolve;
          });
          await previous;
          saved = snapshot();
        },
        async execute(sql, values) {
          return executeQuery(sql, values);
        },
        async commit() {
          state.commits += 1;
          releaseTransaction?.();
        },
        async rollback() {
          state.rollbacks += 1;
          restore(saved);
          releaseTransaction?.();
        },
        release() {
          state.releases += 1;
        },
        destroy() {},
      };
    },
  };
}

function useDatabase(database) {
  pool.execute = database.poolExecute;
  pool.getConnection = database.getConnection;
}

after(() => {
  pool.execute = originalExecute;
  pool.getConnection = originalGetConnection;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test("Simulated payment creation uses the booking amount and rejects duplicates", async () => {
  const database = createDatabase();
  useDatabase(database);

  await withServer(async (port) => {
    const path = "/api/payments/77";
    const token = createToken();
    const created = await sendRequest(
      port,
      "POST",
      path,
      token,
      { payment_method: "SIMULATED" },
    );
    assert.equal(created.statusCode, 201);
    assert.equal(created.payload.status, "success");
    assert.deepEqual(
      {
        booking_id: created.payload.data.booking_id,
        amount: created.payload.data.amount,
        payment_method: created.payload.data.payment_method,
        payment_status: created.payload.data.payment_status,
      },
      {
        booking_id: 77,
        amount: "25.00",
        payment_method: "SIMULATED",
        payment_status: "PENDING",
      },
    );

    const duplicate = await sendRequest(
      port,
      "POST",
      path,
      token,
      { payment_method: "SIMULATED" },
    );
    assert.equal(duplicate.statusCode, 409);
    assert.equal(database.state.payments.length, 1);
    assert.equal(database.state.commits, 1);
    assert.equal(database.state.rollbacks, 1);
  });

  assert.ok(database.state.queries.some(
    ({ sql }) => /FROM bookings[\s\S]*FOR UPDATE/i.test(sql),
  ));
  assert.ok(database.state.queries.some(
    ({ sql }) => /FROM payments[\s\S]*FOR UPDATE/i.test(sql),
  ));
  assert.equal(database.state.releases, 2);
});

test("Payment creation rejects zero-value, cancelled, no-show, and unavailable bookings", async () => {
  const cases = [
    { booking: { final_amount: "0.00" }, statusCode: 400 },
    { booking: { booking_status: "CANCELLED" }, statusCode: 400 },
    { booking: { booking_status: "NO_SHOW" }, statusCode: 400 },
    { booking: null, statusCode: 404 },
  ];

  for (const options of cases) {
    const database = createDatabase(options);
    useDatabase(database);
    await withServer(async (port) => {
      const response = await sendRequest(
        port,
        "POST",
        "/api/payments/77",
        createToken(),
        { payment_method: "SIMULATED" },
      );
      assert.equal(response.statusCode, options.statusCode);
      assert.equal(database.state.payments.length, 0);
      assert.equal(database.state.commits, 0);
      assert.equal(database.state.rollbacks, 1);
    });
  }
});

test("Customers cannot create payments for another customer's booking", async () => {
  const database = createDatabase({ booking: { user_id: 202 } });
  useDatabase(database);

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/payments/77",
      createToken("CUSTOMER", 101),
      { payment_method: "SIMULATED" },
    );
    assert.equal(response.statusCode, 404);
    assert.equal(database.state.payments.length, 0);
    assert.equal(database.state.rollbacks, 1);
  });
});

test("Simulated payments can be marked PAID or FAILED and duplicate results are idempotent", async () => {
  for (const paymentStatus of ["PAID", "FAILED"]) {
    const database = createDatabase({
      payments: [{ payment_method: "SIMULATED" }],
    });
    useDatabase(database);

    await withServer(async (port) => {
      const path = "/api/payments/77/simulate";
      const token = createToken();
      const first = await sendRequest(
        port,
        "POST",
        path,
        token,
        { payment_status: paymentStatus },
      );
      const duplicate = await sendRequest(
        port,
        "POST",
        path,
        token,
        { payment_status: paymentStatus },
      );

      assert.equal(first.statusCode, 200);
      assert.equal(first.payload.data.payment_status, paymentStatus);
      assert.equal(duplicate.statusCode, 200);
      assert.equal(
        duplicate.payload.data.transaction_ref,
        first.payload.data.transaction_ref,
      );
      assert.match(first.payload.data.transaction_ref, /^SIM-/);
      assert.equal(
        Boolean(first.payload.data.paid_at),
        paymentStatus === "PAID",
      );
      assert.equal(database.state.paymentStatusUpdates, 1);
      assert.equal(database.state.commits, 2);
    });
  }
});

test("Simulation rejects non-SIMULATED payments, invalid results, and terminal transitions", async () => {
  for (const options of [
    {
      payments: [{ payment_method: "WALLET" }],
      result: "PAID",
      statusCode: 400,
      transactionStarted: true,
    },
    {
      payments: [{ payment_status: "PAID" }],
      result: "FAILED",
      statusCode: 409,
      transactionStarted: true,
    },
    {
      payments: [{ payment_status: "FAILED" }],
      result: "PAID",
      statusCode: 409,
      transactionStarted: true,
    },
    {
      payments: [{ payment_status: "PENDING" }],
      result: "PENDING",
      statusCode: 400,
      transactionStarted: false,
    },
  ]) {
    const database = createDatabase({ payments: options.payments });
    useDatabase(database);
    await withServer(async (port) => {
      const response = await sendRequest(
        port,
        "POST",
        "/api/payments/77/simulate",
        createToken(),
        { payment_status: options.result },
      );
      assert.equal(response.statusCode, options.statusCode);
      assert.equal(database.state.paymentStatusUpdates, 0);
      assert.equal(database.state.rollbacks, options.transactionStarted ? 1 : 0);
    });
  }
});

test("Wallet payment debits the balance and records the payment atomically", async () => {
  const database = createDatabase();
  useDatabase(database);

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/payments/77/wallet",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.status, "success");
    assert.equal(response.payload.data.payment.payment_method, "WALLET");
    assert.equal(response.payload.data.payment.payment_status, "PAID");
    assert.equal(response.payload.data.payment.amount, "25.00");
    assert.equal(response.payload.data.wallet.balance, "75.00");
  });

  assert.equal(database.state.wallets[0].balance, "75.00");
  assert.equal(database.state.walletTransactions.length, 1);
  assert.equal(database.state.walletTransactions[0].transaction_type, "DEBIT");
  assert.equal(database.state.walletTransactions[0].amount, "25.00");
  assert.equal(database.state.payments.length, 1);
  assert.equal(database.state.commits, 1);
  assert.equal(database.state.rollbacks, 0);
  assert.ok(database.state.queries.some(
    ({ sql }) => /FROM bookings[\s\S]*FOR UPDATE/i.test(sql),
  ));
  assert.ok(database.state.queries.some(
    ({ sql }) => /FROM wallets[\s\S]*FOR UPDATE/i.test(sql),
  ));
  assert.ok(database.state.queries.some(
    ({ sql }) => /FROM wallet_transactions[\s\S]*FOR UPDATE/i.test(sql),
  ));
});

test("Wallet payment completes an existing pending simulated payment", async () => {
  const database = createDatabase({
    payments: [{ payment_method: "SIMULATED", payment_status: "PENDING" }],
  });
  useDatabase(database);

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/payments/77/wallet",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.payment.payment_id, 301);
    assert.equal(response.payload.data.payment.payment_method, "WALLET");
    assert.equal(response.payload.data.payment.payment_status, "PAID");
  });
  assert.equal(database.state.payments.length, 1);
  assert.equal(database.state.walletTransactions.length, 1);
  assert.equal(database.state.wallets[0].balance, "75.00");
});

test("Wallet payment rejects insufficient balance, missing wallets, and already-paid bookings", async () => {
  const cases = [
    {
      options: { wallets: [{ wallet_id: 501, user_id: 101, balance: "24.99" }] },
      statusCode: 400,
    },
    { options: { wallets: [] }, statusCode: 400 },
    {
      options: { payments: [{ payment_method: "SIMULATED", payment_status: "PAID" }] },
      statusCode: 409,
    },
    {
      options: { payments: [{ payment_method: "SIMULATED", payment_status: "FAILED" }] },
      statusCode: 409,
    },
  ];

  for (const { options, statusCode } of cases) {
    const database = createDatabase(options);
    useDatabase(database);
    await withServer(async (port) => {
      const response = await sendRequest(
        port,
        "POST",
        "/api/payments/77/wallet",
        createToken(),
      );
      assert.equal(response.statusCode, statusCode);
      assert.equal(database.state.walletTransactions.length, 0);
      assert.equal(database.state.commits, 0);
      assert.equal(database.state.rollbacks, 1);
    });
    assert.equal(
      database.state.wallets[0]?.balance ?? null,
      options.wallets?.[0]?.balance ?? (options.wallets ? null : "100.00"),
    );
  }
});

test("Wallet payment rejects cancelled, no-show, and unavailable bookings", async () => {
  const cases = [
    { booking: { booking_status: "CANCELLED" }, statusCode: 400 },
    { booking: { booking_status: "NO_SHOW" }, statusCode: 400 },
    { booking: null, statusCode: 404 },
  ];

  for (const options of cases) {
    const database = createDatabase(options);
    useDatabase(database);
    await withServer(async (port) => {
      const response = await sendRequest(
        port,
        "POST",
        "/api/payments/77/wallet",
        createToken(),
      );
      assert.equal(response.statusCode, options.statusCode);
      assert.equal(database.state.wallets[0].balance, "100.00");
      assert.equal(database.state.walletTransactions.length, 0);
      assert.equal(database.state.payments.length, 0);
      assert.equal(database.state.rollbacks, 1);
    });
  }
});

test("Duplicate concurrent wallet requests create only one debit and payment", async () => {
  const database = createDatabase();
  useDatabase(database);

  await withServer(async (port) => {
    const token = createToken();
    const responses = await Promise.all([
      sendRequest(port, "POST", "/api/payments/77/wallet", token),
      sendRequest(port, "POST", "/api/payments/77/wallet", token),
    ]);
    assert.deepEqual(
      responses.map((response) => response.statusCode).sort(),
      [200, 409],
    );
  });

  assert.equal(database.state.wallets[0].balance, "75.00");
  assert.equal(database.state.walletTransactions.length, 1);
  assert.equal(database.state.payments.length, 1);
  assert.equal(database.state.commits, 1);
  assert.equal(database.state.rollbacks, 1);
});

test("Wallet payment rolls back its balance debit when transaction recording fails", async () => {
  const database = createDatabase({ failOn: "walletTransactionInsert" });
  useDatabase(database);

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/payments/77/wallet",
      createToken(),
    );
    assert.equal(response.statusCode, 500);
    assert.equal(response.payload.message, "Unable to process payment request.");
    assert.doesNotMatch(JSON.stringify(response.payload), /simulated wallet/);
  });

  assert.equal(database.state.wallets[0].balance, "100.00");
  assert.equal(database.state.walletTransactions.length, 0);
  assert.equal(database.state.payments.length, 0);
  assert.equal(database.state.commits, 0);
  assert.equal(database.state.rollbacks, 1);
  assert.equal(database.state.releases, 1);
});

test("Customers cannot pay another customer's booking or access another wallet", async () => {
  const database = createDatabase({ booking: { user_id: 202 } });
  useDatabase(database);

  await withServer(async (port) => {
    const token = createToken("CUSTOMER", 101);
    const payment = await sendRequest(
      port,
      "POST",
      "/api/payments/77/wallet",
      token,
    );
    assert.equal(payment.statusCode, 404);

    const ownWallet = await sendRequest(
      port,
      "GET",
      "/api/wallet",
      token,
    );
    assert.equal(ownWallet.statusCode, 200);
    assert.equal(database.state.poolQueries.at(-1).values[0], 101);

    const otherWallet = await sendRequest(
      port,
      "GET",
      "/api/wallet?user_id=202",
      token,
    );
    assert.equal(otherWallet.statusCode, 403);
    assert.equal(database.state.poolQueries.length, 1);
  });
  assert.equal(database.state.wallets[0].balance, "100.00");
  assert.equal(database.state.walletTransactions.length, 0);
});

test("Customers receive a zero-balance response for a missing wallet", async () => {
  const database = createDatabase({ wallets: [] });
  useDatabase(database);

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "GET",
      "/api/wallet",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data, {
      wallet_id: null,
      user_id: 101,
      balance: "0.00",
      created_at: null,
      updated_at: null,
    });
  });
});

test("Admin can create a payment and retrieve another customer's wallet", async () => {
  const database = createDatabase({
    booking: { user_id: 202 },
    wallets: [{ wallet_id: 502, user_id: 202, balance: "12.34" }],
  });
  useDatabase(database);

  await withServer(async (port) => {
    const adminToken = createToken("ADMIN", 9);
    const payment = await sendRequest(
      port,
      "POST",
      "/api/payments/77",
      adminToken,
      { payment_method: "SIMULATED" },
    );
    assert.equal(payment.statusCode, 201);

    const wallet = await sendRequest(
      port,
      "GET",
      "/api/wallet?user_id=202",
      adminToken,
    );
    assert.equal(wallet.statusCode, 200);
    assert.equal(wallet.payload.data.user_id, 202);
    assert.equal(wallet.payload.data.balance, "12.34");
  });
});

test("Payment and wallet routes enforce authentication and allowed roles", async () => {
  let databaseCalls = 0;
  const database = createDatabase();
  const originalGetConnectionForTest = database.getConnection;
  database.getConnection = async () => {
    databaseCalls += 1;
    return originalGetConnectionForTest();
  };
  const originalPoolExecuteForTest = database.poolExecute;
  database.poolExecute = async (...args) => {
    databaseCalls += 1;
    return originalPoolExecuteForTest(...args);
  };
  useDatabase(database);

  await withServer(async (port) => {
    const missing = await sendRequest(
      port,
      "POST",
      "/api/payments/77",
      undefined,
      { payment_method: "SIMULATED" },
    );
    const staff = await sendRequest(
      port,
      "POST",
      "/api/payments/77",
      createToken("STAFF"),
      { payment_method: "SIMULATED" },
    );
    const missingWallet = await sendRequest(
      port,
      "GET",
      "/api/wallet",
      undefined,
    );
    assert.equal(missing.statusCode, 401);
    assert.equal(staff.statusCode, 403);
    assert.equal(missingWallet.statusCode, 401);
  });
  assert.equal(databaseCalls, 0);
});
