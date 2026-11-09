const authService = require("../services/authService");

async function login(req, res) {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    return res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    if (error instanceof authService.AuthenticationError) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password.",
      });
    }

    console.error("Admin authentication failed due to an internal error.");
    return res.status(500).json({
      status: "error",
      message: "Unable to process login request.",
    });
  }
}

function me(req, res) {
  return res.status(200).json({
    status: "success",
    data: {
      user: req.user,
    },
  });
}

function logout(req, res) {
  return res.status(200).json({
    status: "success",
    message:
      "Logout successful. Remove the JWT from client storage; this stateless token remains valid until it expires because no token blacklist is configured.",
  });
}

module.exports = { login, me, logout };
