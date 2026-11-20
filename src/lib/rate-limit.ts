interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 10_000;
const PRUNE_INTERVAL_MS = 60_000;

const buckets = new Map<string, Bucket>();
let lastPrunedAt = 0;

function pruneExpiredBuckets(now: number) {
  if (now - lastPrunedAt < PRUNE_INTERVAL_MS && buckets.size < MAX_BUCKETS) {
    return;
  }
  lastPrunedAt = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
  // If still above cap under extreme traffic, evict oldest entries first
  if (buckets.size >= MAX_BUCKETS) {
    const excess = buckets.size - Math.floor(MAX_BUCKETS * 0.8);
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  pruneExpiredBuckets(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - 1),
      retryAfterSeconds: 0,
    };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - existing.count),
    retryAfterSeconds: 0,
  };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

export function getActiveRateLimitBucketsCount(): number {
  pruneExpiredBuckets(Date.now());
  return buckets.size;
}
