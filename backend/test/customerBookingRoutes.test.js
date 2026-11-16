const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalGetConnection = pool.getConnection;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-customer-booking-secret-32-bytes";
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

function createDatabase(options = {}) {
  const state = {
    queries: [],
    bookingInsert: null,
    serviceInsert: null,
    committed: false,
    rolledBack: false,
    released: false,
  };
  const defaultServices = [
    { service_id: 3, service_name: "Wash", duration_minutes: 30, status: "ACTIVE" },
    { service_id: 5, service_name: "Polish", duration_minutes: 30, status: "ACTIVE" },
  ];
  const services = options.services || defaultServices;
  const prices = options.prices || [
    { service_id: 3, price: "19.99" },
    { service_id: 5, price: "0.10" },
  ];
  const databaseDate = options.databaseDate || "2026-11-14";
  const databaseTime = options.databaseTime || "12:00:00";

  const connection = {
    async beginTransaction() {
      state.began = true;
    },
    async execute(sql, values) {
      state.queries.push({ sql, values });
      if (sql.includes("FROM schedules")) {
        if (options.schedule === null) return [[]];
        const schedule = {
          schedule_id: 7,
          schedule_date: "2026-11-20",
          start_time: "09:00:00",
          end_time: "10:30:00",
          capacity: 2,
          status: "AVAILABLE",
          ...options.schedule,
        };
        const hasStarted =
          schedule.schedule_date < databaseDate ||
          (schedule.schedule_date === databaseDate &&
            schedule.start_time <= databaseTime);
        return [[{ ...schedule, has_started: hasStarted ? 1 : 0 }]];
      }
      if (sql.includes("COUNT(*) AS booking_count")) {
        return [[{ booking_count: options.bookingCount || 0 }]];
      }
      if (sql.includes("FROM vehicles") && sql.includes("FOR UPDATE")) {
        if (options.vehicle === null) return [[]];
        assert.deepEqual(values, [42, 50]);
        return [[{
          vehicle_id: 42,
          model_id: 11,
          license_plate: "TEST-42",
          production_year: 2020,
          province: "Bangkok",
          color: "Blue",
          status: "ACTIVE",
          ...options.vehicle,
        }]];
      }
      if (sql.includes("FROM vehicle_models")) {
        if (options.model === null) return [[]];
        return [[{
          model_id: 11,
          vehicle_type_id: 4,
          status: "ACTIVE",
          ...options.model,
        }]];
      }
      if (sql.includes("FROM services")) {
        return [services];
      }
      if (sql.includes("FROM vehicle_types")) {
        if (options.vehicleType === null) return [[]];
        return [[{
          vehicle_type_id: 4,
          status: "ACTIVE",
          ...options.vehicleType,
        }]];
      }
      if (sql.includes("FROM service_prices")) {
        return [prices];
      }
      if (sql.startsWith("INSERT INTO bookings")) {
        if (options.failBookingInsert) throw new Error("database insert failed");
        state.bookingInsert = { sql, values };
        return [{ insertId: 101, affectedRows: 1 }];
      }
      if (sql.startsWith("INSERT INTO booking_services")) {
        if (options.failServiceInsert) {
          throw new Error("database service insert failed");
        }
        state.serviceInsert = { sql, values };
        return [{ insertId: 201, affectedRows: services.length }];
      }
      if (sql.includes("FROM bookings b")) {
        const valuesForBooking = state.bookingInsert.values;
        return [[{
          booking_id: 101,
          booking_date: valuesForBooking[3],
          start_time: valuesForBooking[4],
          end_time: valuesForBooking[5],
          booking_status: "CONFIRMED",
          total_amount: valuesForBooking[6],
          discount_amount: "0.00",
          final_amount: valuesForBooking[7],
          vehicle_id: 42,
          license_plate: "TEST-42",
          production_year: 2020,
          province: "Bangkok",
          color: "Blue",
          model_name: "Model",
          brand_name: "Brand",
          type_name: "Sedan",
        }]];
      }
      if (sql.includes("FROM booking_services")) {
        const valuesForServices = state.serviceInsert.values;
        const result = [];
        for (let index = 0; index < valuesForServices.length; index += 5) {
          result.push({
            booking_service_id: 201 + index / 5,
            service_id: valuesForServices[index + 1],
            service_name: valuesForServices[index + 2],
            unit_price: valuesForServices[index + 3],
            duration_minutes: valuesForServices[index + 4],
          });
        }
        return [result];
      }
      throw new Error(`Unexpected booking query: ${sql}`);
    },
    async commit() {
      state.committed = true;
    },
    async rollback() {
      state.rolledBack = true;
    },
    release() {
      state.released = true;
    },
    destroy() {},
  };

  return { state, connection };
}

after(() => {
  pool.getConnection = originalGetConnection;
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test("Booking creation requires a CUSTOMER token", async () => {
  let connectionRequested = false;
  pool.getConnection = async () => {
    connectionRequested = true;
    throw new Error("Unauthorized requests must not access the database.");
  };

  await withServer(async (port) => {
    const missing = await sendRequest(
      port,
      "POST",
      "/api/customer/bookings",
      undefined,
      { vehicle_id: 42, schedule_id: 7, service_ids: [3] },
    );
    const admin = await sendRequest(
      port,
      "POST",
      "/api/customer/bookings",
      createToken("ADMIN"),
      { vehicle_id: 42, schedule_id: 7, service_ids: [3] },
    );
    assert.equal(missing.statusCode, 401);
    assert.equal(admin.statusCode, 403);
  });
  assert.equal(connectionRequested, false);
});

test("Booking rejects past dates and elapsed same-day schedules using database time", async () => {
  const cases = [
    {
      options: {
        schedule: { schedule_date: "2026-11-13", start_time: "15:00:00" },
      },
      message: "The selected schedule is in the past or has already started.",
    },
    {
      options: {
        schedule: { schedule_date: "2026-11-14", start_time: "11:59:59" },
      },
      message: "The selected schedule is in the past or has already started.",
    },
  ];

  for (const { options, message } of cases) {
    const database = createDatabase(options);
    pool.getConnection = async () => database.connection;

    await withServer(async (port) => {
      const response = await sendRequest(
        port,
        "POST",
        "/api/customer/bookings",
        createToken(),
        { vehicle_id: 42, schedule_id: 7, service_ids: [3] },
      );

      assert.equal(response.statusCode, 400);
      assert.equal(response.payload.message, message);
      assert.equal(database.state.queries.length, 1);
      assert.match(database.state.queries[0].sql, /schedule_date < CURRENT_DATE\(\)/);
      assert.match(database.state.queries[0].sql, /start_time <= CURRENT_TIME\(\)/);
      assert.equal(database.state.bookingInsert, null);
      assert.equal(database.state.rolledBack, true);
    });
  }
});

test("Booking accepts future slots on the current date and future dates", async () => {
  const cases = [
    {
      schedule: {
        schedule_date: "2026-11-14",
        start_time: "12:00:01",
        end_time: "13:30:01",
      },
    },
    {
      schedule: { schedule_date: "2026-11-15", start_time: "09:00:00" },
    },
  ];

  for (const { schedule } of cases) {
    const database = createDatabase({ schedule });
    pool.getConnection = async () => database.connection;

    await withServer(async (port) => {
      const response = await sendRequest(
        port,
        "POST",
        "/api/customer/bookings",
        createToken(),
        { vehicle_id: 42, schedule_id: 7, service_ids: [3] },
      );

      assert.equal(response.statusCode, 201);
      assert.equal(response.payload.data.booking_date, schedule.schedule_date);
      assert.equal(database.state.committed, true);
      assert.equal(database.state.rolledBack, false);
    });
  }
});

test("Customer booking validates input before opening a transaction", async () => {
  let connectionRequested = false;
  pool.getConnection = async () => {
    connectionRequested = true;
    throw new Error("Invalid input must not reach the database.");
  };

  await withServer(async (port) => {
    for (const body of [
      { vehicle_id: 42, schedule_id: 7, service_ids: [] },
      { vehicle_id: 42, schedule_id: 7, service_ids: [3, 3] },
      { vehicle_id: 42, schedule_id: 7, service_ids: [3], user_id: 999 },
      { vehicle_id: 42, schedule_id: 7, service_ids: [3], price: 0.01 },
      { vehicle_id: 42, schedule_id: 7, service_ids: [3], duration_minutes: 1 },
      { vehicle_id: 42, schedule_id: 7, service_ids: [3], total_amount: 0.01 },
      { vehicle_id: 42, schedule_id: 7, service_ids: [3], booking_status: "PAID" },
      { vehicle_id: 42, schedule_id: 7, service_ids: [3], booking_date: "2026-11-20" },
      { vehicle_id: 42, schedule_id: 7, service_ids: [3], start_time: "09:00:00" },
      { vehicle_id: 42, schedule_id: 7, service_ids: [3], end_time: "10:00:00" },
      { vehicle_id: 42, schedule_id: 7, service_ids: [3], payment: {} },
    ]) {
      const response = await sendRequest(
        port,
        "POST",
        "/api/customer/bookings",
        createToken(),
        body,
      );
      assert.equal(response.statusCode, 400);
    }
  });
  assert.equal(connectionRequested, false);
});

test("Customer booking uses locked database values and returns a history-compatible booking", async () => {
  const database = createDatabase();
  pool.getConnection = async () => database.connection;

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/customer/bookings",
      createToken("CUSTOMER", 50),
      { vehicle_id: 42, schedule_id: 7, service_ids: [3, 5] },
    );

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.status, "success");
    const booking = response.payload.data;
    assert.equal(booking.booking_id, 101);
    assert.equal(booking.booking_status, "CONFIRMED");
    assert.equal(booking.booking_date, "2026-11-20");
    assert.equal(booking.start_time, "09:00:00");
    assert.equal(booking.end_time, "10:30:00");
    assert.equal(booking.total_amount, 20.09);
    assert.equal(booking.discount_amount, 0);
    assert.equal(booking.final_amount, 20.09);
    assert.equal(booking.payment, null);
    assert.deepEqual(
      booking.services.map((service) => [
        service.service_id,
        service.service_name,
        service.unit_price,
        service.duration_minutes,
      ]),
      [
        [3, "Wash", 19.99, 30],
        [5, "Polish", 0.1, 30],
      ],
    );

    assert.match(database.state.queries[0].sql, /FROM schedules[\s\S]*FOR UPDATE/);
    assert.match(
      database.state.queries[1].sql,
      /booking_status <> 'CANCELLED'/,
    );
    assert.deepEqual(database.state.queries[0].values, [7]);
    assert.deepEqual(database.state.queries[1].values, [7]);
    assert.deepEqual(database.state.bookingInsert.values, [
      50,
      42,
      7,
      "2026-11-20",
      "09:00:00",
      "10:30:00",
      "20.09",
      "20.09",
    ]);
    assert.match(database.state.bookingInsert.sql, /INSERT INTO bookings/);
    assert.doesNotMatch(database.state.bookingInsert.sql, /booking_status/);
    assert.deepEqual(database.state.serviceInsert.values, [
      101, 3, "Wash", "19.99", 30,
      101, 5, "Polish", "0.10", 30,
    ]);
    assert.equal(database.state.committed, true);
    assert.equal(database.state.rolledBack, false);
    assert.equal(database.state.released, true);
  });
});

test("Booking rejects a zero final amount and rolls back", async () => {
  const database = createDatabase({
    prices: [
      { service_id: 3, price: "0.00" },
      { service_id: 5, price: "0.00" },
    ],
  });
  pool.getConnection = async () => database.connection;

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/customer/bookings",
      createToken(),
      { vehicle_id: 42, schedule_id: 7, service_ids: [3, 5] },
    );
    assert.equal(response.statusCode, 400);
    assert.equal(
      response.payload.message,
      "Booking final_amount must be greater than zero.",
    );
    assert.equal(database.state.bookingInsert, null);
    assert.equal(database.state.serviceInsert, null);
    assert.equal(database.state.rolledBack, true);
    assert.equal(database.state.committed, false);
  });
});

test("A zero-priced service is allowed when the final booking amount is positive", async () => {
  const database = createDatabase({
    prices: [
      { service_id: 3, price: "0.00" },
      { service_id: 5, price: "5.25" },
    ],
  });
  pool.getConnection = async () => database.connection;

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/customer/bookings",
      createToken(),
      { vehicle_id: 42, schedule_id: 7, service_ids: [3, 5] },
    );
    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.data.total_amount, 5.25);
    assert.equal(response.payload.data.final_amount, 5.25);
    assert.deepEqual(
      response.payload.data.services.map((service) => service.unit_price),
      [0, 5.25],
    );
    assert.deepEqual(database.state.bookingInsert.values.slice(6), [
      "5.25",
      "5.25",
    ]);
    assert.deepEqual(database.state.serviceInsert.values.slice(3), [
      "0.00",
      30,
      101,
      5,
      "Polish",
      "5.25",
      30,
    ]);
    assert.equal(database.state.committed, true);
    assert.equal(database.state.rolledBack, false);
  });
});

test("Booking rejects an unowned or inactive vehicle and inactive model or type", async () => {
  const cases = [
    { options: { vehicle: null }, statusCode: 404 },
    { options: { vehicle: { status: "INACTIVE" } }, statusCode: 409 },
    { options: { model: { status: "INACTIVE" } }, statusCode: 409 },
    { options: { vehicleType: { status: "INACTIVE" } }, statusCode: 409 },
  ];

  for (const { options, statusCode } of cases) {
    const database = createDatabase(options);
    pool.getConnection = async () => database.connection;
    await withServer(async (port) => {
      const response = await sendRequest(
        port,
        "POST",
        "/api/customer/bookings",
        createToken(),
        { vehicle_id: 42, schedule_id: 7, service_ids: [3] },
      );
      assert.equal(response.statusCode, statusCode);
      assert.equal(database.state.bookingInsert, null);
      assert.equal(database.state.rolledBack, true);
    });
  }
});

test("Booking rejects unavailable services and missing vehicle-type prices", async () => {
  const cases = [
    {
      options: {
        services: [
          { service_id: 3, service_name: "Wash", duration_minutes: 30, status: "INACTIVE" },
        ],
      },
      statusCode: 404,
    },
    {
      options: { services: [] },
      statusCode: 404,
    },
    {
      options: { prices: [] },
      statusCode: 409,
    },
  ];

  for (const { options, statusCode } of cases) {
    const database = createDatabase(options);
    pool.getConnection = async () => database.connection;
    await withServer(async (port) => {
      const response = await sendRequest(
        port,
        "POST",
        "/api/customer/bookings",
        createToken(),
        { vehicle_id: 42, schedule_id: 7, service_ids: [3] },
      );
      assert.equal(response.statusCode, statusCode);
      assert.equal(database.state.bookingInsert, null);
      assert.equal(database.state.rolledBack, true);
    });
  }
});

test("Booking rejects an unavailable or full schedule", async () => {
  const cases = [
    { options: { schedule: { status: "UNAVAILABLE" } }, statusCode: 409 },
    { options: { bookingCount: 2 }, statusCode: 409 },
    { options: { schedule: null }, statusCode: 404 },
  ];

  for (const { options, statusCode } of cases) {
    const database = createDatabase(options);
    pool.getConnection = async () => database.connection;
    await withServer(async (port) => {
      const response = await sendRequest(
        port,
        "POST",
        "/api/customer/bookings",
        createToken(),
        { vehicle_id: 42, schedule_id: 7, service_ids: [3] },
      );
      assert.equal(response.statusCode, statusCode);
      assert.equal(database.state.bookingInsert, null);
      assert.equal(database.state.rolledBack, true);
    });
  }
});

test("Booking rejects service duration longer than the selected schedule", async () => {
  const database = createDatabase({
    services: [
      { service_id: 3, service_name: "Wash", duration_minutes: 60, status: "ACTIVE" },
      { service_id: 5, service_name: "Polish", duration_minutes: 60, status: "ACTIVE" },
    ],
  });
  pool.getConnection = async () => database.connection;

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/customer/bookings",
      createToken(),
      { vehicle_id: 42, schedule_id: 7, service_ids: [3, 5] },
    );
    assert.equal(response.statusCode, 400);
    assert.equal(database.state.bookingInsert, null);
    assert.equal(database.state.rolledBack, true);
  });
});

test("Booking accepts one 30-minute service and preserves the schedule times", async () => {
  const database = createDatabase({
    services: [
      { service_id: 3, service_name: "Wash", duration_minutes: 30, status: "ACTIVE" },
    ],
  });
  pool.getConnection = async () => database.connection;

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/customer/bookings",
      createToken(),
      { vehicle_id: 42, schedule_id: 7, service_ids: [3] },
    );

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.data.start_time, "09:00:00");
    assert.equal(response.payload.data.end_time, "10:30:00");
    assert.deepEqual(database.state.bookingInsert.values.slice(3, 6), [
      "2026-11-20",
      "09:00:00",
      "10:30:00",
    ]);
    assert.deepEqual(database.state.serviceInsert.values, [
      101, 3, "Wash", "19.99", 30,
    ]);
    assert.equal(database.state.committed, true);
    assert.equal(database.state.rolledBack, false);
  });
});

test("Booking accepts mixed service durations that exactly fill the schedule", async () => {
  const database = createDatabase({
    services: [
      { service_id: 3, service_name: "Wash", duration_minutes: 30, status: "ACTIVE" },
      { service_id: 5, service_name: "Polish", duration_minutes: 60, status: "ACTIVE" },
    ],
  });
  pool.getConnection = async () => database.connection;

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/customer/bookings",
      createToken(),
      { vehicle_id: 42, schedule_id: 7, service_ids: [3, 5] },
    );

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.data.start_time, "09:00:00");
    assert.equal(response.payload.data.end_time, "10:30:00");
    assert.deepEqual(database.state.bookingInsert.values.slice(3, 6), [
      "2026-11-20",
      "09:00:00",
      "10:30:00",
    ]);
    assert.deepEqual(
      response.payload.data.services.map((service) => service.duration_minutes),
      [30, 60],
    );
    assert.equal(database.state.committed, true);
    assert.equal(database.state.rolledBack, false);
  });
});

test("Booking rejects mixed service durations over the schedule without inserting", async () => {
  const database = createDatabase({
    services: [
      { service_id: 3, service_name: "Wash", duration_minutes: 30, status: "ACTIVE" },
      { service_id: 5, service_name: "Polish", duration_minutes: 61, status: "ACTIVE" },
    ],
  });
  pool.getConnection = async () => database.connection;

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/customer/bookings",
      createToken(),
      { vehicle_id: 42, schedule_id: 7, service_ids: [3, 5] },
    );

    assert.equal(response.statusCode, 400);
    assert.equal(
      response.payload.message,
      "The selected services exceed the schedule duration.",
    );
    assert.equal(database.state.bookingInsert, null);
    assert.equal(database.state.serviceInsert, null);
    assert.equal(
      database.state.queries.some(({ sql }) =>
        sql.startsWith("INSERT INTO bookings"),
      ),
      false,
    );
    assert.equal(database.state.committed, false);
    assert.equal(database.state.rolledBack, true);
  });
});

test("Booking inserts are rolled back when booking service snapshots fail", async () => {
  const database = createDatabase({ failServiceInsert: true });
  pool.getConnection = async () => database.connection;

  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "POST",
      "/api/customer/bookings",
      createToken(),
      { vehicle_id: 42, schedule_id: 7, service_ids: [3] },
    );
    assert.equal(response.statusCode, 500);
    assert.equal(database.state.bookingInsert !== null, true);
    assert.equal(database.state.committed, false);
    assert.equal(database.state.rolledBack, true);
    assert.equal(database.state.released, true);
  });
});
