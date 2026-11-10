const bookingService = require("../services/bookingService");

function handleError(res, error) {
  if (error instanceof bookingService.BookingNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Booking not found.",
    });
  }
  if (error instanceof bookingService.BookingValidationError) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }

  console.error("Admin booking request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process booking request.",
  });
}

async function list(req, res) {
  try {
    const data = await bookingService.list(req.bookingListQuery);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getById(req, res) {
  try {
    const data = await bookingService.getById(req.bookingId);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getHistory(req, res) {
  try {
    const data = await bookingService.getHistory(req.bookingId);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { list, getById, getHistory };
