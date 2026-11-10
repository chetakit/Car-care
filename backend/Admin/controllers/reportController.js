const reportService = require("../services/reportService");

function handleError(res) {
  console.error("Admin report request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to retrieve report.",
  });
}

async function bookings(req, res) {
  try {
    const data = await reportService.bookings(req.reportQuery);
    return res.status(200).json({ status: "success", data });
  } catch {
    return handleError(res);
  }
}

async function revenue(req, res) {
  try {
    const data = await reportService.revenue(req.reportQuery);
    return res.status(200).json({ status: "success", data });
  } catch {
    return handleError(res);
  }
}

module.exports = { bookings, revenue };
