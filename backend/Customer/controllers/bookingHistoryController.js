const bookingHistoryService = require("../services/bookingHistoryService");

function handleError(res, error) {
  if (error instanceof bookingHistoryService.VehicleNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Vehicle not found.",
    });
  }

  console.error("Customer booking history request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to retrieve booking history.",
  });
}

async function list(req, res) {
  try {
    const data = await bookingHistoryService.list({
      ...req.bookingHistoryQuery,
      userId: req.user.user_id,
    });
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function vehicleBookings(req, res) {
  try {
    const data = await bookingHistoryService.list({
      ...req.bookingHistoryQuery,
      userId: req.user.user_id,
      vehicleId: req.vehicleId,
    });
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { list, vehicleBookings };
