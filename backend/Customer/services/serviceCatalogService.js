const pool = require("../../shared/config/db");
const serviceService = require("../../Admin/services/serviceService");

const CATALOG_PAGE_SIZE = 100;

async function listActiveServices() {
  const firstPage = await serviceService.list({
    page: 1,
    limit: CATALOG_PAGE_SIZE,
    offset: 0,
    search: "",
    status: "ACTIVE",
  });
  const items = [...firstPage.items];

  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    const result = await serviceService.list({
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

async function listPrices(serviceId, vehicleTypeId) {
  const service = await serviceService.getById(serviceId);
  if (service.status !== "ACTIVE") {
    throw new serviceService.ServiceNotFoundError();
  }

  const [rows] = await pool.execute(
    `SELECT
      sp.service_price_id,
      sp.service_id,
      sp.vehicle_type_id,
      vt.type_name,
      sp.price,
      sp.created_at,
      sp.updated_at
    FROM service_prices sp
    INNER JOIN vehicle_types vt
      ON vt.vehicle_type_id = sp.vehicle_type_id
    WHERE sp.service_id = ?
      AND sp.vehicle_type_id = ?
      AND vt.status = 'ACTIVE'
    ORDER BY vt.type_name ASC, sp.vehicle_type_id ASC`,
    [serviceId, vehicleTypeId],
  );
  return rows;
}

// Fixed price per active vehicle type for each listed service, so guests can
// compare prices before signing in. Returns Map<service_id, [{...}]>.
async function listPublicPrices(serviceIds) {
  const pricesByService = new Map();
  if (serviceIds.length === 0) return pricesByService;
  const [rows] = await pool.execute(
    `SELECT sp.service_id, sp.vehicle_type_id, vt.type_name, sp.price
    FROM service_prices sp
    INNER JOIN vehicle_types vt
      ON vt.vehicle_type_id = sp.vehicle_type_id
    WHERE vt.status = 'ACTIVE'
      AND sp.service_id IN (${serviceIds.map(() => "?").join(", ")})
    ORDER BY sp.service_id ASC, sp.price ASC, vt.vehicle_type_id ASC`,
    serviceIds,
  );
  for (const row of rows) {
    const serviceId = Number(row.service_id);
    if (!pricesByService.has(serviceId)) pricesByService.set(serviceId, []);
    pricesByService.get(serviceId).push({
      vehicle_type_id: Number(row.vehicle_type_id),
      type_name: row.type_name,
      price: row.price,
    });
  }
  return pricesByService;
}

module.exports = { listActiveServices, listPrices, listPublicPrices };
