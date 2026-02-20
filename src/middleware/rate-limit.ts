import { Request, Response, NextFunction } from "express";
import { TooManyRequestsError } from "../shared/errors";

interface RateLimitRecord {
  count: number;
  firstAttempt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Clean up expired records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now - record.firstAttempt > 15 * 60 * 1000) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
}

/**
 * Middleware factory: rate limits requests by IP + route key.
 */
export function rateLimit(key: string, config: RateLimitConfig) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const identifier = `${key}:${ip}`;
    const now = Date.now();

    const record = rateLimitStore.get(identifier);

    if (!record || now - record.firstAttempt > config.windowMs) {
      rateLimitStore.set(identifier, { count: 1, firstAttempt: now });
      return next();
    }

    if (record.count >= config.maxAttempts) {
      const retryAfter = Math.ceil((config.windowMs - (now - record.firstAttempt)) / 1000);
      return next(
        new TooManyRequestsError(
          `Too many requests. Try again in ${retryAfter} seconds.`,
          retryAfter
        )
      );
    }

    record.count++;
    next();
  };
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string") return realIp;
  return req.ip || "unknown";
}

// Pre-configured rate limiters
export const loginRateLimit = rateLimit("login", { windowMs: 15 * 60 * 1000, maxAttempts: 10 });
export const forgotPasswordRateLimit = rateLimit("forgot-password", { windowMs: 15 * 60 * 1000, maxAttempts: 3 });
export const resetPasswordRateLimit = rateLimit("reset-password", { windowMs: 15 * 60 * 1000, maxAttempts: 5 });
export const changePasswordRateLimit = rateLimit("change-password", { windowMs: 15 * 60 * 1000, maxAttempts: 5 });
