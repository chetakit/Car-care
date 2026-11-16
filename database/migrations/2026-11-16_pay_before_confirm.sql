-- =====================================================================
-- Pay before confirm
--
-- A new booking starts as PENDING_PAYMENT and holds its schedule slot for
-- 15 minutes (backend/shared/services/bookingPaymentHold.js). A successful
-- payment (SIMULATED PAID, WALLET, or a verified BANK_TRANSFER) moves it to
-- CONFIRMED. Unpaid bookings past the hold are cancelled automatically.
--
-- Cancellation of a paid booking: 20% fee, 80% credited to the Wallet.
-- No-show of a paid booking: 100% forfeited (refunds row with refund 0).
--
-- Run once:  mysql -u <user> -p <database> < database/migrations/2026-11-16_pay_before_confirm.sql
-- Existing CONFIRMED bookings are left unchanged.
-- =====================================================================

ALTER TABLE bookings
  MODIFY booking_status
    ENUM('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
    NOT NULL DEFAULT 'PENDING_PAYMENT';
