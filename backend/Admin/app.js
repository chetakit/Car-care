const express = require("express");
const cors = require("cors");
const pool = require("../shared/config/db");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const vehicleTypeRoutes = require("./routes/vehicleTypeRoutes");
const vehicleBrandRoutes = require("./routes/vehicleBrandRoutes");
const vehicleModelRoutes = require("./routes/vehicleModelRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const userRoutes = require("./routes/userRoutes");
const couponRoutes = require("./routes/couponRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const reportRoutes = require("./routes/reportRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const cancellationRoutes = require("./routes/cancellationRoutes");
const walletRoutes = require("./routes/walletRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/admin/auth", authRoutes);
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
