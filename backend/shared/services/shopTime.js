// The database server runs on UTC, but schedules and coupon dates are entered
// in the shop's local time (Thailand, UTC+7, no daylight saving). Compare
// against this instead of NOW() / CURRENT_DATE() / CURRENT_TIME().
const SHOP_NOW_SQL = "(UTC_TIMESTAMP() + INTERVAL 7 HOUR)";

module.exports = { SHOP_NOW_SQL };
