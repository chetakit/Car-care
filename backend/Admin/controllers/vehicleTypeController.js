const vehicleTypeService = require("../services/vehicleTypeService");

function handleError(res, error) {
  if (error instanceof vehicleTypeService.VehicleTypeNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Vehicle type not found.",
    });
  }

  if (error instanceof vehicleTypeService.DuplicateVehicleTypeNameError) {
    return res.status(409).json({
      status: "error",
      message: "Vehicle type name already exists.",
    });
  }

  console.error("Vehicle type request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process vehicle type request.",
  });
}

async function list(req, res) {
  try {
    const data = await vehicleTypeService.list(req.vehicleTypeListQuery);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getById(req, res) {
  try {
    const data = await vehicleTypeService.getById(req.vehicleTypeId);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function create(req, res) {
  try {
    const data = await vehicleTypeService.create(req.body);
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function update(req, res) {
  try {
    const data = await vehicleTypeService.update(
      req.vehicleTypeId,
      req.body,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateStatus(req, res) {
  try {
    const data = await vehicleTypeService.updateStatus(
      req.vehicleTypeId,
      req.body.status,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { list, getById, create, update, updateStatus };
