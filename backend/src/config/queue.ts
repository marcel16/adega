import { Queue, JobsOptions } from 'bullmq';
import { getRedisClient } from './redis';

// ── Queue names ──
export const QUEUES = {
  MEDIA_PROCESSING: 'media-processing',
  YOUTUBE_DOWNLOAD: 'youtube-download',
  M3U_CACHE_INVALIDATION: 'm3u-cache-invalidation',
} as const;

// ── Job data types ──
export interface MediaProcessingJob {
  midiaId: string;
  clienteId: string;
  filePath: string;
  tipo: 'video' | 'imagem' | 'som';
}

export interface YoutubeDownloadJob {
  midiaId: string;
  clienteId: string;
  youtubeId: string;
  youtubeUrl: string;
}

export interface M3uCacheInvalidationJob {
  clienteId: string;
  slug: string;
  tvIds?: string[];
}

let redisConnection: ReturnType<typeof getRedisClient> extends Promise<infer T> ? T : never;

// ── Queue factory ──
async function createQueue<T>(name: string): Promise<Queue<T>> {
  const connection = await getRedisClient();
  return new Queue<T>(name, {
    connection: connection as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 3600 * 24, // 24h
        count: 100,
      },
      removeOnFail: {
        age: 3600 * 24 * 7, // 7 days
      },
    },
  });
}

// ── Queue instances (lazy) ──
let mediaQueue: Queue<MediaProcessingJob> | null = null;
let youtubeQueue: Queue<YoutubeDownloadJob> | null = null;
let m3uCacheQueue: Queue<M3uCacheInvalidationJob> | null = null;

export async function getMediaQueue(): Promise<Queue<MediaProcessingJob>> {
  if (!mediaQueue) {
    mediaQueue = await createQueue<MediaProcessingJob>(QUEUES.MEDIA_PROCESSING);
  }
  return mediaQueue;
}

export async function getYoutubeQueue(): Promise<Queue<YoutubeDownloadJob>> {
  if (!youtubeQueue) {
    youtubeQueue = await createQueue<YoutubeDownloadJob>(QUEUES.YOUTUBE_DOWNLOAD);
  }
  return youtubeQueue;
}

export async function getM3uCacheQueue(): Promise<Queue<M3uCacheInvalidationJob>> {
  if (!m3uCacheQueue) {
    m3uCacheQueue = await createQueue<M3uCacheInvalidationJob>(QUEUES.M3U_CACHE_INVALIDATION);
  }
  return m3uCacheQueue;
}

// ── Job enqueue helpers ──
export async function enqueueMediaProcessing(data: MediaProcessingJob, opts?: JobsOptions): Promise<void> {
  const queue = await getMediaQueue();
  await queue.add('process-media', data, opts);
  console.log(`[Queue] Enqueued media processing: ${data.midiaId}`);
}

export async function enqueueYoutubeDownload(data: YoutubeDownloadJob, opts?: JobsOptions): Promise<void> {
  const queue = await getYoutubeQueue();
  await queue.add('download-youtube', data, opts);
  console.log(`[Queue] Enqueued YouTube download: ${data.youtubeId}`);
}

export async function enqueueM3uCacheInvalidation(data: M3uCacheInvalidationJob, opts?: JobsOptions): Promise<void> {
  const queue = await getM3uCacheQueue();
  await queue.add('invalidate-m3u', data, opts);
  console.log(`[Queue] Enqueued M3U invalidation for cliente: ${data.clienteId}`);
}

// ── Cleanup ──
export async function closeAllQueues(): Promise<void> {
  for (const q of [mediaQueue, youtubeQueue, m3uCacheQueue]) {
    if (q) {
      await q.close();
    }
  }
  mediaQueue = null;
  youtubeQueue = null;
  m3uCacheQueue = null;
}
