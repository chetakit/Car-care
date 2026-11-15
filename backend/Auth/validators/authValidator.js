const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_LENGTH = 1024;

function validateLogin(req, res, next) {
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      status: "error",
      message: "A valid email and password are required.",
    });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = body.password;

  if (
    email.length === 0 ||
    email.length > 254 ||
    !EMAIL_PATTERN.test(email) ||
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return res.status(400).json({
      status: "error",
      message: "A valid email and password are required.",
    });
  }

  req.body.email = email.toLowerCase();
  return next();
}

module.exports = validateLogin;
