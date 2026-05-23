import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import {
  MediaProcessingJob,
  QUEUES,
  getMediaQueue,
} from '../config/queue';
import { getRedisClient } from '../config/redis';
import {
  transcodeVideo,
  generateThumbnail,
  extractMetadata,
  validateVideoFile,
} from '../services/ffmpeg';

const prisma = new PrismaClient();

// ── Worker instance ──
let worker: Worker<MediaProcessingJob> | null = null;

export async function startMediaProcessor(): Promise<Worker<MediaProcessingJob>> {
  if (worker) return worker;

  const connection = await getRedisClient();

  worker = new Worker<MediaProcessingJob>(
    QUEUES.MEDIA_PROCESSING,
    async (job: Job<MediaProcessingJob>) => {
      console.log(`[MediaProcessor] Processing job ${job.id}: midia=${job.data.midiaId}`);
      return processMediaJob(job.data);
    },
    {
      connection: connection as any,
      concurrency: 2, // Process 2 at a time to limit CPU
      limiter: {
        max: 10,
        duration: 60000, // max 10 jobs per minute
      },
    },
  );

  worker.on('completed', (job) => {
    console.log(`[MediaProcessor] Job ${job.id} completed: ${job.data.midiaId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[MediaProcessor] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);

    // On final failure, mark media as error
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      const { midiaId } = job.data;
      prisma.midia.update({
        where: { id: midiaId },
        data: {
          status: 'error',
          metadata: { error: err.message },
        },
      }).catch((e: Error) => console.error('[MediaProcessor] Failed to update midia status:', e));
    }
  });

  console.log('[MediaProcessor] Worker started');
  return worker;
}

// ── Main processing logic ──
async function processMediaJob(data: MediaProcessingJob): Promise<void> {
  const { midiaId, filePath } = data;

  // Update status to processing
  await prisma.midia.update({
    where: { id: midiaId },
    data: { status: 'processing' },
  });

  // Validate file exists
  const absolutePath = path.resolve(filePath);
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`File not found: ${absolutePath}`);
  }

  // Validate video
  const isValid = await validateVideoFile(absolutePath);
  if (!isValid) {
    throw new Error(`Invalid or corrupted video file: ${absolutePath}`);
  }

  console.log(`[MediaProcessor] Validated file: ${absolutePath}`);

  const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
  const processedDir = path.join(uploadDir, 'processed');
  await fs.mkdir(processedDir, { recursive: true });

  const ext = path.extname(absolutePath);
  const baseName = path.basename(absolutePath, ext);
  const outputPath = path.join(processedDir, `${baseName}_h264${ext}`);
  const thumbnailPath = path.join(processedDir, `${baseName}_thumb.jpg`);

  // ── Step 1: Transcode to H.264/AAC ──
  console.log(`[MediaProcessor] Transcoding: ${absolutePath} -> ${outputPath}`);
  await transcodeVideo({
    inputPath: absolutePath,
    outputPath,
    resolution: '1280x720',
    videoBitrate: '2M',
    audioBitrate: '128k',
  });

  // ── Step 2: Generate thumbnail ──
  console.log(`[MediaProcessor] Generating thumbnail: ${thumbnailPath}`);
  try {
    await generateThumbnail({
      inputPath: outputPath,
      outputPath: thumbnailPath,
      timeOffset: 5,
    });
  } catch (thumbErr) {
    console.warn('[MediaProcessor] Thumbnail generation failed (non-fatal):', (thumbErr as Error).message);
  }

  // ── Step 3: Extract metadata ──
  console.log(`[MediaProcessor] Extracting metadata from: ${outputPath}`);
  const metadata = await extractMetadata(outputPath);

  // ── Step 4: Update midia record ──
  const relativeOutput = outputPath.replace(uploadDir, '/uploads');
  const relativeThumb = thumbnailPath.replace(uploadDir, '/uploads');

  await prisma.midia.update({
    where: { id: midiaId },
    data: {
      url: relativeOutput,
      thumbnailUrl: relativeThumb,
      duracao: metadata.duration,
      status: 'ready',
      metadata: {
        width: metadata.width,
        height: metadata.height,
        codec: metadata.codec,
        bitrate: metadata.bitrate,
        fps: metadata.fps,
        audioCodec: metadata.audioCodec,
        audioChannels: metadata.audioChannels,
        fileSize: metadata.fileSize,
        format: metadata.format,
        processedPath: relativeOutput,
      },
    },
  });

  console.log(`[MediaProcessor] Midia ${midiaId} processed successfully`);
  console.log(`[MediaProcessor]   Duration: ${metadata.duration}s`);
  console.log(`[MediaProcessor]   Resolution: ${metadata.width}x${metadata.height}`);
  console.log(`[MediaProcessor]   Codec: ${metadata.codec}`);
}

// ── Graceful shutdown ──
export async function stopMediaProcessor(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[MediaProcessor] Worker stopped');
  }
}
