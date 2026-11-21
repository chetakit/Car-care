SET FOREIGN_KEY_CHECKS = 0;
-- =====================================================================
-- Car Care — full database schema (MySQL 8.4)
-- Dumped from the live database on 2026-11-16, then updated to the state
-- after every file in database/migrations/ has been applied:
--   * 2026-11-15_staff_service.sql          (booking_notes, vehicle_check_ins)
--   * 2026-11-15_payment_verifications.sql  (payment_verifications)
--   * 2026-11-16_pay_before_confirm.sql     (booking_status PENDING_PAYMENT)
--   * 2026-11-21_notifications.sql          (notifications)
--   * 2026-11-22_coupon_per_user_limit.sql  (coupons.per_user_limit)
-- Use this file to create a fresh database. For an existing database,
-- run the migration files instead.
-- =====================================================================

CREATE TABLE `audit_logs` (
  `audit_log_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `table_name` varchar(100) NOT NULL,
  `record_id` varchar(100) NOT NULL,
  `old_value` json DEFAULT NULL,
  `new_value` json DEFAULT NULL,
  `reason` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_log_id`),
  KEY `idx_audit_logs_user_date` (`user_id`,`created_at`),
  KEY `idx_audit_logs_table_record` (`table_name`,`record_id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `booking_notes` (
  `note_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `note` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`note_id`),
  KEY `idx_booking_notes_booking` (`booking_id`,`created_at`),
  KEY `fk_booking_notes_user` (`created_by`),
  CONSTRAINT `fk_booking_notes_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`),
  CONSTRAINT `fk_booking_notes_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `booking_services` (
  `booking_service_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `service_id` int NOT NULL,
  `service_name` varchar(100) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `duration_minutes` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`booking_service_id`),
  UNIQUE KEY `booking_id` (`booking_id`,`service_id`),
  KEY `service_id` (`service_id`),
  CONSTRAINT `booking_services_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`),
  CONSTRAINT `booking_services_ibfk_2` FOREIGN KEY (`service_id`) REFERENCES `services` (`service_id`),
  CONSTRAINT `booking_services_chk_1` CHECK ((`unit_price` >= 0)),
  CONSTRAINT `booking_services_chk_2` CHECK ((`duration_minutes` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `booking_status_history` (
  `history_id` bigint NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `old_status` varchar(30) DEFAULT NULL,
  `new_status` varchar(30) NOT NULL,
  `changed_by` int DEFAULT NULL,
  `reason` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `changed_by` (`changed_by`),
  KEY `idx_booking_status_history_booking_date` (`booking_id`,`created_at`),
  CONSTRAINT `booking_status_history_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`),
  CONSTRAINT `booking_status_history_ibfk_2` FOREIGN KEY (`changed_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `bookings` (
  `booking_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `vehicle_id` int NOT NULL,
  `schedule_id` int NOT NULL,
  `coupon_id` int DEFAULT NULL,
  `booking_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `discount_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `final_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `booking_status` enum('PENDING_PAYMENT','CONFIRMED','CHECKED_IN','IN_SERVICE','COMPLETED','CANCELLED','NO_SHOW') NOT NULL DEFAULT 'PENDING_PAYMENT',
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`booking_id`),
  KEY `vehicle_id` (`vehicle_id`,`user_id`),
  KEY `schedule_id` (`schedule_id`),
  KEY `coupon_id` (`coupon_id`),
  KEY `idx_bookings_user` (`user_id`),
  KEY `idx_bookings_date_status` (`booking_date`,`booking_status`),
  CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`vehicle_id`, `user_id`) REFERENCES `vehicles` (`vehicle_id`, `user_id`),
  CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`schedule_id`) REFERENCES `schedules` (`schedule_id`),
  CONSTRAINT `bookings_ibfk_3` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`coupon_id`),
  CONSTRAINT `bookings_chk_1` CHECK ((`total_amount` >= 0)),
  CONSTRAINT `bookings_chk_2` CHECK ((`discount_amount` >= 0)),
  CONSTRAINT `bookings_chk_3` CHECK ((`final_amount` >= 0)),
  CONSTRAINT `bookings_chk_4` CHECK ((`discount_amount` <= `total_amount`)),
  CONSTRAINT `bookings_chk_5` CHECK ((`final_amount` = (`total_amount` - `discount_amount`))),
  CONSTRAINT `bookings_chk_6` CHECK ((`end_time` > `start_time`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `business_hours` (
  `business_hour_id` int NOT NULL AUTO_INCREMENT,
  `day_of_week` tinyint NOT NULL,
  `open_time` time DEFAULT NULL,
  `close_time` time DEFAULT NULL,
  `is_closed` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`business_hour_id`),
  UNIQUE KEY `day_of_week` (`day_of_week`),
  CONSTRAINT `business_hours_chk_1` CHECK ((`day_of_week` between 1 and 7)),
  CONSTRAINT `business_hours_chk_2` CHECK (((`is_closed` = true) or ((`open_time` is not null) and (`close_time` is not null) and (`close_time` > `open_time`))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `coupon_usages` (
  `coupon_usage_id` int NOT NULL AUTO_INCREMENT,
  `coupon_id` int NOT NULL,
  `booking_id` int NOT NULL,
  `user_id` int NOT NULL,
  `discount_amount` decimal(10,2) NOT NULL,
  `used_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`coupon_usage_id`),
  UNIQUE KEY `booking_id` (`booking_id`),
  KEY `coupon_id` (`coupon_id`),
  KEY `user_id` (`user_id`),
  KEY `idx_coupon_usages_coupon_user` (`coupon_id`,`user_id`),
  CONSTRAINT `coupon_usages_ibfk_1` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`coupon_id`),
  CONSTRAINT `coupon_usages_ibfk_2` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`),
  CONSTRAINT `coupon_usages_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `coupon_usages_chk_1` CHECK ((`discount_amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `coupons` (
  `coupon_id` int NOT NULL AUTO_INCREMENT,
  `coupon_code` varchar(50) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_type` enum('PERCENT','FIXED') NOT NULL,
  `discount_value` decimal(10,2) NOT NULL,
  `max_discount` decimal(10,2) DEFAULT NULL,
  `min_order_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `usage_limit` int DEFAULT NULL,
  `per_user_limit` int DEFAULT NULL,
  `used_count` int NOT NULL DEFAULT '0',
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`coupon_id`),
  UNIQUE KEY `coupon_code` (`coupon_code`),
  CONSTRAINT `coupons_chk_1` CHECK ((`discount_value` > 0)),
  CONSTRAINT `coupons_chk_2` CHECK (((`discount_type` <> _utf8mb4'PERCENT') or (`discount_value` <= 100))),
  CONSTRAINT `coupons_chk_3` CHECK ((`min_order_amount` >= 0)),
  CONSTRAINT `coupons_chk_4` CHECK (((`usage_limit` is null) or (`usage_limit` >= 0))),
  CONSTRAINT `coupons_chk_5` CHECK ((`used_count` >= 0)),
  CONSTRAINT `coupons_chk_6` CHECK ((`end_date` > `start_date`)),
  CONSTRAINT `coupons_chk_7` CHECK (((`per_user_limit` is null) or (`per_user_limit` >= 1)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `notifications` (
  `notification_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `booking_id` int DEFAULT NULL,
  `data` json DEFAULT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `idx_notifications_user_read` (`user_id`,`read_at`,`created_at`),
  KEY `idx_notifications_booking` (`booking_id`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_notifications_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payments` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_method` enum('CASH','BANK_TRANSFER','WALLET','SIMULATED') NOT NULL DEFAULT 'SIMULATED',
  `payment_status` enum('PENDING','PAID','FAILED') NOT NULL DEFAULT 'PENDING',
  `transaction_ref` varchar(100) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `booking_id` (`booking_id`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`),
  CONSTRAINT `payments_chk_1` CHECK ((`amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `payment_verifications` (
  `payment_id` int NOT NULL,
  `verified_by` int NOT NULL,
  `payment_method` enum('CASH','BANK_TRANSFER') NOT NULL,
  `verified_amount` decimal(10,2) NOT NULL,
  `transfer_reference` varchar(128) DEFAULT NULL,
  `verified_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uq_payment_verifications_transfer_reference` (`transfer_reference`),
  KEY `fk_payment_verifications_user` (`verified_by`),
  CONSTRAINT `fk_payment_verifications_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`payment_id`),
  CONSTRAINT `fk_payment_verifications_user` FOREIGN KEY (`verified_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `refunds` (
  `refund_id` int NOT NULL AUTO_INCREMENT,
  `payment_id` int NOT NULL,
  `booking_id` int NOT NULL,
  `refund_amount` decimal(10,2) NOT NULL,
  `cancellation_fee` decimal(10,2) NOT NULL DEFAULT '0.00',
  `refund_reason` text,
  `refund_status` enum('REFUND_PENDING','REFUNDED','REFUND_FAILED') NOT NULL DEFAULT 'REFUND_PENDING',
  `processed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`refund_id`),
  KEY `booking_id` (`booking_id`),
  KEY `idx_refunds_payment` (`payment_id`),
  CONSTRAINT `refunds_ibfk_1` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`payment_id`),
  CONSTRAINT `refunds_ibfk_2` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`),
  CONSTRAINT `refunds_chk_1` CHECK ((`refund_amount` >= 0)),
  CONSTRAINT `refunds_chk_2` CHECK ((`cancellation_fee` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `schedules` (
  `schedule_id` int NOT NULL AUTO_INCREMENT,
  `schedule_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `capacity` int NOT NULL,
  `status` enum('AVAILABLE','FULL','CLOSED') NOT NULL DEFAULT 'AVAILABLE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`schedule_id`),
  UNIQUE KEY `schedule_date` (`schedule_date`,`start_time`),
  CONSTRAINT `schedules_chk_1` CHECK ((`capacity` > 0)),
  CONSTRAINT `schedules_chk_2` CHECK ((`end_time` > `start_time`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `service_prices` (
  `service_price_id` int NOT NULL AUTO_INCREMENT,
  `service_id` int NOT NULL,
  `vehicle_type_id` int NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`service_price_id`),
  UNIQUE KEY `service_id` (`service_id`,`vehicle_type_id`),
  KEY `vehicle_type_id` (`vehicle_type_id`),
  CONSTRAINT `service_prices_ibfk_1` FOREIGN KEY (`service_id`) REFERENCES `services` (`service_id`),
  CONSTRAINT `service_prices_ibfk_2` FOREIGN KEY (`vehicle_type_id`) REFERENCES `vehicle_types` (`vehicle_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `services` (
  `service_id` int NOT NULL AUTO_INCREMENT,
  `service_name` varchar(100) NOT NULL,
  `description` text,
  `duration_minutes` int NOT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`service_id`),
  UNIQUE KEY `service_name` (`service_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `role` enum('ADMIN','CUSTOMER','STAFF') NOT NULL DEFAULT 'CUSTOMER',
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `vehicle_brands` (
  `brand_id` int NOT NULL AUTO_INCREMENT,
  `brand_name` varchar(100) NOT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`brand_id`),
  UNIQUE KEY `brand_name` (`brand_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `vehicle_check_ins` (
  `check_in_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `mileage` int unsigned NOT NULL,
  `fuel_level` enum('EMPTY','QUARTER','HALF','THREE_QUARTER','FULL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `condition_note` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `checked_in_by` int NOT NULL,
  `checked_in_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`check_in_id`),
  UNIQUE KEY `uq_vehicle_check_ins_booking` (`booking_id`),
  KEY `fk_vehicle_check_ins_staff` (`checked_in_by`),
  CONSTRAINT `fk_vehicle_check_ins_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`),
  CONSTRAINT `fk_vehicle_check_ins_staff` FOREIGN KEY (`checked_in_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `vehicle_models` (
  `model_id` int NOT NULL AUTO_INCREMENT,
  `brand_id` int NOT NULL,
  `vehicle_type_id` int NOT NULL,
  `model_name` varchar(100) NOT NULL,
  `model_year_start` year DEFAULT NULL,
  `model_year_end` year DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`model_id`),
  UNIQUE KEY `brand_id` (`brand_id`,`model_name`),
  KEY `vehicle_type_id` (`vehicle_type_id`),
  CONSTRAINT `vehicle_models_ibfk_1` FOREIGN KEY (`brand_id`) REFERENCES `vehicle_brands` (`brand_id`),
  CONSTRAINT `vehicle_models_ibfk_2` FOREIGN KEY (`vehicle_type_id`) REFERENCES `vehicle_types` (`vehicle_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `vehicle_types` (
  `vehicle_type_id` int NOT NULL AUTO_INCREMENT,
  `type_name` varchar(50) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`vehicle_type_id`),
  UNIQUE KEY `type_name` (`type_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `vehicles` (
  `vehicle_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `model_id` int NOT NULL,
  `production_year` year DEFAULT NULL,
  `license_plate` varchar(20) NOT NULL,
  `province` varchar(100) DEFAULT NULL,
  `color` varchar(50) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`vehicle_id`),
  UNIQUE KEY `vehicle_id` (`vehicle_id`,`user_id`),
  KEY `user_id` (`user_id`),
  KEY `model_id` (`model_id`),
  CONSTRAINT `vehicles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `vehicles_ibfk_2` FOREIGN KEY (`model_id`) REFERENCES `vehicle_models` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `wallet_transactions` (
  `wallet_transaction_id` bigint NOT NULL AUTO_INCREMENT,
  `wallet_id` int NOT NULL,
  `refund_id` int DEFAULT NULL,
  `booking_id` int DEFAULT NULL,
  `transaction_type` enum('CREDIT','DEBIT') NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`wallet_transaction_id`),
  UNIQUE KEY `refund_id` (`refund_id`),
  KEY `wallet_id` (`wallet_id`),
  KEY `booking_id` (`booking_id`),
  CONSTRAINT `wallet_transactions_ibfk_1` FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`wallet_id`),
  CONSTRAINT `wallet_transactions_ibfk_2` FOREIGN KEY (`refund_id`) REFERENCES `refunds` (`refund_id`),
  CONSTRAINT `wallet_transactions_ibfk_3` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`),
  CONSTRAINT `wallet_transactions_chk_1` CHECK ((`amount` > 0)),
  CONSTRAINT `wallet_transactions_chk_2` CHECK ((((`transaction_type` = _utf8mb4'CREDIT') and (`refund_id` is not null) and (`booking_id` is null)) or ((`transaction_type` = _utf8mb4'DEBIT') and (`booking_id` is not null) and (`refund_id` is null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `wallets` (
  `wallet_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `balance` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`wallet_id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `wallets_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `wallets_chk_1` CHECK ((`balance` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
SET FOREIGN_KEY_CHECKS = 1;
