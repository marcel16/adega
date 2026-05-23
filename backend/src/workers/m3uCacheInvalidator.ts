import { Worker, Job } from 'bullmq';
import {
  M3uCacheInvalidationJob,
  QUEUES,
} from '../config/queue';
import { getRedisClient } from '../config/redis';
import { invalidateM3uCliente, cacheInvalidateNamespace } from '../services/cache';

// ── Worker instance ──
let worker: Worker<M3uCacheInvalidationJob> | null = null;

export async function startM3uCacheInvalidator(): Promise<Worker<M3uCacheInvalidationJob>> {
  if (worker) return worker;

  const connection = await getRedisClient();

  worker = new Worker<M3uCacheInvalidationJob>(
    QUEUES.M3U_CACHE_INVALIDATION,
    async (job: Job<M3uCacheInvalidationJob>) => {
      console.log(`[M3uCacheInvalidator] Processing job ${job.id}: cliente=${job.data.clienteId}`);
      return invalidateM3uCache(job.data);
    },
    {
      connection: connection as any,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[M3uCacheInvalidator] Job ${job.id} completed: cliente ${job.data.clienteId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[M3uCacheInvalidator] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });

  console.log('[M3uCacheInvalidator] Worker started');
  return worker;
}

// ── Invalidation logic ──
async function invalidateM3uCache(data: M3uCacheInvalidationJob): Promise<void> {
  const { clienteId, slug, tvIds } = data;

  console.log(`[M3uCacheInvalidator] Invalidating cache for cliente ${clienteId} (slug: ${slug})`);

  // Invalidate client-level M3U cache (all TVs)
  await invalidateM3uCliente(slug);

  // Invalidate specific TV caches
  if (tvIds && tvIds.length > 0) {
    for (const tvId of tvIds) {
      await cacheInvalidateNamespace(`m3u:${slug}:tv:${tvId}`);
    }
  }

  // Also invalidate any playlist-related caches
  await cacheInvalidateNamespace(`playlist:${clienteId}`);
  await cacheInvalidateNamespace(`m3u:${slug}`);

  // Log the invalidation for monitoring
  console.log(`[M3uCacheInvalidator] Cache invalidated for cliente ${clienteId}${tvIds ? ` (${tvIds.length} TVs)` : ' (all TVs)'}`);

  // If we want to pre-warm cache after invalidation, we could signal another job
  // But that's handled by the m3uPreCache cron job
}

// ── Direct invalidation (used by routes, no queue needed) ──
export async function invalidateM3uForCliente(clienteId: string, slug: string): Promise<void> {
  try {
    await invalidateM3uCliente(slug);
    await cacheInvalidateNamespace(`playlist:${clienteId}`);
    console.log(`[M3uCacheInvalidator] Direct invalidation for cliente ${clienteId}`);
  } catch (err) {
    console.error(`[M3uCacheInvalidator] Direct invalidation failed:`, (err as Error).message);
  }
}

// ── Graceful shutdown ──
export async function stopM3uCacheInvalidator(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[M3uCacheInvalidator] Worker stopped');
  }
}
