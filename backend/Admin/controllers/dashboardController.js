const dashboardService = require("../services/dashboardService");

async function getSummary(req, res) {
  try {
    const summary = await dashboardService.getSummary();
    return res.status(200).json({
      status: "success",
      data: summary,
    });
  } catch (error) {
    console.error("Admin dashboard summary request failed.", {
      message: error.message,
      code: error.code,
      errno: error.errno,
    });
    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve dashboard summary.",
    });
  }
}

module.exports = { getSummary };
