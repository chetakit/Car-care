const vehicleService = require("../services/vehicleService");

function handleVehicleError(error, res) {
  if (error instanceof vehicleService.VehicleNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Vehicle not found.",
    });
  }
  if (error instanceof vehicleService.VehicleModelUnavailableError) {
    return res.status(400).json({
      status: "error",
      message: "model_id must reference an active vehicle model.",
    });
  }
  if (error instanceof vehicleService.DuplicateLicensePlateError) {
    return res.status(409).json({
      status: "error",
      message: "A vehicle with this license plate already exists.",
    });
  }
  if (error instanceof vehicleService.VehicleHasBookingsError) {
    return res.status(409).json({
      status: "error",
      message: "A vehicle with existing bookings cannot be deleted.",
    });
  }

  console.error("Customer vehicle request failed due to an internal error.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process customer vehicle request.",
  });
}

async function list(req, res) {
  try {
    const items = await vehicleService.list(req.user.user_id);
    return res.status(200).json({
      status: "success",
      data: { items },
    });
  } catch (error) {
    return handleVehicleError(error, res);
  }
}

async function create(req, res) {
  try {
    const vehicle = await vehicleService.create(
      req.user.user_id,
      req.vehicleInput,
    );
    return res.status(201).json({
      status: "success",
      data: { vehicle },
    });
  } catch (error) {
    return handleVehicleError(error, res);
  }
}

async function update(req, res) {
  try {
    const vehicle = await vehicleService.update(
      req.user.user_id,
      req.vehicleId,
      req.vehicleChanges,
    );
    return res.status(200).json({
      status: "success",
      data: { vehicle },
    });
  } catch (error) {
    return handleVehicleError(error, res);
  }
}

async function remove(req, res) {
  try {
    await vehicleService.deleteVehicle(req.user.user_id, req.vehicleId);
    return res.status(200).json({
      status: "success",
      message: "Vehicle deleted successfully.",
    });
  } catch (error) {
    return handleVehicleError(error, res);
  }
}

module.exports = { list, create, update, remove };
