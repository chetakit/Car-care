const express = require("express");
const cors = require("cors");
const pool = require("./shared/config/db");
const loginRoutes = require("./Auth/routes/loginRoutes");
const sessionRoutes = require("./Auth/routes/sessionRoutes");
const authRoutes = require("./Auth/routes/authRoutes");
const customerAuthRoutes = require("./Auth/routes/customerAuthRoutes");
const customerProfileRoutes = require("./Customer/routes/profileRoutes");
const customerVehicleRoutes = require("./Customer/routes/vehicleRoutes");
const customerCatalogRoutes = require("./Customer/routes/catalogRoutes");
const customerServiceCatalogRoutes = require("./Customer/routes/serviceCatalogRoutes");
const publicServiceCatalogRoutes = require("./Public/routes/serviceCatalogRoutes");
const publicAvailabilityRoutes = require("./Public/routes/availabilityRoutes");
const notificationRoutes = require("./shared/routes/notificationRoutes");
const paymentLookupRoutes = require("./Admin/routes/paymentLookupRoutes");
const auditLogRoutes = require("./Admin/routes/auditLogRoutes");
const { auditTrail } = require("./shared/middleware/auditTrail");
const customerBookingRoutes = require("./Customer/routes/bookingRoutes");
const customerBookingHistoryRoutes = require("./Customer/routes/bookingHistoryRoutes");
const customerScheduleRoutes = require("./Customer/routes/scheduleRoutes");
const customerCouponRoutes = require("./Customer/routes/couponRoutes");
const dashboardRoutes = require("./Admin/routes/dashboardRoutes");
const vehicleTypeRoutes = require("./Admin/routes/vehicleTypeRoutes");
const vehicleBrandRoutes = require("./Admin/routes/vehicleBrandRoutes");
const vehicleModelRoutes = require("./Admin/routes/vehicleModelRoutes");
const serviceRoutes = require("./Admin/routes/serviceRoutes");
const scheduleRoutes = require("./Admin/routes/scheduleRoutes");
const userRoutes = require("./Admin/routes/userRoutes");
const couponRoutes = require("./Admin/routes/couponRoutes");
const bookingRoutes = require("./Admin/routes/bookingRoutes");
const reportRoutes = require("./Admin/routes/reportRoutes");
const paymentRoutes = require("./Admin/routes/paymentRoutes");
const cancellationRoutes = require("./Admin/routes/cancellationRoutes");
const walletRoutes = require("./Admin/routes/walletRoutes");
// [STAFF] ระบบพนักงาน: คิวงาน, รับรถ, เปลี่ยนสถานะ, หมายเหตุ, No-show, ประวัติ
const staffBookingRoutes = require("./Staff/routes/staffBookingRoutes");

const app = express();

// Don't advertise the framework in every response.
app.disable("x-powered-by");
// Behind a hosting proxy (Railway, Render...) set TRUST_PROXY=1 so req.ip is
// the visitor's address, not the proxy's - the sign-in limiter counts per IP.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
}

app.use(cors());
app.use(express.json());
// Record admin/staff changes in audit_logs (see shared/middleware/auditTrail.js).
app.use(auditTrail);
app.use("/api/auth", loginRoutes);
app.use("/api/auth", sessionRoutes);
app.use("/api/admin/auth", authRoutes);
app.use("/api/customer/auth", customerAuthRoutes);
app.use("/api/customer/profile", customerProfileRoutes);
app.use("/api/customer/vehicles", customerVehicleRoutes);
app.use("/api/customer/catalog", customerCatalogRoutes);
app.use("/api/customer/catalog/services", customerServiceCatalogRoutes);
app.use("/api/public/catalog/services", publicServiceCatalogRoutes);
app.use("/api/public/availability", publicAvailabilityRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/customer", customerBookingRoutes);
app.use("/api/customer", customerBookingHistoryRoutes);
app.use("/api/customer/schedules", customerScheduleRoutes);
app.use("/api/customer/coupons", customerCouponRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/admin/vehicle-types", vehicleTypeRoutes);
app.use("/api/admin/vehicle-brands", vehicleBrandRoutes);
app.use("/api/admin/vehicle-models", vehicleModelRoutes);
app.use("/api/admin/services", serviceRoutes);
app.use("/api/admin/schedules", scheduleRoutes);
app.use("/api/admin/users", userRoutes);
app.use("/api/admin/coupons", couponRoutes);
app.use("/api/admin/bookings", bookingRoutes);
app.use("/api/staff/bookings", staffBookingRoutes);
app.use("/api/admin/reports", reportRoutes);
app.use("/api/admin/payments", paymentLookupRoutes);
app.use("/api/admin/audit-logs", auditLogRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/cancellations", cancellationRoutes);
app.use("/api/wallet", walletRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Car Care Backend API is running!",
  });
});

app.get("/api/health/db", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT DATABASE() AS database_name");

    res.json({
      status: "success",
      message: "Database connected successfully!",
      database: rows[0].database_name,
    });
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.status(500).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});

// Unknown paths: short JSON instead of Express's HTML page.
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Not found." });
});

// Last stop for any error: never send a stack trace or file path back.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ status: "error", message: "Request body is not valid JSON." });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ status: "error", message: "Request body is too large." });
  }
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error("Unhandled error:", error.message);
  return res.status(status).json({
    status: "error",
    message: status === 500 ? "Something went wrong. Please try again." : "The request could not be processed.",
  });
});

module.exports = app;
