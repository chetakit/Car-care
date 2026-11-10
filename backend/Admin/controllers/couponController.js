const couponService = require("../services/couponService");

function handleError(res, error) {
  if (error instanceof couponService.CouponNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Coupon not found.",
    });
  }

  if (error instanceof couponService.DuplicateCouponCodeError) {
    return res.status(409).json({
      status: "error",
      message: "Coupon code already exists.",
    });
  }

  if (error instanceof couponService.CouponValidationError) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }

  console.error("Admin coupon request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process coupon request.",
  });
}

async function list(req, res) {
  try {
    const data = await couponService.list(req.couponListQuery);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getById(req, res) {
  try {
    const data = await couponService.getById(req.couponId);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function create(req, res) {
  try {
    const data = await couponService.create(req.body);
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function update(req, res) {
  try {
    const data = await couponService.update(req.couponId, req.body);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateStatus(req, res) {
  try {
    const data = await couponService.updateStatus(
      req.couponId,
      req.body.status,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function listUsages(req, res) {
  try {
    const data = await couponService.listUsages(
      req.couponId,
      req.couponUsageQuery,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  updateStatus,
  listUsages,
};
