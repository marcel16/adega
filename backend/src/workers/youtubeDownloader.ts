import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import {
  YoutubeDownloadJob,
  QUEUES,
} from '../config/queue';
import { getRedisClient } from '../config/redis';
import {
  downloadAndExtract,
  downloadThumbnail,
  extractYoutubeId,
  getVideoInfo,
} from '../services/youtube';
import { transcodeVideo, generateThumbnail } from '../services/ffmpeg';
import fs from 'fs/promises';

const prisma = new PrismaClient();

// ── Worker instance ──
let worker: Worker<YoutubeDownloadJob> | null = null;

export async function startYoutubeDownloader(): Promise<Worker<YoutubeDownloadJob>> {
  if (worker) return worker;

  const connection = await getRedisClient();

  worker = new Worker<YoutubeDownloadJob>(
    QUEUES.YOUTUBE_DOWNLOAD,
    async (job: Job<YoutubeDownloadJob>) => {
      console.log(`[YouTubeDownloader] Processing job ${job.id}: youtubeId=${job.data.youtubeId}`);
      return processYoutubeJob(job.data);
    },
    {
      connection: connection as any,
      concurrency: 1, // Download one at a time
      limiter: {
        max: 5,
        duration: 60000, // max 5 per minute
      },
    },
  );

  worker.on('completed', (job) => {
    console.log(`[YouTubeDownloader] Job ${job.id} completed: ${job.data.youtubeId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[YouTubeDownloader] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);

    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      const { midiaId } = job.data;
      prisma.midia.update({
        where: { id: midiaId },
        data: {
          status: 'error',
          metadata: { error: err.message },
        },
      }).catch((e: Error) => console.error('[YouTubeDownloader] Failed to update midia:', e));
    }
  });

  console.log('[YouTubeDownloader] Worker started');
  return worker;
}

// ── Main processing logic ──
async function processYoutubeJob(data: YoutubeDownloadJob): Promise<void> {
  const { midiaId, clienteId, youtubeId, youtubeUrl } = data;

  // Update status
  await prisma.midia.update({
    where: { id: midiaId },
    data: { status: 'processing' },
  });

  const downloadDir = process.env.DOWNLOAD_DIR || path.join(process.env.UPLOAD_DIR || '/app/uploads', 'youtube');
  await fs.mkdir(downloadDir, { recursive: true });

  const thumbDir = path.join(downloadDir, 'thumbs');
  await fs.mkdir(thumbDir, { recursive: true });

  try {
    // ── Step 1: Download video from YouTube ──
    console.log(`[YouTubeDownloader] Downloading: ${youtubeUrl}`);
    const result = await downloadAndExtract(youtubeUrl, downloadDir, youtubeId);
    console.log(`[YouTubeDownloader] Downloaded: ${result.filePath} (${result.metadata.duration}s, ${result.metadata.width}x${result.metadata.height})`);

    // ── Step 2: Download thumbnail (fallback if metadata one fails) ──
    let thumbnailPath = result.youtubeInfo.thumbnail;
    try {
      thumbnailPath = await downloadThumbnail(youtubeUrl, thumbDir, youtubeId);
      console.log(`[YouTubeDownloader] Thumbnail downloaded: ${thumbnailPath}`);
    } catch (thumbErr) {
      console.warn('[YouTubeDownloader] Thumbnail download failed, trying FFmpeg:', (thumbErr as Error).message);
      try {
        thumbnailPath = path.join(thumbDir, `${youtubeId}_thumb.jpg`);
        await generateThumbnail({
          inputPath: result.filePath,
          outputPath: thumbnailPath,
          timeOffset: 5,
        });
      } catch (ffmpegThumbErr) {
        console.warn('[YouTubeDownloader] FFmpeg thumbnail also failed:', (ffmpegThumbErr as Error).message);
      }
    }

    // ── Step 3: Transcode if needed ──
    let finalPath = result.filePath;
    const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
    const processedDir = path.join(uploadDir, 'processed');
    await fs.mkdir(processedDir, { recursive: true });

    // Only transcode if not already H.264 in MP4 container
    const ext = path.extname(result.filePath).toLowerCase();
    const needsTranscode = ext !== '.mp4' || result.metadata.codec !== 'h264';

    if (needsTranscode) {
      const transcodedPath = path.join(processedDir, `${youtubeId}_h264.mp4`);
      console.log(`[YouTubeDownloader] Transcoding to H.264: ${transcodedPath}`);
      await transcodeVideo({
        inputPath: result.filePath,
        outputPath: transcodedPath,
        resolution: '1280x720',
        videoBitrate: '2M',
      });
      finalPath = transcodedPath;
    }

    // ── Step 4: Update midia record ──
    const relativeFinal = finalPath.replace(uploadDir, '/uploads');
    const relativeThumb = typeof thumbnailPath === 'string'
      ? thumbnailPath.replace(uploadDir, '/uploads')
      : undefined;

    await prisma.midia.update({
      where: { id: midiaId },
      data: {
        url: relativeFinal,
        thumbnailUrl: relativeThumb,
        duracao: result.metadata.duration,
        tamanho: BigInt(result.metadata.fileSize),
        status: 'ready',
        metadata: {
          width: result.metadata.width,
          height: result.metadata.height,
          codec: result.metadata.codec,
          bitrate: result.metadata.bitrate,
          fps: result.metadata.fps,
          format: result.metadata.format,
          originalTitle: result.youtubeInfo.title,
          uploader: result.youtubeInfo.uploader,
          viewCount: result.youtubeInfo.viewCount,
          youtubeId: result.youtubeInfo.id,
        },
      },
    });

    console.log(`[YouTubeDownloader] Mídia ${midiaId} processed: "${result.youtubeInfo.title}"`);
  } catch (err) {
    console.error(`[YouTubeDownloader] Failed to process ${midiaId}:`, (err as Error).message);
    throw err;
  }
}

// ── Graceful shutdown ──
export async function stopYoutubeDownloader(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[YouTubeDownloader] Worker stopped');
  }
}
