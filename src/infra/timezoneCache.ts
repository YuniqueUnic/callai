import { client } from "./client";

/**
 * Detected host timezone cache.
 * - First paint: sync Intl fallback (cheap)
 * - Background: one Rust/OS probe; subsequent readers share the same promise/value
 * Settings should never block UI on detectTimezone IPC.
 */

let cached: string | null = null;
let inflight: Promise<string> | null = null;

function intlFallback(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Immediate best-effort value (cache or Intl). Never hits IPC. */
export function peekDetectedTimezone(): string {
  return cached ?? intlFallback();
}

/** Cached value if already resolved. */
export function getCachedDetectedTimezone(): string | null {
  return cached;
}

/**
 * Ensure detection runs once in the background.
 * Resolves with cached OS timezone; falls back to Intl on error.
 */
export function ensureDetectedTimezone(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const tz = await client.detectTimezone();
      cached = (tz && tz.trim()) || intlFallback();
    } catch {
      cached = intlFallback();
    } finally {
      inflight = null;
    }
    return cached!;
  })();

  return inflight;
}

/** Test/reset helper (not used in prod UI). */
export function __resetTimezoneCacheForTests(): void {
  cached = null;
  inflight = null;
}
