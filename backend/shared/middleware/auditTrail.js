// Audit trail: records every important change made by an ADMIN or STAFF
// account in audit_logs - who did it, what, to which record, the values
// before and after, and the reason when one was given.
//
// It sits in front of the routers (see app.js), so the feature code stays as
// it is. For a matched request it takes a snapshot of the record before the
// change, lets the request run, and - only if it succeeded (2xx) and the user
// is ADMIN or STAFF - takes the snapshot again and writes the log row.
// Saving a log can never fail or slow down the request itself.
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const ADMIN = ["ADMIN"];
const STAFF_OR_ADMIN = ["STAFF", "ADMIN"];
const STAFF = ["STAFF"];
const SECRET_KEY = /password|token|secret/i;
const DROPPED_COLUMNS = new Set(["password_hash", "created_at", "updated_at"]);

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (SECRET_KEY.test(key) || DROPPED_COLUMNS.has(key)) continue;
      out[key] = clean(inner);
    }
    return out;
  }
  return value;
}

const rowById = (table, pk) => async (id) => {
  const [rows] = await pool.execute(`SELECT * FROM ${table} WHERE ${pk} = ? LIMIT 1`, [id]);
  return rows[0] ? clean(rows[0]) : null;
};

const servicePrices = async (id) => {
  const [rows] = await pool.execute(
    `SELECT vt.type_name, sp.price FROM service_prices sp
    JOIN vehicle_types vt ON vt.vehicle_type_id = sp.vehicle_type_id
    WHERE sp.service_id = ? ORDER BY sp.vehicle_type_id`,
    [id],
  );
  return Object.fromEntries(rows.map((row) => [row.type_name, row.price]));
};

const bookingState = async (id) => {
  const [rows] = await pool.execute(
    `SELECT b.booking_status, b.final_amount, p.payment_id, p.payment_method, p.payment_status
    FROM bookings b LEFT JOIN payments p ON p.booking_id = b.booking_id
    WHERE b.booking_id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? clean(rows[0]) : null;
};

// Admin master data: create / edit / enable-disable (and user roles).
const RESOURCES = [
  ["vehicle-types", "vehicle_types", "vehicle_type_id", "VEHICLE_TYPE"],
  ["vehicle-brands", "vehicle_brands", "brand_id", "VEHICLE_BRAND"],
  ["vehicle-models", "vehicle_models", "model_id", "VEHICLE_MODEL"],
  ["services", "services", "service_id", "SERVICE"],
  ["users", "users", "user_id", "USER"],
  ["coupons", "coupons", "coupon_id", "COUPON"],
];

const RULES = [
  { methods: ["PUT"], pattern: /^\/api\/admin\/services\/(\d+)\/prices$/, roles: ADMIN, action: "SERVICE_PRICES_UPDATED", table: "service_prices", snapshot: servicePrices },
  { methods: ["PATCH"], pattern: /^\/api\/admin\/schedules\/(\d+)\/capacity$/, roles: ADMIN, action: "SCHEDULE_CAPACITY_CHANGED", table: "schedules", snapshot: rowById("schedules", "schedule_id") },
  { methods: ["PATCH"], pattern: /^\/api\/admin\/users\/(\d+)\/role$/, roles: ADMIN, action: "USER_ROLE_CHANGED", table: "users", snapshot: rowById("users", "user_id") },
  ...RESOURCES.flatMap(([path, table, pk, name]) => [
    { methods: ["PATCH"], pattern: new RegExp(`^/api/admin/${path}/(\\d+)/status$`), roles: ADMIN, action: `${name}_STATUS_CHANGED`, table, snapshot: rowById(table, pk) },
    { methods: ["PATCH", "PUT"], pattern: new RegExp(`^/api/admin/${path}/(\\d+)$`), roles: ADMIN, action: `${name}_UPDATED`, table, snapshot: rowById(table, pk) },
    { methods: ["POST"], pattern: new RegExp(`^/api/admin/${path}$`), roles: ADMIN, action: `${name}_CREATED`, table, idKey: pk },
  ]),
  // Money and bookings handled by staff or an admin.
  { methods: ["POST"], pattern: /^\/api\/payments\/(\d+)\/verify$/, roles: STAFF_OR_ADMIN, action: "PAYMENT_VERIFIED", table: "payments", snapshot: bookingState },
  { methods: ["POST"], pattern: /^\/api\/payments\/(\d+)\/simulate$/, roles: ADMIN, action: "PAYMENT_SIMULATED", table: "payments", snapshot: bookingState },
  { methods: ["POST"], pattern: /^\/api\/payments\/(\d+)\/wallet$/, roles: ADMIN, action: "PAYMENT_BY_WALLET", table: "payments", snapshot: bookingState },
  { methods: ["POST"], pattern: /^\/api\/payments\/(\d+)$/, roles: ADMIN, action: "PAYMENT_CREATED", table: "payments", snapshot: bookingState },
  { methods: ["POST"], pattern: /^\/api\/cancellations\/(\d+)$/, roles: ADMIN, action: "BOOKING_CANCELLED", table: "bookings", snapshot: bookingState },
  { methods: ["POST"], pattern: /^\/api\/staff\/bookings\/(\d+)\/check-in$/, roles: STAFF, action: "BOOKING_CHECKED_IN", table: "bookings", snapshot: bookingState },
  { methods: ["PATCH"], pattern: /^\/api\/staff\/bookings\/(\d+)\/status$/, roles: STAFF, action: "BOOKING_STATUS_CHANGED", table: "bookings", snapshot: bookingState },
  { methods: ["POST"], pattern: /^\/api\/staff\/bookings\/(\d+)\/no-show$/, roles: STAFF, action: "BOOKING_NO_SHOW", table: "bookings", snapshot: bookingState },
  { methods: ["POST"], pattern: /^\/api\/staff\/bookings\/(\d+)\/notes$/, roles: STAFF, action: "BOOKING_NOTE_ADDED", table: "booking_notes" },
];

function roleFromToken(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") || "");
  const secret = process.env.JWT_SECRET;
  if (!match || !secret) return null;
  try {
    const payload = jwt.verify(match[1], secret);
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function matchRule(method, path) {
  for (const rule of RULES) {
    if (!rule.methods.includes(method)) continue;
    const match = rule.pattern.exec(path);
    if (match) return { rule, id: match[1] ?? null };
  }
  return null;
}

// Keep only the fields that changed, so a log shows "role: CUSTOMER -> STAFF".
function changedFields(before, after) {
  if (!before || !after || Array.isArray(before) || typeof before !== "object") return { before, after };
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const oldValue = {};
  const newValue = {};
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      oldValue[key] = before[key] ?? null;
      newValue[key] = after[key] ?? null;
    }
  }
  return { before: oldValue, after: newValue };
}

const toJson = (value) => (value === undefined || value === null ? null : JSON.stringify(value));

async function writeLog({ userId, action, table, recordId, oldValue, newValue, reason }) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_value, new_value, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, action, table, String(recordId ?? "-"), toJson(oldValue), toJson(newValue), reason || null],
    );
  } catch (error) {
    console.error("Audit log could not be saved:", error.message);
  }
}

function auditTrail(req, res, next) {
  const path = req.path.replace(/\/+$/, "") || "/";
  const found = req.method === "GET" ? null : matchRule(req.method, path);
  if (!found) return next();
  const { rule, id } = found;
  // Read the role from the token without touching the database, so requests
  // from customers, other roles or without a valid token are never logged
  // (and cost no extra query). The route still does its own full auth check.
  const role = roleFromToken(req);
  if (!role || !rule.roles.includes(role)) return next();

  let responseBody;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  const beforePromise = rule.snapshot && id ? rule.snapshot(id).catch(() => null) : Promise.resolve(null);

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    if (!req.user || !rule.roles.includes(req.user.role)) return;
    (async () => {
      const before = await beforePromise;
      let after = null;
      let recordId = id;
      if (rule.snapshot && id) {
        after = await rule.snapshot(id).catch(() => null);
      } else {
        const data = responseBody && responseBody.data;
        after = clean(data ?? req.body ?? null);
        if (!recordId && rule.idKey && data && data[rule.idKey]) recordId = data[rule.idKey];
        if (!recordId && rule.idKey && data && data.id) recordId = data.id;
      }
      const diff = before ? changedFields(before, after) : { before: null, after };
      const body = req.body && typeof req.body === "object" ? req.body : {};
      await writeLog({
        userId: req.user.user_id,
        action: rule.action,
        table: rule.table,
        recordId,
        oldValue: diff.before,
        newValue: diff.after,
        reason: body.reason || body.note || null,
      });
    })().catch(() => {});
  });

  // Take the "before" snapshot first so it is not affected by the change.
  beforePromise.then(() => next(), () => next());
}

module.exports = { auditTrail, matchRule, changedFields, clean };
