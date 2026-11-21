const express = require("express");
const pool = require("../../shared/config/db");
const {
  authenticateToken,
  requireAdmin,
} = require("../../Auth/middleware/authMiddleware");

// GET /api/admin/audit-logs?page=1&limit=20&action=USER&q=somchai
//   action  prefix of the action code (e.g. PAYMENT, USER_ROLE_CHANGED)
//   q       part of the name or e-mail of who did it
// Newest first. Read-only: there is no API to edit or delete a log.
const router = express.Router();
router.use(authenticateToken, requireAdmin);

const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

router.get("/", async (req, res) => {
  const allowed = new Set(["page", "limit", "action", "q"]);
  if (Object.keys(req.query).some((key) => !allowed.has(key))) {
    return res.status(400).json({ status: "error", message: "Only page, limit, action and q are supported." });
  }
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ status: "error", message: "page must be 1 or more and limit 1 to 100." });
  }
  const action = typeof req.query.action === "string" ? req.query.action.trim().toUpperCase() : "";
  if (action && !/^[A-Z_]{1,50}$/.test(action)) {
    return res.status(400).json({ status: "error", message: "action must contain only letters and underscores." });
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length > 100) {
    return res.status(400).json({ status: "error", message: "q must be at most 100 characters." });
  }

  const conditions = [];
  const values = [];
  if (action) {
    conditions.push("a.action LIKE ?");
    values.push(`${action}%`);
  }
  if (q) {
    conditions.push("(u.full_name LIKE ? ESCAPE '\\\\' OR u.email LIKE ? ESCAPE '\\\\')");
    values.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  try {
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id${where}`,
      values,
    );
    const [rows] = await pool.execute(
      `SELECT a.audit_log_id, a.action, a.table_name, a.record_id, a.old_value, a.new_value, a.reason,
        DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
        u.user_id, u.full_name, u.email, u.role
      FROM audit_logs a
      LEFT JOIN users u ON u.user_id = a.user_id${where}
      ORDER BY a.created_at DESC, a.audit_log_id DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      values,
    );
    return res.status(200).json({
      status: "success",
      data: {
        items: rows.map((row) => ({
          audit_log_id: row.audit_log_id,
          action: row.action,
          table_name: row.table_name,
          record_id: row.record_id,
          old_value: parseJson(row.old_value),
          new_value: parseJson(row.new_value),
          reason: row.reason,
          created_at: row.created_at,
          actor: row.user_id
            ? { user_id: row.user_id, full_name: row.full_name, email: row.email, role: row.role }
            : null,
        })),
        pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
      },
    });
  } catch {
    console.error("Listing audit logs failed.");
    return res.status(500).json({ status: "error", message: "Unable to retrieve audit logs." });
  }
});

module.exports = router;
