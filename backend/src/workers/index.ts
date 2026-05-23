/**
 * Worker Launcher
 * Starts all BullMQ workers for background processing.
 * Import and call startAllWorkers() from the main index.ts to enable workers.
 */
import { startMediaProcessor, stopMediaProcessor } from './mediaProcessor';
import { startYoutubeDownloader, stopYoutubeDownloader } from './youtubeDownloader';
import { startM3uCacheInvalidator, stopM3uCacheInvalidator } from './m3uCacheInvalidator';

export interface WorkerStatus {
  mediaProcessor: boolean;
  youtubeDownloader: boolean;
  m3uCacheInvalidator: boolean;
}

let workersRunning = false;

export async function startAllWorkers(): Promise<WorkerStatus> {
  if (workersRunning) {
    console.log('[Workers] All workers already running');
    return getWorkerStatus();
  }

  console.log('[Workers] Starting all workers...');

  try {
    await startMediaProcessor();
    console.log('[Workers] ✓ Media processor started');
  } catch (err) {
    console.error('[Workers] ✗ Failed to start media processor:', (err as Error).message);
  }

  try {
    await startYoutubeDownloader();
    console.log('[Workers] ✓ YouTube downloader started');
  } catch (err) {
    console.error('[Workers] ✗ Failed to start YouTube downloader:', (err as Error).message);
  }

  try {
    await startM3uCacheInvalidator();
    console.log('[Workers] ✓ M3U cache invalidator started');
  } catch (err) {
    console.error('[Workers] ✗ Failed to start M3U cache invalidator:', (err as Error).message);
  }

  workersRunning = true;
  console.log('[Workers] All workers initialization complete');

  return getWorkerStatus();
}

export async function stopAllWorkers(): Promise<void> {
  console.log('[Workers] Stopping all workers...');

  await stopMediaProcessor();
  await stopYoutubeDownloader();
  await stopM3uCacheInvalidator();

  workersRunning = false;
  console.log('[Workers] All workers stopped');
}

export function getWorkerStatus(): WorkerStatus {
  return {
    mediaProcessor: workersRunning,
    youtubeDownloader: workersRunning,
    m3uCacheInvalidator: workersRunning,
  };
}
