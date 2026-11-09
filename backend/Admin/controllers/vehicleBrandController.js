const vehicleBrandService = require("../services/vehicleBrandService");

function handleError(res, error) {
  if (error instanceof vehicleBrandService.VehicleBrandNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Vehicle brand not found.",
    });
  }

  if (error instanceof vehicleBrandService.DuplicateVehicleBrandNameError) {
    return res.status(409).json({
      status: "error",
      message: "Vehicle brand name already exists.",
    });
  }

  console.error("Vehicle brand request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process vehicle brand request.",
  });
}

async function list(req, res) {
  try {
    const data = await vehicleBrandService.list(req.vehicleBrandListQuery);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getById(req, res) {
  try {
    const data = await vehicleBrandService.getById(req.vehicleBrandId);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function create(req, res) {
  try {
    const data = await vehicleBrandService.create(req.body);
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function update(req, res) {
  try {
    const data = await vehicleBrandService.update(
      req.vehicleBrandId,
      req.body,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateStatus(req, res) {
  try {
    const data = await vehicleBrandService.updateStatus(
      req.vehicleBrandId,
      req.body.status,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { list, getById, create, update, updateStatus };
