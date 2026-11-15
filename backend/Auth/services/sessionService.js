const pool = require("../../shared/config/db");

// [STAFF] เพิ่ม "STAFF" เพื่อให้ GET /api/auth/me ตอบข้อมูลพนักงานได้
const SESSION_ROLES = new Set(["ADMIN", "CUSTOMER", "STAFF"]);

class InvalidSessionError extends Error {}

async function getAuthenticatedUser({ user_id, role }) {
  const [users] = await pool.execute(
    `SELECT user_id, full_name, email, phone, role, status
    FROM users
    WHERE user_id = ?
    LIMIT 1`,
    [user_id],
  );
  const user = users[0];

  if (
    !user ||
    user.status !== "ACTIVE" ||
    !SESSION_ROLES.has(user.role) ||
    user.role !== role
  ) {
    throw new InvalidSessionError();
  }

  return {
    user_id: user.user_id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
}

module.exports = { InvalidSessionError, getAuthenticatedUser };
