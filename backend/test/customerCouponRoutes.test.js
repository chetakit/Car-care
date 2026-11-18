const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-customer-coupon-list-secret";
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

test("Customers can list only currently usable coupons", async () => {
  const coupons = [{
    coupon_id: 1,
    coupon_code: "SAVE10",
    description: "Save ten percent",
    discount_type: "PERCENT",
    discount_value: "10.00",
    max_discount: "100.00",
    min_order_amount: "200.00",
  }];
  pool.execute = async (sql) => {
    assert.match(sql, /status = 'ACTIVE'/);
    // Coupon dates are entered in Thai time; the database clock is UTC.
    assert.match(sql, /\(UTC_TIMESTAMP\(\) \+ INTERVAL 7 HOUR\) >= start_date/);
    assert.match(sql, /\(UTC_TIMESTAMP\(\) \+ INTERVAL 7 HOUR\) <= end_date/);
    assert.match(sql, /used_count < usage_limit/);
    return [coupons];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/coupons/available",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload, {
      status: "success",
      data: { items: coupons },
    });
  });
});

test("Only authenticated customers can list coupons", async () => {
  let queryCount = 0;
  pool.execute = async () => {
    queryCount += 1;
    throw new Error("Unauthorized requests must not query the database.");
  };

  await withServer(async (port) => {
    const path = "/api/customer/coupons/available";
    const adminResponse = await sendRequest(port, path, createToken("ADMIN"));
    const missingTokenResponse = await sendRequest(port, path);
    assert.equal(adminResponse.statusCode, 403);
    assert.equal(missingTokenResponse.statusCode, 401);
  });
  assert.equal(queryCount, 0);
});
