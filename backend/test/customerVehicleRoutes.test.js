const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalGetConnection = pool.getConnection;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-customer-vehicle-secret-32-bytes";
process.env.JWT_SECRET = testSecret;

function createToken(role = "CUSTOMER", userId = 50) {
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

function vehicle(overrides = {}) {
  return {
    vehicle_id: 70,
    model_id: 7,
    license_plate: "PLATE-70",
    production_year: 2020,
    province: "Bangkok",
    color: "Blue",
    status: "ACTIVE",
    model_name: "Model 7",
    brand_name: "Brand 7",
    type_name: "Sedan",
    ...overrides,
  };
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

test("Customer can list multiple owned vehicles with either collection URL", async () => {
  const rows = [vehicle(), vehicle({ vehicle_id: 71, license_plate: "PLATE-71" })];
  pool.execute = async (sql, values) => {
    assert.match(sql, /WHERE v\.user_id = \?/);
    assert.deepEqual(values, [50]);
    return [rows];
  };

  await withServer(async (port) => {
    for (const path of ["/api/customer/vehicles", "/api/customer/vehicles/"]) {
      const response = await sendRequest(
        port,
        "GET",
        `${path}?user_id=999`,
        createToken(),
      );
      assert.equal(response.statusCode, 200);
      assert.equal(response.payload.data.items.length, 2);
      assert.equal(response.payload.data.items[0].vehicle_id, 70);
      assert.equal(
        Object.hasOwn(response.payload.data.items[0], "user_id"),
        false,
      );
    }
  });
});

test("Customer can create a vehicle using an active model", async () => {
  let insertedColumns;
  let insertedValues;
  pool.execute = async (sql, values) => {
    if (sql.includes("FROM vehicle_models")) {
      assert.deepEqual(values, [7]);
      return [[{ model_id: 7 }]];
    }
    if (sql.includes("FROM vehicles") && sql.includes("WHERE license_plate")) {
      return [[]];
    }
    if (sql.startsWith("INSERT INTO vehicles")) {
      insertedColumns = sql.match(/INSERT INTO vehicles \(([^)]+)\)/)[1]
        .split(", ");
      insertedValues = values;
      return [{ insertId: 70, affectedRows: 1 }];
    }
    if (sql.includes("WHERE v.vehicle_id = ? AND v.user_id = ?")) {
      assert.deepEqual(values, [70, 50]);
      return [[vehicle()]];
    }
    throw new Error(`Unexpected vehicle query: ${sql}`);
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/customer/vehicles",
      createToken(),
      {
        model_id: 7,
        license_plate: "  PLATE-70 ",
        production_year: 2020,
        province: " Bangkok ",
        color: " Blue ",
      },
    );

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.data.vehicle.vehicle_id, 70);
    assert.equal(insertedColumns.includes("user_id"), true);
    assert.deepEqual(insertedValues, [
      50,
      7,
      "PLATE-70",
      2020,
      "Bangkok",
      "Blue",
      "ACTIVE",
    ]);
  });
});

test("Customer cannot create a vehicle with an inactive or missing model", async () => {
  let insertAttempted = false;
  pool.execute = async (sql) => {
    if (sql.includes("FROM vehicle_models")) return [[]];
    insertAttempted = true;
    throw new Error("Vehicle insert must not be attempted.");
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/customer/vehicles",
      createToken(),
      { model_id: 7, license_plate: "PLATE-70" },
    );

    assert.equal(response.statusCode, 400);
    assert.equal(insertAttempted, false);
  });
});

test("Customer can update owned vehicle fields", async () => {
  let updated = vehicle();
  pool.execute = async (sql, values) => {
    if (sql.includes("WHERE v.vehicle_id = ? AND v.user_id = ?")) {
      assert.deepEqual(values, [70, 50]);
      return [[updated]];
    }
    if (sql.includes("FROM vehicles") && sql.includes("WHERE license_plate")) {
      assert.deepEqual(values, ["NEW-PLATE", 70]);
      return [[]];
    }
    if (sql.startsWith("UPDATE vehicles")) {
      assert.match(sql, /WHERE vehicle_id = \? AND user_id = \?/);
      assert.deepEqual(values, ["NEW-PLATE", "Red", 70, 50]);
      updated = vehicle({ license_plate: values[0], color: values[1] });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected vehicle query: ${sql}`);
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "PATCH",
      "/api/customer/vehicles/70",
      createToken(),
      { license_plate: " NEW-PLATE ", color: " Red " },
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.vehicle.license_plate, "NEW-PLATE");
    assert.equal(response.payload.data.vehicle.color, "Red");
  });
});

test("Vehicle update rejects another customer's vehicle as not found", async () => {
  pool.execute = async (sql, values) => {
    assert.match(sql, /WHERE v\.vehicle_id = \? AND v\.user_id = \?/);
    assert.deepEqual(values, [70, 50]);
    return [[]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "PATCH",
      "/api/customer/vehicles/70",
      createToken(),
      { color: "Red" },
    );
    assert.equal(response.statusCode, 404);
  });
});

test("Vehicle endpoints require CUSTOMER authentication", async () => {
  pool.execute = async () => {
    throw new Error("Unauthorized requests must not query vehicles.");
  };

  await withServer(async (port) => {
    const missingToken = await sendRequest(
      port,
      "GET",
      "/api/customer/vehicles",
    );
    const invalidToken = await sendRequest(
      port,
      "GET",
      "/api/customer/vehicles",
      "not-a-jwt",
    );
    const adminToken = await sendRequest(
      port,
      "GET",
      "/api/customer/vehicles",
      createToken("ADMIN"),
    );

    assert.equal(missingToken.statusCode, 401);
    assert.equal(invalidToken.statusCode, 401);
    assert.equal(adminToken.statusCode, 403);
  });
});

test("Vehicle create rejects client-supplied user_id", async () => {
  pool.execute = async () => {
    throw new Error("Invalid input must not reach the database.");
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/customer/vehicles",
      createToken(),
      { user_id: 999, model_id: 7, license_plate: "PLATE-70" },
    );
    assert.equal(response.statusCode, 400);
  });
});

test("Vehicle deletion is blocked when a booking references it", async () => {
  let rolledBack = false;
  let deleteAttempted = false;
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql, values) => {
      if (sql.includes("FROM vehicles") && sql.includes("FOR UPDATE")) {
        assert.deepEqual(values, [70, 50]);
        return [[{ vehicle_id: 70 }]];
      }
      if (sql.includes("FROM bookings")) {
        assert.deepEqual(values, [70]);
        return [[{ booking_id: 101 }]];
      }
      if (sql.startsWith("DELETE FROM vehicles")) {
        deleteAttempted = true;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    commit: async () => {},
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {},
    destroy: () => {},
  });

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "DELETE",
      "/api/customer/vehicles/70",
      createToken(),
    );
    assert.equal(response.statusCode, 409);
    assert.equal(rolledBack, true);
    assert.equal(deleteAttempted, false);
  });
});

test("Customer can delete an owned vehicle with no bookings", async () => {
  let committed = false;
  let deleted = false;
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql, values) => {
      if (sql.includes("FROM vehicles") && sql.includes("FOR UPDATE")) {
        assert.deepEqual(values, [70, 50]);
        return [[{ vehicle_id: 70 }]];
      }
      if (sql.includes("FROM bookings")) return [[]];
      if (sql.startsWith("DELETE FROM vehicles")) {
        assert.deepEqual(values, [70, 50]);
        deleted = true;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    commit: async () => {
      committed = true;
    },
    rollback: async () => {},
    release: () => {},
    destroy: () => {},
  });

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "DELETE",
      "/api/customer/vehicles/70",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.equal(deleted, true);
    assert.equal(committed, true);
  });
});

test("Missing owned vehicle returns 404 for update and delete", async () => {
  pool.execute = async () => [[]];
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async () => [[]],
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    destroy: () => {},
  });

  await withServer(async (port) => {
    const updateResponse = await sendRequest(
      port,
      "PATCH",
      "/api/customer/vehicles/70",
      createToken(),
      { color: "Red" },
    );
    const deleteResponse = await sendRequest(
      port,
      "DELETE",
      "/api/customer/vehicles/70",
      createToken(),
    );
    assert.equal(updateResponse.statusCode, 404);
    assert.equal(deleteResponse.statusCode, 404);
  });
});

test("Vehicle database errors return a safe error response", async () => {
  pool.execute = async () => {
    throw new Error("private database detail");
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "GET",
      "/api/customer/vehicles",
      createToken(),
    );
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(JSON.stringify(response.payload), /private database/);
  });
});
