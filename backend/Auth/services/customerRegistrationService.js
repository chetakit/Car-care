const bcrypt = require("bcryptjs");
const pool = require("../../shared/config/db");

const PASSWORD_HASH_ROUNDS = 12;
const CUSTOMER_ROLE = "CUSTOMER";
const ACTIVE_STATUS = "ACTIVE";

class DuplicateCustomerEmailError extends Error {}

function isDuplicateEntryError(error) {
  return error.code === "ER_DUP_ENTRY" || error.errno === 1062;
}

async function registerCustomer({ full_name, email, phone, password }) {
  const [existingUsers] = await pool.execute(
    "SELECT user_id FROM users WHERE email = ? LIMIT 1",
    [email],
  );
  if (existingUsers.length > 0) {
    throw new DuplicateCustomerEmailError();
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
  const columns = ["full_name", "email"];
  const values = [full_name, email];
  if (phone !== undefined) {
    columns.push("phone");
    values.push(phone);
  }
  columns.push("password_hash", "role", "status");
  values.push(passwordHash, CUSTOMER_ROLE, ACTIVE_STATUS);

  let result;
  try {
    [result] = await pool.execute(
      `INSERT INTO users (${columns.join(", ")})
      VALUES (${columns.map(() => "?").join(", ")})`,
      values,
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new DuplicateCustomerEmailError();
    }
    throw error;
  }

  return {
    user_id: result.insertId,
    full_name,
    email,
    phone: phone === undefined ? null : phone,
    role: CUSTOMER_ROLE,
    status: ACTIVE_STATUS,
  };
}

module.exports = { DuplicateCustomerEmailError, registerCustomer };
