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
      status: "AVAILABLE",
      has_started: 0,
    },
    {
      schedule_id: 8,
      schedule_date: "2026-11-20",
      start_time: "11:00:00",
      end_time: "12:30:00",
      capacity: 2,
      booked_count: 0,
      status: "AVAILABLE",
      has_started: 0,
    },
  ];
  pool.execute = async (sql, values) => {
    assert.match(sql, /s\.schedule_date BETWEEN \? AND \?/);
    assert.match(sql, /s\.status,/);
    assert.match(
      sql,
      /TIMESTAMP\(s\.schedule_date, s\.start_time\) <= \(UTC_TIMESTAMP\(\) \+ INTERVAL 7 HOUR\)/,
    );
    assert.match(sql, /b\.booking_status <> 'CANCELLED'/);
    // Counts bookings that overlap each slot in time, so multi-slot bookings are included.
    assert.match(sql, /b\.start_time < s\.end_time/);
    assert.match(sql, /b\.end_time > s\.start_time/);
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
      data: {
        items: schedules.map(({ has_started, ...schedule }) => ({
          ...schedule,
          remaining_capacity: schedule.capacity - schedule.booked_count,
          end_time: schedule.end_time,
        })),
      },
    });
  });
});

test("Past dates and elapsed same-day slots are returned as unavailable using database time", async () => {
  let query;
  pool.execute = async (sql) => {
    query = sql;
    return [[{
      schedule_id: 3,
      schedule_date: "2026-11-13",
      start_time: "09:00:00",
      end_time: "10:30:00",
      capacity: 2,
      booked_count: 1,
      status: "AVAILABLE",
      has_started: 1,
    }]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/schedules/availability?from=2026-11-13&to=2026-11-14",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.items[0].status, "PAST");
    assert.equal(response.payload.data.items[0].booked_count, 1);
  });

  assert.match(
    query,
    // Schedules are in Thai time; the database clock is UTC.
    /TIMESTAMP\(s\.schedule_date, s\.start_time\) <= \(UTC_TIMESTAMP\(\) \+ INTERVAL 7 HOUR\)/,
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

test("Fully booked schedules are returned with no remaining capacity", async () => {
  let query;
  pool.execute = async (sql) => {
    query = sql;
    return [[{
      schedule_id: 4, schedule_date: "2026-11-20", start_time: "09:00:00",
      end_time: "10:30:00", capacity: 2, booked_count: 2,
      status: "AVAILABLE",
      has_started: 0,
    }]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/schedules/availability?from=2026-11-20&to=2026-11-20",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.data.items[0].status, "FULL");
    assert.equal(response.payload.data.items[0].remaining_capacity, 0);
  });
  assert.match(query, /b\.booking_date = s\.schedule_date/);
});

test("With duration_minutes, unfit start times are included as unavailable", async () => {
  const slot = (id, start, end, booked = 0) => ({
    schedule_id: id, schedule_date: "2026-11-20", start_time: start, end_time: end, capacity: 2, booked_count: booked,
  });
  pool.execute = async () => [[
    slot(1, "09:00:00", "10:30:00"),
    slot(2, "10:30:00", "12:00:00", 1),
    slot(3, "12:00:00", "13:30:00", 2),
    slot(4, "13:30:00", "15:00:00"),
    slot(5, "15:00:00", "16:30:00"),
  ]];
  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/schedules/availability?from=2026-11-20&to=2026-11-20&duration_minutes=120",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.payload.data.items.map((item) => [
        item.schedule_id,
        item.end_time,
        item.remaining_capacity,
        item.status,
      ]),
      // 09:00 uses slots 1+2; 10:30 and 12:00 run into full slot 3;
      // 13:30 uses 4+5; 15:00 has no slot after it.
      [
        [1, "12:00:00", 1, "AVAILABLE"],
        [2, "12:00:00", 0, "UNAVAILABLE"],
        [3, "13:30:00", 0, "FULL"],
        [4, "16:30:00", 2, "AVAILABLE"],
        [5, "16:30:00", 0, "UNAVAILABLE"],
      ],
    );
  });
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

test("Closed schedules are included with unavailable status", async () => {
  let query;
  pool.execute = async (sql) => {
    query = sql;
    return [[
      {
        schedule_id: 10,
        schedule_date: "2026-11-20",
        start_time: "15:00:00",
        end_time: "16:30:00",
        capacity: 3,
        booked_count: 0,
        status: "AVAILABLE",
        has_started: 0,
      },
      {
        schedule_id: 11,
        schedule_date: "2026-11-20",
        start_time: "16:30:00",
        end_time: "18:00:00",
        capacity: 3,
        booked_count: 0,
        status: "CLOSED",
        has_started: 0,
      },
    ]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "/api/customer/schedules/availability?from=2026-11-20&to=2026-11-20",
      createToken(),
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.payload.data.items.map((schedule) => [schedule.schedule_id, schedule.status]),
      [[10, "AVAILABLE"], [11, "CLOSED"]],
    );
  });
  assert.match(query, /s\.status,/);
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
