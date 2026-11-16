// The caller joins payments p to their booking b.
module.exports = `p.payment_status = 'PAID'
  AND p.paid_at IS NOT NULL
  AND p.amount > 0 AND p.amount = b.final_amount
  AND (SELECT COUNT(*) FROM payments booking_payments
    WHERE booking_payments.booking_id = b.booking_id) = 1
  AND (
    (p.payment_method = 'WALLET' AND
      (SELECT COUNT(*) FROM wallet_transactions wt
        INNER JOIN wallets w ON w.wallet_id = wt.wallet_id
        WHERE wt.booking_id = b.booking_id AND wt.transaction_type = 'DEBIT'
          AND wt.refund_id IS NULL AND w.user_id = b.user_id) = 1
      AND EXISTS (
        SELECT 1 FROM wallet_transactions wt
        INNER JOIN wallets w ON w.wallet_id = wt.wallet_id
        WHERE wt.booking_id = b.booking_id AND wt.transaction_type = 'DEBIT'
          AND wt.refund_id IS NULL AND w.user_id = b.user_id AND wt.amount = p.amount
      ))
    OR (p.payment_method IN ('CASH', 'BANK_TRANSFER') AND EXISTS (
      SELECT 1 FROM payment_verifications pv
      WHERE pv.payment_id = p.payment_id AND pv.payment_method = p.payment_method
        AND pv.verified_amount = p.amount
    ))
  )`;
