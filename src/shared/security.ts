/**
 * Security utilities: rate limiting, account lockout, password validation.
 * Adapted from src/lib/security.ts for standalone Express server.
 */

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

interface LockoutRecord {
  attempts: number;
  lockedUntil: number | null;
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const lockoutMap = new Map<string, LockoutRecord>();

export const RATE_LIMITS = {
  LOGIN: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
  FORGOT_PASSWORD: { maxAttempts: 3, windowMs: 15 * 60 * 1000 },
  RESET_PASSWORD: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
  CHANGE_PASSWORD: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
};

const LOCKOUT_CONFIG = {
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 30 * 60 * 1000,
};

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const key = `ratelimit:${identifier}`;
  const record = rateLimitMap.get(key);

  if (record && now > record.resetTime) {
    rateLimitMap.delete(key);
  }

  const current = rateLimitMap.get(key);

  if (!current) {
    rateLimitMap.set(key, { count: 1, resetTime: now + config.windowMs });
    return { allowed: true };
  }

  if (current.count >= config.maxAttempts) {
    const retryAfter = Math.ceil((current.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  current.count++;
  return { allowed: true };
}

export function checkAccountLockout(email: string): {
  isLocked: boolean;
  remainingTime?: number;
} {
  const now = Date.now();
  const record = lockoutMap.get(email);

  if (!record) return { isLocked: false };

  if (record.lockedUntil && now > record.lockedUntil) {
    lockoutMap.delete(email);
    return { isLocked: false };
  }

  if (record.lockedUntil) {
    const remainingTime = Math.ceil((record.lockedUntil - now) / 1000);
    return { isLocked: true, remainingTime };
  }

  return { isLocked: false };
}

export function recordFailedLogin(email: string): {
  shouldLockout: boolean;
  attemptsRemaining: number;
} {
  const record = lockoutMap.get(email) || { attempts: 0, lockedUntil: null };
  record.attempts++;

  if (record.attempts >= LOCKOUT_CONFIG.MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_CONFIG.LOCKOUT_DURATION_MS;
    lockoutMap.set(email, record);
    return { shouldLockout: true, attemptsRemaining: 0 };
  }

  lockoutMap.set(email, record);
  return {
    shouldLockout: false,
    attemptsRemaining: LOCKOUT_CONFIG.MAX_FAILED_ATTEMPTS - record.attempts,
  };
}

export function clearFailedLogins(email: string): void {
  lockoutMap.delete(email);
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export async function generateSecureToken(bytes: number = 32): Promise<string> {
  const crypto = await import("crypto");
  return crypto.randomBytes(bytes).toString("hex");
}

export function isValidTokenFormat(token: string): boolean {
  return /^[a-f0-9]{64}$/i.test(token);
}

// Cleanup expired records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) rateLimitMap.delete(key);
  }
  for (const [key, record] of lockoutMap.entries()) {
    if (record.lockedUntil && now > record.lockedUntil) lockoutMap.delete(key);
  }
}, 5 * 60 * 1000);
