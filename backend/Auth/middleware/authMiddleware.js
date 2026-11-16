const jwt = require("jsonwebtoken");
const pool = require("../../shared/config/db");

function authenticateToken(req, res, next) {
  const authorization = req.get("authorization");
  const match =
    typeof authorization === "string" &&
    authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return res.status(401).json({
      status: "error",
      message: "Authentication required.",
    });
  }

  const secret = process.env.JWT_SECRET;
  if (typeof secret !== "string" || secret.length === 0) {
    return res.status(500).json({
      status: "error",
      message: "Unable to authenticate request.",
    });
  }

  try {
    const payload = jwt.verify(match[1], secret);

    if (
      typeof payload !== "object" ||
      payload === null ||
      !Number.isInteger(payload.user_id) ||
      typeof payload.role !== "string"
    ) {
      return res.status(401).json({
        status: "error",
        message: "Invalid or expired token.",
      });
    }

    req.user = {
      user_id: payload.user_id,
      role: payload.role,
    };
    return next();
  } catch {
    return res.status(401).json({
      status: "error",
      message: "Invalid or expired token.",
    });
  }
}

function requireCurrentRole(requiredRole) {
  return async function verifyCurrentRole(req, res, next) {
    try {
      const [users] = await pool.execute(
        "SELECT role, status FROM users WHERE user_id = ? LIMIT 1",
        [req.user.user_id],
      );
      const user = users[0];

      if (
        !user ||
        user.status !== "ACTIVE" ||
        user.role !== req.user.role
      ) {
        return res.status(401).json({
          status: "error",
          message: "Invalid or expired token.",
        });
      }

      if (user.role !== requiredRole) {
        return res.status(403).json({
          status: "error",
          message: `${requiredRole === "ADMIN" ? "Administrator" : "Staff"} access required.`,
        });
      }

      return next();
    } catch {
      console.error("Role-based authorization failed.");
      return res.status(500).json({
        status: "error",
        message: "Unable to authorize request.",
      });
    }
  };
}

const requireAdmin = requireCurrentRole("ADMIN");
const requireCurrentAdmin = requireAdmin;
const requireCurrentStaff = requireCurrentRole("STAFF");

async function requireCurrentStaffOrAdmin(req, res, next) {
  try {
    const [users] = await pool.execute(
      "SELECT role, status FROM users WHERE user_id = ? LIMIT 1",
      [req.user.user_id],
    );
    const user = users[0];
    if (!user || user.status !== "ACTIVE" || user.role !== req.user.role) {
      return res.status(401).json({ status: "error", message: "Invalid or expired token." });
    }
    if (!["STAFF", "ADMIN"].includes(user.role)) {
      return res.status(403).json({ status: "error", message: "Staff or administrator access required." });
    }
    return next();
  } catch {
    console.error("Role-based authorization failed.");
    return res.status(500).json({ status: "error", message: "Unable to authorize request." });
  }
}

function requireSupportedSessionRole(req, res, next) {
  if (
    !req.user ||
    !["ADMIN", "STAFF", "CUSTOMER"].includes(req.user.role)
  ) {
    return res.status(403).json({
      status: "error",
      message: "Supported account role required.",
    });
  }
  return next();
}

function requireCustomer(req, res, next) {
  if (!req.user || req.user.role !== "CUSTOMER") {
    return res.status(403).json({
      status: "error",
      message: "Customer access required.",
    });
  }

  return next();
}

function requireCustomerOrAdmin(req, res, next) {
  if (
    !req.user ||
    (req.user.role !== "CUSTOMER" && req.user.role !== "ADMIN")
  ) {
    return res.status(403).json({
      status: "error",
      message: "Customer or administrator access required.",
    });
  }

  return next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireCurrentAdmin,
  requireCurrentStaff,
  requireCurrentStaffOrAdmin,
  requireCustomer,
  requireCustomerOrAdmin,
  requireSupportedSessionRole,
};
