// Per-IP rate limiting.
//
// The extension is free and the provider bills per call, so the only thing standing between
// a scraper and a real bill is this file. Two windows rather than one: an hourly cap stops a
// burst, a daily cap stops a slow drip that would never trip the hourly one.
//
// Phase 2 adds the other half — a GLOBAL daily circuit breaker, so that quota abuse spread
// across many IPs fails closed instead of generating a bill. Per-IP limits alone do not
// bound total spend.

import rateLimit from 'express-rate-limit';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Phase 1D shows the user when they can retry, so the response has to carry that rather
// than just a status code.
function tooManyRequests(_req, res) {
  const retryAfter = Number(res.get('Retry-After')) || null;
  res.status(429).json({
    error: 'rate_limited',
    message: 'Too many identifications. Please try again later.',
    retryAfter,
  });
}

const shared = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests,
};

export const perHour = rateLimit({ windowMs: HOUR, limit: 10, ...shared });
export const perDay = rateLimit({ windowMs: DAY, limit: 50, ...shared });
