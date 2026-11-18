const serviceService = require("../../Admin/services/serviceService");
const serviceCatalogService = require("../services/serviceCatalogService");

function handleError(res, error) {
  if (error instanceof serviceService.ServiceNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Service not found.",
    });
  }

  console.error("Service catalog request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to retrieve service catalog.",
  });
}

async function list(req, res) {
  try {
    const items = await serviceCatalogService.listActiveServices();
    return res.status(200).json({
      status: "success",
      data: { items },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function publicList(req, res) {
  try {
    const services = await serviceCatalogService.listActiveServices();
    const pricesByService = await serviceCatalogService.listPublicPrices(
      services.map((service) => service.service_id),
    );
    const items = services.map(({
      service_id,
      service_name,
      description,
      duration_minutes,
    }) => ({
      service_id,
      service_name,
      description,
      duration_minutes,
      prices: pricesByService.get(Number(service_id)) ?? [],
    }));
    return res.status(200).json({
      status: "success",
      data: { items },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function prices(req, res) {
  try {
    const items = await serviceCatalogService.listPrices(
      req.serviceCatalogServiceId,
      req.vehicleTypeId,
    );
    return res.status(200).json({
      status: "success",
      data: { items },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { list, publicList, prices };
