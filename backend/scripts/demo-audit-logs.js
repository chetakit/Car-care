// Sample audit-log rows for the demo. Nothing is made up: every row is built
// from something a demo staff/admin account really did in the database
// (verified a transfer, checked a car in, changed a status, marked a no-show,
// cancelled, wrote a note), with the same action names, table and record id
// that shared/middleware/auditTrail.js writes, at the time it happened.
//
//   node backend/scripts/demo-audit-logs.js             last 7 days
//   node backend/scripts/demo-audit-logs.js --days 3    last 3 days
//   node backend/scripts/demo-audit-logs.js --dry-run   count only, save nothing
//
// Running it again adds nothing twice. demo-seed.js calls it too, and
// demo-clear.js removes these rows with the rest of the demo data.
const pool = require("../shared/config/db");
const { DEMO_DOMAIN } = require("./demo-data");

const DEFAULT_DAYS = 7;

// Who: a demo account with the role the real route allows.
// When: within the last `days` days. Skips rows that are already there.
const notLoggedYet = `NOT EXISTS (
  SELECT 1 FROM audit_logs a
  WHERE a.user_id = x.user_id
    AND a.action = x.action COLLATE utf8mb4_0900_ai_ci
    AND a.record_id = x.record_id COLLATE utf8mb4_0900_ai_ci
    AND a.created_at = x.created_at
)`;

const INSERT = `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_value, new_value, reason, created_at)
SELECT x.user_id, x.action, x.table_name, x.record_id, x.old_value, x.new_value, x.reason, x.created_at`;

const SOURCES = [
  {
    label: "PAYMENT_VERIFIED",
    sql: `${INSERT}
    FROM (
      SELECT pv.verified_by AS user_id, 'PAYMENT_VERIFIED' AS action, 'payments' AS table_name,
        CAST(p.booking_id AS CHAR) AS record_id,
        JSON_OBJECT('booking_status', 'PENDING_PAYMENT', 'payment_status', 'PENDING') AS old_value,
        JSON_OBJECT('booking_status', 'CONFIRMED', 'payment_status', 'PAID') AS new_value,
        NULL AS reason, pv.verified_at AS created_at
      FROM payment_verifications pv
      JOIN payments p ON p.payment_id = pv.payment_id
      JOIN users u ON u.user_id = pv.verified_by
      WHERE u.email LIKE ? AND u.role IN ('STAFF', 'ADMIN')
        AND pv.verified_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
    ) x
    WHERE ${notLoggedYet}`,
  },
  {
    label: "booking status changes",
    sql: `${INSERT}
    FROM (
      SELECT h.changed_by AS user_id,
        CASE h.new_status
          WHEN 'CHECKED_IN' THEN 'BOOKING_CHECKED_IN'
          WHEN 'NO_SHOW' THEN 'BOOKING_NO_SHOW'
          WHEN 'CANCELLED' THEN 'BOOKING_CANCELLED'
          ELSE 'BOOKING_STATUS_CHANGED'
        END AS action,
        'bookings' AS table_name,
        CAST(h.booking_id AS CHAR) AS record_id,
        JSON_OBJECT('booking_status', h.old_status) AS old_value,
        JSON_OBJECT('booking_status', h.new_status) AS new_value,
        -- The check-in screen sends no reason; the others require one.
        CASE WHEN h.new_status = 'CHECKED_IN' THEN NULL ELSE h.reason END AS reason,
        h.created_at
      FROM booking_status_history h
      JOIN users u ON u.user_id = h.changed_by
      WHERE u.email LIKE ?
        AND h.created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
        AND (
          (u.role = 'STAFF' AND h.new_status IN ('CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'NO_SHOW'))
          OR (u.role = 'ADMIN' AND h.new_status = 'CANCELLED')
        )
    ) x
    WHERE ${notLoggedYet}`,
  },
  {
    label: "BOOKING_NOTE_ADDED",
    sql: `${INSERT}
    FROM (
      SELECT n.created_by AS user_id, 'BOOKING_NOTE_ADDED' AS action, 'booking_notes' AS table_name,
        CAST(n.booking_id AS CHAR) AS record_id,
        NULL AS old_value,
        JSON_OBJECT('note_id', n.note_id, 'booking_id', n.booking_id, 'note', n.note) AS new_value,
        n.note AS reason, n.created_at
      FROM booking_notes n
      JOIN users u ON u.user_id = n.created_by
      WHERE u.email LIKE ? AND u.role = 'STAFF'
        AND n.created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
    ) x
    WHERE ${notLoggedYet}`,
  },
];

async function addDemoAuditLogs(conn, { days = DEFAULT_DAYS } = {}) {
  const added = {};
  for (const source of SOURCES) {
    const [result] = await conn.query(source.sql, [`%${DEMO_DOMAIN}`, days]);
    added[source.label] = result.affectedRows;
  }
  return added;
}

function readDays(argv) {
  const index = argv.indexOf("--days");
  if (index === -1) return DEFAULT_DAYS;
  const days = Number(argv[index + 1]);
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    throw new Error("--days must be a whole number from 1 to 60");
  }
  return days;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const days = readDays(process.argv);
  const conn = await pool.getConnection();
  let started = false;
  try {
    await conn.beginTransaction();
    started = true;
    const added = await addDemoAuditLogs(conn, { days });
    const total = Object.values(added).reduce((sum, n) => sum + n, 0);
    const detail = Object.entries(added).map(([label, n]) => `${label} ${n}`).join(" · ");
    if (dryRun) {
      await conn.rollback();
      console.log(`[dry run] ถ้ารันจริงจะเพิ่ม audit log ${total} แถว (ย้อนหลัง ${days} วัน): ${detail}`);
    } else {
      await conn.commit();
      console.log(`เพิ่ม audit log ${total} แถว (ย้อนหลัง ${days} วัน): ${detail}`);
    }
    started = false;
  } catch (error) {
    if (started) await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { addDemoAuditLogs };
