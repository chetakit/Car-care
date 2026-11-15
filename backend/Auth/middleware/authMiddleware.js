const jwt = require("jsonwebtoken");

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

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({
      status: "error",
      message: "Administrator access required.",
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

// [STAFF] ใช้กับ /api/staff/* — อนุญาต STAFF และ ADMIN (เผื่อแอดมินต้องช่วยดูคิว)
function requireStaff(req, res, next) {
  if (!req.user || (req.user.role !== "STAFF" && req.user.role !== "ADMIN")) {
    return res.status(403).json({
      status: "error",
      message: "Staff access required.",
    });
  }

  return next();
}

// [STAFF] ใช้กับ /api/auth/me และ /api/auth/logout ให้ทุก role ที่ล็อกอินได้
function requireAnySignedInRole(req, res, next) {
  if (
    !req.user ||
    !["CUSTOMER", "ADMIN", "STAFF"].includes(req.user.role)
  ) {
    return res.status(403).json({
      status: "error",
      message: "Signed-in account required.",
    });
  }

  return next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireCustomer,
  requireCustomerOrAdmin,
  requireStaff, // [STAFF]
  requireAnySignedInRole, // [STAFF]
};
