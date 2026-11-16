-- Review payment_id and user_id types against the target schema before applying.
-- This migration does not verify or change existing payments.
CREATE TABLE payment_verifications (
  payment_id INT NOT NULL PRIMARY KEY,
  verified_by INT NOT NULL,
  payment_method ENUM('CASH', 'BANK_TRANSFER') NOT NULL,
  verified_amount DECIMAL(10,2) NOT NULL,
  transfer_reference VARCHAR(128) NULL,
  verified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_verifications_transfer_reference (transfer_reference),
  CONSTRAINT fk_payment_verifications_payment
    FOREIGN KEY (payment_id) REFERENCES payments (payment_id),
  CONSTRAINT fk_payment_verifications_user
    FOREIGN KEY (verified_by) REFERENCES users (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
