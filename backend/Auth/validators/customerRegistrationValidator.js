const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9]{10}$/;
const ALLOWED_FIELDS = new Set([
  "full_name",
  "email",
  "phone",
  "password",
]);
const MIN_PASSWORD_LENGTH = 1;
const MAX_PASSWORD_LENGTH = 1024;

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function validateCustomerRegistration(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendValidationError(res, "Request body must be a JSON object.");
  }

  if (Object.keys(body).some((field) => !ALLOWED_FIELDS.has(field))) {
    return sendValidationError(res, "Request contains unsupported fields.");
  }

  if (
    typeof body.full_name !== "string" ||
    typeof body.email !== "string" ||
    typeof body.password !== "string"
  ) {
    return sendValidationError(
      res,
      "full_name, email, and password are required.",
    );
  }

  const fullName = body.full_name.trim();
  const email = body.email.trim();
  const passwordLength = Array.from(body.password).length;
  if (
    fullName.length === 0 ||
    Array.from(fullName).length > 100 ||
    email.length === 0 ||
    email.length > 150 ||
    !EMAIL_PATTERN.test(email)
  ) {
    return sendValidationError(
      res,
      "Provide a valid name and email address.",
    );
  }

  if (
    passwordLength < MIN_PASSWORD_LENGTH ||
    body.password.length > MAX_PASSWORD_LENGTH
  ) {
    return sendValidationError(
      res,
      "Password must contain 1 to 1024 characters.",
    );
  }

  let phone;
  if (Object.hasOwn(body, "phone")) {
    if (
      body.phone !== null &&
      (typeof body.phone !== "string" || !PHONE_PATTERN.test(body.phone))
    ) {
      return sendValidationError(
        res,
        "phone must be null or exactly 10 digits.",
      );
    }
    phone = typeof body.phone === "string" ? body.phone : null;
  }

  req.customerRegistration = {
    full_name: fullName,
    email: email.toLowerCase(),
    password: body.password,
    ...(Object.hasOwn(body, "phone") ? { phone } : {}),
  };
  return next();
}

module.exports = validateCustomerRegistration;
