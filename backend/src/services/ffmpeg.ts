import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// ── Types ──
export interface TranscodeOptions {
  inputPath: string;
  outputPath: string;
  resolution?: string;    // e.g. "1920x1080", "1280x720"
  videoBitrate?: string;  // e.g. "2M"
  audioBitrate?: string;  // e.g. "128k"
  crf?: number;          // 18-28, lower = better quality
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow';
  fps?: number;
}

export interface ThumbnailOptions {
  inputPath: string;
  outputPath: string;
  timeOffset?: number;   // seconds into video
  width?: number;
  height?: number;
}

export interface VideoMetadata {
  duration: number;       // seconds
  width: number;
  height: number;
  codec: string;
  bitrate: number;        // kbps
  fps: number;
  audioCodec?: string;
  audioChannels?: number;
  fileSize: number;       // bytes
  format: string;
}

// ── Default transcode settings ──
const DEFAULT_TRANSCODE: Partial<TranscodeOptions> = {
  resolution: '1280x720',
  videoBitrate: '2M',
  audioBitrate: '128k',
  crf: 23,
  preset: 'medium',
  fps: 30,
};

// ── FFmpeg path detection ──
async function getFfmpegPath(): Promise<string> {
  // Try common paths
  try {
    const { stdout } = await execAsync('which ffmpeg');
    return stdout.trim();
  } catch {
    return 'ffmpeg'; // hope it's on PATH
  }
}

// ── Ensure output directory exists ──
async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

// ── Transcode vídeo para H.264 + AAC ──
export async function transcodeVideo(options: TranscodeOptions): Promise<void> {
  const opts = { ...DEFAULT_TRANSCODE, ...options };
  const ffmpeg = await getFfmpegPath();

  await ensureDir(opts.outputPath);

  const args: string[] = [
    '-i', opts.inputPath,
    '-c:v', 'libx264',           // H.264
    '-c:a', 'aac',               // AAC audio
    '-b:v', opts.videoBitrate!,
    '-b:a', opts.audioBitrate!,
    '-crf', String(opts.crf),
    '-preset', opts.preset!,
    '-movflags', '+faststart',   // Web-optimized
    '-pix_fmt', 'yuv420p',       // Max compatibility
    '-r', String(opts.fps),
    '-max_muxing_queue_size', '1024',
  ];

  // Scale if resolution specified
  if (opts.resolution) {
    args.push('-vf', `scale=${opts.resolution}:force_original_aspect_ratio=decrease,pad=${opts.resolution}:(ow-iw)/2:(oh-ih)/2`);
  }

  args.push('-y'); // overwrite
  args.push(opts.outputPath);

  console.log(`[FFmpeg] Transcoding: ${opts.inputPath} -> ${opts.outputPath}`);
  console.log(`[FFmpeg] Args: ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    const child = execFile(ffmpeg, args, {
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    let stderr = '';

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[FFmpeg] Transcode complete: ${opts.outputPath}`);
        resolve();
      } else {
        console.error(`[FFmpeg] Transcode failed (exit ${code}):`, stderr.slice(-500));
        reject(new Error(`FFmpeg exit code ${code}: ${stderr.slice(-300)}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`FFmpeg process error: ${err.message}`));
    });
  });
}

// ── Gerar thumbnail ──
export async function generateThumbnail(options: ThumbnailOptions): Promise<void> {
  const {
    inputPath,
    outputPath,
    timeOffset = 5,
    width = 640,
    height = 360,
  } = options;
  const ffmpeg = await getFfmpegPath();

  await ensureDir(outputPath);

  const args = [
    '-ss', String(timeOffset),
    '-i', inputPath,
    '-vframes', '1',
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    '-q:v', '2',
    '-y',
    outputPath,
  ];

  console.log(`[FFmpeg] Generating thumbnail: ${inputPath} -> ${outputPath}`);

  await execFileAsync(ffmpeg, args);
  console.log(`[FFmpeg] Thumbnail generated: ${outputPath}`);
}

// ── Extrair metadados ──
export async function extractMetadata(inputPath: string): Promise<VideoMetadata> {
  const ffprobe = 'ffprobe'; // Assume ffprobe is next to ffmpeg

  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ];

  try {
    const { stdout } = await execFileAsync(ffprobe, args, {
      maxBuffer: 5 * 1024 * 1024,
    });
    const data = JSON.parse(stdout);

    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');
    const format = data.format || {};

    // Parse duration
    const duration = parseFloat(format.duration) || (videoStream?.duration ? parseFloat(videoStream.duration) : 0);

    // Parse bitrate
    const bitrate = format.bit_rate
      ? Math.round(parseInt(format.bit_rate) / 1000)
      : 0;

    // Parse FPS
    let fps = 0;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      fps = den ? Math.round(num / den) : num;
    }

    const stats = await fs.stat(inputPath);

    return {
      duration: Math.round(duration),
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      codec: videoStream?.codec_name || 'unknown',
      bitrate,
      fps,
      audioCodec: audioStream?.codec_name,
      audioChannels: audioStream?.channels,
      fileSize: stats.size,
      format: format.format_name || 'unknown',
    };
  } catch (err) {
    console.error('[FFmpeg] Metadata extraction error:', (err as Error).message);
    throw err;
  }
}

// ── Validar arquivo de vídeo ──
export async function validateVideoFile(inputPath: string): Promise<boolean> {
  const ffprobe = 'ffprobe';
  const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', inputPath];

  try {
    await execFileAsync(ffprobe, args, { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

// ── Gerar variações de resolução ──
export async function generateResolutions(
  inputPath: string,
  baseOutputDir: string,
  filename: string,
  resolutions: string[] = ['1920x1080', '1280x720', '854x480'],
): Promise<string[]> {
  const outputs: string[] = [];

  for (const resolution of resolutions) {
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    const outputPath = path.join(baseOutputDir, `${name}_${resolution.replace('x', 'p')}${ext}`);

    await transcodeVideo({
      inputPath,
      outputPath,
      resolution,
      videoBitrate: resolution === '1920x1080' ? '4M' : resolution === '1280x720' ? '2M' : '1M',
    });

    outputs.push(outputPath);
  }

  return outputs;
}
