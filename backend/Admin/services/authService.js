const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../../shared/config/db");

const INVALID_CREDENTIALS = "Invalid email or password.";

class AuthenticationError extends Error {}

function getTokenConfiguration() {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN;

  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret, "utf8") < 32 ||
    typeof expiresIn !== "string" ||
    expiresIn.trim().length === 0
  ) {
    throw new Error("JWT configuration is missing or invalid.");
  }

  return { secret, expiresIn: expiresIn.trim() };
}

async function login(email, password) {
  const { secret, expiresIn } = getTokenConfiguration();
  const [users] = await pool.execute(
    "SELECT user_id, full_name, email, password_hash, role, status FROM users WHERE email = ? LIMIT 1",
    [email],
  );
  const user = users[0];

  if (!user || user.status !== "ACTIVE" || user.role !== "ADMIN") {
    throw new AuthenticationError(INVALID_CREDENTIALS);
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw new AuthenticationError(INVALID_CREDENTIALS);
  }

  const accessToken = jwt.sign(
    { user_id: user.user_id, role: user.role },
    secret,
    { expiresIn },
  );

  return {
    accessToken,
    tokenType: "Bearer",
    expiresIn,
    user: {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    },
  };
}

module.exports = { AuthenticationError, login };
