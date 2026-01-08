/**
 * ffmpeg Compression
 *
 * Handles media compression using ffmpeg.
 * ffmpeg and ffprobe are provided via Lambda Layer.
 *
 * Supported media types:
 * - Video: MP4 output with H.264 video and AAC audio
 * - Image: JPEG output with quality optimization
 * - Audio: AAC output with bitrate control
 */

import { spawn } from "child_process";
import * as fs from "fs";
import { logger } from "./logger";
import { FfmpegPreset, MediaType } from "./types";

// ffmpeg binary paths (provided by Lambda Layer)
const FFMPEG_PATH = process.env.FFMPEG_PATH || "/opt/bin/ffmpeg";
const FFPROBE_PATH = process.env.FFPROBE_PATH || "/opt/bin/ffprobe";

/**
 * Calculate optimal ffmpeg settings based on target file size
 */
function calculateVideoPreset(
  targetSizeMb: number,
  durationSeconds: number
): FfmpegPreset {
  // Calculate target bitrate
  // Formula: bitrate = (targetSize * 8) / duration
  // Leave 10% for audio
  const targetBits = targetSizeMb * 1024 * 1024 * 8;
  const audioBitrate = 128; // kbps
  const audioBits = audioBitrate * 1000 * durationSeconds;
  const videoBits = targetBits - audioBits;
  const videoBitrate = Math.floor(videoBits / durationSeconds / 1000); // kbps

  // Clamp to reasonable values
  const clampedBitrate = Math.max(500, Math.min(videoBitrate, 8000));

  return {
    videoCodec: "libx264",
    audioCodec: "aac",
    crf: 28, // Quality factor (18-28 is visually lossless to good)
    preset: "fast", // Speed/compression tradeoff
    maxBitrate: `${clampedBitrate}k`,
    audioBitrate: `${audioBitrate}k`,
    // Scale down if bitrate is very low
    scale:
      clampedBitrate < 1000
        ? "-2:480"
        : clampedBitrate < 2000
        ? "-2:720"
        : undefined,
  };
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ];

    const process = spawn(FFPROBE_PATH, args);
    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    process.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed with code ${code}: ${stderr}`));
        return;
      }

      const duration = parseFloat(stdout.trim());
      if (isNaN(duration)) {
        reject(
          new Error(`Could not parse duration from ffprobe output: ${stdout}`)
        );
        return;
      }

      resolve(duration);
    });
  });
}

/**
 * Compress a video file using ffmpeg
 */
async function compressVideo(
  inputPath: string,
  outputPath: string,
  targetSizeMb: number,
  jobId: string
): Promise<void> {
  // Get duration for bitrate calculation
  const duration = await getVideoDuration(inputPath);
  logger.info("Video duration detected", jobId, { durationSeconds: duration });

  const preset = calculateVideoPreset(targetSizeMb, duration);
  logger.info("Using compression preset", jobId, { preset });

  const args = [
    "-i",
    inputPath,
    "-c:v",
    preset.videoCodec!,
    "-c:a",
    preset.audioCodec!,
    "-crf",
    preset.crf!.toString(),
    "-preset",
    preset.preset!,
    "-maxrate",
    preset.maxBitrate!,
    "-bufsize",
    `${parseInt(preset.maxBitrate!) * 2}k`,
    "-b:a",
    preset.audioBitrate!,
  ];

  // Add scale filter if needed
  if (preset.scale) {
    args.push("-vf", `scale=${preset.scale}`);
  }

  // Output settings
  args.push(
    "-movflags",
    "+faststart", // Enable streaming
    "-y", // Overwrite output
    outputPath
  );

  await runFfmpeg(args, jobId);
}

/**
 * Compress an image file using ffmpeg
 */
async function compressImage(
  inputPath: string,
  outputPath: string,
  targetSizeMb: number,
  jobId: string
): Promise<void> {
  // For images, we'll use quality-based compression
  // Start with high quality and reduce if needed
  const inputSize = fs.statSync(inputPath).size;
  const targetSize = targetSizeMb * 1024 * 1024;

  // Calculate quality factor (1-31, lower is better)
  // If input is much larger than target, use lower quality
  const ratio = inputSize / targetSize;
  const quality = Math.min(31, Math.max(2, Math.floor(ratio * 5)));

  logger.info("Using image compression settings", jobId, { quality, ratio });

  const args = ["-i", inputPath, "-q:v", quality.toString(), "-y", outputPath];

  await runFfmpeg(args, jobId);

  // Check if we hit the target, if not, reduce quality further
  const outputSize = fs.statSync(outputPath).size;
  if (outputSize > targetSize && quality < 31) {
    logger.info(
      "Output still too large, recompressing with lower quality",
      jobId,
      {
        outputSize,
        targetSize,
      }
    );

    const newQuality = Math.min(31, quality + 5);
    const retryArgs = [
      "-i",
      inputPath,
      "-q:v",
      newQuality.toString(),
      "-y",
      outputPath,
    ];

    await runFfmpeg(retryArgs, jobId);
  }
}

/**
 * Compress an audio file using ffmpeg
 */
async function compressAudio(
  inputPath: string,
  outputPath: string,
  targetSizeMb: number,
  jobId: string
): Promise<void> {
  // Get duration for bitrate calculation
  const duration = await getVideoDuration(inputPath);
  logger.info("Audio duration detected", jobId, { durationSeconds: duration });

  // Calculate target bitrate
  const targetBits = targetSizeMb * 1024 * 1024 * 8;
  const bitrate = Math.floor(targetBits / duration / 1000); // kbps

  // Clamp to reasonable values for audio (32-320 kbps)
  const clampedBitrate = Math.max(32, Math.min(bitrate, 320));

  logger.info("Using audio compression settings", jobId, {
    bitrate: clampedBitrate,
  });

  const args = [
    "-i",
    inputPath,
    "-c:a",
    "aac",
    "-b:a",
    `${clampedBitrate}k`,
    "-y",
    outputPath,
  ];

  await runFfmpeg(args, jobId);
}

/**
 * Run ffmpeg with the given arguments
 */
function runFfmpeg(args: string[], jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info("Running ffmpeg", jobId, { args: args.join(" ") });

    const process = spawn(FFMPEG_PATH, args);
    let stderr = "";

    process.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    process.on("close", (code: number | null) => {
      if (code !== 0) {
        logger.error("ffmpeg failed", jobId, { code, stderr });
        reject(new Error(`ffmpeg failed with code ${code}: ${stderr}`));
        return;
      }

      logger.info("ffmpeg completed successfully", jobId);
      resolve();
    });

    process.on("error", (err: Error) => {
      logger.error("ffmpeg process error", jobId, { error: err.message });
      reject(err);
    });
  });
}

/**
 * Get the appropriate output content type for a media type
 */
export function getOutputContentType(mediaType: MediaType): string {
  switch (mediaType) {
    case "video":
      return "video/mp4";
    case "image":
      return "image/jpeg";
    case "audio":
      return "audio/aac";
    default:
      return "application/octet-stream";
  }
}

/**
 * Get the appropriate output file extension for a media type
 */
export function getOutputExtension(mediaType: MediaType): string {
  switch (mediaType) {
    case "video":
      return ".mp4";
    case "image":
      return ".jpg";
    case "audio":
      return ".aac";
    default:
      return "";
  }
}

/**
 * Compress a media file
 *
 * @param inputPath - Path to input file
 * @param outputPath - Path for output file
 * @param mediaType - Type of media (video, image, audio)
 * @param targetSizeMb - Target maximum file size in MB
 * @param jobId - Job ID for logging
 */
export async function compressMedia(
  inputPath: string,
  outputPath: string,
  mediaType: MediaType,
  targetSizeMb: number,
  jobId: string
): Promise<void> {
  // Validate ffmpeg is available
  if (!fs.existsSync(FFMPEG_PATH)) {
    throw new Error(
      `ffmpeg not found at ${FFMPEG_PATH}. Ensure the ffmpeg layer is attached.`
    );
  }

  logger.info("Starting compression", jobId, {
    inputPath,
    outputPath,
    mediaType,
    targetSizeMb,
  });

  switch (mediaType) {
    case "video":
      await compressVideo(inputPath, outputPath, targetSizeMb, jobId);
      break;
    case "image":
      await compressImage(inputPath, outputPath, targetSizeMb, jobId);
      break;
    case "audio":
      await compressAudio(inputPath, outputPath, targetSizeMb, jobId);
      break;
    default:
      throw new Error(`Unsupported media type: ${mediaType}`);
  }

  // Verify output was created
  if (!fs.existsSync(outputPath)) {
    throw new Error(
      `Compression failed: output file not created at ${outputPath}`
    );
  }

  const outputSize = fs.statSync(outputPath).size;
  logger.info("Compression completed", jobId, { outputSizeBytes: outputSize });
}
