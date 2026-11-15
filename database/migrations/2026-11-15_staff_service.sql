-- =====================================================================
-- Staff & Service Management (Flame)
-- ตารางใหม่ 2 ตาราง สำหรับระบบฝั่งพนักงาน
--
-- วิธีรัน:  mysql -u root -p car_care_db < database/migrations/2026-11-15_staff_service.sql
--
-- หมายเหตุ: ชนิดคอลัมน์ booking_id / user_id ต้องตรงกับตาราง bookings / users เป๊ะ ๆ
--   ถ้ารันแล้วเจอ error 3780 (foreign key incompatible) แปลว่าตารางเดิมใช้
--   INT UNSIGNED -> ให้เปลี่ยน INT เป็น INT UNSIGNED ในคอลัมน์ที่มี FK ด้านล่าง
-- =====================================================================

USE car_care_db;

-- ---------------------------------------------------------------------
-- 1) vehicle_check_ins : บันทึกการรับรถเข้าร้าน (1 การจอง = รับรถได้ 1 ครั้ง)
--    ใช้โดย POST /api/staff/bookings/:id/check-in
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_check_ins (
  check_in_id     INT AUTO_INCREMENT PRIMARY KEY,
  booking_id      INT NOT NULL,
  mileage         INT UNSIGNED NOT NULL,                 -- เลขไมล์ (กม.)
  fuel_level      ENUM('EMPTY', 'QUARTER', 'HALF', 'THREE_QUARTER', 'FULL') NOT NULL,
  condition_note  VARCHAR(1000) NULL,                    -- สภาพรถ / รอย / ของมีค่าในรถ
  checked_in_by   INT NOT NULL,                          -- users.user_id ของพนักงานที่รับรถ
  checked_in_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_vehicle_check_ins_booking UNIQUE (booking_id),
  CONSTRAINT fk_vehicle_check_ins_booking
    FOREIGN KEY (booking_id) REFERENCES bookings (booking_id),
  CONSTRAINT fk_vehicle_check_ins_staff
    FOREIGN KEY (checked_in_by) REFERENCES users (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2) booking_notes : หมายเหตุของพนักงานที่ "ไม่ได้เปลี่ยนสถานะ"
--    (หมายเหตุตอนเปลี่ยนสถานะ ยังเก็บใน booking_status_history.reason เหมือนเดิม)
--    ใช้โดย POST /api/staff/bookings/:id/notes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_notes (
  note_id     INT AUTO_INCREMENT PRIMARY KEY,
  booking_id  INT NOT NULL,
  note        VARCHAR(1000) NOT NULL,
  created_by  INT NOT NULL,                              -- users.user_id ของพนักงาน
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_booking_notes_booking (booking_id, created_at),
  CONSTRAINT fk_booking_notes_booking
    FOREIGN KEY (booking_id) REFERENCES bookings (booking_id),
  CONSTRAINT fk_booking_notes_user
    FOREIGN KEY (created_by) REFERENCES users (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- (ไม่บังคับ) สร้างบัญชีพนักงานไว้ทดสอบ
-- ไม่ต้องรัน SQL — ให้ Admin เปลี่ยน role ผู้ใช้ที่มีอยู่เป็น STAFF ผ่าน
--   PATCH /api/admin/users/:id/role   { "role": "STAFF" }
-- ---------------------------------------------------------------------
