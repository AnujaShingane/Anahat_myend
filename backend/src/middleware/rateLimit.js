import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { message: 'Too many attempts. Try again in 15 minutes.' } });
export const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 200 });
