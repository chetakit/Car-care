// [STAFF] แปลง request -> service และแปลง error -> HTTP status
const service = require("../services/staffBookingService");

function handleError(res, error) {
  if (error instanceof service.StaffBookingNotFoundError) {
    return res.status(404).json({ status: "error", message: "Booking not found." });
  }
  if (error instanceof service.StaffForbiddenActionError) {
    return res.status(403).json({ status: "error", message: error.message });
  }
  if (error instanceof service.StaffBookingConflictError) {
    return res.status(409).json({ status: "error", message: error.message });
  }
  if (error?.code === "ER_NO_SUCH_TABLE") {
    // ยังไม่ได้รัน database/migrations/2026-11-15_staff_service.sql
    console.error("Staff tables are missing. Run the staff_service migration.");
  } else {
    console.error("Staff booking request failed.");
  }
  return res.status(500).json({
    status: "error",
    message: "Unable to process booking request.",
  });
}

function respond(work) {
  return async (req, res) => {
    try {
      const data = await work(req);
      return res.status(200).json({ status: "success", data });
    } catch (error) {
      return handleError(res, error);
    }
  };
}

module.exports = {
  list: respond((req) => service.list(req.staffBookingQuery)),
  getById: respond((req) => service.getById(req.bookingId)),
  checkIn: respond((req) => service.checkIn(req.bookingId, req.staffCheckIn, req.user)),
  changeStatus: respond((req) =>
    service.changeStatus(req.bookingId, req.staffStatusChange, req.user),
  ),
  markNoShow: respond((req) => service.markNoShow(req.bookingId, req.staffText, req.user)),
  addNote: respond((req) => service.addNote(req.bookingId, req.staffText, req.user)),
};
