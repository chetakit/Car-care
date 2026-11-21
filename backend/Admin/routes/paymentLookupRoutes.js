const express = require("express");
const pool = require("../../shared/config/db");
const {
  authenticateToken,
  requireAdmin,
} = require("../../Auth/middleware/authMiddleware");

// Search for the Admin Payments page. Returns bookings (with their payment,
// if any) so the Admin can pick one and open it.
// GET /api/admin/payments/lookup?q=<text>
//   digits  -> payment number (exact) or phone number (part of it)
//   text    -> payment reference (exact: SIM-…, WAL-…, bank transfer ref)
//              or customer name / e-mail / phone / licence plate (part of it)
const router = express.Router();
router.use(authenticateToken, requireAdmin);

const MAX_RESULTS = 20;

const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

router.get("/lookup", async (req, res) => {
  if (Object.keys(req.query).some((field) => field !== "q")) {
    return res.status(400).json({ status: "error", message: "Only the q query parameter is supported." });
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length === 0 || q.length > 128) {
    return res.status(400).json({ status: "error", message: "q must contain 1 to 128 characters." });
  }
  const like = `%${escapeLike(q)}%`;
  const isNumber = /^\d{1,10}$/.test(q) && Number(q) <= 2147483647;
  const where = isNumber
    ? "(p.payment_id = ? OR u.phone LIKE ? ESCAPE '\\\\')"
    : `(p.transaction_ref = ? OR pv.transfer_reference = ?
        OR u.full_name LIKE ? ESCAPE '\\\\' OR u.email LIKE ? ESCAPE '\\\\'
        OR u.phone LIKE ? ESCAPE '\\\\' OR v.license_plate LIKE ? ESCAPE '\\\\')`;
  const params = isNumber ? [Number(q), like] : [q, q, like, like, like, like];
  try {
    const [rows] = await pool.execute(
      `SELECT b.booking_id, DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
        TIME_FORMAT(b.start_time, '%H:%i') AS start_time, b.booking_status, b.final_amount,
        u.user_id, u.full_name, u.email, u.phone, v.license_plate,
        p.payment_id, p.payment_method, p.payment_status, p.transaction_ref, pv.transfer_reference
      FROM bookings b
      INNER JOIN users u ON u.user_id = b.user_id
      LEFT JOIN vehicles v ON v.vehicle_id = b.vehicle_id
      LEFT JOIN payments p ON p.booking_id = b.booking_id
      LEFT JOIN payment_verifications pv ON pv.payment_id = p.payment_id
      WHERE ${where}
      ORDER BY b.booking_date DESC, b.start_time DESC, b.booking_id DESC
      LIMIT ${MAX_RESULTS}`,
      params,
    );
    return res.status(200).json({
      status: "success",
      data: {
        items: rows.map((row) => ({
          booking_id: row.booking_id,
          booking_date: row.booking_date,
          start_time: row.start_time,
          booking_status: row.booking_status,
          amount: Number(row.final_amount),
          customer: {
            user_id: row.user_id,
            full_name: row.full_name,
            email: row.email,
            phone: row.phone,
          },
          license_plate: row.license_plate,
          payment_id: row.payment_id,
          payment_method: row.payment_method,
          payment_status: row.payment_status,
          transaction_ref: row.transaction_ref,
          transfer_reference: row.transfer_reference,
        })),
      },
    });
  } catch {
    console.error("Admin payment lookup failed.");
    return res.status(500).json({ status: "error", message: "Unable to look up the payment." });
  }
});

module.exports = router;
