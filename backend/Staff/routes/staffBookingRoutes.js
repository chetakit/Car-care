// =====================================================================
// [STAFF] /api/staff/bookings  (ต่อใน app.js)
//
//   GET    /                 1) รายการจองรายวัน (?date=) / 8) ประวัติ (?date_from=&date_to=)
//   GET    /:id              2) 3) รายละเอียดลูกค้า รถ บริการ + ไทม์ไลน์
//   POST   /:id/check-in     4) รับรถเข้าร้าน
//   PATCH  /:id/status       5) 6) เปลี่ยนสถานะ + เหตุผล
//   POST   /:id/no-show      7) ลูกค้าไม่มาตามนัด
//   POST   /:id/notes        6) หมายเหตุ (ไม่เปลี่ยนสถานะ)
//
// ไม่มี endpoint ยกเลิกการจอง — พนักงานไม่มีสิทธิ์ยกเลิกแทนลูกค้า
// =====================================================================
const express = require("express");
const controller = require("../controllers/staffBookingController");
const validator = require("../validators/staffBookingValidator");
const {
  authenticateToken,
  requireCurrentStaff,
} = require("../../Auth/middleware/authMiddleware");

const router = express.Router();

router.use(authenticateToken, requireCurrentStaff); // STAFF เท่านั้น (เช็ก role ล่าสุดจาก DB)

router.get("/", validator.validateListQuery, controller.list);
router.get("/:id", validator.parseId, controller.getById);
router.post("/:id/check-in", validator.parseId, validator.validateCheckIn, controller.checkIn);
router.patch("/:id/status", validator.parseId, validator.validateStatusChange, controller.changeStatus);
router.post("/:id/no-show", validator.parseId, validator.validateNoShow, controller.markNoShow);
router.post("/:id/notes", validator.parseId, validator.validateNote, controller.addNote);

module.exports = router;
