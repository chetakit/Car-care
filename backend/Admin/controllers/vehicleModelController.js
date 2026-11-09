const vehicleModelService = require("../services/vehicleModelService");

function handleError(res, error) {
  if (error instanceof vehicleModelService.VehicleModelNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Vehicle model not found.",
    });
  }

  if (error instanceof vehicleModelService.VehicleModelParentNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Vehicle model parent not found.",
    });
  }

  if (error instanceof vehicleModelService.VehicleModelParentInactiveError) {
    return res.status(400).json({
      status: "error",
      message: "Vehicle model parent must be ACTIVE.",
    });
  }

  if (error instanceof vehicleModelService.VehicleModelValidationError) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }

  if (error instanceof vehicleModelService.VehicleModelConflictError) {
    return res.status(409).json({
      status: "error",
      message: "Vehicle model cannot be changed while vehicles reference it.",
    });
  }

  if (error instanceof vehicleModelService.DuplicateVehicleModelNameError) {
    return res.status(409).json({
      status: "error",
      message: "Vehicle model name already exists for this brand.",
    });
  }

  console.error("Vehicle model request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process vehicle model request.",
  });
}

async function ensureExists(req, res, next) {
  try {
    await vehicleModelService.getById(req.vehicleModelId);
    return next();
  } catch (error) {
    return handleError(res, error);
  }
}

async function list(req, res) {
  try {
    const data = await vehicleModelService.list(req.vehicleModelListQuery);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getById(req, res) {
  try {
    const data = await vehicleModelService.getById(req.vehicleModelId);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function create(req, res) {
  try {
    const data = await vehicleModelService.create(req.body);
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function update(req, res) {
  try {
    const data = await vehicleModelService.update(
      req.vehicleModelId,
      req.body,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateStatus(req, res) {
  try {
    const data = await vehicleModelService.updateStatus(
      req.vehicleModelId,
      req.body.status,
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
};
