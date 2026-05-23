import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { extractMetadata, VideoMetadata } from './ffmpeg';

// ── Types ──
export interface YoutubeVideoInfo {
  id: string;
  title: string;
  description: string;
  duration: number;       // seconds
  thumbnail: string;
  uploadDate: string;
  uploader: string;
  viewCount: number;
  width: number;
  height: number;
  formats: string[];
}

export interface DownloadResult {
  filePath: string;
  metadata: VideoMetadata;
  youtubeInfo: YoutubeVideoInfo;
}

// ── yt-dlp path detection ──
async function getYtDlpPath(): Promise<string> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const { stdout } = await execAsync('which yt-dlp');
    return stdout.trim();
  } catch {
    return 'yt-dlp'; // hope it's on PATH
  }
}

// ── Get video metadata (no download) ──
export async function getVideoInfo(urlOrId: string): Promise<YoutubeVideoInfo> {
  const ytdlp = await getYtDlpPath();

  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    urlOrId,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(ytdlp, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr.slice(-500)}`));
        return;
      }

      try {
        const raw = JSON.parse(stdout.trim());
        const info: YoutubeVideoInfo = {
          id: raw.id || raw.display_id || '',
          title: raw.title || '',
          description: raw.description || '',
          duration: Math.round(raw.duration || 0),
          thumbnail: raw.thumbnail || '',
          uploadDate: raw.upload_date || '',
          uploader: raw.uploader || raw.channel || '',
          viewCount: raw.view_count || 0,
          width: raw.width || 0,
          height: raw.height || 0,
          formats: raw.formats?.map((f: any) => f.format_id) || [],
        };
        resolve(info);
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp output: ${(err as Error).message}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`yt-dlp process error: ${err.message}`));
    });
  });
}

// ── Download video ──
export async function downloadVideo(
  urlOrId: string,
  outputDir: string,
  filename?: string,
): Promise<string> {
  const ytdlp = await getYtDlpPath();

  await fs.mkdir(outputDir, { recursive: true });

  const outputTemplate = filename
    ? path.join(outputDir, filename)
    : path.join(outputDir, '%(id)s.%(ext)s');

  // If filename specified without extension, let yt-dlp add it
  const actualOutput = filename && !path.extname(filename)
    ? path.join(outputDir, `${filename}.%(ext)s`)
    : outputTemplate;

  const args = [
    '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--output', actualOutput,
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--restrict-filenames',
    urlOrId,
  ];

  console.log(`[YouTube] Downloading: ${urlOrId} -> ${outputDir}`);
  console.log(`[YouTube] Command: ${ytdlp} ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    const child = spawn(ytdlp, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    let lastLine = '';

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      lastLine = text.trim();
      // yt-dlp output lines
      if (text.includes('Destination:')) {
        console.log(`[YouTube] ${text.trim()}`);
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp download failed (exit ${code}): ${stderr.slice(-500)}`));
        return;
      }

      // Find the downloaded file
      try {
        const expectedId = extractYoutubeId(urlOrId);
        const files = await fs.readdir(outputDir);
        const downloadedFile = files.find(f => {
          const ext = path.extname(f).toLowerCase();
          return (ext === '.mp4' || ext === '.mkv' || ext === '.webm')
            && (expectedId ? f.includes(expectedId) : true);
        });

        if (!downloadedFile) {
          reject(new Error('Downloaded file not found in output directory'));
          return;
        }

        const filePath = path.join(outputDir, downloadedFile);
        console.log(`[YouTube] Download complete: ${filePath}`);
        resolve(filePath);
      } catch (err) {
        reject(new Error(`Failed to locate downloaded file: ${(err as Error).message}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`yt-dlp process error: ${err.message}`));
    });
  });
}

// ── Download + metadata extraction ──
export async function downloadAndExtract(
  urlOrId: string,
  outputDir: string,
  filename?: string,
): Promise<DownloadResult> {
  // Get metadata first (fast)
  const youtubeInfo = await getVideoInfo(urlOrId);
  console.log(`[YouTube] Got info: "${youtubeInfo.title}" (${youtubeInfo.duration}s, ${youtubeInfo.width}x${youtubeInfo.height})`);

  // Download
  const filePath = await downloadVideo(urlOrId, outputDir, filename);

  // Extract FFmpeg metadata
  const metadata = await extractMetadata(filePath);

  return {
    filePath,
    metadata,
    youtubeInfo,
  };
}

// ── Download thumbnail ──
export async function downloadThumbnail(
  urlOrId: string,
  outputDir: string,
  filename?: string,
): Promise<string> {
  const ytdlp = await getYtDlpPath();

  await fs.mkdir(outputDir, { recursive: true });

  const outputName = filename || '%(id)s_thumb.%(ext)s';
  const outputTemplate = path.join(outputDir, outputName);

  const args = [
    '--skip-download',
    '--write-thumbnail',
    '--convert-thumbnails', 'jpg',
    '--output', outputTemplate,
    '--no-playlist',
    '--no-warnings',
    urlOrId,
  ];

  console.log(`[YouTube] Downloading thumbnail: ${urlOrId}`);

  return new Promise((resolve, reject) => {
    const child = spawn(ytdlp, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Thumbnail download failed (exit ${code}): ${stderr.slice(-300)}`));
        return;
      }

      try {
        const expectedId = extractYoutubeId(urlOrId);
        const files = await fs.readdir(outputDir);
        const thumbFile = files.find(f => {
          const lower = f.toLowerCase();
          return (lower.endsWith('.jpg') || lower.endsWith('.png') || lower.endsWith('.webp'))
            && (expectedId ? f.includes(expectedId) : true)
            && f.includes('thumb');
        });

        const thumbPath = thumbFile
          ? path.join(outputDir, thumbFile)
          : path.join(outputDir, `${expectedId}.jpg`);

        resolve(thumbPath);
      } catch (err) {
        reject(new Error(`Failed to locate thumbnail: ${(err as Error).message}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`yt-dlp thumbnail error: ${err.message}`));
    });
  });
}

// ── List available formats ──
export async function listFormats(urlOrId: string): Promise<Array<{
  formatId: string;
  ext: string;
  resolution: string;
  fps: number;
  filesize: number;
  codec: string;
}>> {
  const ytdlp = await getYtDlpPath();

  const args = [
    '--dump-json',
    '--no-playlist',
    urlOrId,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(ytdlp, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp list-formats failed (exit ${code})`));
        return;
      }

      try {
        const raw = JSON.parse(stdout.trim());
        const formats = (raw.formats || []).map((f: any) => ({
          formatId: f.format_id,
          ext: f.ext,
          resolution: f.resolution || `${f.width || '?'}x${f.height || '?'}`,
          fps: f.fps || 0,
          filesize: f.filesize || 0,
          codec: f.vcodec || 'unknown',
        }));
        resolve(formats);
      } catch (err) {
        reject(new Error(`Failed to parse formats: ${(err as Error).message}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`yt-dlp process error: ${err.message}`));
    });
  });
}

// ── Utility: extract YouTube ID from URL ──
export function extractYoutubeId(url: string): string {
  // Standard URL: https://www.youtube.com/watch?v=XXXXX
  const standardMatch = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
  if (standardMatch) return standardMatch[1];

  // Short URL: https://youtu.be/XXXXX
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // Embed URL: https://www.youtube.com/embed/XXXXX
  const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  // Probably already just an ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

  return url;
}
