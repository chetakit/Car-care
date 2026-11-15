const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-customer-schedule-availability-secret";
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

test("Customer can retrieve available schedules with remaining capacity", async () => {
  const schedules = [
    {
      schedule_id: 7,
      schedule_date: "2026-11-20",
      start_time: "09:00:00",
      end_time: "10:30:00",
      capacity: 4,
      booked_count: 1,
      remaining_capacity: 3,
    },
    {
      schedule_id: 8,
      schedule_date: "2026-11-20",
      start_time: "11:00:00",
      end_time: "12:30:00",
      capacity: 2,
      booked_count: 0,
      remaining_capacity: 2,
    },
  ];
  pool.execute = async (sql, values) => {
    assert.match(sql, /s\.schedule_date BETWEEN \? AND \?/);
    assert.match(sql, /s\.status = 'AVAILABLE'/);
    assert.match(sql, /s\.schedule_date > CURRENT_DATE\(\)/);
    assert.match(
      sql,
      /s\.schedule_date = CURRENT_DATE\(\)\s+AND s\.start_time > CURRENT_TIME\(\)/,
    );
    assert.match(sql, /b\.booking_status <> 'CANCELLED'/);
    assert.match(sql, /HAVING s\.capacity - COUNT\(b\.booking_id\) > 0/);
    assert.deepEqual(values, ["2026-11-20", "2026-11-22"]);
    return [schedules];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/schedules/availability?from=2026-11-20&to=2026-11-22",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload, {
      status: "success",
      data: { items: schedules },
    });
  });
});

test("Past dates and elapsed same-day slots are excluded using database time", async () => {
  let query;
  pool.execute = async (sql) => {
    query = sql;
    return [[]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/schedules/availability?from=2026-11-13&to=2026-11-14",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data.items, []);
  });

  assert.match(query, /s\.schedule_date > CURRENT_DATE\(\)/);
  assert.match(
    query,
    /s\.schedule_date = CURRENT_DATE\(\)\s+AND s\.start_time > CURRENT_TIME\(\)/,
  );
});

test("Invalid date formats and unsupported query parameters are rejected", async () => {
  let queryCount = 0;
  pool.execute = async () => {
    queryCount += 1;
    throw new Error("Invalid requests must not query the database.");
  };

  await withServer(async (port) => {
    for (const query of [
      "from=2026-1-20&to=2026-01-22",
      "from=2026-02-29&to=2026-03-01",
      "from=2026-11-20",
      "from=2026-11-20&to=2026-11-22&status=AVAILABLE",
    ]) {
      const response = await sendRequest(
        port,
        `/api/customer/schedules/availability?${query}`,
        createToken(),
      );
      assert.equal(response.statusCode, 400, query);
      assert.equal(response.payload.status, "error");
    }
  });
  assert.equal(queryCount, 0);
});

test("Reversed date ranges are rejected before database access", async () => {
  let queryCount = 0;
  pool.execute = async () => {
    queryCount += 1;
    throw new Error("Invalid ranges must not query the database.");
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/schedules/availability?from=2026-11-23&to=2026-11-22",
      createToken(),
    );
    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.message, "from must be on or before to.");
  });
  assert.equal(queryCount, 0);
});

test("Fully booked schedules are excluded", async () => {
  let query;
  pool.execute = async (sql) => {
    query = sql;
    return [[]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/schedules/availability?from=2026-11-20&to=2026-11-20",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.data.items, []);
  });
  assert.match(query, /HAVING s\.capacity - COUNT\(b\.booking_id\) > 0/);
});

test("Cancelled bookings do not consume schedule capacity", async () => {
  const availableSchedule = {
    schedule_id: 9,
    schedule_date: "2026-11-20",
    start_time: "13:00:00",
    end_time: "14:30:00",
    capacity: 2,
    booked_count: 0,
    remaining_capacity: 2,
  };
  pool.execute = async (sql) => {
    assert.match(sql, /b\.booking_status <> 'CANCELLED'/);
    return [[availableSchedule]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/schedules/availability?from=2026-11-20&to=2026-11-20",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.items[0].booked_count, 0);
    assert.equal(response.payload.data.items[0].remaining_capacity, 2);
  });
});

test("Closed and unavailable schedules are excluded", async () => {
  let query;
  pool.execute = async (sql) => {
    query = sql;
    return [[{
      schedule_id: 10,
      schedule_date: "2026-11-20",
      start_time: "15:00:00",
      end_time: "16:30:00",
      capacity: 3,
      booked_count: 0,
      remaining_capacity: 3,
    }]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/schedules/availability?from=2026-11-20&to=2026-11-20",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.payload.data.items.map((schedule) => schedule.schedule_id),
      [10],
    );
  });
  assert.match(query, /s\.status = 'AVAILABLE'/);
});

test("Only authenticated customers can retrieve schedule availability", async () => {
  let queryCount = 0;
  pool.execute = async () => {
    queryCount += 1;
    throw new Error("Unauthorized requests must not query the database.");
  };

  await withServer(async (port) => {
    const path =
      "/api/customer/schedules/availability?from=2026-11-20&to=2026-11-22";
    const adminResponse = await sendRequest(port, path, createToken("ADMIN"));
    const missingTokenResponse = await sendRequest(port, path);
    assert.equal(adminResponse.statusCode, 403);
    assert.equal(missingTokenResponse.statusCode, 401);
  });
  assert.equal(queryCount, 0);
});

test("Schedule availability database errors return a safe response", async () => {
  pool.execute = async () => {
    throw new Error("private database query detail");
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/schedules/availability?from=2026-11-20&to=2026-11-22",
      createToken(),
    );
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(
      JSON.stringify(response.payload),
      /private database query detail/,
    );
  });
});
