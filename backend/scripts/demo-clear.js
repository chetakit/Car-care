// Remove everything demo-seed.js created: every account with an
// @carcare.test e-mail and all rows that belong to it (bookings, payments,
// refunds, wallet, vehicles, ...). Nothing else is touched.
//
//   node backend/scripts/demo-clear.js            delete the demo data
//   node backend/scripts/demo-clear.js --dry-run  show what would go, change nothing
//
// Coupon use counters are given back. Schedule slots the seed added for past
// days are kept: they are ordinary empty slots, like the generator makes.
// If a demo staff/admin account also acted on non-demo bookings (for example
// during a live demo), that account is set INACTIVE and renamed to
// retired-<id>-…@carcare.invalid instead of deleted, so the real booking
// history stays intact.
const pool = require("../shared/config/db");
const { DEMO_DOMAIN } = require("./demo-data");

const ids = (rows, key) => rows.map((row) => row[key]);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const conn = await pool.getConnection();
  let started = false;
  try {
    await conn.beginTransaction();
    started = true;
    const [users] = await conn.query(
      "SELECT user_id, role FROM users WHERE email LIKE ? FOR UPDATE",
      [`%${DEMO_DOMAIN}`],
    );
    if (users.length === 0) {
      await conn.rollback();
      started = false;
      console.log("ไม่มีข้อมูลเดโม่ในฐานข้อมูล");
      return;
    }
    const userIds = ids(users, "user_id");
    const [bookings] = await conn.query("SELECT booking_id FROM bookings WHERE user_id IN (?)", [userIds]);
    const bookingIds = ids(bookings, "booking_id");
    const [wallets] = await conn.query("SELECT wallet_id FROM wallets WHERE user_id IN (?)", [userIds]);
    const walletIds = ids(wallets, "wallet_id");
    const deleted = {};
    const run = async (label, sql, params) => {
      const [result] = await conn.query(sql, params);
      deleted[label] = (deleted[label] || 0) + result.affectedRows;
    };

    if (bookingIds.length) {
      // Audit rows a demo account wrote about a demo booking (the samples
      // from demo-audit-logs.js, or clicks during a live demo) go with it.
      await run(
        "audit_logs",
        `DELETE FROM audit_logs
        WHERE user_id IN (?) AND table_name IN ('bookings', 'payments', 'booking_notes') AND record_id IN (?)`,
        [userIds, bookingIds.map(String)],
      ).catch((error) => {
        if (error.code !== "ER_NO_SUCH_TABLE") throw error;
      });
      // Give coupon uses back before the usage rows go.
      const [uses] = await conn.query(
        "SELECT coupon_id, COUNT(*) AS n FROM coupon_usages WHERE booking_id IN (?) GROUP BY coupon_id",
        [bookingIds],
      );
      for (const use of uses) {
        await conn.query(
          "UPDATE coupons SET used_count = GREATEST(used_count - ?, 0) WHERE coupon_id = ?",
          [Number(use.n), use.coupon_id],
        );
      }
      const [payments] = await conn.query("SELECT payment_id FROM payments WHERE booking_id IN (?)", [bookingIds]);
      const paymentIds = ids(payments, "payment_id");

      await run("wallet_transactions", "DELETE FROM wallet_transactions WHERE booking_id IN (?)", [bookingIds]);
      if (walletIds.length) {
        await run("wallet_transactions", "DELETE FROM wallet_transactions WHERE wallet_id IN (?)", [walletIds]);
      }
      await run("refunds", "DELETE FROM refunds WHERE booking_id IN (?)", [bookingIds]);
      if (paymentIds.length) {
        await run("payment_verifications", "DELETE FROM payment_verifications WHERE payment_id IN (?)", [paymentIds]);
      }
      await run("payments", "DELETE FROM payments WHERE booking_id IN (?)", [bookingIds]);
      await run("coupon_usages", "DELETE FROM coupon_usages WHERE booking_id IN (?)", [bookingIds]);
      await run("booking_notes", "DELETE FROM booking_notes WHERE booking_id IN (?)", [bookingIds]);
      await run("vehicle_check_ins", "DELETE FROM vehicle_check_ins WHERE booking_id IN (?)", [bookingIds]);
      await run("booking_status_history", "DELETE FROM booking_status_history WHERE booking_id IN (?)", [bookingIds]);
      await run("booking_services", "DELETE FROM booking_services WHERE booking_id IN (?)", [bookingIds]);
      await run("bookings", "DELETE FROM bookings WHERE booking_id IN (?)", [bookingIds]);
    }
    if (walletIds.length) {
      await run("wallet_transactions", "DELETE FROM wallet_transactions WHERE wallet_id IN (?)", [walletIds]);
      await run("wallets", "DELETE FROM wallets WHERE wallet_id IN (?)", [walletIds]);
    }
    // Bell notifications: those about demo bookings went with the bookings
    // (ON DELETE CASCADE); remove the ones addressed to demo accounts too.
    await run("notifications", "DELETE FROM notifications WHERE user_id IN (?)", [userIds]).catch((error) => {
      if (error.code !== "ER_NO_SUCH_TABLE") throw error;
    });
    await run("vehicles", "DELETE FROM vehicles WHERE user_id IN (?)", [userIds]);
    await run("coupon_usages", "DELETE FROM coupon_usages WHERE user_id IN (?)", [userIds]);

    // Staff/admin accounts may have touched real bookings; keep those.
    const references = [
      ["booking_status_history", "changed_by"],
      ["vehicle_check_ins", "checked_in_by"],
      ["booking_notes", "created_by"],
      ["payment_verifications", "verified_by"],
    ];
    const kept = [];
    const removable = [];
    for (const user of users) {
      let used = false;
      for (const [table, column] of references) {
        const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, [user.user_id]);
        if (Number(n) > 0) used = true;
      }
      const [[{ audit }]] = await conn.query("SELECT COUNT(*) AS audit FROM audit_logs WHERE user_id = ?", [user.user_id])
        .catch(() => [[{ audit: 0 }]]);
      if (Number(audit) > 0) used = true;
      (used ? kept : removable).push(user.user_id);
    }
    if (removable.length) await run("users", "DELETE FROM users WHERE user_id IN (?)", [removable]);
    if (kept.length) {
      // Move them off the demo domain too, so the next seed can recreate
      // the demo accounts with the same e-mail addresses.
      await conn.query(
        `UPDATE users
        SET status = 'INACTIVE', email = CONCAT('retired-', user_id, '-', REPLACE(email, ?, '@carcare.invalid'))
        WHERE user_id IN (?)`,
        [DEMO_DOMAIN, kept],
      );
    }

    const summary = Object.entries(deleted)
      .filter(([, n]) => n > 0)
      .map(([table, n]) => `${table} ${n}`)
      .join(" · ");
    const keptNote = kept.length
      ? `\nบัญชีที่เคยใช้กับข้อมูลจริง ${kept.length} บัญชี ถูกปิดใช้งาน (INACTIVE) แทนการลบ`
      : "";
    if (dryRun) {
      await conn.rollback();
      console.log(`[dry run] ถ้าลบจริงจะลบ: ${summary}${keptNote}`);
    } else {
      await conn.commit();
      console.log(`ลบข้อมูลเดโม่แล้ว: ${summary}${keptNote}`);
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
