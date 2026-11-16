const app = require("./app");
const pool = require("./shared/config/db");
const { startPaymentHoldSweeper } = require("./shared/services/bookingPaymentHold");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Car Care Backend running on port ${PORT}`);
  // Cancel PENDING_PAYMENT bookings whose 15-minute payment hold has passed.
  startPaymentHoldSweeper(pool);
});
