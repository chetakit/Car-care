const sessionService = require("../services/sessionService");

async function me(req, res) {
  try {
    const user = await sessionService.getAuthenticatedUser(req.user);
    return res.status(200).json({
      status: "success",
      data: { user },
    });
  } catch (error) {
    if (error instanceof sessionService.InvalidSessionError) {
      return res.status(401).json({
        status: "error",
        message: "Invalid or expired token.",
      });
    }

    console.error("Could not verify the authenticated user session.");
    return res.status(500).json({
      status: "error",
      message: "Unable to verify the authenticated user.",
    });
  }
}

module.exports = { me };
