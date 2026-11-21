// Fill the database with realistic demo data for a presentation:
// about four weeks of booking history, today's queue, and the next three weeks.
//
//   node backend/scripts/demo-seed.js            create the demo data
//   node backend/scripts/demo-seed.js --dry-run  build everything, then roll back
//
// Needs DEMO_PASSWORD (8+ characters) in backend/.env: the password of every
// demo account. Remove the data again with demo-clear.js.
//
// The rows follow the same rules as the app itself: prices come from
// service_prices, bookings never overfill a slot (long services take the
// following slots), a booking is confirmed only after payment, cancelling a
// paid booking refunds 80% to the Wallet, a no-show forfeits the payment.
// Dates are relative to the day you run it, so run it on the presentation day.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../shared/config/db");
const { OVERLAPPING_BOOKINGS_SQL, planFromSlot } = require("../shared/services/slotPlanner");
const { EXPIRY_REASON } = require("../shared/services/bookingPaymentHold");
const { calculateDiscount, toCents, centsToDecimal } = require("../shared/services/couponPricing");
const { calculateRefund } = require("../Admin/services/cancellationService");
const D = require("./demo-data");

const HISTORY_DAYS = 28;
const FUTURE_DAYS = 21; // three weeks of upcoming bookings
const PASSWORD_HASH_ROUNDS = 12;
// Same slots as generate-schedules.js, used only for days that have none.
const SLOTS = [
  ["09:00:00", "10:30:00"],
  ["10:30:00", "12:00:00"],
  ["12:00:00", "13:30:00"],
  ["13:30:00", "15:00:00"],
  ["15:00:00", "16:30:00"],
  ["16:30:00", "18:00:00"],
];
const SLOT_CAPACITY = 2;

// Busy-ness: Saturday is the busiest, Sunday the shop is closed (no bookings).
const DAY_WEIGHT = { 1: 0.42, 2: 0.38, 3: 0.42, 4: 0.52, 5: 0.7, 6: 0.92 };
// Morning and after-work slots fill first, early afternoon is quiet.
const SLOT_WEIGHT = { "09:00:00": 0.9, "10:30:00": 0.7, "12:00:00": 0.42, "13:30:00": 0.42, "15:00:00": 0.62, "16:30:00": 0.95 };

// ---------------------------------------------------------------------------
// Time: the shop works in Thai time (UTC+7). "Wall" values are milliseconds of
// the Thai wall clock; the database stores timestamps as UTC (like NOW()).
// ---------------------------------------------------------------------------
const BKK = 7 * 3600e3;
const MIN = 60e3;
const HOUR = 3600e3;
const DAY = 86400e3;
const nowWall = Date.now() + BKK;
const today = isoDate(nowWall);

function isoDate(wallMs) {
  return new Date(wallMs).toISOString().slice(0, 10);
}
function wallAt(date, time = "00:00:00") {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi, s = 0] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi, s);
}
function toDb(wallMs) {
  return new Date(Math.round(wallMs) - BKK).toISOString().slice(0, 19).replace("T", " ");
}
function addDays(date, days) {
  return isoDate(wallAt(date) + days * DAY);
}
function weekday(date) {
  return new Date(wallAt(date)).getUTCDay(); // 0 = Sunday
}

// ---------------------------------------------------------------------------
// Repeatable randomness: the same day gives the same data every run.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(400);
const between = (a, b) => a + rand() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const chance = (p) => rand() < p;
const pick = (list) => list[Math.floor(rand() * list.length)];
function weighted(entries) {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [item, w] of entries) {
    roll -= w;
    if (roll <= 0) return item;
  }
  return entries[entries.length - 1][0];
}

function fail(message) {
  const error = new Error(message);
  error.expected = true;
  throw error;
}

// ---------------------------------------------------------------------------

async function insert(conn, table, row) {
  const columns = Object.keys(row);
  const [result] = await conn.query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    columns.map((c) => row[c]),
  );
  return result.insertId;
}

// Rows nobody needs an id for are collected and written in a few big INSERTs
// at the end (much faster over a remote database).
function createBatch() {
  const tables = new Map();
  return {
    add(table, row) {
      if (!tables.has(table)) tables.set(table, []);
      tables.get(table).push(row);
    },
    async flush(conn) {
      for (const [table, rows] of tables) {
        const columns = Object.keys(rows[0]);
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500).map((row) => columns.map((c) => row[c]));
          await conn.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ?`, [chunk]);
        }
      }
      tables.clear();
    },
  };
}

async function createUsers(conn, passwordHash) {
  const users = {};
  for (const account of D.DEMO_ACCOUNTS) {
    const created = nowWall - 40 * DAY - int(0, 5) * DAY;
    const id = await insert(conn, "users", {
      full_name: account.full_name,
      email: account.email,
      password_hash: passwordHash,
      phone: account.phone,
      role: account.role,
      status: "ACTIVE",
      created_at: toDb(created),
      updated_at: toDb(created),
    });
    users[account.key] = { user_id: id, role: account.role, created, weight: 3 };
  }
  for (const [index, customer] of D.CUSTOMERS.entries()) {
    const created = nowWall - int(30, 60) * DAY - between(0, 12) * HOUR;
    const id = await insert(conn, "users", {
      full_name: customer.full_name,
      email: `${customer.handle}${D.DEMO_DOMAIN}`,
      password_hash: passwordHash,
      phone: `0800000${String(104 + index).padStart(3, "0")}`,
      role: "CUSTOMER",
      status: "ACTIVE",
      created_at: toDb(created),
      updated_at: toDb(created),
    });
    users[customer.handle] = { user_id: id, role: "CUSTOMER", created, weight: customer.regular ? 3 : 1 };
  }
  users.demo = users.customer;
  return users;
}

async function createVehicles(conn, users) {
  const [models] = await conn.query(
    `SELECT vm.model_id, vm.model_name, vm.vehicle_type_id, vb.brand_name, vt.type_name
    FROM vehicle_models vm
    JOIN vehicle_brands vb ON vb.brand_id = vm.brand_id
    JOIN vehicle_types vt ON vt.vehicle_type_id = vm.vehicle_type_id
    WHERE vm.status = 'ACTIVE' AND vb.status = 'ACTIVE' AND vt.status = 'ACTIVE'`,
  );
  const byName = new Map(models.map((m) => [`${m.brand_name}|${m.model_name}`, m]));
  const vehicles = [];
  for (const spec of D.VEHICLES) {
    const model = byName.get(`${spec.brand}|${spec.model}`);
    if (!model) fail(`ไม่พบรุ่นรถ ${spec.brand} ${spec.model} ในฐานข้อมูล`);
    const owner = users[spec.owner];
    if (!owner) fail(`ไม่พบเจ้าของรถ ${spec.owner} ใน demo-data.js`);
    const created = owner.created + between(0.5, 3) * DAY;
    const id = await insert(conn, "vehicles", {
      user_id: owner.user_id,
      model_id: model.model_id,
      production_year: spec.year,
      license_plate: spec.plate,
      province: spec.province,
      color: spec.color,
      status: "ACTIVE",
      created_at: toDb(created),
      updated_at: toDb(created),
    });
    vehicles.push({
      vehicle_id: id,
      owner,
      plate: spec.plate,
      year: spec.year,
      typeId: model.vehicle_type_id,
      isMotorcycle: model.type_name === "Motorcycle",
    });
  }
  return vehicles;
}

async function loadPrices(conn) {
  const [rows] = await conn.query(
    `SELECT s.service_id, s.service_name, s.duration_minutes, sp.vehicle_type_id, sp.price
    FROM services s
    JOIN service_prices sp ON sp.service_id = s.service_id
    WHERE s.status = 'ACTIVE'`,
  );
  const prices = {};
  for (const row of rows) {
    (prices[row.vehicle_type_id] ||= {})[row.service_name] = row;
  }
  return prices;
}

// Make sure every open day in the range has schedule slots (older days may
// have none because generate-schedules.js only creates upcoming days).
async function ensureSchedules(conn, firstDate, lastDate) {
  const values = [];
  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    if (weekday(date) === 0) continue; // closed on Sundays, like generate-schedules.js
    for (const [start, end] of SLOTS) values.push([date, start, end, SLOT_CAPACITY, "AVAILABLE"]);
  }
  const [result] = await conn.query(
    "INSERT IGNORE INTO schedules (schedule_date, start_time, end_time, capacity, status) VALUES ?",
    [values],
  );
  const [slots] = await conn.query(
    `SELECT s.schedule_id, s.schedule_date, TIME_FORMAT(s.start_time, '%H:%i:%s') AS start_time,
      TIME_FORMAT(s.end_time, '%H:%i:%s') AS end_time, s.capacity, s.status,
      ${OVERLAPPING_BOOKINGS_SQL("s", "b")} AS booked_count
    FROM schedules s
    WHERE s.schedule_date BETWEEN ? AND ?
    ORDER BY s.schedule_date, s.start_time`,
    [firstDate, lastDate],
  );
  const byDate = {};
  for (const slot of slots) {
    slot.booked_count = Number(slot.booked_count);
    (byDate[slot.schedule_date] ||= []).push(slot);
  }
  return { byDate, created: result.affectedRows };
}

async function loadCoupons(conn) {
  const [rows] = await conn.query(
    `SELECT coupon_id, coupon_code, discount_type, discount_value, max_discount, min_order_amount,
      usage_limit, per_user_limit, used_count, status,
      DATE_FORMAT(start_date, '%Y-%m-%d %H:%i:%s') AS start_at,
      DATE_FORMAT(end_date, '%Y-%m-%d %H:%i:%s') AS end_at
    FROM coupons
    WHERE status = 'ACTIVE' AND coupon_code NOT LIKE 'TEST%'`,
  );
  return rows.map((c) => ({
    ...c,
    used_count: Number(c.used_count),
    usesByUser: new Map(), // user_id -> uses in this seed (for per_user_limit)
    // Coupon dates are stored in shop time.
    startWall: wallAt(...c.start_at.split(" ")),
    endWall: wallAt(...c.end_at.split(" ")),
  }));
}

// Pick the services for one booking: one main service, sometimes an add-on.
function chooseServices(vehicle, prices) {
  const available = prices[vehicle.typeId] || {};
  const mains = Object.entries(D.SERVICE_WEIGHTS).filter(([name]) => available[name]);
  if (mains.length === 0) return [];
  const main = weighted(mains);
  const chosen = [available[main]];
  if (chance(0.3)) {
    const addOns = D.ADD_ON_SERVICES.filter((name) => name !== main && available[name]);
    if (addOns.length) chosen.push(available[pick(addOns)]);
  }
  return chosen;
}

function chooseCustomerVehicle(vehicles) {
  return weighted(vehicles.map((v) => [v, v.owner.weight]));
}

// Decide what happened to a booking, given when its slot is.
function decideOutcome(date, startWall, endWall) {
  if (date < today || endWall <= nowWall - 20 * MIN) {
    if (date === today) return chance(0.1) ? "NO_SHOW" : "COMPLETED";
    return weighted([["COMPLETED", 85], ["CANCELLED", 8], ["NO_SHOW", 4], ["EXPIRED", 3]]);
  }
  if (date === today) {
    if (startWall > nowWall) return chance(0.08) ? "CANCELLED" : "CONFIRMED";
    if (endWall <= nowWall) return "COMPLETED";
    return nowWall - startWall < 12 * MIN ? "CHECKED_IN" : "IN_SERVICE";
  }
  return chance(0.05) ? "CANCELLED" : "CONFIRMED";
}

// When the customer made the booking: usually 0-6 days before the slot,
// always in the past, never before the customer's account existed.
function chooseCreatedAt(startWall, owner) {
  const lead = weighted([["same", 25], ["1", 30], ["2-3", 30], ["4-6", 15]]);
  let created;
  if (lead === "same") created = startWall - between(40 * MIN, 3 * HOUR);
  else if (lead === "1") created = startWall - DAY + between(-6, 4) * HOUR;
  else if (lead === "2-3") created = startWall - int(2, 3) * DAY + between(-5, 5) * HOUR;
  else created = startWall - int(4, 6) * DAY + between(-5, 5) * HOUR;
  // Bookings far ahead were made some time in the past few days, not "now".
  if (created > nowWall - 8 * MIN) created = nowWall - between(8 * MIN, 7 * DAY);
  return Math.max(created, owner.created + DAY);
}

function planBooking(slotsOfDay, index, vehicle, prices) {
  let services = chooseServices(vehicle, prices);
  if (services.length === 0) return null;
  const duration = (list) => list.reduce((sum, s) => sum + Number(s.duration_minutes), 0);
  let plan = planFromSlot(slotsOfDay, index, duration(services));
  if (!plan.slots && services.length > 1) {
    services = [services[0]];
    plan = planFromSlot(slotsOfDay, index, duration(services));
  }
  if (!plan.slots) return null;
  return { services, plan, durationMinutes: duration(services) };
}

function buildPlans(byDate, vehicles, prices, firstDate, lastDate) {
  const plans = [];
  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    const day = weekday(date);
    if (day === 0) continue; // closed on Sundays
    const slots = byDate[date] || [];
    const daysAhead = Math.round((wallAt(date) - wallAt(today)) / DAY);
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      if (slot.status !== "AVAILABLE") continue;
      let p = (DAY_WEIGHT[day] || 0.4) * (SLOT_WEIGHT[slot.start_time] ?? 0.5);
      if (daysAhead === 0) p *= 1.05;
      // Fewer bookings the further ahead: busy next few days, sparse in week 3.
      if (daysAhead > 0) p *= Math.max(0.1, 0.7 - daysAhead * 0.03);
      const free = Number(slot.capacity) - slot.booked_count;
      for (let unit = 0; unit < free; unit += 1) {
        if (!chance(p)) continue;
        const vehicle = chooseCustomerVehicle(vehicles);
        const planned = planBooking(slots, index, vehicle, prices);
        if (!planned) continue;
        const startWall = wallAt(date, slot.start_time);
        const endWall = wallAt(date, planned.plan.endTime);
        const outcome = decideOutcome(date, startWall, endWall);
        if (outcome !== "CANCELLED" && outcome !== "EXPIRED") {
          for (const used of planned.plan.slots) used.booked_count += 1;
        }
        plans.push({
          date,
          vehicle,
          owner: vehicle.owner,
          slot,
          services: planned.services,
          durationMinutes: planned.durationMinutes,
          startWall,
          endWall,
          endTime: planned.plan.endTime,
          slotsUsed: planned.plan.slots,
          outcome,
          createdWall: chooseCreatedAt(startWall, vehicle.owner),
        });
      }
    }
  }
  return plans;
}

// The demo customer should have a wallet balance and an upcoming booking.
function shapeDemoCustomer(plans, users, byDate, vehicles, prices) {
  const demo = users.customer;
  const mine = plans.filter((p) => p.owner === demo);
  const pastCompleted = mine.filter((p) => p.date < today && p.outcome === "COMPLETED");
  if (!mine.some((p) => p.outcome === "CANCELLED") && pastCompleted.length > 1) {
    const victim = pastCompleted[pastCompleted.length - 1];
    victim.outcome = "CANCELLED";
    for (const used of victim.slotsUsed || []) used.booked_count -= 1;
  }
  if (mine.some((p) => p.date > today && p.outcome === "CONFIRMED")) return;
  const demoVehicles = vehicles.filter((v) => v.owner === demo && !v.isMotorcycle);
  for (let ahead = 2; ahead <= FUTURE_DAYS; ahead += 1) {
    const date = addDays(today, ahead);
    if (weekday(date) === 0) continue;
    const slots = byDate[date] || [];
    for (let index = 0; index < slots.length; index += 1) {
      const planned = planBooking(slots, index, demoVehicles[0], prices);
      if (!planned) continue;
      for (const used of planned.plan.slots) used.booked_count += 1;
      const startWall = wallAt(date, slots[index].start_time);
      plans.push({
        date,
        vehicle: demoVehicles[0],
        owner: demo,
        slot: slots[index],
        services: planned.services,
        durationMinutes: planned.durationMinutes,
        startWall,
        endWall: wallAt(date, planned.plan.endTime),
        endTime: planned.plan.endTime,
        outcome: "CONFIRMED",
        createdWall: nowWall - between(1, 20) * HOUR,
      });
      return;
    }
  }
}

function staffFor(users) {
  return chance(0.55) ? users.staff : users.staff2;
}

function mileageFor(vehicle, atWall) {
  const age = Math.max(0.3, new Date(atWall).getUTCFullYear() - vehicle.year + between(0, 1));
  const perYear = vehicle.isMotorcycle ? int(4500, 8000) : int(12000, 19000);
  return Math.round(age * perYear + int(0, 3000));
}

async function seed(conn, password) {
  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
  const users = await createUsers(conn, passwordHash);
  const vehicles = await createVehicles(conn, users);
  const prices = await loadPrices(conn);
  const firstDate = addDays(today, -HISTORY_DAYS);
  const lastDate = addDays(today, FUTURE_DAYS);
  const { byDate, created: schedulesCreated } = await ensureSchedules(conn, firstDate, lastDate);
  const coupons = await loadCoupons(conn);

  const plans = buildPlans(byDate, vehicles, prices, firstDate, lastDate);
  shapeDemoCustomer(plans, users, byDate, vehicles, prices);

  // Work out every timestamp up front so each booking's events line up.
  for (const plan of plans) {
    const created = plan.createdWall;
    plan.payWall = created + between(1, 6) * MIN;
    plan.method = weighted([["SIMULATED", 50], ["BANK_TRANSFER", 35], ["WALLET", 15]]);
    if (plan.method === "BANK_TRANSFER") plan.payWall = created + between(4, 13) * MIN;
    plan.payWall = Math.max(created + MIN / 2, Math.min(plan.payWall, nowWall - MIN));
    if (plan.outcome === "EXPIRED") plan.expireWall = created + between(15.2, 16.5) * MIN;
    if (plan.outcome === "CANCELLED") {
      const latest = Math.min(plan.startWall - HOUR, nowWall - 5 * MIN);
      plan.cancelWall = Math.max(plan.payWall + 10 * MIN, latest - between(0, 2) * DAY);
      if (plan.cancelWall > latest) plan.cancelWall = Math.max(plan.payWall + 2 * MIN, latest);
    }
    if (["CHECKED_IN", "IN_SERVICE", "COMPLETED"].includes(plan.outcome)) {
      plan.checkInWall = plan.startWall + between(-10, 10) * MIN;
      if (plan.checkInWall < plan.payWall) plan.checkInWall = plan.payWall + MIN;
      if (plan.outcome !== "CHECKED_IN") plan.serviceWall = plan.checkInWall + between(5, 12) * MIN;
      if (plan.outcome === "COMPLETED") {
        plan.completeWall = plan.serviceWall + (plan.durationMinutes + between(5, 20)) * MIN;
      }
      // Nothing may happen in the future.
      for (const key of ["checkInWall", "serviceWall", "completeWall"]) {
        if (plan[key] && plan[key] > nowWall - MIN) plan[key] = nowWall - between(1, 4) * MIN;
      }
      if (plan.serviceWall && plan.serviceWall <= plan.checkInWall) plan.serviceWall = plan.checkInWall + MIN / 2;
      if (plan.completeWall && plan.completeWall <= plan.serviceWall) plan.completeWall = plan.serviceWall + MIN / 2;
    }
    if (plan.outcome === "NO_SHOW") plan.noShowWall = Math.min(plan.startWall + between(35, 70) * MIN, nowWall - MIN);
    plan.lastWall = Math.max(
      created,
      plan.payWall || 0,
      plan.expireWall || 0,
      plan.cancelWall || 0,
      plan.completeWall || plan.serviceWall || plan.checkInWall || 0,
      plan.noShowWall || 0,
    );
    if (plan.outcome === "EXPIRED") plan.lastWall = plan.expireWall;
  }

  // Process in time order so wallet payments only spend money already refunded.
  const events = [];
  for (const plan of plans) {
    events.push({ at: plan.createdWall, type: "create", plan });
    if (plan.outcome === "CANCELLED") events.push({ at: plan.cancelWall, type: "cancel", plan });
  }
  events.sort((a, b) => a.at - b.at || (a.type === "create" ? -1 : 1));

  const wallets = new Map(); // user_id -> { wallet_id, balanceCents }
  async function walletOf(userId, atWall) {
    if (!wallets.has(userId)) {
      const id = await insert(conn, "wallets", {
        user_id: userId,
        balance: "0.00",
        created_at: toDb(atWall),
        updated_at: toDb(atWall),
      });
      wallets.set(userId, { wallet_id: id, balanceCents: 0n });
    }
    return wallets.get(userId);
  }
  const batch = createBatch();
  const history = (bookingId, oldStatus, newStatus, changedBy, reason, atWall) =>
    batch.add("booking_status_history", {
      booking_id: bookingId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: changedBy,
      reason,
      created_at: toDb(atWall),
    });

  for (const event of events) {
    const plan = event.plan;
    const customerId = plan.owner.user_id;

    if (event.type === "cancel") {
      const { cancellationFee, refundAmount } = calculateRefund(plan.finalAmount);
      const wallet = await walletOf(customerId, plan.cancelWall);
      const reason = pick(D.CANCEL_REASONS);
      const refundId = await insert(conn, "refunds", {
        payment_id: plan.paymentId,
        booking_id: plan.bookingId,
        refund_amount: refundAmount,
        cancellation_fee: cancellationFee,
        refund_reason: reason,
        refund_status: "REFUNDED",
        processed_at: toDb(plan.cancelWall),
        created_at: toDb(plan.cancelWall),
      });
      wallet.balanceCents += toCents(refundAmount);
      batch.add("wallet_transactions", {
        wallet_id: wallet.wallet_id,
        refund_id: refundId,
        booking_id: null,
        transaction_type: "CREDIT",
        amount: refundAmount,
        description: `Refund for booking ${plan.bookingId}`,
        created_at: toDb(plan.cancelWall),
      });
      history(plan.bookingId, "CONFIRMED", "CANCELLED", customerId, reason, plan.cancelWall);
      continue;
    }

    // --- create the booking -------------------------------------------------
    const subtotalCents = plan.services.reduce((sum, s) => sum + toCents(s.price), 0n);
    let coupon = null;
    let discountCents = 0n;
    if (plan.outcome !== "EXPIRED" && chance(0.3)) {
      const usable = coupons.filter(
        (c) =>
          plan.createdWall >= c.startWall &&
          plan.createdWall <= c.endWall &&
          (c.usage_limit === null || c.used_count < Number(c.usage_limit)) &&
          (c.per_user_limit === null || (c.usesByUser.get(customerId) || 0) < Number(c.per_user_limit)) &&
          subtotalCents >= toCents(c.min_order_amount ?? "0"),
      );
      if (usable.length) {
        coupon = pick(usable);
        plan.couponUsed = true;
        discountCents = calculateDiscount({ ...coupon, not_started: 0, is_live: 1 }, subtotalCents);
      }
    }
    const finalCents = subtotalCents - discountCents;
    plan.finalAmount = centsToDecimal(finalCents);
    const finalStatus = plan.outcome === "EXPIRED" ? "CANCELLED" : plan.outcome;

    plan.bookingId = await insert(conn, "bookings", {
      user_id: customerId,
      vehicle_id: plan.vehicle.vehicle_id,
      schedule_id: plan.slot.schedule_id,
      coupon_id: coupon ? coupon.coupon_id : null,
      booking_date: plan.date,
      start_time: plan.slot.start_time,
      end_time: plan.endTime,
      total_amount: centsToDecimal(subtotalCents),
      discount_amount: centsToDecimal(discountCents),
      final_amount: plan.finalAmount,
      booking_status: finalStatus,
      notes: chance(0.18) ? pick(D.CUSTOMER_NOTES) : null,
      created_at: toDb(plan.createdWall),
      updated_at: toDb(plan.lastWall),
    });
    for (const service of plan.services) {
      batch.add("booking_services", {
        booking_id: plan.bookingId,
        service_id: service.service_id,
        service_name: service.service_name,
        unit_price: service.price,
        duration_minutes: service.duration_minutes,
        created_at: toDb(plan.createdWall),
      });
    }
    if (coupon) {
      await conn.query("UPDATE coupons SET used_count = used_count + 1 WHERE coupon_id = ?", [coupon.coupon_id]);
      coupon.used_count += 1;
      coupon.usesByUser.set(customerId, (coupon.usesByUser.get(customerId) || 0) + 1);
      batch.add("coupon_usages", {
        coupon_id: coupon.coupon_id,
        booking_id: plan.bookingId,
        user_id: customerId,
        discount_amount: centsToDecimal(discountCents),
        used_at: toDb(plan.createdWall),
      });
    }

    // --- payment ------------------------------------------------------------
    if (plan.outcome === "EXPIRED") {
      // Never paid: the 15-minute hold ran out and the system cancelled it.
      if (plan.method === "BANK_TRANSFER") {
        await insert(conn, "payments", {
          booking_id: plan.bookingId,
          amount: plan.finalAmount,
          payment_method: "BANK_TRANSFER",
          payment_status: "FAILED",
          created_at: toDb(plan.createdWall + MIN),
          updated_at: toDb(plan.expireWall),
        });
      }
      history(plan.bookingId, "PENDING_PAYMENT", "CANCELLED", null, EXPIRY_REASON, plan.expireWall);
      continue;
    }

    let method = plan.method;
    if (method === "WALLET") {
      const wallet = wallets.get(customerId);
      if (!wallet || wallet.balanceCents < finalCents) method = "SIMULATED";
    }
    if (method === "WALLET") {
      const wallet = wallets.get(customerId);
      wallet.balanceCents -= finalCents;
      plan.paymentId = await insert(conn, "payments", {
        booking_id: plan.bookingId,
        amount: plan.finalAmount,
        payment_method: "WALLET",
        payment_status: "PAID",
        transaction_ref: `WAL-${crypto.randomUUID()}`,
        paid_at: toDb(plan.payWall),
        created_at: toDb(plan.payWall),
        updated_at: toDb(plan.payWall),
      });
      batch.add("wallet_transactions", {
        wallet_id: wallet.wallet_id,
        refund_id: null,
        booking_id: plan.bookingId,
        transaction_type: "DEBIT",
        amount: plan.finalAmount,
        description: `Wallet payment for booking ${plan.bookingId}`,
        created_at: toDb(plan.payWall),
      });
      history(plan.bookingId, "PENDING_PAYMENT", "CONFIRMED", customerId, "Paid by WALLET.", plan.payWall);
    } else if (method === "BANK_TRANSFER") {
      const staff = staffFor(users);
      plan.paymentId = await insert(conn, "payments", {
        booking_id: plan.bookingId,
        amount: plan.finalAmount,
        payment_method: "BANK_TRANSFER",
        payment_status: "PAID",
        paid_at: toDb(plan.payWall),
        created_at: toDb(plan.createdWall + 2 * MIN),
        updated_at: toDb(plan.payWall),
      });
      batch.add("payment_verifications", {
        payment_id: plan.paymentId,
        verified_by: staff.user_id,
        payment_method: "BANK_TRANSFER",
        verified_amount: plan.finalAmount,
        transfer_reference: String(int(100000, 999999)) + String(int(100000, 999999)),
        verified_at: toDb(plan.payWall),
      });
      history(plan.bookingId, "PENDING_PAYMENT", "CONFIRMED", staff.user_id, "Paid by BANK_TRANSFER.", plan.payWall);
    } else {
      plan.paymentId = await insert(conn, "payments", {
        booking_id: plan.bookingId,
        amount: plan.finalAmount,
        payment_method: "SIMULATED",
        payment_status: "PAID",
        transaction_ref: `SIM-${crypto.randomUUID()}`,
        paid_at: toDb(plan.payWall),
        created_at: toDb(plan.createdWall + MIN / 2),
        updated_at: toDb(plan.payWall),
      });
      history(plan.bookingId, "PENDING_PAYMENT", "CONFIRMED", customerId, "Paid by SIMULATED.", plan.payWall);
    }
    plan.method = method;

    // --- what happened on the day -------------------------------------------
    if (plan.checkInWall) {
      const staff = staffFor(users);
      const note = chance(0.25) ? pick(D.CHECK_IN_NOTES) : null;
      batch.add("vehicle_check_ins", {
        booking_id: plan.bookingId,
        mileage: mileageFor(plan.vehicle, plan.checkInWall),
        fuel_level: weighted([["QUARTER", 15], ["HALF", 35], ["THREE_QUARTER", 30], ["FULL", 15], ["EMPTY", 5]]),
        condition_note: note,
        checked_in_by: staff.user_id,
        checked_in_at: toDb(plan.checkInWall),
      });
      history(plan.bookingId, "CONFIRMED", "CHECKED_IN", staff.user_id, note ?? "Vehicle checked in.", plan.checkInWall);
      if (plan.serviceWall) {
        history(plan.bookingId, "CHECKED_IN", "IN_SERVICE", staff.user_id, "เริ่มดำเนินการ", plan.serviceWall);
        if (chance(0.3)) {
          batch.add("booking_notes", {
            booking_id: plan.bookingId,
            note: pick(D.STAFF_NOTES),
            created_by: staff.user_id,
            created_at: toDb(Math.min(plan.serviceWall + between(5, 20) * MIN, nowWall - MIN / 2)),
          });
        }
      }
      if (plan.completeWall) {
        history(plan.bookingId, "IN_SERVICE", "COMPLETED", staff.user_id, "ดำเนินการครบทุกรายการ", plan.completeWall);
      }
    }
    if (plan.noShowWall) {
      const staff = staffFor(users);
      history(plan.bookingId, "CONFIRMED", "NO_SHOW", staff.user_id, D.NO_SHOW_REASON, plan.noShowWall);
      await insert(conn, "refunds", {
        payment_id: plan.paymentId,
        booking_id: plan.bookingId,
        refund_amount: "0.00",
        cancellation_fee: plan.finalAmount,
        refund_reason: `No-show (100% forfeited): ${D.NO_SHOW_REASON}`,
        refund_status: "REFUNDED",
        processed_at: toDb(plan.noShowWall),
        created_at: toDb(plan.noShowWall),
      });
    }
  }

  await addDemoNotifications(conn, batch, plans, users);
  await batch.flush(conn);
  for (const wallet of wallets.values()) {
    await conn.query("UPDATE wallets SET balance = ? WHERE wallet_id = ?", [
      centsToDecimal(wallet.balanceCents),
      wallet.wallet_id,
    ]);
  }

  return { users, vehicles, plans, schedulesCreated, wallets };
}

// Sample bell notifications for the demo accounts, matching what the app
// itself sends (skipped when the notifications migration has not been run).
async function addDemoNotifications(conn, batch, plans, users) {
  const [[{ present }]] = await conn.query(
    "SELECT COUNT(*) AS present FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'notifications'",
  );
  if (Number(present) === 0) return 0;
  let count = 0;
  const add = (user, type, plan, atWall, extra = {}) => {
    if (!atWall || atWall > nowWall) return;
    batch.add("notifications", {
      user_id: user.user_id,
      type,
      booking_id: plan.bookingId,
      data: JSON.stringify({ date: plan.date, start_time: plan.slot.start_time.slice(0, 5), plate: plan.vehicle.plate, ...extra }),
      // Older than a day = already seen.
      read_at: nowWall - atWall > DAY ? toDb(atWall + between(5, 120) * MIN) : null,
      created_at: toDb(atWall),
    });
    count += 1;
  };
  const recent = (wall) => wall && nowWall - wall < 3 * DAY;
  for (const plan of plans) {
    if (plan.outcome === "EXPIRED" || !plan.bookingId) continue;
    if (plan.owner === users.customer) {
      add(users.customer, "PAYMENT_CONFIRMED", plan, plan.payWall, { method: plan.method, amount: Number(plan.finalAmount) });
      add(users.customer, "VEHICLE_CHECKED_IN", plan, plan.checkInWall);
      add(users.customer, "SERVICE_STARTED", plan, plan.serviceWall);
      add(users.customer, "SERVICE_COMPLETED", plan, plan.completeWall);
      add(users.customer, "NO_SHOW", plan, plan.noShowWall);
      if (plan.outcome === "CANCELLED") {
        add(users.customer, "BOOKING_CANCELLED", plan, plan.cancelWall, { refund_amount: Number(calculateRefund(plan.finalAmount).refundAmount) });
      }
      if (plan.outcome === "CONFIRMED" && plan.date === addDays(today, 1)) {
        add(users.customer, "APPOINTMENT_REMINDER", plan, Math.max(plan.payWall, nowWall - between(1, 6) * HOUR));
      }
    }
    for (const staff of [users.staff, users.staff2]) {
      if (plan.method === "BANK_TRANSFER" && recent(plan.createdWall)) {
        add(staff, "TRANSFER_PENDING", plan, plan.createdWall + 2 * MIN, { amount: Number(plan.finalAmount) });
      }
      if (plan.date === today && isoDate(plan.payWall) === today) {
        add(staff, "NEW_BOOKING_TODAY", plan, plan.payWall, { amount: Number(plan.finalAmount) });
      }
    }
    if (plan.method === "BANK_TRANSFER" && recent(plan.createdWall)) {
      add(users.admin, "TRANSFER_PENDING", plan, plan.createdWall + 2 * MIN, { amount: Number(plan.finalAmount) });
    }
    if (plan.outcome === "CANCELLED" && recent(plan.cancelWall)) {
      add(users.admin, "BOOKING_CANCELLED", plan, plan.cancelWall, { refund_amount: Number(calculateRefund(plan.finalAmount).refundAmount) });
    }
  }
  return count;
}

function summarise({ users, vehicles, plans, schedulesCreated, wallets }) {
  const count = (fn) => plans.filter(fn).length;
  const byOutcome = {};
  for (const p of plans) byOutcome[p.outcome] = (byOutcome[p.outcome] || 0) + 1;
  const paid = plans.filter((p) => p.outcome !== "EXPIRED");
  const revenueCents = paid.reduce((sum, p) => sum + toCents(p.finalAmount), 0n);
  const refundedCents = plans
    .filter((p) => p.outcome === "CANCELLED")
    .reduce((sum, p) => sum + toCents(calculateRefund(p.finalAmount).refundAmount), 0n);
  const demoWallet = wallets.get(users.customer.user_id);
  const lines = [
    `ลูกค้า ${D.CUSTOMERS.length + 1} คน (รวมลูกค้าเดโม่), รถ ${vehicles.length} คัน, ตารางเวลาที่สร้างเพิ่ม ${schedulesCreated} รอบ`,
    `การจอง ${plans.length} รายการ: ย้อนหลัง ${count((p) => p.date < today)} · วันนี้ ${count((p) => p.date === today)} · ล่วงหน้า ${count((p) => p.date > today)}`,
    `สถานะ: ${Object.entries(byOutcome).map(([k, v]) => `${k === "EXPIRED" ? "ไม่จ่ายใน 15 นาที" : k} ${v}`).join(" · ")}`,
    `ยอดชำระ ${centsToDecimal(revenueCents)} ฿ · คืนเข้ากระเป๋า ${centsToDecimal(refundedCents)} ฿ · ใช้คูปอง ${count((p) => p.couponUsed)} ครั้ง`,
    `กระเป๋าเงินลูกค้าเดโม่: ${demoWallet ? centsToDecimal(demoWallet.balanceCents) : "0.00"} ฿`,
    `บัญชีเดโม่ (รหัสผ่าน = DEMO_PASSWORD ใน backend/.env): ${D.DEMO_ACCOUNTS.map((a) => a.email).join(", ")}`,
  ];
  return lines.join("\n");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) {
    fail("ตั้งค่า DEMO_PASSWORD (อย่างน้อย 8 ตัวอักษร) ใน backend/.env ก่อนรัน");
  }
  const conn = await pool.getConnection();
  let started = false;
  try {
    const [[{ existing }]] = await conn.query(
      "SELECT COUNT(*) AS existing FROM users WHERE email LIKE ?",
      [`%${D.DEMO_DOMAIN}`],
    );
    if (Number(existing) > 0) {
      fail("มีข้อมูลเดโม่อยู่แล้ว รัน `node backend/scripts/demo-clear.js` ก่อน แล้วค่อยรันใหม่");
    }
    await conn.beginTransaction();
    started = true;
    const result = await seed(conn, password);
    if (dryRun) {
      await conn.rollback();
      console.log(`[dry run] ยังไม่ได้บันทึกอะไร\n${summarise(result)}`);
    } else {
      await conn.commit();
      console.log(`สร้างข้อมูลเดโม่สำหรับวันที่ ${today} แล้ว\n${summarise(result)}`);
    }
  } catch (error) {
    if (started) await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.expected ? error.message : error);
  process.exitCode = 1;
});
