const express = require("express");
const cors = require("cors");
const pool = require("../shared/config/db");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const vehicleTypeRoutes = require("./routes/vehicleTypeRoutes");
const vehicleBrandRoutes = require("./routes/vehicleBrandRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/admin/auth", authRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/admin/vehicle-types", vehicleTypeRoutes);
app.use("/api/admin/vehicle-brands", vehicleBrandRoutes);

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
