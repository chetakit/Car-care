// Small in-memory limiter for the sign-in and sign-up routes, so nobody can
// guess passwords or create accounts in a loop. No extra package: the counts
// live in this process and start again from zero when the backend restarts.
//
// Each limiter counts only the responses it is told to count (for sign-in:
// failed logins) per key (IP, or IP + email) inside a time window. Once a key
// reaches the limit, further requests get 429 until the window ends, without
// reaching the route at all.
const MAX_KEYS = 10000;
const limiters = new Set();

function minutesText(seconds) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function createLimiter({ name, windowMs, max, key, countWhen, resetWhen }) {
  const hits = new Map();

  function sweep(now) {
    for (const [entryKey, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(entryKey);
    }
    // Still too many (a flood of different keys): drop the oldest ones.
    while (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value);
  }

  function middleware(req, res, next) {
    const entryKey = key(req);
    const now = Date.now();
    const entry = hits.get(entryKey);
    if (entry && entry.resetAt > now && entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        status: "error",
        code: "TOO_MANY_ATTEMPTS",
        message: `Too many attempts. Try again in ${minutesText(retryAfter)}.`,
        retry_after_seconds: retryAfter,
      });
    }

    res.on("finish", () => {
      const at = Date.now();
      if (resetWhen && resetWhen(res.statusCode)) {
        hits.delete(entryKey);
        return;
      }
      if (!countWhen(res.statusCode)) return;
      const current = hits.get(entryKey);
      if (current && current.resetAt > at) {
        current.count += 1;
      } else {
        hits.delete(entryKey);
        hits.set(entryKey, { count: 1, resetAt: at + windowMs });
        if (hits.size > MAX_KEYS) sweep(at);
      }
    });
    return next();
  }

  const limiter = { name, middleware, reset: () => hits.clear(), sweep: () => sweep(Date.now()) };
  limiters.add(limiter);
  return middleware;
}

const clientIp = (req) => req.ip || req.socket?.remoteAddress || "unknown";
const loginEmail = (req) =>
  typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 150) : "";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// 5 wrong passwords for one account from one IP in 15 minutes. A correct
// sign-in clears the count.
const loginPerAccount = createLimiter({
  name: "login-account",
  windowMs: FIFTEEN_MINUTES,
  max: 5,
  key: (req) => `${clientIp(req)}|${loginEmail(req)}`,
  countWhen: (status) => status === 401,
  resetWhen: (status) => status === 200,
});

// 20 wrong passwords from one IP in 15 minutes, whatever the email - stops
// trying one password against many accounts.
const loginPerIp = createLimiter({
  name: "login-ip",
  windowMs: FIFTEEN_MINUTES,
  max: 20,
  key: clientIp,
  countWhen: (status) => status === 401,
});

// 5 sign-ups (or attempts with an e-mail that already exists) per IP per hour.
const registerPerIp = createLimiter({
  name: "register-ip",
  windowMs: ONE_HOUR,
  max: 5,
  key: clientIp,
  countWhen: (status) => status === 201 || status === 409,
});

// Clear every count (used by the tests).
function resetRateLimits() {
  for (const limiter of limiters) limiter.reset();
}

// Forget expired entries every 10 minutes; unref so it never keeps the
// process (or a test run) alive.
setInterval(() => {
  for (const limiter of limiters) limiter.sweep();
}, 10 * 60 * 1000).unref();

module.exports = {
  createLimiter,
  loginLimiters: [loginPerIp, loginPerAccount],
  registerLimiters: [registerPerIp],
  resetRateLimits,
};
