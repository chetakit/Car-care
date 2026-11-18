const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-customer-service-catalog-secret";
process.env.JWT_SECRET = testSecret;

function createToken(role = "CUSTOMER") {
  return jwt.sign({ user_id: 50, role }, testSecret, { expiresIn: "1h" });
}

function sendRequest(port, path, token) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
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

after(() => {
  pool.execute = originalExecute;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test("Customer can list active services with both slash forms", async () => {
  let listQueryCount = 0;
  pool.execute = async (sql, values) => {
    assert.match(sql, /FROM services/);
    assert.match(sql, /status = \?/);
    assert.equal(values[0], "ACTIVE");
    listQueryCount += 1;
    if (sql.includes("COUNT(*)")) {
      return [[{ total: 1 }]];
    }
    return [[{
      service_id: 7,
      service_name: "Oil change",
      description: "Engine oil service",
      duration_minutes: 45,
      status: "ACTIVE",
      created_at: null,
      updated_at: null,
    }]];
  };

  await withServer(async (port) => {
    for (const path of [
      "/api/customer/catalog/services",
      "/api/customer/catalog/services/",
    ]) {
      const response = await sendRequest(port, path, createToken());
      assert.equal(response.statusCode, 200);
      assert.equal(response.payload.status, "success");
      assert.equal(response.payload.data.items.length, 1);
      assert.equal(response.payload.data.items[0].duration_minutes, 45);
      assert.equal(response.payload.data.items[0].status, "ACTIVE");
    }
  });
  assert.equal(listQueryCount, 4);
});

test("Guests can list active services from the read-only public catalog", async () => {
  let queryCount = 0;
  pool.execute = async (sql, values) => {
    queryCount += 1;
    if (sql.includes("FROM service_prices")) {
      // Only prices for active vehicle types are public.
      assert.match(sql, /vt\.status = 'ACTIVE'/);
      assert.deepEqual(values, [7]);
      return [[
        { service_id: 7, vehicle_type_id: 2, type_name: "Hatchback", price: "300.00" },
        { service_id: 7, vehicle_type_id: 3, type_name: "SUV", price: "450.00" },
      ]];
    }
    assert.match(sql, /FROM services/);
    assert.match(sql, /status = \?/);
    if (sql.includes("COUNT(*)")) {
      assert.deepEqual(values, ["ACTIVE"]);
      return [[{ total: 1 }]];
    }
    assert.deepEqual(values, ["ACTIVE", 100, 0]);
    return [[{
      service_id: 7,
      service_name: "Oil change",
      description: "Engine oil service",
      duration_minutes: 45,
      status: "ACTIVE",
      created_at: null,
      updated_at: null,
    }]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/public/catalog/services",
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.status, "success");
    assert.deepEqual(response.payload.data.items, [{
      service_id: 7,
      service_name: "Oil change",
      description: "Engine oil service",
      duration_minutes: 45,
      prices: [
        { vehicle_type_id: 2, type_name: "Hatchback", price: "300.00" },
        { vehicle_type_id: 3, type_name: "SUV", price: "450.00" },
      ],
    }]);
  });
  assert.equal(queryCount, 3);
});

test("Customer prices are filtered by service and vehicle type", async () => {
  const expectedPrice = {
    service_price_id: 11,
    service_id: 7,
    vehicle_type_id: 3,
    type_name: "SUV",
    price: "1250.00",
    created_at: null,
    updated_at: null,
  };
  pool.execute = async (sql, values) => {
    if (sql.includes("FROM services")) {
      assert.match(sql, /service_id = \?/);
      assert.deepEqual(values, [7]);
      return [[{
        service_id: 7,
        service_name: "Oil change",
        description: null,
        duration_minutes: 45,
        status: "ACTIVE",
        created_at: null,
        updated_at: null,
      }]];
    }

    assert.match(sql, /FROM service_prices sp/);
    assert.match(sql, /sp\.service_id = \?\s+AND sp\.vehicle_type_id = \?/);
    assert.match(sql, /vt\.status = 'ACTIVE'/);
    assert.deepEqual(values, [7, 3]);
    return [[expectedPrice]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/catalog/services/7/prices?vehicle_type_id=3",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data.items, [expectedPrice]);
  });
});

test("Customer service prices are not returned for inactive vehicle types", async () => {
  pool.execute = async (sql, values) => {
    if (sql.includes("FROM services")) {
      assert.deepEqual(values, [7]);
      return [[{
        service_id: 7,
        service_name: "Oil change",
        description: null,
        duration_minutes: 45,
        status: "ACTIVE",
        created_at: null,
        updated_at: null,
      }]];
    }

    assert.match(sql, /FROM service_prices sp/);
    assert.match(sql, /vt\.status = 'ACTIVE'/);
    assert.deepEqual(values, [7, 999]);
    return [[]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/catalog/services/7/prices?vehicle_type_id=999",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data.items, []);
  });
});

test("Invalid service and vehicle type IDs are rejected before database access", async () => {
  let queryCount = 0;
  pool.execute = async () => {
    queryCount += 1;
    throw new Error("Invalid IDs must not query the database.");
  };

  await withServer(async (port) => {
    for (const path of [
      "/api/customer/catalog/services/0/prices?vehicle_type_id=3",
      "/api/customer/catalog/services/nope/prices?vehicle_type_id=3",
      "/api/customer/catalog/services/7/prices?vehicle_type_id=0",
      "/api/customer/catalog/services/7/prices",
      "/api/customer/catalog/services/7/prices?vehicle_type_id=3&user_id=50",
      "/api/customer/catalog/services?status=ACTIVE",
    ]) {
      const response = await sendRequest(port, path, createToken());
      assert.equal(response.statusCode, 400, path);
    }
  });
  assert.equal(queryCount, 0);
});

test("Missing or inactive services are unavailable for customer pricing", async () => {
  pool.execute = async (sql) => {
    if (sql.includes("FROM services")) {
      return [[{
        service_id: 7,
        service_name: "Oil change",
        description: null,
        duration_minutes: 45,
        status: "INACTIVE",
        created_at: null,
        updated_at: null,
      }]];
    }
    throw new Error("Inactive service prices must not be queried.");
  };

  await withServer(async (port) => {
    const inactiveResponse = await sendRequest(
      port,
      "/api/customer/catalog/services/7/prices?vehicle_type_id=3",
      createToken(),
    );
    assert.equal(inactiveResponse.statusCode, 404);
    assert.equal(inactiveResponse.payload.message, "Service not found.");

    pool.execute = async () => [[]];
    const missingResponse = await sendRequest(
      port,
      "/api/customer/catalog/services/999/prices?vehicle_type_id=3",
      createToken(),
    );
    assert.equal(missingResponse.statusCode, 404);
    assert.equal(missingResponse.payload.message, "Service not found.");
  });
});

test("Admin and unauthenticated callers cannot access Customer service catalogs", async () => {
  let queryCount = 0;
  pool.execute = async () => {
    queryCount += 1;
    throw new Error("Unauthorized requests must not query the database.");
  };

  await withServer(async (port) => {
    const customerCatalogPath = "/api/customer/catalog/services";
    const adminResponse = await sendRequest(
      port,
      customerCatalogPath,
      createToken("ADMIN"),
    );
    const missingTokenResponse = await sendRequest(port, customerCatalogPath);

    assert.equal(adminResponse.statusCode, 403);
    assert.equal(missingTokenResponse.statusCode, 401);
    assert.equal(queryCount, 0);
  });
});

test("Service catalog database errors return a safe response", async () => {
  pool.execute = async () => {
    throw new Error("private database query detail");
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/catalog/services/",
      createToken(),
    );
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(
      JSON.stringify(response.payload),
      /private database query detail/,
    );
  });
});
