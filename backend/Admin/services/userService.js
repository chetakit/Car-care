const pool = require("../../shared/config/db");

class UserNotFoundError extends Error {}
class DuplicateUserEmailError extends Error {}
class SelfRoleChangeError extends Error {}
class SelfDeactivationError extends Error {}

const USER_COLUMNS =
  "user_id, full_name, email, phone, role, status, created_at, updated_at";
const PATCH_COLUMNS = Object.freeze({
  full_name: "full_name",
  email: "email",
  phone: "phone",
});
const ROLES = new Set(["ADMIN", "CUSTOMER", "STAFF"]);
const STATUSES = new Set(["ACTIVE", "INACTIVE"]);

function isDuplicateEntryError(error) {
  return error.code === "ER_DUP_ENTRY" || error.errno === 1062;
}

function escapeLikeLiteral(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function findById(userId) {
  const [rows] = await pool.execute(
    `SELECT ${USER_COLUMNS} FROM users WHERE user_id = ?`,
    [userId],
  );
  return rows[0] || null;
}

async function list({ page, limit, offset, search, role, status }) {
  const conditions = [];
  const values = [];
  if (search) {
    const pattern = `%${escapeLikeLiteral(search)}%`;
    conditions.push(
      "(full_name LIKE ? ESCAPE '\\\\' OR email LIKE ? ESCAPE '\\\\' OR phone LIKE ? ESCAPE '\\\\')",
    );
    values.push(pattern, pattern, pattern);
  }
  if (role !== undefined) {
    conditions.push("role = ?");
    values.push(role);
  }
  if (status !== undefined) {
    conditions.push("status = ?");
    values.push(status);
  }
  const whereClause = conditions.length
    ? ` WHERE ${conditions.join(" AND ")}`
    : "";
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM users${whereClause}`,
    values,
  );
  const total = Number(countRows[0].total);
  const [rows] = await pool.execute(
    `SELECT ${USER_COLUMNS} FROM users${whereClause}
    ORDER BY full_name ASC, user_id ASC
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

async function getById(userId) {
  const user = await findById(userId);
  if (!user) {
    throw new UserNotFoundError();
  }
  return user;
}

async function update(userId, changes) {
  if (!(await findById(userId))) {
    throw new UserNotFoundError();
  }

  if (Object.hasOwn(changes, "email")) {
    const [existingRows] = await pool.execute(
      "SELECT user_id FROM users WHERE email = ? AND user_id <> ? LIMIT 1",
      [changes.email, userId],
    );
    if (existingRows.length > 0) {
      throw new DuplicateUserEmailError();
    }
  }

  const assignments = [];
  const values = [];
  for (const [field, column] of Object.entries(PATCH_COLUMNS)) {
    if (Object.hasOwn(changes, field)) {
      assignments.push(`${column} = ?`);
      values.push(changes[field]);
    }
  }

  try {
    await pool.execute(
      `UPDATE users SET ${assignments.join(", ")} WHERE user_id = ?`,
      [...values, userId],
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new DuplicateUserEmailError();
    }
    throw error;
  }
  return getById(userId);
}

async function updateRole(userId, role, authenticatedUserId) {
  if (Number(userId) === Number(authenticatedUserId)) {
    throw new SelfRoleChangeError();
  }

  const [result] = await pool.execute(
    "UPDATE users SET role = ? WHERE user_id = ?",
    [role, userId],
  );
  if (result.affectedRows === 0 && !(await findById(userId))) {
    throw new UserNotFoundError();
  }
  return getById(userId);
}

async function updateStatus(userId, status, authenticatedUserId) {
  if (!(await findById(userId))) {
    throw new UserNotFoundError();
  }
  if (
    Number(userId) === Number(authenticatedUserId) &&
    status === "INACTIVE"
  ) {
    throw new SelfDeactivationError();
  }

  const [result] = await pool.execute(
    "UPDATE users SET status = ? WHERE user_id = ?",
    [status, userId],
  );
  if (result.affectedRows === 0 && !(await findById(userId))) {
    throw new UserNotFoundError();
  }
  return getById(userId);
}

module.exports = {
  UserNotFoundError,
  DuplicateUserEmailError,
  SelfRoleChangeError,
  SelfDeactivationError,
  ROLES,
  STATUSES,
  list,
  getById,
  update,
  updateRole,
  updateStatus,
};
