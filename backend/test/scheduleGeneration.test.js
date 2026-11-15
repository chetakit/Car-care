const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const pool = require("../shared/config/db");
const generatorPath = require.resolve("../scripts/generate-schedules");
const { main } = require("../scripts/generate-schedules");

const originalGetConnection = pool.getConnection;
const originalPoolEnd = pool.end;
const originalArgv = process.argv;
const originalExitCode = process.exitCode;
const originalDate = global.Date;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const sundayEarlyUtc = "2026-11-14T17:05:00Z";

function uniqueIndex(columns, options = {}) {
  return columns.map((columnName, index) => ({
    INDEX_NAME: options.name || "uq_schedules_slot",
    NON_UNIQUE: options.nonUnique ? 1 : 0,
    SEQ_IN_INDEX: index + 1,
    COLUMN_NAME: columnName,
    SUB_PART: options.prefix ? 4 : null,
  }));
}

function createSchemaColumns(options = {}) {
  const columns = [
    ["schedule_id", "int", "int", "NO", null, "auto_increment"],
    ["schedule_date", "date", "date", "NO", null, ""],
    ["start_time", "time", "time", "NO", null, ""],
    ["end_time", "time", "time", "NO", null, ""],
    ["capacity", "int", "int", "NO", null, ""],
    ["status", "enum", "enum('AVAILABLE','UNAVAILABLE')", "NO", "AVAILABLE", ""],
  ].map(
    ([
      COLUMN_NAME,
      DATA_TYPE,
      COLUMN_TYPE,
      IS_NULLABLE,
      COLUMN_DEFAULT,
      EXTRA,
    ]) => ({
      COLUMN_NAME,
      DATA_TYPE,
      COLUMN_TYPE,
      IS_NULLABLE,
      COLUMN_DEFAULT,
      EXTRA,
    }),
  );
  return options.missingColumn
    ? columns.filter((column) => column.COLUMN_NAME !== options.missingColumn)
    : columns;
}

function createDatabase(options = {}) {
  const state = {
    rows: [...(options.existingRows || [])],
    queries: [],
    inserts: 0,
    begins: 0,
    commits: 0,
    rollbacks: 0,
    releases: 0,
    destroyed: 0,
    lockAcquisitions: 0,
    lockReleases: 0,
    lockHeld: false,
    transactionSnapshot: null,
    poolEnds: 0,
  };

  const connection = {
    async execute(sql, values = []) {
      state.queries.push({ sql, values, lockHeld: state.lockHeld });

      if (sql.includes("GET_LOCK")) {
        state.lockAcquisitions += 1;
        if (options.lockAcquired === false) {
          return [[{ lock_acquired: 0 }]];
        }
        state.lockHeld = true;
        return [[{ lock_acquired: 1 }]];
      }
      if (sql.includes("INFORMATION_SCHEMA.COLUMNS")) {
        if (options.failAt === "schema") throw new Error("metadata read failed");
        return [createSchemaColumns(options.schemaOptions)];
      }
      if (sql.includes("INFORMATION_SCHEMA.STATISTICS")) {
        if (options.failAt === "indexes") throw new Error("index read failed");
        return [options.indexRows ?? uniqueIndex(["schedule_date", "start_time"])];
      }
      if (sql.includes("DATE_FORMAT(schedule_date")) {
        if (options.failAt === "existing") {
          throw new Error("schedule read failed");
        }
        const [from, to] = values;
        state.scheduleReadValues = values;
        return [[
          ...state.rows
            .filter(
              (row) =>
                row.schedule_date >= from && row.schedule_date <= to,
            )
            .map((row) => ({
              schedule_date: row.schedule_date,
              start_time: row.start_time,
              end_time: row.end_time,
            })),
        ]];
      }
      if (sql.startsWith("INSERT INTO schedules")) {
        state.inserts += 1;
        if (options.failAt === "insert") {
          throw new Error("schedule insert failed");
        }

        const [date, start, end, capacity, status] = values;
        const matchingRow = state.rows.find(
          (row) =>
            row.schedule_date === date && row.start_time === start,
        );
        if (options.duplicateRaceOnInsert === state.inserts && !matchingRow) {
          state.rows.push({
            schedule_date: date,
            start_time: start,
            end_time: end,
            capacity,
            status,
          });
          const error = new Error("Duplicate schedule slot.");
          error.code = "ER_DUP_ENTRY";
          throw error;
        }
        if (matchingRow) return [{ affectedRows: 0 }];

        state.rows.push({
          schedule_date: date,
          start_time: start,
          end_time: end,
          capacity,
          status,
        });
        return [{ affectedRows: 1 }];
      }
      if (
        sql.includes("SELECT schedule_id") &&
        sql.includes("FROM schedules")
      ) {
        const [date, start] = values;
        const found = state.rows.some(
          (row) =>
            row.schedule_date === date && row.start_time === start,
        );
        return [found ? [{ schedule_id: 1 }] : []];
      }
      if (sql.includes("RELEASE_LOCK")) {
        state.lockReleases += 1;
        if (options.failLockRelease) return [[{ lock_released: 0 }]];
        state.lockHeld = false;
        return [[{ lock_released: 1 }]];
      }
      throw new Error(`Unexpected mocked schedule query: ${sql}`);
    },
    async beginTransaction() {
      assert.equal(state.lockHeld, true);
      state.begins += 1;
      state.transactionSnapshot = [...state.rows];
    },
    async commit() {
      assert.equal(state.lockHeld, true);
      if (options.failAt === "commit") throw new Error("commit failed");
      state.commits += 1;
      state.transactionSnapshot = null;
    },
    async rollback() {
      assert.equal(state.lockHeld, true);
      state.rollbacks += 1;
      state.rows = state.transactionSnapshot || state.rows;
      state.transactionSnapshot = null;
    },
    release() {
      state.releases += 1;
    },
    destroy() {
      state.destroyed += 1;
      state.lockHeld = false;
    },
  };

  return { state, connection };
}

async function runCli(database, args = [], options = {}) {
  const logs = [];
  const errors = [];
  const clock = options.clock || (() => sundayEarlyUtc);
  const NativeDate = global.Date;

  pool.getConnection = async () => database.connection;
  pool.end = async () => {
    database.state.poolEnds += 1;
  };
  process.argv = ["node", "generate-schedules.js", ...args];
  process.exitCode = undefined;
  global.Date = class MockDate extends NativeDate {
    constructor(...values) {
      if (values.length === 0) super(clock());
      else super(...values);
    }

    static now() {
      return new NativeDate(clock()).getTime();
    }
  };
  console.log = (...values) => logs.push(values.join(" "));
  console.error = (...values) => errors.push(values.join(" "));

  try {
    const report = options.passApplyObject
      ? await main({ apply: true })
      : await main();
    return { report, logs, errors, exitCode: process.exitCode };
  } finally {
    pool.getConnection = originalGetConnection;
    pool.end = originalPoolEnd;
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    global.Date = NativeDate;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
}

after(() => {
  pool.getConnection = originalGetConnection;
  pool.end = originalPoolEnd;
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  global.Date = originalDate;
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

test("Importing the generator exposes only main and performs no database work", () => {
  let connectionRequests = 0;
  pool.getConnection = async () => {
    connectionRequests += 1;
    throw new Error("Module import must not connect to the database.");
  };
  delete require.cache[generatorPath];

  const imported = require(generatorPath);

  assert.deepEqual(Object.keys(imported), ["main"]);
  assert.equal(connectionRequests, 0);
  pool.getConnection = originalGetConnection;
});

test("Dry-run is the default, lists slots, and executes no DML", async () => {
  const database = createDatabase();
  const result = await runCli(database);

  assert.equal(result.exitCode, undefined);
  assert.equal(result.report.mode, "dry-run");
  assert.equal(result.report.uniqueIndexVerified, true);
  assert.equal(result.report.slotsToCreate.length, 150);
  assert.match(result.logs[0], /Mode: DRY RUN \(no inserts\)/);
  assert.match(result.logs[0], /2026-11-16 09:00-10:30 capacity=2/);
  assert.equal(database.state.inserts, 0);
  assert.equal(
    database.state.queries.some(({ sql }) =>
      /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql),
    ),
    false,
  );
  assert.equal(database.state.begins, 0);
  assert.equal(database.state.lockReleases, 1);
});

test("Passing an apply object to the exported CLI entry point cannot enable writes", async () => {
  const database = createDatabase();
  const result = await runCli(database, [], { passApplyObject: true });

  assert.equal(result.report.mode, "dry-run");
  assert.equal(database.state.inserts, 0);
});

test("Only the actual --apply CLI argument enables inserts", async () => {
  const database = createDatabase();
  const result = await runCli(database, ["--apply"]);

  assert.equal(result.exitCode, undefined);
  assert.equal(result.report.mode, "apply");
  assert.equal(result.report.createdCount, 150);
  assert.equal(database.state.inserts, 150);
  assert.equal(database.state.begins, 1);
  assert.equal(database.state.commits, 1);
  assert.equal(database.state.lockReleases, 1);
});

test("The plan is computed after lock acquisition using the latest Bangkok date", async () => {
  const database = createDatabase();
  let clockReads = 0;
  const result = await runCli(database, [], {
    clock: () => {
      clockReads += 1;
      return database.state.lockHeld
        ? "2026-11-16T09:00:00+07:00"
        : "2026-11-15T00:05:00+07:00";
    },
  });

  assert.equal(result.report.startDate, "2026-11-16");
  assert.equal(result.report.endDate, "2026-12-15");
  assert.equal(result.report.skippedElapsedSlots, 1);
  assert.deepEqual(database.state.scheduleReadValues, [
    "2026-11-16",
    "2026-12-15",
  ]);
  assert.ok(clockReads > 0);
  assert.ok(
    database.state.queries.findIndex(({ sql }) => sql.includes("GET_LOCK")) <
      database.state.queries.findIndex(({ sql }) =>
        sql.includes("DATE_FORMAT(schedule_date"),
      ),
  );
});

test("Generation uses Bangkok dates, excludes Sundays, and creates six capacity-two slots", async () => {
  const database = createDatabase();
  const result = await runCli(database);
  const slots = result.report.slotsToCreate;
  const dates = [...new Set(slots.map((slot) => slot.schedule_date))];

  assert.equal(result.report.timeZone, "Asia/Bangkok");
  assert.equal(result.report.startDate, "2026-11-15");
  assert.equal(result.report.endDate, "2026-12-14");
  assert.equal(result.report.skippedSundays, 5);
  assert.equal(dates.length, 25);
  assert.ok(
    dates.every((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0),
  );
  for (const date of dates) {
    const dailySlots = slots.filter((slot) => slot.schedule_date === date);
    assert.equal(dailySlots.length, 6);
    assert.ok(dailySlots.every((slot) => slot.capacity === 2));
    assert.deepEqual(
      dailySlots.map((slot) => [slot.start_time, slot.end_time]),
      [
        ["09:00:00", "10:30:00"],
        ["10:30:00", "12:00:00"],
        ["12:00:00", "13:30:00"],
        ["13:30:00", "15:00:00"],
        ["15:00:00", "16:30:00"],
        ["16:30:00", "18:00:00"],
      ],
    );
  }
});

test("Past dates and elapsed same-day slots are skipped", async () => {
  const database = createDatabase();
  const result = await runCli(database, [], {
    clock: () => "2026-11-16T12:15:00+07:00",
  });
  const slots = result.report.slotsToCreate;
  const todaySlots = slots.filter(
    (slot) => slot.schedule_date === "2026-11-16",
  );

  assert.ok(slots.every((slot) => slot.schedule_date >= "2026-11-16"));
  assert.deepEqual(
    todaySlots.map((slot) => slot.start_time),
    ["13:30:00", "15:00:00", "16:30:00"],
  );
  assert.equal(result.report.skippedElapsedSlots, 3);
});

test("Dry-run warns about a missing unique schedule identity index", async () => {
  const database = createDatabase({ indexRows: [] });
  const result = await runCli(database);

  assert.equal(result.report.mode, "dry-run");
  assert.equal(result.report.uniqueIndexVerified, false);
  assert.match(result.logs[0], /Warning: No exact unique index/);
  assert.equal(database.state.inserts, 0);
});

test("Apply refuses a missing or ambiguous unique identity index", async () => {
  const invalidIndexes = [
    [],
    uniqueIndex(["schedule_date", "start_time", "capacity"]),
    [
      ...uniqueIndex(["schedule_date"], { name: "uq_date" }),
      ...uniqueIndex(["start_time"], { name: "uq_time" }),
    ],
    uniqueIndex(["start_time", "schedule_date"], { prefix: true }),
    uniqueIndex(["schedule_date", "start_time"], { nonUnique: true }),
  ];

  for (const indexRows of invalidIndexes) {
    const database = createDatabase({ indexRows });
    const result = await runCli(database, ["--apply"]);

    assert.equal(result.exitCode, 1);
    assert.match(result.errors[0], /Apply mode is disabled/);
    assert.equal(database.state.inserts, 0);
    assert.equal(database.state.begins, 0);
    assert.equal(database.state.lockReleases, 1);
    assert.ok(
      database.state.queries
        .filter(({ sql }) => !sql.includes("GET_LOCK"))
        .every(({ lockHeld }) => lockHeld),
    );
    assert.equal(database.state.lockHeld, false);
  }
});

test("Apply accepts an exact unique index in either column order", async () => {
  const database = createDatabase({
    indexRows: uniqueIndex(["start_time", "schedule_date"]),
  });
  const result = await runCli(database, ["--apply"]);

  assert.equal(result.exitCode, undefined);
  assert.equal(result.report.uniqueIndexVerified, true);
  assert.equal(database.state.inserts, 150);
  assert.equal(database.state.commits, 1);
});

test("Existing schedules and their capacity/status are preserved across repeated runs", async () => {
  const originalSchedule = {
    schedule_date: "2026-11-16",
    start_time: "09:00:00",
    end_time: "10:00:00",
    capacity: 7,
    status: "UNAVAILABLE",
  };
  const database = createDatabase({ existingRows: [originalSchedule] });
  const first = await runCli(database, ["--apply"]);
  const second = await runCli(database, ["--apply"]);

  assert.equal(first.report.createdCount, 149);
  assert.equal(first.report.existingSlotsSkipped, 1);
  assert.equal(second.report.createdCount, 0);
  assert.equal(second.report.existingSlotsSkipped, 150);
  assert.equal(database.state.rows.length, 150);
  assert.deepEqual(database.state.rows[0], originalSchedule);
  assert.equal(database.state.inserts, 149);
  assert.ok(
    database.state.queries.every(
      ({ sql }) => !/^\s*(UPDATE|DELETE|REPLACE)\b/i.test(sql),
    ),
  );
});

test("Duplicate-insert races are skipped without changing the existing slot", async () => {
  const database = createDatabase({ duplicateRaceOnInsert: 1 });
  const result = await runCli(database, ["--apply"]);

  assert.equal(result.report.createdCount, 149);
  assert.equal(result.report.existingSlotsSkipped, 1);
  assert.equal(database.state.rows.length, 150);
  assert.equal(database.state.rollbacks, 0);
  assert.equal(database.state.commits, 1);
});

test("Lock is released on pre-transaction and transactional errors", async () => {
  for (const options of [
    { schemaOptions: { missingColumn: "capacity" } },
    { indexRows: [] },
    { failAt: "existing" },
    { failAt: "insert" },
    { failAt: "commit" },
  ]) {
    const database = createDatabase(options);
    const result = await runCli(database, ["--apply"]);

    assert.equal(result.exitCode, 1);
    assert.equal(database.state.lockReleases, 1);
    assert.equal(database.state.lockHeld, false);
    assert.equal(database.state.releases, 1);
    if (options.failAt === "existing" || options.failAt === "insert" || options.failAt === "commit") {
      assert.equal(database.state.rollbacks, 1);
    }
  }
});

test("Failed lock acquisition does not release an unacquired lock", async () => {
  const database = createDatabase({ lockAcquired: false });
  const result = await runCli(database, ["--apply"]);

  assert.equal(result.exitCode, 1);
  assert.equal(database.state.inserts, 0);
  assert.equal(database.state.lockReleases, 0);
  assert.equal(database.state.releases, 1);
});

test("A failed lock release destroys the connection", async () => {
  const database = createDatabase({ failLockRelease: true });
  const result = await runCli(database);

  assert.equal(result.exitCode, 1);
  assert.equal(database.state.lockReleases, 1);
  assert.equal(database.state.destroyed, 1);
  assert.equal(database.state.releases, 0);
});
