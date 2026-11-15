const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");
const authService = require("../Auth/services/authService");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const originalJwtExpiresIn = process.env.JWT_EXPIRES_IN;
const testPassword = "test-only-password";
const passwordHash = bcrypt.hashSync(testPassword, 4);
const testSecret = "test-only-jwt-secret-with-at-least-32-bytes";

process.env.JWT_SECRET = testSecret;
process.env.JWT_EXPIRES_IN = "1h";

function mockUser(user) {
  pool.execute = async (sql, values) => {
    assert.match(sql, /FROM users WHERE email = \? LIMIT 1/);
    assert.deepEqual(values, [user.email]);
    return [[user]];
  };
}

function postJson(port, path, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    request.end(JSON.stringify(body));
  });
}

for (const role of ["ADMIN", "CUSTOMER"]) {
  test(`login issues database role claims for ${role}`, async () => {
    const user = {
      user_id: role === "ADMIN" ? 11 : 22,
      full_name: "Test User",
      email: `${role.toLowerCase()}@example.test`,
      password_hash: passwordHash,
      role,
      status: "ACTIVE",
    };
    mockUser(user);

    const result = await authService.login(user.email, testPassword);
    const claims = jwt.verify(result.accessToken, testSecret);

    assert.equal(claims.user_id, user.user_id);
    assert.equal(claims.role, role);
    assert.equal(result.user.user_id, user.user_id);
    assert.equal(result.user.role, role);
    assert.equal(Object.hasOwn(result.user, "password_hash"), false);
  });
}

test("shared and legacy login paths use the same response contract", async () => {
  const user = {
    user_id: 11,
    full_name: "Test Admin",
    email: "admin@example.test",
    password_hash: passwordHash,
    role: "ADMIN",
    status: "ACTIVE",
  };
  mockUser(user);

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const port = server.address().port;
    const body = { email: user.email, password: testPassword };
    const shared = await postJson(port, "/api/auth/login", body);
    const legacy = await postJson(port, "/api/admin/auth/login", body);

    assert.equal(shared.statusCode, 200);
    assert.equal(legacy.statusCode, 200);
    assert.equal(shared.payload.data.user.role, "ADMIN");
    assert.equal(legacy.payload.data.user.role, "ADMIN");
    assert.equal(
      Object.hasOwn(shared.payload.data.user, "password_hash"),
      false,
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("login rejects an invalid password", async () => {
  const user = {
    user_id: 11,
    email: "admin@example.test",
    password_hash: passwordHash,
    role: "ADMIN",
    status: "ACTIVE",
  };
  mockUser(user);

  await assert.rejects(
    authService.login(user.email, "incorrect-password"),
    authService.AuthenticationError,
  );
});

test("login rejects inactive accounts", async () => {
  const user = {
    user_id: 11,
    email: "admin@example.test",
    password_hash: passwordHash,
    role: "ADMIN",
    status: "INACTIVE",
  };
  mockUser(user);

  await assert.rejects(
    authService.login(user.email, testPassword),
    authService.AuthenticationError,
  );
});

test("login rejects roles outside ADMIN and CUSTOMER", async () => {
  const user = {
    user_id: 33,
    email: "staff@example.test",
    password_hash: passwordHash,
    role: "STAFF",
    status: "ACTIVE",
  };
  mockUser(user);

  await assert.rejects(
    authService.login(user.email, testPassword),
    authService.AuthenticationError,
  );
});

after(() => {
  pool.execute = originalExecute;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
  if (originalJwtExpiresIn === undefined) {
    delete process.env.JWT_EXPIRES_IN;
  } else {
    process.env.JWT_EXPIRES_IN = originalJwtExpiresIn;
  }
});
