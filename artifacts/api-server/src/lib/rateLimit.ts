interface RateLimitEntry {
  count: number;
  firstRequestAt: number;
  blockedUntil?: number;
}

const store = new Map<string, RateLimitEntry>();
const actionStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000;

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = store.get(ip);

  if (entry?.blockedUntil && now < entry.blockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }

  if (!entry || now - entry.firstRequestAt > WINDOW_MS) {
    store.set(ip, { count: 1, firstRequestAt: now });
    return { allowed: true };
  }

  entry.count++;

  if (entry.count > MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_DURATION_MS;
    store.set(ip, entry);
    return { allowed: false, retryAfter: Math.ceil(BLOCK_DURATION_MS / 1000) };
  }

  store.set(ip, entry);
  return { allowed: true };
}

export function resetLoginRateLimit(ip: string): void {
  store.delete(ip);
}

export function checkActionRateLimit(
  key: string,
  options: { maxAttempts: number; windowMs: number; blockDurationMs: number },
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = actionStore.get(key);

  if (entry?.blockedUntil && now < entry.blockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  if (!entry || now - entry.firstRequestAt > options.windowMs) {
    actionStore.set(key, { count: 1, firstRequestAt: now });
    return { allowed: true };
  }

  entry.count += 1;
  if (entry.count > options.maxAttempts) {
    entry.blockedUntil = now + options.blockDurationMs;
    actionStore.set(key, entry);
    return { allowed: false, retryAfter: Math.ceil(options.blockDurationMs / 1000) };
  }
  actionStore.set(key, entry);
  return { allowed: true };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store.entries()) {
    if (entry.blockedUntil && now > entry.blockedUntil) {
      store.delete(ip);
    } else if (!entry.blockedUntil && now - entry.firstRequestAt > WINDOW_MS * 2) {
      store.delete(ip);
    }
  }
  for (const [key, entry] of actionStore.entries()) {
    if ((entry.blockedUntil && now > entry.blockedUntil)
      || (!entry.blockedUntil && now - entry.firstRequestAt > 30 * 60 * 1000)) {
      actionStore.delete(key);
    }
  }
}, 5 * 60 * 1000);
