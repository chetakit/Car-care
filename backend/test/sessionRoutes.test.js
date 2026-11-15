const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-session-secret-with-at-least-32-bytes";
process.env.JWT_SECRET = testSecret;

function createToken(role, userId = 9, expiresIn = "1h") {
  return jwt.sign({ user_id: userId, role }, testSecret, { expiresIn });
}

function sendRequest(port, method, path, token) {
  return new Promise((resolve, reject) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers,
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

function databaseUser(role, overrides = {}) {
  return {
    user_id: 9,
    full_name: "Test User",
    email: "test@example.test",
    phone: "0123456789",
    role,
    status: "ACTIVE",
    password_hash: "must-not-be-selected-or-returned",
    ...overrides,
  };
}

for (const role of ["ADMIN", "CUSTOMER"]) {
  test(`/api/auth/me returns safe database profile for ${role}`, async () => {
    const user = databaseUser(role);
    pool.execute = async (sql, values) => {
      assert.match(sql, /FROM users\s+WHERE user_id = \?/);
      assert.doesNotMatch(sql, /password_hash/);
      assert.deepEqual(values, [user.user_id]);
      return [[user]];
    };

    await withServer(async (port) => {
      const response = await sendRequest(
        port,
        "GET",
        "/api/auth/me",
        createToken(role),
      );

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.payload.data.user, {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role,
      });
      assert.equal(
        Object.hasOwn(response.payload.data.user, "password_hash"),
        false,
      );
    });
  });
}

test("session endpoint rejects a role that no longer matches the database", async () => {
  pool.execute = async () => [[databaseUser("CUSTOMER")]];

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "GET",
      "/api/auth/me",
      createToken("ADMIN"),
    );
    assert.equal(response.statusCode, 401);
    assert.equal(response.payload.message, "Invalid or expired token.");
  });
});

test("session endpoint rejects inactive accounts", async () => {
  pool.execute = async () => [
    [databaseUser("CUSTOMER", { status: "INACTIVE" })],
  ];

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "GET",
      "/api/auth/me",
      createToken("CUSTOMER"),
    );
    assert.equal(response.statusCode, 401);
  });
});

for (const role of ["ADMIN", "CUSTOMER"]) {
  test(`/api/auth/logout accepts authenticated ${role} sessions`, async () => {
    await withServer(async (port) => {
      const response = await sendRequest(
        port,
        "POST",
        "/api/auth/logout",
        createToken(role),
      );

      assert.equal(response.statusCode, 200);
      assert.equal(response.payload.status, "success");
      assert.match(response.payload.message, /stateless token remains valid/);
    });
  });
}

test("shared session endpoints reject invalid and expired tokens", async () => {
  pool.execute = async () => {
    throw new Error("Invalid tokens must be rejected before database access.");
  };

  await withServer(async (port) => {
    for (const token of ["not-a-jwt", createToken("CUSTOMER", 9, -1)]) {
      const response = await sendRequest(
        port,
        "GET",
        "/api/auth/me",
        token,
      );
      assert.equal(response.statusCode, 401);
      assert.equal(response.payload.message, "Invalid or expired token.");
    }

    const logoutResponse = await sendRequest(
      port,
      "POST",
      "/api/auth/logout",
      "not-a-jwt",
    );
    assert.equal(logoutResponse.statusCode, 401);
  });
});

test("legacy Admin session endpoints remain Admin-only", async () => {
  await withServer(async (port) => {
    const customerResponse = await sendRequest(
      port,
      "GET",
      "/api/admin/auth/me",
      createToken("CUSTOMER"),
    );
    const adminResponse = await sendRequest(
      port,
      "GET",
      "/api/admin/auth/me",
      createToken("ADMIN"),
    );

    assert.equal(customerResponse.statusCode, 403);
    assert.equal(adminResponse.statusCode, 200);
    assert.equal(adminResponse.payload.data.user.role, "ADMIN");
  });
});

after(() => {
  pool.execute = originalExecute;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});
