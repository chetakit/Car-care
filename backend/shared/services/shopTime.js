// The database server runs on UTC, but schedules and coupon dates are entered
// in the shop's local time (Thailand, UTC+7, no daylight saving). Compare
// against this instead of NOW() / CURRENT_DATE() / CURRENT_TIME().
const SHOP_NOW_SQL = "(UTC_TIMESTAMP() + INTERVAL 7 HOUR)";

// Today's date in the shop (use for DATE columns such as booking_date).
const SHOP_TODAY_SQL = "DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR)";

// Timestamps written with NOW()/CURRENT_TIMESTAMP (paid_at, processed_at,
// created_at, ...) are UTC; this turns one into shop time so it can be
// compared with SHOP_TODAY_SQL or grouped by the shop's calendar day.
const toShopTimeSql = (column) => `(${column} + INTERVAL 7 HOUR)`;

module.exports = { SHOP_NOW_SQL, SHOP_TODAY_SQL, toShopTimeSql };
