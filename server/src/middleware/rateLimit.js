// Per-IP rate limiting.
//
// The extension is free and the provider bills per call, so the only thing standing between
// a scraper and a real bill is this file. Two windows rather than one: an hourly cap stops a
// burst, a daily cap stops a slow drip that would never trip the hourly one.
//
// This is only half the protection: per-IP limits bound one caller, not total spend. The
// other half is the global daily budget in circuitBreaker.js, which is what actually bounds
// the bill when the same volume arrives from a hundred addresses.

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
