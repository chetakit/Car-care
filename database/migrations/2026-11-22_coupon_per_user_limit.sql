-- =====================================================================
-- Per-account coupon limit
--
-- per_user_limit = how many times one customer may use the coupon
-- (NULL = no per-account limit, only the overall usage_limit applies).
-- A use counts while its coupon_usages row exists: a booking cancelled
-- before payment (or expired) gives the use back, a paid one keeps it.
--
-- Run once with an account that can ALTER tables (e.g. root):
--   mysql -u <user> -p <database> < database/migrations/2026-11-22_coupon_per_user_limit.sql
-- =====================================================================

ALTER TABLE coupons
  ADD COLUMN per_user_limit INT DEFAULT NULL AFTER usage_limit,
  ADD CONSTRAINT coupons_chk_7 CHECK (per_user_limit IS NULL OR per_user_limit >= 1);

-- Counting a customer's uses of one coupon quickly.
CREATE INDEX idx_coupon_usages_coupon_user ON coupon_usages (coupon_id, user_id);
