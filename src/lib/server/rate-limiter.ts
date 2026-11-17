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
  // 1. Vercel Edge proxy header (cannot be spoofed by client)
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp) {
    return vercelIp.split(",")[0].trim();
  }

  // 2. Cloudflare connecting IP (cannot be spoofed if behind Cloudflare)
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp.trim();
  }

  // 3. Reverse proxy real IP header
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // 4. Standard X-Forwarded-For fallback:
  // When behind trusted proxies, the rightmost IP is appended by the nearest trusted edge/load balancer
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  return "127.0.0.1";
}
