// Vehicle types that appear in the services' prices, cheapest on average
// first (Motorcycle → … → Van). Shared by the Home and Services pages.
export function buildPriceTypes(services) {
  const types = new Map()
  for (const service of services) {
    for (const item of service.prices ?? []) {
      const entry = types.get(item.vehicle_type_id) ??
        { id: item.vehicle_type_id, name: item.type_name, total: 0, count: 0 }
      entry.total += Number(item.price)
      entry.count += 1
      types.set(item.vehicle_type_id, entry)
    }
  }
  return [...types.values()].sort((left, right) => left.total / left.count - right.total / right.count)
}

// The price to show for one service: the chosen type's price, or the
// cheapest one when no type is chosen. null = not offered for that type.
export function priceForType(service, typeId) {
  const prices = service.prices ?? []
  if (!prices.length) return null
  if (!typeId) return Number(prices[0].price)
  const match = prices.find((item) => item.vehicle_type_id === typeId)
  return match ? Number(match.price) : null
}
