const express = require("express");
const pool = require("../config/db");
const {
  authenticateToken,
  requireSupportedSessionRole,
} = require("../../Auth/middleware/authMiddleware");
const notificationService = require("../services/notificationService");

// The bell in the header, for every role. A user only ever sees and marks
// their own notifications (the user comes from the token).
//   GET  /api/notifications?limit=20   -> { items, unread_count }
//   POST /api/notifications/read       body { ids?: number[] }  (no ids = all)
const router = express.Router();
router.use(authenticateToken, requireSupportedSessionRole);

function sendValidationError(res, message) {
  return res.status(400).json({ status: "error", message });
}

router.get("/", async (req, res) => {
  const fields = Object.keys(req.query);
  if (fields.some((field) => field !== "limit")) {
    return sendValidationError(res, "Only the limit query parameter is supported.");
  }
  let limit = 20;
  if (req.query.limit !== undefined) {
    limit = Number(req.query.limit);
    if (!/^\d+$/.test(String(req.query.limit)) || limit < 1 || limit > 50) {
      return sendValidationError(res, "limit must be a whole number from 1 to 50.");
    }
  }
  try {
    const data = await notificationService.listForUser(pool, req.user.user_id, limit);
    return res.status(200).json({ status: "success", data });
  } catch {
    console.error("Listing notifications failed.");
    return res.status(500).json({ status: "error", message: "Unable to retrieve notifications." });
  }
});

router.post("/read", async (req, res) => {
  const body = req.body ?? {};
  if (typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "ids")) {
    return sendValidationError(res, "Only ids may be sent.");
  }
  const { ids } = body;
  if (
    ids !== undefined &&
    (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => !Number.isSafeInteger(id) || id < 1))
  ) {
    return sendValidationError(res, "ids must be a list of up to 100 positive whole numbers.");
  }
  try {
    const updated = await notificationService.markRead(pool, req.user.user_id, ids);
    return res.status(200).json({ status: "success", data: { updated } });
  } catch {
    console.error("Marking notifications as read failed.");
    return res.status(500).json({ status: "error", message: "Unable to update notifications." });
  }
});

module.exports = router;
