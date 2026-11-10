const userService = require("../services/userService");

function handleError(res, error) {
  if (error instanceof userService.UserNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "User not found.",
    });
  }

  if (error instanceof userService.DuplicateUserEmailError) {
    return res.status(409).json({
      status: "error",
      message: "Email address already exists.",
    });
  }

  if (error instanceof userService.SelfRoleChangeError) {
    return res.status(400).json({
      status: "error",
      message: "You cannot change your own role.",
    });
  }

  if (error instanceof userService.SelfDeactivationError) {
    return res.status(400).json({
      status: "error",
      message: "You cannot deactivate your own account.",
    });
  }

  console.error("Admin user request failed.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process user request.",
  });
}

async function list(req, res) {
  try {
    const data = await userService.list(req.userListQuery);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getById(req, res) {
  try {
    const data = await userService.getById(req.userId);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function update(req, res) {
  try {
    const data = await userService.update(req.userId, req.body);
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateRole(req, res) {
  try {
    const data = await userService.updateRole(
      req.userId,
      req.body.role,
      req.user.user_id,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateStatus(req, res) {
  try {
    const data = await userService.updateStatus(
      req.userId,
      req.body.status,
      req.user.user_id,
    );
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { list, getById, update, updateRole, updateStatus };
