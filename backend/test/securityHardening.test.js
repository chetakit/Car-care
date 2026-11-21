const assert = require("node:assert/strict");
const http = require("node:http");
const { after, beforeEach, test } = require("node:test");
const bcrypt = require("bcryptjs");
const app = require("../app");
const pool = require("../shared/config/db");
const { resetRateLimits } = require("../shared/middleware/rateLimit");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "test-only-security-secret-that-is-long-enough-1234";

const passwordHash = bcrypt.hashSync("correct-password", 4);

function send(port, method, path, rawBody, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          ...(rawBody !== undefined
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(rawBody) }
            : {}),
          ...headers,
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => resolve({ statusCode: response.statusCode, headers: response.headers, text }));
      },
    );
    req.on("error", reject);
    if (rawBody !== undefined) req.write(rawBody);
    req.end();
  });
}

const json = (port, method, path, body) => send(port, method, path, JSON.stringify(body));

async function withServer(callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await callback(server.address().port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

beforeEach(() => {
  resetRateLimits();
  pool.execute = async (sql) => {
    if (sql.includes("FROM users") && sql.includes("email")) {
      return [[{ user_id: 7, full_name: "Somchai", email: "somchai@example.test", role: "CUSTOMER", status: "ACTIVE", password_hash: passwordHash }]];
    }
    return [[]];
  };
});

after(() => {
  resetRateLimits();
  pool.execute = originalExecute;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

test("Five wrong passwords lock that account's sign-in for a while, even with the right password", async () => {
  await withServer(async (port) => {
    for (let i = 0; i < 5; i += 1) {
      const wrong = await json(port, "POST", "/api/auth/login", { email: "somchai@example.test", password: "guess" + i });
      assert.equal(wrong.statusCode, 401);
    }
    const blocked = await json(port, "POST", "/api/auth/login", { email: "SOMCHAI@example.test", password: "correct-password" });
    assert.equal(blocked.statusCode, 429);
    const body = JSON.parse(blocked.text);
    assert.equal(body.code, "TOO_MANY_ATTEMPTS");
    assert.ok(body.retry_after_seconds > 0 && body.retry_after_seconds <= 15 * 60);
    assert.equal(blocked.headers["retry-after"], String(body.retry_after_seconds));
    // The admin login path shares the same counter.
    const adminPath = await json(port, "POST", "/api/admin/auth/login", { email: "somchai@example.test", password: "x" });
    assert.equal(adminPath.statusCode, 429);
  });
});

test("A correct sign-in clears the wrong-password count", async () => {
  await withServer(async (port) => {
    for (let i = 0; i < 4; i += 1) {
      assert.equal((await json(port, "POST", "/api/auth/login", { email: "somchai@example.test", password: "nope" })).statusCode, 401);
    }
    assert.equal((await json(port, "POST", "/api/auth/login", { email: "somchai@example.test", password: "correct-password" })).statusCode, 200);
    for (let i = 0; i < 4; i += 1) {
      assert.equal((await json(port, "POST", "/api/auth/login", { email: "somchai@example.test", password: "nope" })).statusCode, 401);
    }
  });
});

test("Spraying one password across many emails is stopped per IP", async () => {
  await withServer(async (port) => {
    for (let i = 0; i < 20; i += 1) {
      const response = await json(port, "POST", "/api/auth/login", { email: `user${i}@example.test`, password: "Password1" });
      assert.equal(response.statusCode, 401, `attempt ${i}`);
    }
    assert.equal((await json(port, "POST", "/api/auth/login", { email: "new@example.test", password: "Password1" })).statusCode, 429);
  });
});

test("Sign-ups are limited per IP", async () => {
  let nextId = 100;
  pool.execute = async (sql) => {
    if (sql.trim().startsWith("INSERT INTO users")) return [{ insertId: (nextId += 1) }];
    return [[]];
  };
  await withServer(async (port) => {
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await json(port, "POST", "/api/customer/auth/register", {
        full_name: "Tester",
        email: `tester${i}@example.test`,
        password: "long-enough-password",
      });
      statuses.push(response.statusCode);
    }
    assert.equal(statuses[5], 429, statuses.join(","));
    assert.ok(statuses.slice(0, 5).every((status) => status !== 429), statuses.join(","));
  });
});

test("Sign-up refuses passwords shorter than 8 characters", async () => {
  await withServer(async (port) => {
    const response = await json(port, "POST", "/api/customer/auth/register", {
      full_name: "Tester",
      email: "short@example.test",
      password: "1234567",
    });
    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.text).message, /8 to 1024/);
  });
});

test("Broken JSON and unknown paths get short JSON, never a stack trace", async () => {
  await withServer(async (port) => {
    const broken = await send(port, "POST", "/api/auth/login", '{"email": "a@b.c", ');
    assert.equal(broken.statusCode, 400);
    assert.match(broken.headers["content-type"], /application\/json/);
    assert.deepEqual(JSON.parse(broken.text), { status: "error", message: "Request body is not valid JSON." });
    assert.ok(!/at |node_modules|\\|\/Users\//.test(broken.text));

    const huge = await send(port, "POST", "/api/auth/login", JSON.stringify({ email: "a".repeat(200 * 1024) }));
    assert.equal(huge.statusCode, 413);
    assert.match(huge.headers["content-type"], /application\/json/);

    const missing = await send(port, "GET", "/api/does-not-exist");
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(JSON.parse(missing.text), { status: "error", message: "Not found." });
    assert.equal(missing.headers["x-powered-by"], undefined);
  });
});
