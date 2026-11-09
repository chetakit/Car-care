USE car_care_db;

DELIMITER $$

CREATE PROCEDURE seed_dashboard_test_data_20261110()
BEGIN
  DECLARE v_customer1_id INT DEFAULT NULL;
  DECLARE v_customer2_id INT DEFAULT NULL;
  DECLARE v_vehicle1_id INT DEFAULT NULL;
  DECLARE v_vehicle2_id INT DEFAULT NULL;
  DECLARE v_booking1_id INT DEFAULT NULL;
  DECLARE v_booking2_id INT DEFAULT NULL;
  DECLARE v_email_count INT DEFAULT 0;
  DECLARE v_plate_count INT DEFAULT 0;
  DECLARE v_master_count INT DEFAULT 0;
  DECLARE v_schedule_count INT DEFAULT 0;
  DECLARE v_schedule1_date DATE DEFAULT NULL;
  DECLARE v_schedule1_start TIME DEFAULT NULL;
  DECLARE v_schedule1_end TIME DEFAULT NULL;
  DECLARE v_schedule1_capacity INT DEFAULT NULL;
  DECLARE v_schedule1_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_schedule2_date DATE DEFAULT NULL;
  DECLARE v_schedule2_start TIME DEFAULT NULL;
  DECLARE v_schedule2_end TIME DEFAULT NULL;
  DECLARE v_schedule2_capacity INT DEFAULT NULL;
  DECLARE v_schedule2_status VARCHAR(20) DEFAULT NULL;
  DECLARE v_schedule1_bookings INT DEFAULT 0;
  DECLARE v_schedule2_bookings INT DEFAULT 0;
  DECLARE v_service1_name VARCHAR(100) DEFAULT NULL;
  DECLARE v_service1_duration INT DEFAULT NULL;
  DECLARE v_service1_price DECIMAL(10,2) DEFAULT NULL;
  DECLARE v_service2_name VARCHAR(100) DEFAULT NULL;
  DECLARE v_service2_duration INT DEFAULT NULL;
  DECLARE v_service2_price DECIMAL(10,2) DEFAULT NULL;
  DECLARE v_service1_price_count INT DEFAULT 0;
  DECLARE v_service2_price_count INT DEFAULT 0;
  DECLARE v_payment_count INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR NOT FOUND
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT COUNT(*) INTO v_schedule_count
  FROM schedules
  WHERE schedule_id IN (1, 2);

  IF v_schedule_count <> 2 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Required test schedules do not exist.';
  END IF;

  BEGIN
    DECLARE v_schedule_not_found BOOLEAN DEFAULT FALSE;
    DECLARE CONTINUE HANDLER FOR NOT FOUND
      SET v_schedule_not_found = TRUE;

    SELECT schedule_date, start_time, end_time, capacity, status
      INTO v_schedule1_date, v_schedule1_start, v_schedule1_end,
           v_schedule1_capacity, v_schedule1_status
    FROM schedules
    WHERE schedule_id = 1
    FOR UPDATE;

    IF v_schedule_not_found THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Schedule 1 disappeared while being locked.';
    END IF;

    SELECT schedule_date, start_time, end_time, capacity, status
      INTO v_schedule2_date, v_schedule2_start, v_schedule2_end,
           v_schedule2_capacity, v_schedule2_status
    FROM schedules
    WHERE schedule_id = 2
    FOR UPDATE;

    IF v_schedule_not_found THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Schedule 2 disappeared while being locked.';
    END IF;
  END;

  IF v_schedule1_status IS NULL OR v_schedule2_status IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Required test schedules do not exist.';
  END IF;

  IF v_schedule1_status <> 'AVAILABLE' OR v_schedule2_status <> 'AVAILABLE' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Required test schedules are not AVAILABLE.';
  END IF;

  SELECT COUNT(*) INTO v_email_count
  FROM users
  WHERE email IN (
    'dashboard.test.customer1@carcare.local',
    'dashboard.test.customer2@carcare.local'
  );

  IF v_email_count <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A dashboard test customer email already exists.';
  END IF;

  SELECT COUNT(*) INTO v_plate_count
  FROM vehicles
  WHERE license_plate IN ('TEST-DASH-001', 'TEST-DASH-002');

  IF v_plate_count <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A dashboard test vehicle plate already exists.';
  END IF;

  SELECT COUNT(*) INTO v_master_count
  FROM vehicle_models
  WHERE model_id IN (1, 4)
    AND vehicle_type_id = 1
    AND status = 'ACTIVE';

  IF v_master_count <> 2 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Required active Sedan models do not exist.';
  END IF;

  SELECT COUNT(*) INTO v_master_count
  FROM services
  WHERE service_id IN (1, 2)
    AND status = 'ACTIVE';

  IF v_master_count <> 2 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Required active services do not exist.';
  END IF;

  SELECT COUNT(*) INTO v_service1_price_count
  FROM service_prices
  WHERE service_id = 1
    AND vehicle_type_id = 1;

  SELECT COUNT(*) INTO v_service2_price_count
  FROM service_prices
  WHERE service_id = 2
    AND vehicle_type_id = 1;

  IF v_service1_price_count <> 1 OR v_service2_price_count <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Each required Sedan service must have exactly one price.';
  END IF;

  SELECT service_name, duration_minutes, price
    INTO v_service1_name, v_service1_duration, v_service1_price
  FROM services
  JOIN service_prices USING (service_id)
  WHERE services.service_id = 1
    AND vehicle_type_id = 1
    AND services.status = 'ACTIVE';

  SELECT service_name, duration_minutes, price
    INTO v_service2_name, v_service2_duration, v_service2_price
  FROM services
  JOIN service_prices USING (service_id)
  WHERE services.service_id = 2
    AND vehicle_type_id = 1
    AND services.status = 'ACTIVE';

  IF v_service1_price IS NULL OR v_service2_price IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Required Sedan service prices do not exist.';
  END IF;

  SELECT COUNT(*) INTO v_schedule1_bookings
  FROM bookings
  WHERE schedule_id = 1;

  SELECT COUNT(*) INTO v_schedule2_bookings
  FROM bookings
  WHERE schedule_id = 2;

  IF v_schedule1_capacity <= v_schedule1_bookings
      OR v_schedule2_capacity <= v_schedule2_bookings THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A required test schedule has no remaining capacity.';
  END IF;

  INSERT INTO users (full_name, email, password_hash, role, status)
  VALUES (
    'Dashboard Test Customer 1',
    'dashboard.test.customer1@carcare.local',
    '$2b$12$439NhnCvoIKpubK7HV5ZJuawS5UORZjPLn4nHlzCJ1wF9pPiBltge',
    'CUSTOMER',
    'ACTIVE'
  );
  SET v_customer1_id = LAST_INSERT_ID();

  INSERT INTO users (full_name, email, password_hash, role, status)
  VALUES (
    'Dashboard Test Customer 2',
    'dashboard.test.customer2@carcare.local',
    '$2b$12$2Ngszy653dP1fzGHpf3Y/O6ADXsQ7jgIMlRjDaTHivs2n/JYc8lC2',
    'CUSTOMER',
    'ACTIVE'
  );
  SET v_customer2_id = LAST_INSERT_ID();

  INSERT INTO vehicles (user_id, model_id, license_plate, status)
  VALUES (v_customer1_id, 1, 'TEST-DASH-001', 'ACTIVE');
  SET v_vehicle1_id = LAST_INSERT_ID();

  INSERT INTO vehicles (user_id, model_id, license_plate, status)
  VALUES (v_customer2_id, 4, 'TEST-DASH-002', 'ACTIVE');
  SET v_vehicle2_id = LAST_INSERT_ID();

  INSERT INTO bookings (
    user_id,
    vehicle_id,
    schedule_id,
    booking_date,
    start_time,
    end_time,
    total_amount,
    discount_amount,
    final_amount,
    booking_status
  )
  VALUES (
    v_customer1_id,
    v_vehicle1_id,
    1,
    v_schedule1_date,
    v_schedule1_start,
    v_schedule1_end,
    v_service1_price,
    0.00,
    v_service1_price,
    'CONFIRMED'
  );
  SET v_booking1_id = LAST_INSERT_ID();

  INSERT INTO bookings (
    user_id,
    vehicle_id,
    schedule_id,
    booking_date,
    start_time,
    end_time,
    total_amount,
    discount_amount,
    final_amount,
    booking_status
  )
  VALUES (
    v_customer2_id,
    v_vehicle2_id,
    2,
    v_schedule2_date,
    v_schedule2_start,
    v_schedule2_end,
    v_service2_price,
    0.00,
    v_service2_price,
    'CONFIRMED'
  );
  SET v_booking2_id = LAST_INSERT_ID();

  INSERT INTO booking_services (
    booking_id,
    service_id,
    service_name,
    unit_price,
    duration_minutes
  )
  VALUES
    (
      v_booking1_id,
      1,
      v_service1_name,
      v_service1_price,
      v_service1_duration
    ),
    (
      v_booking2_id,
      2,
      v_service2_name,
      v_service2_price,
      v_service2_duration
    );

  SELECT COUNT(*) INTO v_payment_count
  FROM payments
  WHERE booking_id IN (v_booking1_id, v_booking2_id);

  IF v_payment_count <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A payment already exists for a test booking.';
  END IF;

  INSERT INTO payments (
    booking_id,
    amount,
    payment_method,
    payment_status,
    paid_at
  )
  VALUES
    (
      v_booking1_id,
      v_service1_price,
      'SIMULATED',
      'PAID',
      CURRENT_TIMESTAMP
    ),
    (
      v_booking2_id,
      v_service2_price,
      'SIMULATED',
      'PENDING',
      NULL
    );

  COMMIT;
END$$

DELIMITER ;

CALL seed_dashboard_test_data_20261110();
DROP PROCEDURE seed_dashboard_test_data_20261110;
