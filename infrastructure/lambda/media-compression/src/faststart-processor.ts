/**
 * Faststart Processor
 *
 * Ensures MP4 videos have the moov atom at the beginning of the file
 * (faststart layout) for proper streaming playback on WhatsApp.
 *
 * WhatsApp Video Requirements:
 * - Format: MP4 with H.264 video codec and AAC audio codec
 * - The moov atom must be at the beginning of the file (faststart)
 *   so WhatsApp can stream without downloading the entire file
 *
 * How it works:
 * - Scans the first few KB of the file for the 'moov' atom
 * - If not found, remuxes with `ffmpeg -c copy -movflags +faststart`
 * - This is a remux (no re-encoding), so it's fast and lossless
 * - The result replaces the original file in S3
 *
 * This module is designed to run inside the media-compression Lambda
 * as a pre-processing step during thumbnail generation for videos.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

// ffmpeg binary path (from Lambda Layer)
const FFMPEG_PATH = process.env.FFMPEG_PATH || "/opt/bin/ffmpeg";

/** Byte sequence for 'moov' atom header */
const MOOV_ATOM = Buffer.from("moov", "ascii");

/** How many bytes to scan for moov atom (covers typical MP4 headers) */
const FASTSTART_SCAN_BYTES = 4096;

/**
 * Result of faststart processing
 */
export interface FaststartResult {
  /** Whether the file was modified */
  wasModified: boolean;
  /** Path to the output file (same as input if not modified) */
  outputPath: string;
  /** Original file size in bytes */
  originalSize: number;
  /** Output file size in bytes (should be ~same for remux) */
  outputSize: number;
}

/**
 * Check if a file buffer already has the moov atom near the beginning.
 *
 * In a faststart MP4 the atom order is typically:
 *   ftyp → moov → mdat
 *
 * The moov atom usually appears within the first few KB.
 * If we find it in the first FASTSTART_SCAN_BYTES bytes, it's already optimized.
 */
export function needsFaststart(buffer: Buffer): boolean {
  const scanLength = Math.min(buffer.length, FASTSTART_SCAN_BYTES);
  const scanRegion = buffer.subarray(0, scanLength);
  return !scanRegion.includes(MOOV_ATOM);
}

/**
 * Check if a MIME type is an MP4 video that could benefit from faststart.
 *
 * Only MP4 containers have moov atoms. Other video formats
 * (WebM, MKV, etc.) use different container structures.
 */
export function isFaststartCandidate(mimeType: string): boolean {
  const mp4Types = ["video/mp4", "video/quicktime", "video/x-m4v"];
  return mp4Types.includes(mimeType.toLowerCase());
}

/**
 * Apply faststart to an MP4 file using ffmpeg.
 *
 * Remuxes the file with `-movflags +faststart` which moves the moov atom
 * to the beginning of the file. This is a copy operation (no re-encoding),
 * so it's fast and produces identical quality.
 *
 * @param inputPath  - Path to the input MP4 file
 * @param tempDir    - Temporary directory for the output file
 * @param jobId      - Job ID for structured logging
 * @returns FaststartResult with output path and metadata
 */
export async function applyFaststart(
  inputPath: string,
  tempDir: string,
  jobId: string,
): Promise<FaststartResult> {
  const inputStats = fs.statSync(inputPath);
  const originalSize = inputStats.size;

  // Read the first bytes to check if faststart is needed
  const fd = fs.openSync(inputPath, "r");
  const scanBuffer = Buffer.alloc(Math.min(FASTSTART_SCAN_BYTES, originalSize));
  fs.readSync(fd, scanBuffer, 0, scanBuffer.length, 0);
  fs.closeSync(fd);

  if (!needsFaststart(scanBuffer)) {
    logger.info("Video already has faststart, skipping remux", jobId);
    return {
      wasModified: false,
      outputPath: inputPath,
      originalSize,
      outputSize: originalSize,
    };
  }

  logger.info("Applying faststart remux", jobId, {
    inputPath,
    originalSize,
  });

  // Output to a separate file to avoid corrupting the input
  const outputPath = path.join(
    tempDir,
    `${jobId}-faststart${path.extname(inputPath)}`,
  );

  await runFaststartRemux(inputPath, outputPath, jobId);

  // Verify the output was created and has faststart
  if (!fs.existsSync(outputPath)) {
    logger.warn("Faststart output file not created, using original", jobId);
    return {
      wasModified: false,
      outputPath: inputPath,
      originalSize,
      outputSize: originalSize,
    };
  }

  const outputStats = fs.statSync(outputPath);

  // Verify moov atom is now at the beginning
  const verifyFd = fs.openSync(outputPath, "r");
  const verifyBuffer = Buffer.alloc(
    Math.min(FASTSTART_SCAN_BYTES, outputStats.size),
  );
  fs.readSync(verifyFd, verifyBuffer, 0, verifyBuffer.length, 0);
  fs.closeSync(verifyFd);

  if (needsFaststart(verifyBuffer)) {
    logger.warn(
      "Faststart remux did not move moov atom, using original",
      jobId,
    );
    // Clean up failed output
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // ignore cleanup errors
    }
    return {
      wasModified: false,
      outputPath: inputPath,
      originalSize,
      outputSize: originalSize,
    };
  }

  logger.info("Faststart applied successfully", jobId, {
    originalSize,
    outputSize: outputStats.size,
    sizeDelta: outputStats.size - originalSize,
  });

  return {
    wasModified: true,
    outputPath,
    originalSize,
    outputSize: outputStats.size,
  };
}

/**
 * Run ffmpeg to remux an MP4 with faststart.
 *
 * Uses `-c copy` (stream copy) so no re-encoding happens.
 * The only change is the container layout: moov atom is moved
 * from the end to the beginning of the file.
 */
function runFaststartRemux(
  inputPath: string,
  outputPath: string,
  jobId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-i",
      inputPath,
      "-c",
      "copy", // copy all streams, no re-encoding
      "-movflags",
      "+faststart", // move moov atom to beginning
      "-y", // overwrite output
      outputPath,
    ];

    logger.info("Running faststart remux", jobId, {
      command: `ffmpeg ${args.join(" ")}`,
    });

    const proc = spawn(FFMPEG_PATH, args);
    let stderr = "";

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code: number | null) => {
      if (code !== 0) {
        logger.error("Faststart remux failed", jobId, { code, stderr });
        reject(
          new Error(`ffmpeg faststart failed with code ${code}: ${stderr}`),
        );
        return;
      }

      logger.info("Faststart remux completed", jobId);
      resolve();
    });

    proc.on("error", (err: Error) => {
      logger.error("Faststart remux process error", jobId, {
        error: err.message,
      });
      reject(err);
    });
  });
}
