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

module.exports = { authenticateToken, requireAdmin };
