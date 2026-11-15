const pool = require("../shared/config/db");

const BUSINESS_TIME_ZONE = "Asia/Bangkok";
const GENERATION_DAYS = 30;
const SLOT_CAPACITY = 2;
const GENERATOR_LOCK_NAME = "car-care-schedule-generator";
const SLOTS = [
  ["09:00:00", "10:30:00"],
  ["10:30:00", "12:00:00"],
  ["12:00:00", "13:30:00"],
  ["13:30:00", "15:00:00"],
  ["15:00:00", "16:30:00"],
  ["16:30:00", "18:00:00"],
];
const REQUIRED_COLUMNS = [
  "schedule_id",
  "schedule_date",
  "start_time",
  "end_time",
  "capacity",
  "status",
];
const INSERT_COLUMNS = new Set([
  "schedule_date",
  "start_time",
  "end_time",
  "capacity",
  "status",
]);

class ScheduleGenerationError extends Error {}

function getBusinessClock(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new ScheduleGenerationError("A valid generation time is required.");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}:${values.second}`,
  };
}

function addCalendarDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function getWeekday(date) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function generateCandidates(now) {
  const clock = getBusinessClock(now);
  const endDate = addCalendarDays(clock.date, GENERATION_DAYS - 1);
  const slots = [];
  let skippedSundays = 0;
  let skippedElapsedSlots = 0;

  for (let offset = 0; offset < GENERATION_DAYS; offset += 1) {
    const scheduleDate = addCalendarDays(clock.date, offset);
    if (getWeekday(scheduleDate) === 0) {
      skippedSundays += 1;
      continue;
    }

    for (const [startTime, endTime] of SLOTS) {
      if (scheduleDate === clock.date && startTime <= clock.time) {
        skippedElapsedSlots += 1;
        continue;
      }

      slots.push({
        schedule_date: scheduleDate,
        start_time: startTime,
        end_time: endTime,
        capacity: SLOT_CAPACITY,
        status: "AVAILABLE",
      });
    }
  }

  return {
    startDate: clock.date,
    endDate,
    slots,
    skippedSundays,
    skippedElapsedSlots,
  };
}

function validateScheduleSchema(columns) {
  const columnsByName = new Map(
    columns.map((column) => [column.COLUMN_NAME, column]),
  );
  const missingColumns = REQUIRED_COLUMNS.filter(
    (columnName) => !columnsByName.has(columnName),
  );
  if (missingColumns.length > 0) {
    throw new ScheduleGenerationError(
      `The schedules table is missing required columns: ${missingColumns.join(", ")}.`,
    );
  }

  const scheduleId = columnsByName.get("schedule_id");
  if (!String(scheduleId.EXTRA).toLowerCase().includes("auto_increment")) {
    throw new ScheduleGenerationError(
      "The schedules table must provide an auto-generated schedule_id; no rows were changed.",
    );
  }

  const expectedTypes = {
    schedule_date: ["date"],
    start_time: ["time"],
    end_time: ["time"],
    capacity: ["tinyint", "smallint", "mediumint", "int", "integer", "bigint"],
    status: ["char", "varchar", "enum", "text"],
  };
  for (const [columnName, allowedTypes] of Object.entries(expectedTypes)) {
    const column = columnsByName.get(columnName);
    if (!allowedTypes.includes(String(column.DATA_TYPE).toLowerCase())) {
      throw new ScheduleGenerationError(
        `The schedules table has an unsupported ${columnName} column type; no rows were changed.`,
      );
    }
    if (
      columnName === "status" &&
      String(column.DATA_TYPE).toLowerCase() === "enum" &&
      !String(column.COLUMN_TYPE).includes("'AVAILABLE'")
    ) {
      throw new ScheduleGenerationError(
        "The schedules status enum does not allow AVAILABLE; no rows were changed.",
      );
    }
  }

  const missingDefaults = columns.filter((column) => {
    const extra = String(column.EXTRA).toLowerCase();
    return (
      !INSERT_COLUMNS.has(column.COLUMN_NAME) &&
      column.IS_NULLABLE === "NO" &&
      column.COLUMN_DEFAULT === null &&
      !extra.includes("auto_increment") &&
      !extra.includes("generated")
    );
  });
  if (missingDefaults.length > 0) {
    throw new ScheduleGenerationError(
      `The schedules table has additional required columns without defaults: ${missingDefaults
        .map((column) => column.COLUMN_NAME)
        .join(", ")}. No rows were changed.`,
    );
  }
}

function hasScheduleIdentityUniqueIndex(indexRows) {
  const indexes = new Map();
  for (const row of indexRows) {
    if (Number(row.NON_UNIQUE) !== 0 || !row.INDEX_NAME) continue;
    if (!indexes.has(row.INDEX_NAME)) indexes.set(row.INDEX_NAME, []);
    indexes.get(row.INDEX_NAME).push(row);
  }

  return [...indexes.values()].some((columns) => {
    if (columns.length !== 2) return false;
    const sequenceNumbers = new Set(
      columns.map((column) => Number(column.SEQ_IN_INDEX)),
    );
    const names = new Set(
      columns.map((column) => String(column.COLUMN_NAME).toLowerCase()),
    );
    return (
      sequenceNumbers.size === 2 &&
      sequenceNumbers.has(1) &&
      sequenceNumbers.has(2) &&
      columns.every((column) => column.SUB_PART === null) &&
      names.has("schedule_date") &&
      names.has("start_time")
    );
  });
}

function timeToSeconds(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(String(value));
  if (!match) {
    throw new ScheduleGenerationError(
      "An existing schedule has an invalid time; generation stopped without changing rows.",
    );
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function planMissingSlots(candidates, existingRows) {
  const byDate = new Map();
  for (const row of existingRows) {
    const date = String(row.schedule_date).slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({
      start_time: String(row.start_time),
      end_time: String(row.end_time),
    });
  }

  const slotsToCreate = [];
  let existingSlotsSkipped = 0;
  for (const candidate of candidates) {
    const daySlots = byDate.get(candidate.schedule_date) || [];
    const sameStart = daySlots.find(
      (slot) => slot.start_time === candidate.start_time,
    );
    if (sameStart) {
      existingSlotsSkipped += 1;
      continue;
    }

    const candidateStart = timeToSeconds(candidate.start_time);
    const candidateEnd = timeToSeconds(candidate.end_time);
    const overlaps = daySlots.some((slot) => {
      const existingStart = timeToSeconds(slot.start_time);
      const existingEnd = timeToSeconds(slot.end_time);
      if (existingEnd <= existingStart) {
        throw new ScheduleGenerationError(
          "An existing schedule has an invalid time interval; generation stopped without changing rows.",
        );
      }
      return candidateStart < existingEnd && candidateEnd > existingStart;
    });
    if (overlaps) {
      throw new ScheduleGenerationError(
        `An existing schedule overlaps ${candidate.schedule_date} ${candidate.start_time}; generation stopped without changing rows.`,
      );
    }

    slotsToCreate.push(candidate);
  }

  return { slotsToCreate, existingSlotsSkipped };
}

function isElapsed(slot, now) {
  const clock = getBusinessClock(now);
  return (
    slot.schedule_date < clock.date ||
    (slot.schedule_date === clock.date && slot.start_time <= clock.time)
  );
}

function parseApplyFlag(args) {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === "--apply") return true;
  throw new ScheduleGenerationError(
    "Usage: node .\\scripts\\generate-schedules.js [--apply]",
  );
}

async function generateSchedules(apply) {
  const connection = await pool.getConnection();
  let lockAcquired = false;
  let transactionStarted = false;
  let operationError = null;
  let lockReleaseError = null;
  let destroyConnection = false;

  try {
    const [lockRows] = await connection.execute(
      "SELECT GET_LOCK(?, 10) AS lock_acquired",
      [GENERATOR_LOCK_NAME],
    );
    if (Number(lockRows[0]?.lock_acquired) !== 1) {
      throw new ScheduleGenerationError(
        "Could not acquire the schedule-generation lock; no rows were changed.",
      );
    }
    lockAcquired = true;

    const [columns] = await connection.execute(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE,
        COLUMN_DEFAULT, EXTRA
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      ["schedules"],
    );
    validateScheduleSchema(columns);

    const [indexRows] = await connection.execute(
      `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      ["schedules"],
    );
    const uniqueIndexVerified = hasScheduleIdentityUniqueIndex(indexRows);
    const warnings = [];
    if (!uniqueIndexVerified) {
      const warning =
        "No exact unique index on (schedule_date, start_time) was verified.";
      if (apply) {
        throw new ScheduleGenerationError(
          `${warning} Apply mode is disabled; no rows were changed.`,
        );
      }
      warnings.push(warning);
    }

    if (apply) {
      await connection.beginTransaction();
      transactionStarted = true;
    }

    const plan = generateCandidates(new Date());
    const [existingRows] = await connection.execute(
      `SELECT
        DATE_FORMAT(schedule_date, '%Y-%m-%d') AS schedule_date,
        TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
        TIME_FORMAT(end_time, '%H:%i:%s') AS end_time
      FROM schedules
      WHERE schedule_date BETWEEN ? AND ?
      ${apply ? "FOR UPDATE" : ""}`,
      [plan.startDate, plan.endDate],
    );
    const missingPlan = planMissingSlots(plan.slots, existingRows);
    let existingSlotsSkipped = missingPlan.existingSlotsSkipped;
    let skippedElapsedSlots = plan.skippedElapsedSlots;
    const processedSlots = [];
    let createdCount = 0;

    if (apply) {
      for (const slot of missingPlan.slotsToCreate) {
        if (isElapsed(slot, new Date())) {
          skippedElapsedSlots += 1;
          continue;
        }

        try {
          const [result] = await connection.execute(
            `INSERT INTO schedules (
              schedule_date, start_time, end_time, capacity, status
            )
            SELECT ?, ?, ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1
              FROM schedules
              WHERE schedule_date = ? AND start_time = ?
            )`,
            [
              slot.schedule_date,
              slot.start_time,
              slot.end_time,
              SLOT_CAPACITY,
              "AVAILABLE",
              slot.schedule_date,
              slot.start_time,
            ],
          );
          if (Number(result.affectedRows) === 1) {
            createdCount += 1;
            processedSlots.push(slot);
          } else if (Number(result.affectedRows) === 0) {
            existingSlotsSkipped += 1;
          } else {
            throw new ScheduleGenerationError(
              "Unexpected schedule insert result; generation was rolled back.",
            );
          }
        } catch (error) {
          if (error.code !== "ER_DUP_ENTRY") throw error;
          const [racedRows] = await connection.execute(
            `SELECT schedule_id
            FROM schedules
            WHERE schedule_date = ? AND start_time = ?
            LIMIT 1
            FOR UPDATE`,
            [slot.schedule_date, slot.start_time],
          );
          if (racedRows.length === 0) throw error;
          existingSlotsSkipped += 1;
        }
      }

      await connection.commit();
      transactionStarted = false;
    }

    return {
      mode: apply ? "apply" : "dry-run",
      timeZone: BUSINESS_TIME_ZONE,
      startDate: plan.startDate,
      endDate: plan.endDate,
      slotsToCreate: apply ? processedSlots : missingPlan.slotsToCreate,
      existingSlotsSkipped,
      skippedElapsedSlots,
      skippedSundays: plan.skippedSundays,
      createdCount,
      uniqueIndexVerified,
      warnings,
    };
  } catch (error) {
    operationError = error;
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        destroyConnection = true;
        console.error("Schedule generation rollback failed.");
      }
    }
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        const [releaseRows] = await connection.execute(
          "SELECT RELEASE_LOCK(?) AS lock_released",
          [GENERATOR_LOCK_NAME],
        );
        if (Number(releaseRows[0]?.lock_released) !== 1) {
          throw new ScheduleGenerationError(
            "Could not release the schedule-generation lock.",
          );
        }
      } catch (error) {
        destroyConnection = true;
        lockReleaseError = error;
        if (operationError) {
          console.error("Schedule generation lock release failed.");
        }
      }
    }

    if (destroyConnection) {
      connection.destroy();
    } else {
      connection.release();
    }

    if (lockReleaseError && !operationError) {
      throw lockReleaseError;
    }
  }
}

function formatReport(report) {
  const lines = [
    `Mode: ${report.mode === "apply" ? "APPLY" : "DRY RUN (no inserts)"}`,
    `Timezone: ${report.timeZone}`,
    `Date range: ${report.startDate} through ${report.endDate}`,
    `Existing slots skipped: ${report.existingSlotsSkipped}`,
    `Elapsed same-day slots skipped: ${report.skippedElapsedSlots}`,
    `Sundays skipped: ${report.skippedSundays}`,
    ...report.warnings.map((warning) => `Warning: ${warning}`),
  ];

  if (report.mode === "apply") {
    lines.push(`Slots created: ${report.createdCount}`);
  } else {
    lines.push(`Slots to create: ${report.slotsToCreate.length}`);
  }

  if (report.slotsToCreate.length > 0) {
    lines.push("Schedule slots:");
    for (const slot of report.slotsToCreate) {
      lines.push(
        `  ${slot.schedule_date} ${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)} capacity=${SLOT_CAPACITY}`,
      );
    }
  }

  return lines.join("\n");
}

async function main() {
  try {
    const apply = parseApplyFlag(process.argv.slice(2));
    const report = await generateSchedules(apply);
    console.log(formatReport(report));
    return report;
  } catch (error) {
    console.error(
      error instanceof ScheduleGenerationError
        ? error.message
        : "Schedule generation failed. Check the configured database and schedules table.",
    );
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {
      console.error("Could not close the database connection pool cleanly.");
      process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
