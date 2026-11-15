const profileService = require("../services/profileService");

function handleProfileError(error, res) {
  if (error instanceof profileService.ProfileNotFoundError) {
    return res.status(404).json({
      status: "error",
      message: "Customer profile not found.",
    });
  }
  if (error instanceof profileService.CustomerAccessError) {
    return res.status(403).json({
      status: "error",
      message: "Customer access required.",
    });
  }

  console.error("Customer profile request failed due to an internal error.");
  return res.status(500).json({
    status: "error",
    message: "Unable to process customer profile request.",
  });
}

async function getProfile(req, res) {
  try {
    const user = await profileService.getProfile(req.user.user_id);
    return res.status(200).json({
      status: "success",
      data: { user },
    });
  } catch (error) {
    return handleProfileError(error, res);
  }
}

async function updateProfile(req, res) {
  try {
    const user = await profileService.updateProfile(
      req.user.user_id,
      req.profileUpdate,
    );
    return res.status(200).json({
      status: "success",
      data: { user },
    });
  } catch (error) {
    return handleProfileError(error, res);
  }
}

module.exports = { getProfile, updateProfile };
