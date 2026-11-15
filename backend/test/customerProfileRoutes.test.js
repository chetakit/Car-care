const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-customer-profile-secret-32-bytes";
process.env.JWT_SECRET = testSecret;

function createToken(role, userId = 42) {
  return jwt.sign({ user_id: userId, role }, testSecret, { expiresIn: "1h" });
}

function sendRequest(port, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
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

function customerProfile(overrides = {}) {
  return {
    user_id: 42,
    full_name: "Customer Name",
    email: "customer@example.test",
    phone: "0123456789",
    role: "CUSTOMER",
    status: "ACTIVE",
    created_at: "2026-11-14 10:00:00",
    ...overrides,
  };
}

test("Customer can read their own safe profile", async () => {
  pool.execute = async (sql, values) => {
    assert.match(sql, /WHERE user_id = \?/);
    assert.doesNotMatch(sql, /password_hash/);
    assert.deepEqual(values, [42]);
    return [[customerProfile()]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "GET",
      "/api/customer/profile?user_id=999",
      createToken("CUSTOMER"),
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data.user, customerProfile());
    assert.equal(
      Object.hasOwn(response.payload.data.user, "password_hash"),
      false,
    );
  });
});

test("Customer can update only their own name and phone", async () => {
  let updatedProfile = customerProfile();
  pool.execute = async (sql, values) => {
    if (sql.startsWith("UPDATE users")) {
      assert.match(sql, /SET full_name = \?, phone = \?/);
      assert.match(sql, /WHERE user_id = \? AND role = 'CUSTOMER'/);
      assert.deepEqual(values, ["Updated Name", "0987654321", 42]);
      updatedProfile = customerProfile({
        full_name: values[0],
        phone: values[1],
      });
      return [{ affectedRows: 1 }];
    }

    assert.match(sql, /WHERE user_id = \?/);
    assert.deepEqual(values, [42]);
    return [[updatedProfile]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "PATCH",
      "/api/customer/profile?user_id=999",
      createToken("CUSTOMER"),
      { full_name: "  Updated Name  ", phone: "  0987654321 " },
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.user.user_id, 42);
    assert.equal(response.payload.data.user.full_name, "Updated Name");
    assert.equal(response.payload.data.user.phone, "0987654321");
    assert.equal(response.payload.data.user.email, "customer@example.test");
  });
});

test("Profile APIs reject missing and invalid tokens", async () => {
  pool.execute = async () => {
    throw new Error("Requests without valid tokens must not query users.");
  };

  await withServer(async (port) => {
    for (const token of [undefined, "not-a-jwt"]) {
      const response = await sendRequest(
        port,
        "GET",
        "/api/customer/profile",
        token,
      );
      assert.equal(response.statusCode, 401);
    }
  });
});

test("Admin is forbidden from Customer profile endpoints", async () => {
  pool.execute = async () => {
    throw new Error("Admin requests must be rejected before database access.");
  };

  await withServer(async (port) => {
    const getResponse = await sendRequest(
      port,
      "GET",
      "/api/customer/profile",
      createToken("ADMIN"),
    );
    const patchResponse = await sendRequest(
      port,
      "PATCH",
      "/api/customer/profile",
      createToken("ADMIN"),
      { full_name: "Changed by Admin" },
    );

    assert.equal(getResponse.statusCode, 403);
    assert.equal(patchResponse.statusCode, 403);
  });
});

test("Profile update rejects email, role, status, password hash and user ID", async () => {
  pool.execute = async () => {
    throw new Error("Forbidden profile fields must not reach the database.");
  };

  await withServer(async (port) => {
    for (const field of [
      "email",
      "role",
      "status",
      "password_hash",
      "user_id",
    ]) {
      const response = await sendRequest(
        port,
        "PATCH",
        "/api/customer/profile",
        createToken("CUSTOMER"),
        { [field]: "forbidden" },
      );
      assert.equal(response.statusCode, 400, `${field} must be rejected`);
    }
  });
});

test("Profile APIs return 404 when the authenticated account is missing", async () => {
  pool.execute = async (sql) => {
    if (sql.startsWith("UPDATE users")) return [{ affectedRows: 0 }];
    return [[]];
  };

  await withServer(async (port) => {
    const getResponse = await sendRequest(
      port,
      "GET",
      "/api/customer/profile",
      createToken("CUSTOMER"),
    );
    const patchResponse = await sendRequest(
      port,
      "PATCH",
      "/api/customer/profile",
      createToken("CUSTOMER"),
      { phone: null },
    );

    assert.equal(getResponse.statusCode, 404);
    assert.equal(patchResponse.statusCode, 404);
  });
});

test("Profile APIs handle database errors without exposing details", async () => {
  pool.execute = async () => {
    throw new Error("private database failure detail");
  };

  await withServer(async (port) => {
    const getResponse = await sendRequest(
      port,
      "GET",
      "/api/customer/profile",
      createToken("CUSTOMER"),
    );
    const patchResponse = await sendRequest(
      port,
      "PATCH",
      "/api/customer/profile",
      createToken("CUSTOMER"),
      { full_name: "Valid Name" },
    );

    assert.equal(getResponse.statusCode, 500);
    assert.equal(patchResponse.statusCode, 500);
    assert.doesNotMatch(JSON.stringify(getResponse.payload), /private database/);
    assert.doesNotMatch(JSON.stringify(patchResponse.payload), /private database/);
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
