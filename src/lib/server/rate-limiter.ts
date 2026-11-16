type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitMap = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * Checks and increments rate limit for a key (e.g. action + IP).
 * Returns { success: true } if within limits, or { success: false, retryAfterSeconds } if exceeded.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): { success: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const existing = rateLimitMap.get(key);

  if (!existing || now > existing.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { success: false, retryAfterSeconds };
  }

  existing.count += 1;
  return { success: true, retryAfterSeconds: 0 };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "127.0.0.1";
}
