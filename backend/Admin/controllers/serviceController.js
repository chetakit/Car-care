const serviceService = require("../services/serviceService");

function handleError(res, error) {
  if (error instanceof serviceService.ServiceNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Service not found.",
    });
  }

  if (error instanceof serviceService.VehicleTypeNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Vehicle type not found.",
    });
  }

  if (error instanceof serviceService.VehicleTypeInactiveError) {
    return res.status(400).json({
      status: "error",
      message: "Vehicle type must be ACTIVE.",
    });
  }

  if (error instanceof serviceService.DuplicateServiceNameError) {
    return res.status(409).json({
      status: "error",
      message: "Service name already exists.",
    });
  }

  console.error("Service request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process service request.",
  });
}

async function ensureExists(req, res, next) {
  try {
    await serviceService.getById(req.serviceId);
    return next();
  } catch (error) {
    return handleError(res, error);
  }
}

async function list(req, res) {
  try {
    const data = await serviceService.list(req.serviceListQuery);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getById(req, res) {
  try {
    const data = await serviceService.getById(req.serviceId);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function create(req, res) {
  try {
    const data = await serviceService.create(req.body);
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function update(req, res) {
  try {
    const data = await serviceService.update(req.serviceId, req.body);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateStatus(req, res) {
  try {
    const data = await serviceService.updateStatus(
      req.serviceId,
      req.body.status,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getPrices(req, res) {
  try {
    const data = await serviceService.getPrices(req.serviceId);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function upsertPrices(req, res) {
  try {
    const data = await serviceService.upsertPrices(
      req.serviceId,
      req.body.prices,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = {
  ensureExists,
  list,
  getById,
  create,
  update,
  updateStatus,
  getPrices,
  upsertPrices,
};
