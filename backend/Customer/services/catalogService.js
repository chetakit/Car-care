const vehicleTypeService = require("../../Admin/services/vehicleTypeService");
const vehicleBrandService = require("../../Admin/services/vehicleBrandService");
const vehicleModelService = require("../../Admin/services/vehicleModelService");

const CATALOG_PAGE_SIZE = 100;

async function readAllActive(listService, filters = {}) {
  const firstPage = await listService({
    ...filters,
    page: 1,
    limit: CATALOG_PAGE_SIZE,
    offset: 0,
    search: "",
    status: "ACTIVE",
  });
  const items = [...firstPage.items];

  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    const result = await listService({
      ...filters,
      page,
      limit: CATALOG_PAGE_SIZE,
      offset: (page - 1) * CATALOG_PAGE_SIZE,
      search: "",
      status: "ACTIVE",
    });
    items.push(...result.items);
  }

  return items;
}

function listVehicleTypes() {
  return readAllActive(vehicleTypeService.list);
}

function listVehicleBrands() {
  return readAllActive(vehicleBrandService.list);
}

function listVehicleModels(filters) {
  return readAllActive(vehicleModelService.list, {
    ...filters,
    requireActiveVehicleType: true,
  });
}

module.exports = { listVehicleTypes, listVehicleBrands, listVehicleModels };
