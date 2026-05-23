import { getRedisClient } from '../config/redis';

// ── Cache prefix ──
const PREFIX = 'adega:';

// ── Build key with prefix ──
function key(...parts: string[]): string {
  return PREFIX + parts.join(':');
}

// ── TTL presets ──
export const TTL = {
  M3U_PLAYLIST: 300,       // 5 min
  YOUTUBE_METADATA: 3600,  // 1 hora
  PLANOS: 86400,           // 24 horas
  CLIENTE_SESSION: 7200,   // 2 horas
  CONFIGURACOES: 3600,     // 1 hora
} as const;

// ── Cache helpers ──

export async function cacheGet<T = string>(ns: string, k: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    const val = await redis.get(key(ns, k));
    if (!val) return null;
    return JSON.parse(val) as T;
  } catch (err) {
    console.error(`[Cache] GET error (${ns}:${k}):`, (err as Error).message);
    return null;
  }
}

export async function cacheSet(ns: string, k: string, value: unknown, ttl?: number): Promise<void> {
  try {
    const redis = await getRedisClient();
    const fullKey = key(ns, k);
    const serialized = JSON.stringify(value);
    if (ttl) {
      await redis.setEx(fullKey, ttl, serialized);
    } else {
      await redis.set(fullKey, serialized);
    }
  } catch (err) {
    console.error(`[Cache] SET error (${ns}:${k}):`, (err as Error).message);
  }
}

export async function cacheDel(ns: string, k: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(key(ns, k));
  } catch (err) {
    console.error(`[Cache] DEL error (${ns}:${k}):`, (err as Error).message);
  }
}

export async function cacheExists(ns: string, k: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    const result = await redis.exists(key(ns, k));
    return result === 1;
  } catch (err) {
    console.error(`[Cache] EXISTS error (${ns}:${k}):`, (err as Error).message);
    return false;
  }
}

// ── Namespace invalidation (delete by pattern) ──
export async function cacheInvalidateNamespace(ns: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    const pattern = key(ns, '*');
    let cursor = 0;
    do {
      const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      const keys = result.keys;
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } while (cursor !== 0);
    console.log(`[Cache] Invalidated namespace: ${ns}`);
  } catch (err) {
    console.error(`[Cache] Invalidation error (${ns}):`, (err as Error).message);
  }
}

// ── Cache with fallback (get or compute) ──
export async function cacheGetOrSet<T>(
  ns: string,
  k: string,
  factory: () => Promise<T>,
  ttl?: number,
): Promise<T> {
  const cached = await cacheGet<T>(ns, k);
  if (cached !== null) return cached;

  const value = await factory();
  await cacheSet(ns, k, value, ttl);
  return value;
}

// ── Increment ──
export async function cacheIncr(ns: string, k: string): Promise<number> {
  try {
    const redis = await getRedisClient();
    return await redis.incr(key(ns, k));
  } catch (err) {
    console.error(`[Cache] INCR error (${ns}:${k}):`, (err as Error).message);
    return 0;
  }
}

// ── TTL management ──
export async function cacheTTL(ns: string, k: string): Promise<number> {
  try {
    const redis = await getRedisClient();
    return await redis.ttl(key(ns, k));
  } catch (err) {
    console.error(`[Cache] TTL error (${ns}:${k}):`, (err as Error).message);
    return -2; // key does not exist
  }
}

// ── Specific domain helpers ──

export async function cacheM3uPlaylist(slug: string, tvNum: number, content: string): Promise<void> {
  await cacheSet('m3u', `${slug}:${tvNum}`, content, TTL.M3U_PLAYLIST);
}

export async function getCachedM3uPlaylist(slug: string, tvNum: number): Promise<string | null> {
  const cached = await cacheGet<{ content: string }>('m3u', `${slug}:${tvNum}`);
  return cached && typeof cached === 'object' && 'content' in cached
    ? (cached as { content: string }).content
    : (typeof cached === 'string' ? cached : null);
}

export async function invalidateM3uCliente(slug: string): Promise<void> {
  await cacheInvalidateNamespace(`m3u:${slug}`);
}
