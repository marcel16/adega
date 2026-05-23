import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';

// ── Cleanup temporary and stale files ──
async function cleanupTempFiles(): Promise<void> {
  console.log('[CleanupTempFiles] Starting cleanup...');

  const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
  const processedDir = path.join(uploadDir, 'processed');
  const youtubeDir = path.join(uploadDir, 'youtube');
  const maxAgeHours = parseInt(process.env.TEMP_FILE_MAX_AGE_HOURS || '72', 10); // 3 days default

  let deletedCount = 0;
  let freedBytes = 0;

  const now = Date.now();
  const maxAge = maxAgeHours * 60 * 60 * 1000;

  // ── Clean directories ──
  const directoriesToClean = [processedDir, youtubeDir];

  for (const dir of directoriesToClean) {
    try {
      await fs.access(dir);
    } catch {
      console.log(`[CleanupTempFiles] Directory does not exist: ${dir}, skipping`);
      continue;
    }

    try {
      const files = await fs.readdir(dir, { withFileTypes: true });

      for (const file of files) {
        if (!file.isFile()) continue;

        const filePath = path.join(dir, file.name);
        try {
          const stats = await fs.stat(filePath);
          const age = now - stats.mtimeMs;

          if (age > maxAge) {
            await fs.unlink(filePath);
            deletedCount++;
            freedBytes += stats.size;
            console.log(`[CleanupTempFiles] Deleted: ${filePath} (${Math.round(age / 3600000)}h old)`);
          }
        } catch (fileErr) {
          console.warn(`[CleanupTempFiles] Failed to process ${filePath}:`, (fileErr as Error).message);
        }
      }
    } catch (err) {
      console.warn(`[CleanupTempFiles] Failed to read directory ${dir}:`, (err as Error).message);
    }
  }

  // ── Clean empty subdirectories ──
  for (const dir of directoriesToClean) {
    try {
      const entries = await fs.readdir(dir);
      if (entries.length === 0) {
        // Don't remove the dir itself, it's needed
        console.log(`[CleanupTempFiles] Directory empty: ${dir}`);
      }

      // Clean thumbnails subdir
      const thumbDir = path.join(dir, 'thumbs');
      try {
        const thumbFiles = await fs.readdir(thumbDir, { withFileTypes: true });
        for (const file of thumbFiles) {
          if (!file.isFile()) continue;
          const filePath = path.join(thumbDir, file.name);
          const stats = await fs.stat(filePath);
          if (now - stats.mtimeMs > maxAge) {
            await fs.unlink(filePath);
            deletedCount++;
            freedBytes += stats.size;
          }
        }
      } catch {
        // thumb dir might not exist
      }
    } catch {
      // dir might not exist
    }
  }

  const freedMB = (freedBytes / (1024 * 1024)).toFixed(2);
  console.log(`[CleanupTempFiles] Cleanup complete: ${deletedCount} files deleted, ${freedMB} MB freed`);
}

// ── Schedule: every day at 3:00 AM ──
export function startCleanupTempFiles(): cron.ScheduledTask {
  console.log('[CleanupTempFiles] Scheduled daily at 3:00 AM');

  // Run immediately on startup in dev
  if (process.env.NODE_ENV === 'development') {
    cleanupTempFiles();
  }

  return cron.schedule('0 3 * * *', cleanupTempFiles, {
    scheduled: true,
    timezone: 'America/Sao_Paulo',
  });
}

export { cleanupTempFiles };
