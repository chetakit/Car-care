const mysql = require("mysql2/promise");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Return DATE columns (booking_date, schedule_date) as plain "YYYY-MM-DD"
  // strings. As JS Date objects they are serialised to UTC, which shifted
  // every date one day earlier for users in Thailand (UTC+7).
  dateStrings: ["DATE"],
});

module.exports = pool;
