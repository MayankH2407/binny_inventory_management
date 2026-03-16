import { Request, Response, NextFunction } from 'express';
import { TooManyRequestsError } from '../utils/errors';
import { logger } from '../utils/logger';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimiter(options: RateLimiterOptions) {
  const storeKey = `${options.windowMs}-${options.maxRequests}`;

  if (!stores.has(storeKey)) {
    stores.set(storeKey, new Map<string, RateLimitEntry>());
  }

  const store = stores.get(storeKey)!;

  // Periodic cleanup of expired entries
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetTime) {
        store.delete(key);
      }
    }
  }, options.windowMs);

  // Allow the timer to not prevent Node.js from exiting
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = getClientIp(req);
    const now = Date.now();
    const entry = store.get(clientIp);

    if (!entry || now > entry.resetTime) {
      store.set(clientIp, {
        count: 1,
        resetTime: now + options.windowMs,
      });

      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', options.maxRequests - 1);
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + options.windowMs) / 1000));
      next();
      return;
    }

    entry.count += 1;
    const remaining = Math.max(0, options.maxRequests - entry.count);

    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    if (entry.count > options.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);

      logger.warn(`Rate limit exceeded for IP: ${clientIp}`);

      next(
        new TooManyRequestsError(
          options.message || 'Too many requests, please try again later'
        )
      );
      return;
    }

    next();
  };
}
