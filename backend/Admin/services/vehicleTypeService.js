const pool = require("../../shared/config/db");

class VehicleTypeNotFoundError extends Error {}
class DuplicateVehicleTypeNameError extends Error {}

function isDuplicateEntryError(error) {
  return error.code === "ER_DUP_ENTRY" || error.errno === 1062;
}

function toVehicleType(row) {
  if (!row) return null;
  return {
    vehicle_type_id: row.vehicle_type_id,
    type_name: row.type_name,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findById(vehicleTypeId) {
  const [rows] = await pool.execute(
    "SELECT vehicle_type_id, type_name, description, status, created_at, updated_at FROM vehicle_types WHERE vehicle_type_id = ?",
    [vehicleTypeId],
  );
  return rows[0] || null;
}

async function list({ page, limit, offset, search, status }) {
  const conditions = [];
  const values = [];

  if (search) {
    conditions.push("type_name LIKE ?");
    values.push(`%${search}%`);
  }
  if (status) {
    conditions.push("status = ?");
    values.push(status);
  }

  const whereClause = conditions.length
    ? ` WHERE ${conditions.join(" AND ")}`
    : "";
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM vehicle_types${whereClause}`,
    values,
  );
  const total = Number(countRows[0].total);
  const [rows] = await pool.execute(
    `SELECT vehicle_type_id, type_name, description, status, created_at, updated_at FROM vehicle_types${whereClause} ORDER BY type_name ASC LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  return {
    items: rows.map(toVehicleType),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(vehicleTypeId) {
  const row = await findById(vehicleTypeId);
  if (!row) {
    throw new VehicleTypeNotFoundError("Vehicle type not found.");
  }
  return toVehicleType(row);
}

async function create({ type_name, description }) {
  const [existingRows] = await pool.execute(
    "SELECT vehicle_type_id FROM vehicle_types WHERE type_name = ? LIMIT 1",
    [type_name],
  );
  if (existingRows.length > 0) {
    throw new DuplicateVehicleTypeNameError("Vehicle type name already exists.");
  }

  let insertResult;
  try {
    [insertResult] = await pool.execute(
      "INSERT INTO vehicle_types (type_name, description) VALUES (?, ?)",
      [type_name, description === undefined ? null : description],
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new DuplicateVehicleTypeNameError("Vehicle type name already exists.");
    }
    throw error;
  }

  const created = await findById(insertResult.insertId);
  if (!created) {
    throw new Error("Created vehicle type could not be retrieved.");
  }
  return toVehicleType(created);
}

async function update(vehicleTypeId, changes) {
  const existing = await findById(vehicleTypeId);
  if (!existing) {
    throw new VehicleTypeNotFoundError("Vehicle type not found.");
  }

  const fields = [];
  const values = [];
  if (Object.hasOwn(changes, "type_name")) {
    fields.push("type_name = ?");
    values.push(changes.type_name);
  }
  if (Object.hasOwn(changes, "description")) {
    fields.push("description = ?");
    values.push(changes.description);
  }

  try {
    await pool.execute(
      `UPDATE vehicle_types SET ${fields.join(", ")} WHERE vehicle_type_id = ?`,
      [...values, vehicleTypeId],
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new DuplicateVehicleTypeNameError("Vehicle type name already exists.");
    }
    throw error;
  }

  return getById(vehicleTypeId);
}

async function updateStatus(vehicleTypeId, status) {
  const [result] = await pool.execute(
    "UPDATE vehicle_types SET status = ? WHERE vehicle_type_id = ?",
    [status, vehicleTypeId],
  );
  if (result.affectedRows === 0) {
    const existing = await findById(vehicleTypeId);
    if (!existing) {
      throw new VehicleTypeNotFoundError("Vehicle type not found.");
    }
  }
  return getById(vehicleTypeId);
}

module.exports = {
  VehicleTypeNotFoundError,
  DuplicateVehicleTypeNameError,
  list,
  getById,
  create,
  update,
  updateStatus,
};
