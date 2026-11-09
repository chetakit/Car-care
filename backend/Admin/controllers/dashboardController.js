const dashboardService = require("../services/dashboardService");

async function getSummary(req, res) {
  try {
    const summary = await dashboardService.getSummary();
    return res.status(200).json({
      status: "success",
      data: summary,
    });
  } catch {
    console.error("Admin dashboard summary request failed.");
    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve dashboard summary.",
    });
  }
}

module.exports = { getSummary };
