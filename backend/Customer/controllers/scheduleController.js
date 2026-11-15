const scheduleService = require("../services/scheduleService");

async function availability(req, res) {
  try {
    const items = await scheduleService.listAvailability(
      req.scheduleDateRange,
    );
    return res.status(200).json({
      status: "success",
      data: { items },
    });
  } catch (error) {
    console.error("Customer schedule availability request failed.");
    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve schedule availability.",
    });
  }
}

module.exports = { availability };
