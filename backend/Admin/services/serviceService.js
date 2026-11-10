const pool = require("../../shared/config/db");

class ServiceNotFoundError extends Error {}
class DuplicateServiceNameError extends Error {}
class VehicleTypeNotFoundError extends Error {}
class VehicleTypeInactiveError extends Error {}

const SERVICE_COLUMNS =
  "service_id, service_name, description, duration_minutes, status, created_at, updated_at";
const PRICE_COLUMNS = `
  sp.service_price_id,
  sp.service_id,
  sp.vehicle_type_id,
  vt.type_name,
  sp.price,
  sp.created_at,
  sp.updated_at`;
const SERVICE_PATCH_COLUMNS = Object.freeze({
  service_name: "service_name",
  description: "description",
  duration_minutes: "duration_minutes",
});

function isDuplicateEntryError(error) {
  return error.code === "ER_DUP_ENTRY" || error.errno === 1062;
}

function isForeignKeyError(error) {
  return error.code === "ER_NO_REFERENCED_ROW_2" || error.errno === 1452;
}

function getForeignKeyDomainError(error) {
  const message = [error.sqlMessage, error.message]
    .filter((value) => typeof value === "string")
    .join(" ");

  if (!/`?service_prices`?/i.test(message)) {
    return null;
  }

  const referencesVehicleType =
    /FOREIGN KEY\s*\(\s*`?vehicle_type_id`?\s*\)/i.test(message) &&
    /REFERENCES\s+(?:`[^`]+`\s*\.\s*)?`?vehicle_types`?/i.test(message);
  if (referencesVehicleType) {
    return new VehicleTypeNotFoundError();
  }

  const referencesService =
    /FOREIGN KEY\s*\(\s*`?service_id`?\s*\)/i.test(message) &&
    /REFERENCES\s+(?:`[^`]+`\s*\.\s*)?`?services`?/i.test(message);
  if (referencesService) {
    return new ServiceNotFoundError();
  }

  return null;
}

function escapeLikeLiteral(value) {
  return value.replace(/[\\%_]/g, "\\$&");
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
        console.error("Service price transaction rollback failed.");
      }
    }

    if (isForeignKeyError(error)) {
      const domainError = getForeignKeyDomainError(error);
      if (domainError) {
        throw domainError;
      }
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
          console.error("Service price connection destruction failed.");
        }
      }
    }
  }
}

async function findServiceById(serviceId) {
  const [rows] = await pool.execute(
    `SELECT ${SERVICE_COLUMNS} FROM services WHERE service_id = ?`,
    [serviceId],
  );
  return rows[0] || null;
}

async function getPricesUsing(executor, serviceId) {
  const [rows] = await executor.execute(
    `SELECT ${PRICE_COLUMNS}
    FROM service_prices sp
    INNER JOIN vehicle_types vt
      ON vt.vehicle_type_id = sp.vehicle_type_id
    WHERE sp.service_id = ?
    ORDER BY vt.type_name ASC, sp.vehicle_type_id ASC`,
    [serviceId],
  );
  return rows;
}

async function list({ page, limit, offset, search, status }) {
  const conditions = [];
  const values = [];

  if (search) {
    conditions.push("service_name LIKE ? ESCAPE '\\\\'");
    values.push(`%${escapeLikeLiteral(search)}%`);
  }
  if (status !== undefined) {
    conditions.push("status = ?");
    values.push(status);
  }

  const whereClause = conditions.length
    ? ` WHERE ${conditions.join(" AND ")}`
    : "";
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM services${whereClause}`,
    values,
  );
  const total = Number(countRows[0].total);
  const [rows] = await pool.execute(
    `SELECT ${SERVICE_COLUMNS}
    FROM services${whereClause}
    ORDER BY service_name ASC, service_id ASC
    LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  return {
    items: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(serviceId) {
  const row = await findServiceById(serviceId);
  if (!row) {
    throw new ServiceNotFoundError();
  }
  return row;
}

async function create({ service_name, description, duration_minutes }) {
  const [existingRows] = await pool.execute(
    "SELECT service_id FROM services WHERE service_name = ? LIMIT 1",
    [service_name],
  );
  if (existingRows.length > 0) {
    throw new DuplicateServiceNameError();
  }

  let result;
  try {
    [result] = await pool.execute(
      "INSERT INTO services (service_name, description, duration_minutes) VALUES (?, ?, ?)",
      [
        service_name,
        description === undefined ? null : description,
        duration_minutes,
      ],
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new DuplicateServiceNameError();
    }
    throw error;
  }

  const created = await findServiceById(result.insertId);
  if (!created) {
    throw new Error("Created service could not be retrieved.");
  }
  return created;
}

async function update(serviceId, changes) {
  const existing = await findServiceById(serviceId);
  if (!existing) {
    throw new ServiceNotFoundError();
  }

  if (
    Object.hasOwn(changes, "service_name") &&
    changes.service_name !== existing.service_name
  ) {
    const [conflicts] = await pool.execute(
      "SELECT service_id FROM services WHERE service_name = ? AND service_id <> ? LIMIT 1",
      [changes.service_name, serviceId],
    );
    if (conflicts.length > 0) {
      throw new DuplicateServiceNameError();
    }
  }

  const assignments = [];
  const values = [];
  for (const [field, column] of Object.entries(SERVICE_PATCH_COLUMNS)) {
    if (Object.hasOwn(changes, field)) {
      assignments.push(`${column} = ?`);
      values.push(changes[field]);
    }
  }

  try {
    await pool.execute(
      `UPDATE services SET ${assignments.join(", ")} WHERE service_id = ?`,
      [...values, serviceId],
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new DuplicateServiceNameError();
    }
    throw error;
  }

  return getById(serviceId);
}

async function updateStatus(serviceId, status) {
  const [result] = await pool.execute(
    "UPDATE services SET status = ? WHERE service_id = ?",
    [status, serviceId],
  );
  if (result.affectedRows === 0) {
    const existing = await findServiceById(serviceId);
    if (!existing) {
      throw new ServiceNotFoundError();
    }
  }
  return getById(serviceId);
}

async function getPrices(serviceId) {
  const service = await findServiceById(serviceId);
  if (!service) {
    throw new ServiceNotFoundError();
  }
  return getPricesUsing(pool, serviceId);
}

async function upsertPrices(serviceId, prices) {
  return withTransaction(async (connection) => {
    const [serviceRows] = await connection.execute(
      "SELECT service_id FROM services WHERE service_id = ? FOR UPDATE",
      [serviceId],
    );
    if (serviceRows.length === 0) {
      throw new ServiceNotFoundError();
    }

    const vehicleTypeIds = prices
      .map((item) => item.vehicle_type_id)
      .sort((left, right) => left - right);
    const placeholders = vehicleTypeIds.map(() => "?").join(", ");
    const [vehicleTypes] = await connection.execute(
      `SELECT vehicle_type_id, status
      FROM vehicle_types
      WHERE vehicle_type_id IN (${placeholders})
      ORDER BY vehicle_type_id ASC
      FOR UPDATE`,
      vehicleTypeIds,
    );
    const vehicleTypesById = new Map(
      vehicleTypes.map((vehicleType) => [
        Number(vehicleType.vehicle_type_id),
        vehicleType,
      ]),
    );

    for (const { vehicle_type_id: vehicleTypeId } of prices) {
      const vehicleType = vehicleTypesById.get(vehicleTypeId);
      if (!vehicleType) {
        throw new VehicleTypeNotFoundError();
      }
      if (vehicleType.status !== "ACTIVE") {
        throw new VehicleTypeInactiveError();
      }
    }

    for (const { vehicle_type_id: vehicleTypeId, price } of prices) {
      await connection.execute(
        `INSERT INTO service_prices (service_id, vehicle_type_id, price)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE price = ?`,
        [serviceId, vehicleTypeId, price, price],
      );
    }

    return getPricesUsing(connection, serviceId);
  });
}

module.exports = {
  ServiceNotFoundError,
  DuplicateServiceNameError,
  VehicleTypeNotFoundError,
  VehicleTypeInactiveError,
  list,
  getById,
  create,
  update,
  updateStatus,
  getPrices,
  upsertPrices,
};
