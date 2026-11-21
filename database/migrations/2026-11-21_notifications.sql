-- =====================================================================
-- In-app notifications (the bell in the header)
--
-- One row per recipient. The app stores only a type and its data; the text
-- is translated in the browser (TH/EN). booking_id links the notification to
-- a booking when there is one. read_at is set when the user opens the bell.
--
-- Run once:  mysql -u <user> -p <database> < database/migrations/2026-11-21_notifications.sql
-- The backend keeps working without this table (notifications are skipped).
-- =====================================================================

CREATE TABLE IF NOT EXISTS notifications (
  notification_id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  booking_id INT DEFAULT NULL,
  data JSON DEFAULT NULL,
  read_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id),
  KEY idx_notifications_user_read (user_id, read_at, created_at),
  KEY idx_notifications_booking (booking_id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT fk_notifications_booking FOREIGN KEY (booking_id) REFERENCES bookings (booking_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
