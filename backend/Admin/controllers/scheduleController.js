const scheduleService = require("../services/scheduleService");

function handleError(res, error) {
  if (error instanceof scheduleService.ScheduleNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Schedule not found.",
    });
  }
  if (error instanceof scheduleService.ScheduleCapacityConflictError) {
    return res.status(409).json({
      status: "error",
      message: error.message,
    });
  }

  console.error("Admin schedule request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process schedule request.",
  });
}

async function listCapacity(req, res) {
  try {
    const items = await scheduleService.listCapacity(req.scheduleDateRange);
    return res.status(200).json({
      status: "success",
      data: { items },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateCapacity(req, res) {
  try {
    const data = await scheduleService.updateCapacity(
      req.scheduleId,
      req.scheduleCapacity,
    );
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { listCapacity, updateCapacity };
