const pool = require("../../shared/config/db");

class VehicleBrandNotFoundError extends Error {}
class DuplicateVehicleBrandNameError extends Error {}

function isDuplicateEntryError(error) {
  return error.code === "ER_DUP_ENTRY" || error.errno === 1062;
}

function escapeLikeLiteral(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function toVehicleBrand(row) {
  if (!row) return null;
  return {
    brand_id: row.brand_id,
    brand_name: row.brand_name,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findById(vehicleBrandId) {
  const [rows] = await pool.execute(
    "SELECT brand_id, brand_name, status, created_at, updated_at FROM vehicle_brands WHERE brand_id = ?",
    [vehicleBrandId],
  );
  return rows[0] || null;
}

async function list({ page, limit, offset, search, status }) {
  const conditions = [];
  const values = [];

  if (search) {
    conditions.push("brand_name LIKE ? ESCAPE '\\\\'");
    values.push(`%${escapeLikeLiteral(search)}%`);
  }
  if (status) {
    conditions.push("status = ?");
    values.push(status);
  }

  const whereClause = conditions.length
    ? ` WHERE ${conditions.join(" AND ")}`
    : "";
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM vehicle_brands${whereClause}`,
    values,
  );
  const total = Number(countRows[0].total);
  const [rows] = await pool.execute(
    `SELECT brand_id, brand_name, status, created_at, updated_at FROM vehicle_brands${whereClause} ORDER BY brand_name ASC, brand_id ASC LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  return {
    items: rows.map(toVehicleBrand),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(vehicleBrandId) {
  const row = await findById(vehicleBrandId);
  if (!row) {
    throw new VehicleBrandNotFoundError("Vehicle brand not found.");
  }
  return toVehicleBrand(row);
}

async function create({ brand_name }) {
  const [existingRows] = await pool.execute(
    "SELECT brand_id FROM vehicle_brands WHERE brand_name = ? LIMIT 1",
    [brand_name],
  );
  if (existingRows.length > 0) {
    throw new DuplicateVehicleBrandNameError("Vehicle brand name already exists.");
  }

  let insertResult;
  try {
    [insertResult] = await pool.execute(
      "INSERT INTO vehicle_brands (brand_name) VALUES (?)",
      [brand_name],
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new DuplicateVehicleBrandNameError("Vehicle brand name already exists.");
    }
    throw error;
  }

  const created = await findById(insertResult.insertId);
  if (!created) {
    throw new Error("Created vehicle brand could not be retrieved.");
  }
  return toVehicleBrand(created);
}

async function update(vehicleBrandId, { brand_name }) {
  const existing = await findById(vehicleBrandId);
  if (!existing) {
    throw new VehicleBrandNotFoundError("Vehicle brand not found.");
  }

  const [conflicts] = await pool.execute(
    "SELECT brand_id FROM vehicle_brands WHERE brand_name = ? AND brand_id <> ? LIMIT 1",
    [brand_name, vehicleBrandId],
  );
  if (conflicts.length > 0) {
    throw new DuplicateVehicleBrandNameError("Vehicle brand name already exists.");
  }

  try {
    await pool.execute(
      "UPDATE vehicle_brands SET brand_name = ? WHERE brand_id = ?",
      [brand_name, vehicleBrandId],
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new DuplicateVehicleBrandNameError("Vehicle brand name already exists.");
    }
    throw error;
  }

  return getById(vehicleBrandId);
}

async function updateStatus(vehicleBrandId, status) {
  const [result] = await pool.execute(
    "UPDATE vehicle_brands SET status = ? WHERE brand_id = ?",
    [status, vehicleBrandId],
  );
  if (result.affectedRows === 0) {
    const existing = await findById(vehicleBrandId);
    if (!existing) {
      throw new VehicleBrandNotFoundError("Vehicle brand not found.");
    }
  }
  return getById(vehicleBrandId);
}

module.exports = {
  VehicleBrandNotFoundError,
  DuplicateVehicleBrandNameError,
  list,
  getById,
  create,
  update,
  updateStatus,
};
