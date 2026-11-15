const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-customer-catalog-secret-32-bytes";
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

const activeTypes = Array.from({ length: 101 }, (_, index) => ({
  vehicle_type_id: index + 1,
  type_name: `Type ${index + 1}`,
  description: null,
  status: "ACTIVE",
  created_at: null,
  updated_at: null,
}));
const activeBrands = [{
  brand_id: 12,
  brand_name: "Brand 12",
  status: "ACTIVE",
  created_at: null,
  updated_at: null,
}];
const activeModels = [{
  model_id: 21,
  brand_id: 12,
  brand_name: "Brand 12",
  vehicle_type_id: 3,
  type_name: "Type 3",
  model_name: "Model 21",
  model_year_start: 2018,
  model_year_end: null,
  status: "ACTIVE",
  created_at: null,
  updated_at: null,
}];
const modelsWithActiveStatus = [
  ...activeModels,
  {
    model_id: 22,
    brand_id: 12,
    brand_name: "Brand 12",
    vehicle_type_id: 999,
    type_name: "Inactive type",
    model_name: "Model 22",
    model_year_start: 2020,
    model_year_end: null,
    status: "ACTIVE",
    created_at: null,
    updated_at: null,
  },
];

function installCatalogQueries({ fail = false, expectFilters = null } = {}) {
  pool.execute = async (sql, values) => {
    if (fail) throw new Error("private database query detail");
    assert.match(sql, /status = \?/);
    if (sql.includes("FROM vehicle_types")) {
      assert.equal(values[0], "ACTIVE");
      if (sql.includes("COUNT(*)")) return [[{ total: activeTypes.length }]];
      return [[...activeTypes.slice(values[2], values[2] + values[1])]];
    }
    if (sql.includes("FROM vehicle_brands")) {
      assert.equal(values[0], "ACTIVE");
      if (sql.includes("COUNT(*)")) return [[{ total: activeBrands.length }]];
      return [[...activeBrands.slice(values[2], values[2] + values[1])]];
    }
    if (sql.includes("FROM vehicle_models vm")) {
      const activeTypeOnly = /vt\.status = 'ACTIVE'/i.test(sql);
      if (expectFilters) {
        assert.deepEqual(values.slice(0, 3), [
          expectFilters.brand_id,
          expectFilters.vehicle_type_id,
          "ACTIVE",
        ]);
        assert.equal(activeTypeOnly, true);
      } else {
        assert.equal(values[0], "ACTIVE");
      }
      const resultModels = activeTypeOnly ? activeModels : modelsWithActiveStatus;
      if (sql.includes("COUNT(*)")) {
        return [[{ total: resultModels.length }]];
      }
      const offset = expectFilters ? values[4] : values[2];
      const limit = expectFilters ? values[3] : values[1];
      return [[...resultModels.slice(offset, offset + limit)]];
    }
    throw new Error(`Unexpected catalog query: ${sql}`);
  };
}

after(() => {
  pool.execute = originalExecute;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test("Customer can read active catalog records with consistent formats", async () => {
  installCatalogQueries();

  await withServer(async (port) => {
    const paths = [
      ["/api/customer/catalog/vehicle-types", activeTypes.length],
      ["/api/customer/catalog/vehicle-brands", activeBrands.length],
      ["/api/customer/catalog/vehicle-models", activeModels.length],
    ];

    for (const [path, expectedCount] of paths) {
      const response = await sendRequest(port, path, createToken());
      assert.equal(response.statusCode, 200);
      assert.equal(response.payload.status, "success");
      assert.equal(response.payload.data.items.length, expectedCount);
      assert.equal(response.payload.data.items[0].status, "ACTIVE");
    }
  });
});

test("Customer model filters are passed to the existing model query", async () => {
  installCatalogQueries({
    expectFilters: { brand_id: 12, vehicle_type_id: 3 },
  });

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/catalog/vehicle-models?brand_id=12&vehicle_type_id=3",
      createToken(),
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.items.length, 1);
    assert.equal(response.payload.data.items[0].brand_id, 12);
    assert.equal(response.payload.data.items[0].vehicle_type_id, 3);
  });
});

test("Customer vehicle model catalog excludes active models with inactive types", async () => {
  installCatalogQueries();

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/catalog/vehicle-models",
      createToken(),
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.payload.data.items.map((model) => model.model_id),
      [21],
    );
    assert.equal(response.payload.data.items[0].vehicle_type_id, 3);
  });
});

test("Admin vehicle model catalog still includes active models with inactive types", async () => {
  installCatalogQueries();

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/admin/vehicle-models?status=ACTIVE",
      createToken("ADMIN"),
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.payload.data.items.map((model) => model.model_id),
      [21, 22],
    );
  });
});

test("Invalid and unsupported catalog filters are rejected before querying", async () => {
  let queryCount = 0;
  pool.execute = async () => {
    queryCount += 1;
    throw new Error("Invalid filters must not query the database.");
  };

  await withServer(async (port) => {
    const urls = [
      "/api/customer/catalog/vehicle-models?brand_id=abc",
      "/api/customer/catalog/vehicle-models?vehicle_type_id=0",
      "/api/customer/catalog/vehicle-models?user_id=50",
      "/api/customer/catalog/vehicle-models?brand_id=12&brand_id=13",
      "/api/customer/catalog/vehicle-types?user_id=50",
    ];

    for (const path of urls) {
      const response = await sendRequest(port, path, createToken());
      assert.equal(response.statusCode, 400);
    }
    assert.equal(queryCount, 0);
  });
});

test("Admin and unauthenticated callers cannot read Customer catalogs", async () => {
  let queryCount = 0;
  pool.execute = async () => {
    queryCount += 1;
    throw new Error("Unauthorized requests must not query the database.");
  };

  await withServer(async (port) => {
    const customerCatalogPath = "/api/customer/catalog/vehicle-types";
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

test("Catalog database errors return a safe error response", async () => {
  installCatalogQueries({ fail: true });

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/catalog/vehicle-models",
      createToken(),
    );
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(
      JSON.stringify(response.payload),
      /private database query detail/,
    );
  });
});
