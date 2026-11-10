const paymentService = require("../services/paymentService");

function handleError(res, error) {
  if (error instanceof paymentService.PaymentNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Payment or booking not found.",
    });
  }
  if (error instanceof paymentService.PaymentValidationError) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
  if (error instanceof paymentService.PaymentConflictError) {
    return res.status(409).json({
      status: "error",
      message: error.message,
    });
  }

  console.error("Payment request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process payment request.",
  });
}

async function getByBookingId(req, res) {
  try {
    const data = await paymentService.getByBookingId(
      req.bookingId,
      req.user,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function createForBooking(req, res) {
  try {
    const data = await paymentService.createForBooking(
      req.bookingId,
      req.paymentCreateInput,
      req.user,
    );
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function simulate(req, res) {
  try {
    const data = await paymentService.simulate(
      req.bookingId,
      req.paymentSimulationInput,
      req.user,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function payWithWallet(req, res) {
  try {
    const data = await paymentService.payWithWallet(
      req.bookingId,
      req.user,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = {
  getByBookingId,
  createForBooking,
  simulate,
  payWithWallet,
};
