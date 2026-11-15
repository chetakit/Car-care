const bookingService = require("../services/bookingService");

function handleError(res, error) {
  if (error instanceof bookingService.BookingNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: error.message,
    });
  }
  if (error instanceof bookingService.BookingValidationError) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
  if (error instanceof bookingService.BookingConflictError) {
    return res.status(409).json({
      status: "error",
      message: error.message,
    });
  }

  console.error("Customer booking creation failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to create booking.",
  });
}

async function create(req, res) {
  try {
    const booking = await bookingService.create(
      req.user.user_id,
      req.bookingInput,
    );
    return res.status(201).json({
      status: "success",
      data: booking,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { create };
