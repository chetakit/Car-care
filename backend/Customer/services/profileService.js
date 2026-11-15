const pool = require("../../shared/config/db");

class ProfileNotFoundError extends Error {}
class CustomerAccessError extends Error {}

const PROFILE_COLUMNS =
  "user_id, full_name, email, phone, role, status, created_at";

function assertActiveCustomer(user) {
  if (user.role !== "CUSTOMER" || user.status !== "ACTIVE") {
    throw new CustomerAccessError();
  }
}

function toProfile(user) {
  return {
    user_id: user.user_id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
  };
}

async function getProfile(userId) {
  const [rows] = await pool.execute(
    `SELECT ${PROFILE_COLUMNS}
    FROM users
    WHERE user_id = ?
    LIMIT 1`,
    [userId],
  );
  const user = rows[0];
  if (!user) {
    throw new ProfileNotFoundError();
  }
  assertActiveCustomer(user);
  return toProfile(user);
}

async function updateProfile(userId, changes) {
  const assignments = [];
  const values = [];
  if (Object.hasOwn(changes, "full_name")) {
    assignments.push("full_name = ?");
    values.push(changes.full_name);
  }
  if (Object.hasOwn(changes, "phone")) {
    assignments.push("phone = ?");
    values.push(changes.phone);
  }

  await pool.execute(
    `UPDATE users
    SET ${assignments.join(", ")}
    WHERE user_id = ? AND role = 'CUSTOMER' AND status = 'ACTIVE'`,
    [...values, userId],
  );

  return getProfile(userId);
}

module.exports = {
  ProfileNotFoundError,
  CustomerAccessError,
  getProfile,
  updateProfile,
};
