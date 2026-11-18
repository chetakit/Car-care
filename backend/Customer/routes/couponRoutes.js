// GET /api/customer/coupons/preview?code=SAVE10&subtotal=450.00
// Lets the booking page show the discount before the customer books.
// The booking request recalculates everything on the server; this is a preview only.
const express = require("express");
const pool = require("../../shared/config/db");
const {
  authenticateToken,
  requireCustomer,
} = require("../../Auth/middleware/authMiddleware");
const coupons = require("../../shared/services/couponPricing");

const router = express.Router();

router.get("/available", authenticateToken, requireCustomer, async (req, res) => {
  try {
    const [items] = await pool.execute(
      `SELECT coupon_id, coupon_code, description, discount_type, discount_value,
        max_discount, min_order_amount
      FROM coupons
      WHERE status = 'ACTIVE'
        AND NOW() >= start_date
        AND NOW() <= end_date
        AND (usage_limit IS NULL OR used_count < usage_limit)
      ORDER BY coupon_code ASC, coupon_id ASC`,
    );
    return res.status(200).json({ status: "success", data: { items } });
  } catch (error) {
    console.error("Available customer coupons request failed.");
    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve available coupons.",
    });
  }
});

router.get("/preview", authenticateToken, requireCustomer, async (req, res) => {
  const code = coupons.normalizeCouponCode(req.query.code);
  if (!code) {
    return res.status(400).json({ status: "error", message: "Enter a coupon code." });
  }
  let subtotalCents;
  try {
    subtotalCents = coupons.toCents(req.query.subtotal);
  } catch {
    return res.status(400).json({ status: "error", message: "subtotal must be an amount such as 450.00." });
  }
  if (subtotalCents <= 0n) {
    return res.status(400).json({ status: "error", message: "subtotal must be greater than zero." });
  }

  try {
    const coupon = await coupons.findCoupon(pool, code);
    const discountCents = coupons.calculateDiscount(coupon, subtotalCents);
    return res.status(200).json({
      status: "success",
      data: {
        coupon_code: coupon.coupon_code,
        description: coupon.description,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        subtotal: coupons.centsToDecimal(subtotalCents),
        discount_amount: coupons.centsToDecimal(discountCents),
        final_amount: coupons.centsToDecimal(subtotalCents - discountCents),
      },
    });
  } catch (error) {
    if (error instanceof coupons.CouponError) {
      return res.status(400).json({ status: "error", message: error.message });
    }
    console.error("Coupon preview failed.");
    return res.status(500).json({ status: "error", message: "Unable to check this coupon." });
  }
});

module.exports = router;
