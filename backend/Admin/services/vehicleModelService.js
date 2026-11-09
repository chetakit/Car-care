const pool = require("../../shared/config/db");

class VehicleModelNotFoundError extends Error {}
class VehicleModelParentNotFoundError extends Error {}
class VehicleModelParentInactiveError extends Error {}
class VehicleModelConflictError extends Error {}
class DuplicateVehicleModelNameError extends Error {}
class VehicleModelValidationError extends Error {}

const MODEL_SELECT = `
  SELECT
    vm.model_id,
    vm.brand_id,
    vb.brand_name,
    vm.vehicle_type_id,
    vt.type_name,
    vm.model_name,
    vm.model_year_start,
    vm.model_year_end,
    vm.status,
    vm.created_at,
    vm.updated_at
  FROM vehicle_models vm
  LEFT JOIN vehicle_brands vb ON vb.brand_id = vm.brand_id
  LEFT JOIN vehicle_types vt ON vt.vehicle_type_id = vm.vehicle_type_id`;

const PATCH_COLUMNS = Object.freeze({
  brand_id: "brand_id",
  vehicle_type_id: "vehicle_type_id",
  model_name: "model_name",
  model_year_start: "model_year_start",
  model_year_end: "model_year_end",
});

function isDuplicateEntryError(error) {
  return error.code === "ER_DUP_ENTRY" || error.errno === 1062;
}

function isForeignKeyParentError(error) {
  return error.code === "ER_NO_REFERENCED_ROW_2" || error.errno === 1452;
}

function mapDatabaseError(error) {
  if (
    error instanceof VehicleModelNotFoundError ||
    error instanceof VehicleModelParentNotFoundError ||
    error instanceof VehicleModelParentInactiveError ||
    error instanceof VehicleModelConflictError ||
    error instanceof DuplicateVehicleModelNameError ||
    error instanceof VehicleModelValidationError
  ) {
    return error;
  }
  if (isDuplicateEntryError(error)) {
    return new DuplicateVehicleModelNameError();
  }
  if (isForeignKeyParentError(error)) {
    return new VehicleModelParentNotFoundError();
  }
  return error;
}

function escapeLikeLiteral(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function toVehicleModel(row) {
  if (!row) return null;
  return {
    model_id: row.model_id,
    brand_id: row.brand_id,
    brand_name: row.brand_name,
    vehicle_type_id: row.vehicle_type_id,
    type_name: row.type_name,
    model_name: row.model_name,
    model_year_start: row.model_year_start,
    model_year_end: row.model_year_end,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findById(modelId) {
  const [rows] = await pool.execute(
    `${MODEL_SELECT} WHERE vm.model_id = ?`,
    [modelId],
  );
  return rows[0] || null;
}

async function findByIdForUpdate(connection, modelId) {
  const [rows] = await connection.execute(
    `SELECT model_id, brand_id, vehicle_type_id, model_name,
      model_year_start, model_year_end, status
    FROM vehicle_models
    WHERE model_id = ?
    FOR UPDATE`,
    [modelId],
  );
  return rows[0] || null;
}

async function getJoinedById(connection, modelId) {
  const [rows] = await connection.execute(
    `${MODEL_SELECT} WHERE vm.model_id = ?`,
    [modelId],
  );
  return rows[0] || null;
}

async function withTransaction(operation) {
  let connection;
  let transactionStarted = false;
  let connectionReusable = true;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const result = await operation(connection);
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        connectionReusable = false;
        console.error("Vehicle model transaction rollback failed.");
      }
    }
    throw mapDatabaseError(error);
  } finally {
    if (connection) {
      if (connectionReusable) {
        connection.release();
      } else {
        try {
          connection.destroy();
        } catch {
          console.error("Vehicle model connection destruction failed.");
        }
      }
    }
  }
}

async function lockParents(connection, parentIds) {
  const parents = new Map();
  const brandId = parentIds.brand_id;
  const vehicleTypeId = parentIds.vehicle_type_id;

  if (brandId !== undefined) {
    const [rows] = await connection.execute(
      "SELECT brand_id, status FROM vehicle_brands WHERE brand_id = ? FOR UPDATE",
      [brandId],
    );
    parents.set("brand_id", rows[0] || null);
  }

  if (vehicleTypeId !== undefined) {
    const [rows] = await connection.execute(
      "SELECT vehicle_type_id, status FROM vehicle_types WHERE vehicle_type_id = ? FOR UPDATE",
      [vehicleTypeId],
    );
    parents.set("vehicle_type_id", rows[0] || null);
  }

  return parents;
}

function validateParents(parents, parentOrder) {
  for (const field of parentOrder) {
    const parent = parents.get(field);
    if (!parent) {
      throw new VehicleModelParentNotFoundError();
    }
    if (parent.status !== "ACTIVE") {
      throw new VehicleModelParentInactiveError();
    }
  }
}

async function assertNoDuplicate(connection, brandId, modelName, modelId) {
  const [rows] =
    modelId === undefined
      ? await connection.execute(
          `SELECT model_id
          FROM vehicle_models
          WHERE brand_id = ? AND model_name = ?
          LIMIT 1`,
          [brandId, modelName],
        )
      : await connection.execute(
          `SELECT model_id
          FROM vehicle_models
          WHERE brand_id = ? AND model_name = ? AND model_id <> ?
          LIMIT 1`,
          [brandId, modelName, modelId],
        );
  if (rows.length > 0) {
    throw new DuplicateVehicleModelNameError();
  }
}

function validateYearRange(start, end) {
  if (start !== null && end !== null && start > end) {
    throw new VehicleModelValidationError(
      "model_year_start must be less than or equal to model_year_end.",
    );
  }
}

async function list({ page, limit, offset, search, brand_id, vehicle_type_id, status }) {
  const conditions = [];
  const values = [];

  if (search) {
    conditions.push("vm.model_name LIKE ? ESCAPE '\\\\'");
    values.push(`%${escapeLikeLiteral(search)}%`);
  }
  if (brand_id !== undefined) {
    conditions.push("vm.brand_id = ?");
    values.push(brand_id);
  }
  if (vehicle_type_id !== undefined) {
    conditions.push("vm.vehicle_type_id = ?");
    values.push(vehicle_type_id);
  }
  if (status !== undefined) {
    conditions.push("vm.status = ?");
    values.push(status);
  }

  const whereClause = conditions.length
    ? ` WHERE ${conditions.join(" AND ")}`
    : "";
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM vehicle_models vm${whereClause}`,
    values,
  );
  const total = Number(countRows[0].total);
  const [rows] = await pool.execute(
    `${MODEL_SELECT}${whereClause} ORDER BY vm.model_name ASC, vm.model_id ASC LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  return {
    items: rows.map(toVehicleModel),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(modelId) {
  const row = await findById(modelId);
  if (!row) {
    throw new VehicleModelNotFoundError();
  }
  return toVehicleModel(row);
}

async function create(data) {
  const parentOrder = Object.keys(data).filter(
    (field) => field === "brand_id" || field === "vehicle_type_id",
  );

  return withTransaction(async (connection) => {
    const parents = await lockParents(connection, {
      brand_id: data.brand_id,
      vehicle_type_id: data.vehicle_type_id,
    });
    validateParents(parents, parentOrder);

    const start = data.model_year_start === undefined
      ? null
      : data.model_year_start;
    const end = data.model_year_end === undefined
      ? null
      : data.model_year_end;
    validateYearRange(start, end);

    await assertNoDuplicate(
      connection,
      data.brand_id,
      data.model_name,
    );

    const [result] = await connection.execute(
      `INSERT INTO vehicle_models
        (brand_id, vehicle_type_id, model_name, model_year_start, model_year_end)
      VALUES (?, ?, ?, ?, ?)`,
      [data.brand_id, data.vehicle_type_id, data.model_name, start, end],
    );
    const created = await getJoinedById(connection, result.insertId);
    if (!created) {
      throw new Error("Created vehicle model could not be retrieved.");
    }
    return toVehicleModel(created);
  });
}

async function update(modelId, changes) {
  return withTransaction(async (connection) => {
    const existing = await findByIdForUpdate(connection, modelId);
    if (!existing) {
      throw new VehicleModelNotFoundError();
    }

    const finalStart = Object.hasOwn(changes, "model_year_start")
      ? changes.model_year_start
      : existing.model_year_start;
    const finalEnd = Object.hasOwn(changes, "model_year_end")
      ? changes.model_year_end
      : existing.model_year_end;
    validateYearRange(finalStart, finalEnd);

    const changedParents = {};
    if (
      Object.hasOwn(changes, "brand_id") &&
      changes.brand_id !== existing.brand_id
    ) {
      changedParents.brand_id = changes.brand_id;
    }
    if (
      Object.hasOwn(changes, "vehicle_type_id") &&
      changes.vehicle_type_id !== existing.vehicle_type_id
    ) {
      changedParents.vehicle_type_id = changes.vehicle_type_id;
    }

    if (Object.keys(changedParents).length > 0) {
      const parents = await lockParents(connection, changedParents);
      const parentOrder = Object.keys(changes).filter(
        (field) => Object.hasOwn(changedParents, field),
      );
      validateParents(parents, parentOrder);

      // The model row lock also blocks new vehicle rows from passing their FK check.
      const [vehicles] = await connection.execute(
        "SELECT vehicle_id FROM vehicles WHERE model_id = ? LIMIT 1 FOR UPDATE",
        [modelId],
      );
      if (vehicles.length > 0) {
        throw new VehicleModelConflictError();
      }
    }

    const finalBrandId = Object.hasOwn(changes, "brand_id")
      ? changes.brand_id
      : existing.brand_id;
    const finalModelName = Object.hasOwn(changes, "model_name")
      ? changes.model_name
      : existing.model_name;
    if (
      Object.hasOwn(changes, "brand_id") ||
      Object.hasOwn(changes, "model_name")
    ) {
      await assertNoDuplicate(
        connection,
        finalBrandId,
        finalModelName,
        modelId,
      );
    }

    const assignments = [];
    const values = [];
    for (const [field, column] of Object.entries(PATCH_COLUMNS)) {
      if (Object.hasOwn(changes, field)) {
        assignments.push(`${column} = ?`);
        values.push(changes[field]);
      }
    }
    if (assignments.length === 0) {
      throw new VehicleModelValidationError("At least one field is required.");
    }

    await connection.execute(
      `UPDATE vehicle_models SET ${assignments.join(", ")} WHERE model_id = ?`,
      [...values, modelId],
    );

    const updated = await getJoinedById(connection, modelId);
    if (!updated) {
      throw new VehicleModelNotFoundError();
    }
    return toVehicleModel(updated);
  });
}

async function updateStatus(modelId, status) {
  return withTransaction(async (connection) => {
    const existing = await findByIdForUpdate(connection, modelId);
    if (!existing) {
      throw new VehicleModelNotFoundError();
    }

    await connection.execute(
      "UPDATE vehicle_models SET status = ? WHERE model_id = ?",
      [status, modelId],
    );
    const updated = await getJoinedById(connection, modelId);
    if (!updated) {
      throw new VehicleModelNotFoundError();
    }
    return toVehicleModel(updated);
  });
}

module.exports = {
  VehicleModelNotFoundError,
  VehicleModelParentNotFoundError,
  VehicleModelParentInactiveError,
  VehicleModelConflictError,
  DuplicateVehicleModelNameError,
  VehicleModelValidationError,
  list,
  getById,
  create,
  update,
  updateStatus,
};
