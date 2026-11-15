const ALLOWED_FIELDS = new Set(["full_name", "phone"]);

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function validateProfileUpdate(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendValidationError(res, "Request body must be a JSON object.");
  }

  const fields = Object.keys(body);
  if (fields.length === 0) {
    return sendValidationError(res, "At least one field is required.");
  }
  if (fields.some((field) => !ALLOWED_FIELDS.has(field))) {
    return sendValidationError(res, "Request contains unsupported fields.");
  }

  const changes = {};
  if (Object.hasOwn(body, "full_name")) {
    if (typeof body.full_name !== "string") {
      return sendValidationError(res, "full_name must be a string.");
    }
    const fullName = body.full_name.trim();
    if (
      fullName.length === 0 ||
      Array.from(fullName).length > 100
    ) {
      return sendValidationError(
        res,
        "full_name must contain 1 to 100 characters.",
      );
    }
    changes.full_name = fullName;
  }

  if (Object.hasOwn(body, "phone")) {
    if (
      body.phone !== null &&
      (typeof body.phone !== "string" ||
        body.phone.trim().length === 0 ||
        body.phone.trim().length > 20)
    ) {
      return sendValidationError(
        res,
        "phone must be null or a string of 1 to 20 characters.",
      );
    }
    changes.phone =
      typeof body.phone === "string" ? body.phone.trim() : null;
  }

  req.profileUpdate = changes;
  return next();
}

module.exports = validateProfileUpdate;
