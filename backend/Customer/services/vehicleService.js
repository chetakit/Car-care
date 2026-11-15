const pool = require("../../shared/config/db");

class VehicleNotFoundError extends Error {}
class VehicleModelUnavailableError extends Error {}
class DuplicateLicensePlateError extends Error {}
class VehicleHasBookingsError extends Error {}

const VEHICLE_SELECT = `
  SELECT
    v.vehicle_id,
    v.model_id,
    v.license_plate,
    v.production_year,
    v.province,
    v.color,
    v.status,
    vm.model_name,
    vb.brand_name,
    vt.type_name
  FROM vehicles v
  LEFT JOIN vehicle_models vm ON vm.model_id = v.model_id
  LEFT JOIN vehicle_brands vb ON vb.brand_id = vm.brand_id
  LEFT JOIN vehicle_types vt ON vt.vehicle_type_id = vm.vehicle_type_id`;

const UPDATE_COLUMNS = Object.freeze({
  model_id: "model_id",
  license_plate: "license_plate",
  production_year: "production_year",
  province: "province",
  color: "color",
});

function isDuplicateEntryError(error) {
  return error.code === "ER_DUP_ENTRY" || error.errno === 1062;
}

function isForeignKeyError(error) {
  return (
    error.code === "ER_NO_REFERENCED_ROW_2" ||
    error.errno === 1452 ||
    error.code === "ER_ROW_IS_REFERENCED_2" ||
    error.errno === 1451
  );
}

function toVehicle(row) {
  return {
    vehicle_id: row.vehicle_id,
    model_id: row.model_id,
    license_plate: row.license_plate,
    production_year: row.production_year,
    province: row.province,
    color: row.color,
    status: row.status,
    model_name: row.model_name,
    brand_name: row.brand_name,
    type_name: row.type_name,
  };
}

async function findOwnedById(userId, vehicleId) {
  const [rows] = await pool.execute(
    `${VEHICLE_SELECT}
    WHERE v.vehicle_id = ? AND v.user_id = ?
    LIMIT 1`,
    [vehicleId, userId],
  );
  return rows[0] || null;
}

async function assertActiveModel(modelId) {
  const [rows] = await pool.execute(
    `SELECT model_id
    FROM vehicle_models
    WHERE model_id = ? AND status = 'ACTIVE'
    LIMIT 1`,
    [modelId],
  );
  if (rows.length === 0) {
    throw new VehicleModelUnavailableError();
  }
}

async function assertLicensePlateAvailable(licensePlate, vehicleId) {
  const [rows] =
    vehicleId === undefined
      ? await pool.execute(
          "SELECT vehicle_id FROM vehicles WHERE license_plate = ? LIMIT 1",
          [licensePlate],
        )
      : await pool.execute(
          `SELECT vehicle_id FROM vehicles
          WHERE license_plate = ? AND vehicle_id <> ?
          LIMIT 1`,
          [licensePlate, vehicleId],
        );
  if (rows.length > 0) {
    throw new DuplicateLicensePlateError();
  }
}

function mapWriteError(error) {
  if (isDuplicateEntryError(error)) {
    return new DuplicateLicensePlateError();
  }
  if (error.code === "ER_NO_REFERENCED_ROW_2" || error.errno === 1452) {
    return new VehicleModelUnavailableError();
  }
  return error;
}

async function list(userId) {
  const [rows] = await pool.execute(
    `${VEHICLE_SELECT}
    WHERE v.user_id = ?
    ORDER BY v.vehicle_id DESC`,
    [userId],
  );
  return rows.map(toVehicle);
}

async function create(userId, data) {
  await assertActiveModel(data.model_id);
  await assertLicensePlateAvailable(data.license_plate);

  const columns = ["user_id", "model_id", "license_plate"];
  const values = [userId, data.model_id, data.license_plate];
  for (const field of ["production_year", "province", "color"]) {
    if (Object.hasOwn(data, field)) {
      columns.push(field);
      values.push(data[field]);
    }
  }
  columns.push("status");
  values.push("ACTIVE");

  let result;
  try {
    [result] = await pool.execute(
      `INSERT INTO vehicles (${columns.join(", ")})
      VALUES (${columns.map(() => "?").join(", ")})`,
      values,
    );
  } catch (error) {
    throw mapWriteError(error);
  }

  const created = await findOwnedById(userId, result.insertId);
  if (!created) {
    throw new Error("Created vehicle could not be retrieved.");
  }
  return toVehicle(created);
}

async function update(userId, vehicleId, changes) {
  const existing = await findOwnedById(userId, vehicleId);
  if (!existing) {
    throw new VehicleNotFoundError();
  }

  if (Object.hasOwn(changes, "model_id")) {
    await assertActiveModel(changes.model_id);
  }
  if (Object.hasOwn(changes, "license_plate")) {
    await assertLicensePlateAvailable(changes.license_plate, vehicleId);
  }

  const assignments = [];
  const values = [];
  for (const [field, column] of Object.entries(UPDATE_COLUMNS)) {
    if (Object.hasOwn(changes, field)) {
      assignments.push(`${column} = ?`);
      values.push(changes[field]);
    }
  }

  try {
    await pool.execute(
      `UPDATE vehicles
      SET ${assignments.join(", ")}
      WHERE vehicle_id = ? AND user_id = ?`,
      [...values, vehicleId, userId],
    );
  } catch (error) {
    throw mapWriteError(error);
  }

  const updated = await findOwnedById(userId, vehicleId);
  if (!updated) {
    throw new VehicleNotFoundError();
  }
  return toVehicle(updated);
}

async function deleteVehicle(userId, vehicleId) {
  let connection;
  let transactionStarted = false;
  let connectionReusable = true;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [vehicles] = await connection.execute(
      `SELECT vehicle_id
      FROM vehicles
      WHERE vehicle_id = ? AND user_id = ?
      FOR UPDATE`,
      [vehicleId, userId],
    );
    if (vehicles.length === 0) {
      throw new VehicleNotFoundError();
    }

    const [bookings] = await connection.execute(
      `SELECT booking_id
      FROM bookings
      WHERE vehicle_id = ?
      LIMIT 1
      FOR UPDATE`,
      [vehicleId],
    );
    if (bookings.length > 0) {
      throw new VehicleHasBookingsError();
    }

    const [result] = await connection.execute(
      "DELETE FROM vehicles WHERE vehicle_id = ? AND user_id = ?",
      [vehicleId, userId],
    );
    if (result.affectedRows !== 1) {
      throw new VehicleNotFoundError();
    }

    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        connectionReusable = false;
        console.error("Vehicle deletion rollback failed.");
      }
    }
    if (error instanceof VehicleNotFoundError ||
        error instanceof VehicleHasBookingsError) {
      throw error;
    }
    if (isForeignKeyError(error)) {
      throw new VehicleHasBookingsError();
    }
    throw error;
  } finally {
    if (connection) {
      if (connectionReusable) {
        connection.release();
      } else {
        try {
          connection.destroy();
        } catch {
          console.error("Vehicle deletion connection cleanup failed.");
        }
      }
    }
  }
}

module.exports = {
  VehicleNotFoundError,
  VehicleModelUnavailableError,
  DuplicateLicensePlateError,
  VehicleHasBookingsError,
  list,
  create,
  update,
  deleteVehicle,
};
