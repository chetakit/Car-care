const MAX_MYSQL_INT = 2147483647;

function sendValidationError(res, message) {
  return res.status(400).json({
    status: "error",
    message,
  });
}

function parsePositiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_MYSQL_INT
    ? parsed
    : null;
}

function validateNoQuery(req, res, next) {
  if (Object.keys(req.query).length > 0) {
    return sendValidationError(
      res,
      "This catalog endpoint does not accept query parameters.",
    );
  }
  return next();
}

function validatePriceParams(req, res, next) {
  const serviceId = parsePositiveInteger(req.params.serviceId);
  if (serviceId === null) {
    return sendValidationError(
      res,
      "serviceId must be a positive MySQL integer.",
    );
  }

  const queryFields = Object.keys(req.query);
  if (
    queryFields.length !== 1 ||
    queryFields[0] !== "vehicle_type_id"
  ) {
    return sendValidationError(
      res,
      "vehicle_type_id is required and must be the only query parameter.",
    );
  }

  const vehicleTypeId = parsePositiveInteger(req.query.vehicle_type_id);
  if (vehicleTypeId === null) {
    return sendValidationError(
      res,
      "vehicle_type_id must be a positive MySQL integer.",
    );
  }

  req.serviceCatalogServiceId = serviceId;
  req.vehicleTypeId = vehicleTypeId;
  return next();
}

module.exports = { validateNoQuery, validatePriceParams };
