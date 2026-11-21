const assert = require("node:assert/strict");
const { test } = require("node:test");
const coupons = require("../shared/services/couponPricing");
const couponValidator = require("../Admin/validators/couponValidator");

function executorReturning(uses, calls = []) {
  return {
    async execute(sql, values) {
      calls.push({ sql, values });
      return [[{ uses }]];
    },
  };
}

test("No per-account limit means no extra check", async () => {
  const calls = [];
  await coupons.assertPerUserLimit(executorReturning(99, calls), { coupon_id: 1, per_user_limit: null }, 7);
  assert.equal(calls.length, 0);
});

test("A customer under the per-account limit may use the coupon", async () => {
  const calls = [];
  await coupons.assertPerUserLimit(executorReturning(1, calls), { coupon_id: 4, per_user_limit: 2 }, 7);
  assert.match(calls[0].sql, /FROM coupon_usages WHERE coupon_id = \? AND user_id = \?/);
  assert.deepEqual(calls[0].values, [4, 7]);
});

test("A customer who reached the per-account limit is refused", async () => {
  await assert.rejects(
    coupons.assertPerUserLimit(executorReturning(1), { coupon_id: 2, per_user_limit: 1 }, 7),
    (error) => error instanceof coupons.CouponError && /already used this coupon\.$/.test(error.message),
  );
  await assert.rejects(
    coupons.assertPerUserLimit(executorReturning(3), { coupon_id: 2, per_user_limit: 3 }, 7),
    /already used this coupon 3 times/,
  );
});

function runValidator(body) {
  let status = 200;
  let payload = null;
  let nextCalled = false;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(data) {
      payload = data;
      return this;
    },
  };
  couponValidator.validateCreate({ body }, res, () => {
    nextCalled = true;
  });
  return { status, payload, nextCalled };
}

const baseCoupon = {
  coupon_code: "WELCOME50",
  discount_type: "FIXED",
  discount_value: 50,
  start_date: "2026-11-18",
  end_date: "2027-12-31",
};

test("Admins can set per_user_limit to a whole number of at least 1, or leave it empty", () => {
  assert.equal(runValidator({ ...baseCoupon, per_user_limit: 1 }).nextCalled, true);
  assert.equal(runValidator({ ...baseCoupon, per_user_limit: null }).nextCalled, true);
  assert.equal(runValidator({ ...baseCoupon }).nextCalled, true);
  for (const bad of [0, -1, 1.5, "1"]) {
    const result = runValidator({ ...baseCoupon, per_user_limit: bad });
    assert.equal(result.status, 400, String(bad));
    assert.match(result.payload.message, /per_user_limit/);
  }
});
