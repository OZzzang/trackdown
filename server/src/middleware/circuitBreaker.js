// Global daily budget — the half of rate limiting that bounds the bill.
//
// The per-IP limits in rateLimit.js bound one caller. They do nothing about the same volume
// spread across a hundred addresses, and the provider bills per call, so per-IP limits alone
// leave total spend unbounded. This is the backstop: when the day's budget is gone,
// identification stops for everyone until it resets.
//
// It fails CLOSED, deliberately. A day of refusals is recoverable and visible; an invoice
// for someone else's scraper is neither.

const DEFAULT_BUDGET = 500;

// Counted in memory, which is the honest limit of this design: a restart resets the day, and
// two instances would each get a full budget rather than sharing one. Acceptable for the
// single small instance Phase 2 deploys, and the alternative — a database round trip on
// every request — costs more than it protects until a second instance exists. Worth
// revisiting in Phase 3, when Mongo is there for other reasons anyway.
let spent = 0;
let day = utcDay();
let warned = false;

function utcDay() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

// Resets on a UTC calendar day rather than a rolling 24h window. That makes "try again
// tomorrow" a thing the user can act on, and lines the counter up with how a provider
// reports usage. The cost is a boundary burst — a full budget at 23:59 and another at 00:01
// spends two days in two minutes — which still bounds spend per day, the thing at risk.
function rollover() {
  const today = utcDay();
  if (today === day) return;
  day = today;
  spent = 0;
  warned = false;
}

export function dailyBudget() {
  const configured = Number(process.env.DAILY_IDENTIFY_BUDGET);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_BUDGET;
}

function secondsUntilReset() {
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - Date.now()) / 1000);
}

// Records one provider call. Called for every ATTEMPT, including those that end in a 502: an
// upstream that answered with an error may well have billed for it, and over-counting costs
// a handful of refusals while under-counting costs money.
export function spendBudget() {
  rollover();
  spent += 1;

  if (spent >= dailyBudget() && !warned) {
    warned = true;
    console.warn(
      `[budget] daily identification budget of ${dailyBudget()} is spent; ` +
        `refusing until ${day} rolls over`,
    );
  }
}

export function circuitBreaker(_req, res, next) {
  rollover();
  if (spent < dailyBudget()) return next();

  const retryAfter = secondsUntilReset();
  res.set('Retry-After', String(retryAfter));

  // 503, not 429. This caller did nothing wrong and has nothing they can change — the
  // service is out of capacity. A 429 would send the popup down its "too many searches"
  // path and blame one user for everyone else's traffic.
  res.status(503).json({
    error: 'daily_limit',
    message: 'TrackDown has reached its identification limit for today.',
    retryAfter,
  });
}
