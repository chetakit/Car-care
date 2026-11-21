const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;

function sendRequest(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET" },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve({ statusCode: response.statusCode, payload: JSON.parse(body) });
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
});

const slot = (overrides) => ({
  schedule_id: 1,
  schedule_date: "2026-11-23",
  start_time: "09:00:00",
  end_time: "10:30:00",
  capacity: 2,
  booked_count: 0,
  status: "AVAILABLE",
  has_started: 0,
  ...overrides,
});

test("Anyone can see a week of availability without logging in", async () => {
  pool.execute = async (sql, values) => {
    assert.match(sql, /s\.schedule_date BETWEEN \? AND \?/);
    assert.deepEqual(values, ["2026-11-23", "2026-11-29"]);
    return [[
      slot({ schedule_id: 1, booked_count: 1 }),
      slot({ schedule_id: 2, start_time: "10:30:00", end_time: "12:00:00", booked_count: 2 }),
      slot({ schedule_id: 3, schedule_date: "2026-11-24", status: "CLOSED" }),
    ]];
  };

  await withServer(async (port) => {
    const response = await sendRequest(port, "/api/public/availability?from=2026-11-23");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload, {
      status: "success",
      data: {
        from: "2026-11-23",
        to: "2026-11-29",
        items: [
          { date: "2026-11-23", start_time: "09:00:00", end_time: "10:30:00", capacity: 2, remaining_capacity: 1, status: "AVAILABLE" },
          { date: "2026-11-23", start_time: "10:30:00", end_time: "12:00:00", capacity: 2, remaining_capacity: 0, status: "FULL" },
          { date: "2026-11-24", start_time: "09:00:00", end_time: "10:30:00", capacity: 2, remaining_capacity: 0, status: "CLOSED" },
        ],
      },
    });
  });
});

test("Public availability never exposes booking or schedule identifiers", async () => {
  pool.execute = async () => [[slot({ booked_count: 1 })]];
  await withServer(async (port) => {
    const response = await sendRequest(port, "/api/public/availability?from=2026-11-23&days=1");
    assert.equal(response.statusCode, 200);
    const [item] = response.payload.data.items;
    assert.deepEqual(Object.keys(item).sort(), ["capacity", "date", "end_time", "remaining_capacity", "start_time", "status"]);
    assert.equal(response.payload.data.to, "2026-11-23");
  });
});

test("Elapsed slots are reported as PAST", async () => {
  pool.execute = async () => [[slot({ has_started: 1 })]];
  await withServer(async (port) => {
    const response = await sendRequest(port, "/api/public/availability?from=2026-11-23&days=1");
    assert.equal(response.payload.data.items[0].status, "PAST");
  });
});

test("Invalid public availability queries are rejected before reaching the database", async () => {
  let called = false;
  pool.execute = async () => {
    called = true;
    return [[]];
  };
  await withServer(async (port) => {
    for (const path of [
      "/api/public/availability",
      "/api/public/availability?from=2026-02-30",
      "/api/public/availability?from=2026-11-23&days=0",
      "/api/public/availability?from=2026-11-23&days=15",
      "/api/public/availability?from=2026-11-23&days=1.5",
      "/api/public/availability?from=2026-11-23&user=1",
    ]) {
      const response = await sendRequest(port, path);
      assert.equal(response.statusCode, 400, path);
      assert.equal(response.payload.status, "error");
    }
  });
  assert.equal(called, false);
});

test("Database failures return a generic error", async () => {
  pool.execute = async () => {
    throw new Error("connection lost");
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await withServer(async (port) => {
      const response = await sendRequest(port, "/api/public/availability?from=2026-11-23");
      assert.equal(response.statusCode, 500);
      assert.deepEqual(response.payload, { status: "error", message: "Unable to retrieve availability." });
    });
  } finally {
    console.error = originalError;
  }
});
