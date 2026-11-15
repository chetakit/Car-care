const catalogService = require("../services/catalogService");

async function respondWithCatalog(res, operation) {
  try {
    const items = await operation();
    return res.status(200).json({
      status: "success",
      data: { items },
    });
  } catch {
    console.error("Customer vehicle catalog request failed due to an internal error.");
    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve vehicle catalog.",
    });
  }
}

function vehicleTypes(req, res) {
  return respondWithCatalog(res, () => catalogService.listVehicleTypes());
}

function vehicleBrands(req, res) {
  return respondWithCatalog(res, () => catalogService.listVehicleBrands());
}

function vehicleModels(req, res) {
  return respondWithCatalog(res, () =>
    catalogService.listVehicleModels(req.vehicleModelFilters),
  );
}

module.exports = { vehicleTypes, vehicleBrands, vehicleModels };
