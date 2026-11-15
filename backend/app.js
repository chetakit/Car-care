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
const customerBookingRoutes = require("./Customer/routes/bookingRoutes");
const customerBookingHistoryRoutes = require("./Customer/routes/bookingHistoryRoutes");
const customerScheduleRoutes = require("./Customer/routes/scheduleRoutes");
const dashboardRoutes = require("./Admin/routes/dashboardRoutes");
const vehicleTypeRoutes = require("./Admin/routes/vehicleTypeRoutes");
const vehicleBrandRoutes = require("./Admin/routes/vehicleBrandRoutes");
const vehicleModelRoutes = require("./Admin/routes/vehicleModelRoutes");
const serviceRoutes = require("./Admin/routes/serviceRoutes");
const userRoutes = require("./Admin/routes/userRoutes");
const couponRoutes = require("./Admin/routes/couponRoutes");
const bookingRoutes = require("./Admin/routes/bookingRoutes");
const reportRoutes = require("./Admin/routes/reportRoutes");
const paymentRoutes = require("./Admin/routes/paymentRoutes");
const cancellationRoutes = require("./Admin/routes/cancellationRoutes");
const walletRoutes = require("./Admin/routes/walletRoutes");
// [STAFF] Staff & Service Management
const staffBookingRoutes = require("./Staff/routes/staffBookingRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/auth", loginRoutes);
app.use("/api/auth", sessionRoutes);
app.use("/api/admin/auth", authRoutes);
app.use("/api/customer/auth", customerAuthRoutes);
app.use("/api/customer/profile", customerProfileRoutes);
app.use("/api/customer/vehicles", customerVehicleRoutes);
app.use("/api/customer/catalog", customerCatalogRoutes);
app.use("/api/customer/catalog/services", customerServiceCatalogRoutes);
app.use("/api/public/catalog/services", publicServiceCatalogRoutes);
app.use("/api/customer", customerBookingRoutes);
app.use("/api/customer", customerBookingHistoryRoutes);
app.use("/api/customer/schedules", customerScheduleRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/admin/vehicle-types", vehicleTypeRoutes);
app.use("/api/admin/vehicle-brands", vehicleBrandRoutes);
app.use("/api/admin/vehicle-models", vehicleModelRoutes);
app.use("/api/admin/services", serviceRoutes);
app.use("/api/admin/users", userRoutes);
app.use("/api/admin/coupons", couponRoutes);
app.use("/api/admin/bookings", bookingRoutes);
app.use("/api/admin/reports", reportRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/cancellations", cancellationRoutes);
app.use("/api/wallet", walletRoutes);
// [STAFF] ต้องรัน database/migrations/2026-11-15_staff_service.sql ก่อนใช้
app.use("/api/staff/bookings", staffBookingRoutes);

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

module.exports = app;
