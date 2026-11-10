const cancellationService = require("../services/cancellationService");

function handleError(res, error) {
  if (error instanceof cancellationService.CancellationNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Booking not found.",
    });
  }
  if (error instanceof cancellationService.CancellationValidationError) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
  if (error instanceof cancellationService.CancellationConflictError) {
    return res.status(409).json({
      status: "error",
      message: error.message,
    });
  }

  console.error("Cancellation request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process cancellation request.",
  });
}

async function cancel(req, res) {
  try {
    const data = await cancellationService.cancel(
      req.bookingId,
      req.cancellationInput,
      req.user,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { cancel };
