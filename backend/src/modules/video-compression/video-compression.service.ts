/**
 * Video Compression Service
 *
 * Core service for compressing videos using FFmpeg.
 * Optimized for WhatsApp Cloud API requirements:
 * - MP4 container (H.264 video + AAC audio)
 * - Maximum 16MB file size
 * - Maintains acceptable quality while meeting size constraints
 *
 * Uses a two-pass approach when needed:
 * 1. First attempt with CRF (constant quality) and maxrate
 * 2. If still too large, calculate target bitrate for exact size
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FFmpegConfig } from '@shared/services/ffmpeg.config';
import * as ffmpegModule from 'fluent-ffmpeg';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  COMPRESSION_PRESETS,
  CompressionPreset,
  CompressionResult,
  CompressionSettings,
  WHATSAPP_SEND_LIMITS,
} from './video-compression.types';

/**
 * Progress callback type for compression progress updates
 * @param percent - Current progress percentage (0-100)
 * @param stage - Current compression stage (e.g., 'downloading', 'pass1', 'pass2', 'uploading')
 */
export type CompressionProgressCallback = (
  percent: number,
  stage?: string,
) => void;

// Handle default exports for ESM compatibility
const ffmpeg = (ffmpegModule as any).default || ffmpegModule;

/**
 * Video metadata extracted from ffprobe
 */
interface VideoMetadata {
  width: number;
  height: number;
  duration: number; // in seconds
  bitrate: number; // in kbps
  fps: number;
  codec: string;
  audioCodec?: string;
  audioBitrate?: number;
}

@Injectable()
export class VideoCompressionService implements OnModuleInit {
  private readonly logger = new Logger(VideoCompressionService.name);
  private ffmpegAvailable = false;

  async onModuleInit() {
    // Configure ffmpeg with bundled binaries
    FFmpegConfig.configureFluetFfmpeg(ffmpeg);

    // Check FFmpeg availability
    try {
      await this.checkFfmpegAvailability();
      this.ffmpegAvailable = true;
      this.logger.log('VideoCompressionService initialized - FFmpeg available');
    } catch (error) {
      this.ffmpegAvailable = false;
      this.logger.warn(
        'FFmpeg not available - video compression will be disabled. ' +
          'Install FFmpeg to enable video compression.',
      );
    }
  }

  /**
   * Check if FFmpeg is available on the system
   */
  private checkFfmpegAvailability(): Promise<void> {
    return new Promise((resolve, reject) => {
      const testCommand = ffmpeg();
      testCommand.ffprobe((err: any) => {
        if (err && err.message?.toLowerCase().includes('not found')) {
          reject(new Error('FFmpeg not found'));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Check if compression is available
   */
  isAvailable(): boolean {
    return this.ffmpegAvailable;
  }

  /**
   * Compress a video buffer to meet WhatsApp size limits
   *
   * @param buffer - Original video buffer
   * @param mimeType - Original MIME type
   * @param preset - Compression preset (fast, balanced, quality)
   * @param targetSize - Target file size in bytes (default: WhatsApp limit)
   * @param onProgress - Optional callback for progress updates (0-100)
   * @returns Compression result with the compressed buffer
   */
  async compressVideo(
    buffer: Buffer,
    mimeType: string,
    preset: CompressionPreset = 'balanced',
    targetSize: number = WHATSAPP_SEND_LIMITS.video,
    onProgress?: CompressionProgressCallback,
  ): Promise<CompressionResult & { buffer?: Buffer }> {
    if (!this.ffmpegAvailable) {
      return {
        success: false,
        error: 'FFmpeg not available for video compression',
      };
    }

    const startTime = Date.now();
    const tempDir = await this.createTempDir('video-compress-');

    try {
      // Write input to temp file
      const inputPath = path.join(
        tempDir,
        `input${this.getExtension(mimeType)}`,
      );
      const outputPath = path.join(tempDir, 'output.mp4');
      await fs.writeFile(inputPath, buffer);

      // Get video metadata
      const metadata = await this.getVideoMetadata(inputPath);
      this.logger.log(
        `[Compression] Input: ${(buffer.length / 1024 / 1024).toFixed(2)}MB, ` +
          `${metadata.width}x${metadata.height}, ${metadata.duration.toFixed(1)}s, ` +
          `${metadata.bitrate}kbps, ${metadata.codec}`,
      );

      // Get compression settings
      const settings = COMPRESSION_PRESETS[preset];

      // Progress tracking - we don't know how many passes we'll need,
      // so we allocate progress dynamically:
      // - First pass: 0-70% (most common case completes here)
      // - Second pass (if needed): 70-90%
      // - Third pass (if needed): 90-100%
      const reportProgress = (passProgress: number, pass: number) => {
        if (!onProgress) return;

        let overallProgress: number;
        switch (pass) {
          case 1:
            // First pass: 0-70%
            overallProgress = Math.round(passProgress * 0.7);
            break;
          case 2:
            // Second pass: 70-90%
            overallProgress = 70 + Math.round(passProgress * 0.2);
            break;
          case 3:
            // Third pass: 90-100%
            overallProgress = 90 + Math.round(passProgress * 0.1);
            break;
          default:
            overallProgress = passProgress;
        }
        onProgress(Math.min(overallProgress, 99), `pass${pass}`);
      };

      // First pass: CRF-based compression with maxrate
      await this.compressWithCrf(
        inputPath,
        outputPath,
        metadata,
        settings,
        targetSize,
        (p) => reportProgress(p, 1),
      );

      // Check output size
      let outputStats = await fs.stat(outputPath);
      let outputSize = outputStats.size;

      this.logger.log(
        `[Compression] First pass result: ${(outputSize / 1024 / 1024).toFixed(2)}MB ` +
          `(target: ${(targetSize / 1024 / 1024).toFixed(2)}MB)`,
      );

      // If still too large, do a second pass with calculated bitrate
      if (outputSize > targetSize) {
        this.logger.log(
          '[Compression] First pass exceeded target, running second pass...',
        );

        const secondPassOutput = path.join(tempDir, 'output_v2.mp4');
        await this.compressWithTargetBitrate(
          inputPath,
          secondPassOutput,
          metadata,
          settings,
          targetSize,
          (p) => reportProgress(p, 2),
        );

        outputStats = await fs.stat(secondPassOutput);
        outputSize = outputStats.size;

        this.logger.log(
          `[Compression] Second pass result: ${(outputSize / 1024 / 1024).toFixed(2)}MB`,
        );

        // If still too large, we need to reduce resolution
        if (outputSize > targetSize) {
          this.logger.log(
            '[Compression] Still too large, reducing resolution...',
          );

          const thirdPassOutput = path.join(tempDir, 'output_v3.mp4');
          await this.compressWithReducedResolution(
            inputPath,
            thirdPassOutput,
            metadata,
            settings,
            targetSize,
            (p) => reportProgress(p, 3),
          );

          outputStats = await fs.stat(thirdPassOutput);
          outputSize = outputStats.size;

          this.logger.log(
            `[Compression] Third pass (reduced res) result: ${(outputSize / 1024 / 1024).toFixed(2)}MB`,
          );

          if (outputSize > targetSize) {
            // Still too large - likely an edge case
            this.logger.warn(
              `[Compression] Could not achieve target size. Final: ${(outputSize / 1024 / 1024).toFixed(2)}MB`,
            );
          }

          // Use third pass output
          const compressedBuffer = await fs.readFile(thirdPassOutput);
          return this.buildResult(
            compressedBuffer,
            buffer.length,
            startTime,
            metadata,
            thirdPassOutput,
          );
        }

        // Use second pass output
        const compressedBuffer = await fs.readFile(secondPassOutput);
        return this.buildResult(
          compressedBuffer,
          buffer.length,
          startTime,
          metadata,
          secondPassOutput,
        );
      }

      // First pass was sufficient
      const compressedBuffer = await fs.readFile(outputPath);
      return this.buildResult(
        compressedBuffer,
        buffer.length,
        startTime,
        metadata,
        outputPath,
      );
    } catch (error) {
      this.logger.error(`[Compression] Failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      };
    } finally {
      // Clean up temp directory
      await this.cleanupTempDir(tempDir);
    }
  }

  /**
   * Build compression result from output file
   */
  private async buildResult(
    buffer: Buffer,
    originalSize: number,
    startTime: number,
    metadata: VideoMetadata,
    outputPath: string,
  ): Promise<CompressionResult & { buffer: Buffer }> {
    // Get output metadata for final dimensions
    let outputMetadata: VideoMetadata;
    try {
      outputMetadata = await this.getVideoMetadata(outputPath);
    } catch {
      outputMetadata = metadata;
    }

    return {
      success: true,
      buffer,
      compressedFileSize: buffer.length,
      compressionRatio: originalSize / buffer.length,
      processingTimeMs: Date.now() - startTime,
      metadata: {
        width: outputMetadata.width,
        height: outputMetadata.height,
        duration: outputMetadata.duration,
        bitrate: outputMetadata.bitrate,
        codec: 'h264',
      },
    };
  }

  /**
   * First pass: CRF-based compression with maxrate limit
   * This produces good quality but may exceed target size
   */
  private compressWithCrf(
    inputPath: string,
    outputPath: string,
    metadata: VideoMetadata,
    settings: CompressionSettings,
    targetSize: number,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          `-preset ${settings.ffmpegPreset}`,
          `-crf ${settings.crf}`,
          `-maxrate ${settings.maxBitrate}k`,
          `-bufsize ${settings.maxBitrate * 2}k`,
          `-b:a ${settings.audioBitrate}k`,
          '-movflags +faststart', // Enable fast start for web playback
          '-pix_fmt yuv420p', // Ensure compatibility
        ]);

      // Apply frame rate limit if specified
      if (settings.targetFps > 0 && metadata.fps > settings.targetFps) {
        command = command.outputOptions([`-r ${settings.targetFps}`]);
      }

      command
        .output(outputPath)
        .on('start', (cmd) => {
          this.logger.debug(`[FFmpeg] CRF pass: ${cmd}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            this.logger.debug(
              `[FFmpeg] Progress: ${progress.percent.toFixed(1)}%`,
            );
            onProgress?.(progress.percent);
          }
        })
        .on('error', (err) => reject(err))
        .on('end', () => resolve())
        .run();
    });
  }

  /**
   * Second pass: Calculate exact bitrate to hit target size
   */
  private compressWithTargetBitrate(
    inputPath: string,
    outputPath: string,
    metadata: VideoMetadata,
    settings: CompressionSettings,
    targetSize: number,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    // Calculate target bitrate to achieve target size
    // Formula: bitrate = (targetSize * 8) / duration
    // Leave 10% margin for container overhead
    const marginFactor = 0.9;
    const targetBits = targetSize * 8 * marginFactor;
    const targetBitrate = Math.floor(targetBits / metadata.duration / 1000); // kbps

    // Subtract audio bitrate to get video bitrate
    const videoBitrate = Math.max(targetBitrate - settings.audioBitrate, 500);

    this.logger.log(
      `[Compression] Calculated bitrate: ${videoBitrate}k video + ${settings.audioBitrate}k audio`,
    );

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          `-preset ${settings.ffmpegPreset}`,
          `-b:v ${videoBitrate}k`,
          `-maxrate ${videoBitrate * 1.2}k`,
          `-bufsize ${videoBitrate * 2}k`,
          `-b:a ${settings.audioBitrate}k`,
          '-movflags +faststart',
          '-pix_fmt yuv420p',
          '-pass 1', // Use two-pass encoding for better quality at target bitrate
        ]);

      // For two-pass, run first pass to /dev/null then second pass to output
      // But for simplicity, we use single-pass ABR here
      command = ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          `-preset ${settings.ffmpegPreset}`,
          `-b:v ${videoBitrate}k`,
          `-maxrate ${videoBitrate}k`,
          `-bufsize ${videoBitrate}k`,
          `-b:a ${settings.audioBitrate}k`,
          '-movflags +faststart',
          '-pix_fmt yuv420p',
        ]);

      if (settings.targetFps > 0 && metadata.fps > settings.targetFps) {
        command = command.outputOptions([`-r ${settings.targetFps}`]);
      }

      command
        .output(outputPath)
        .on('start', (cmd) => {
          this.logger.debug(`[FFmpeg] Target bitrate pass: ${cmd}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            onProgress?.(progress.percent);
          }
        })
        .on('error', (err) => reject(err))
        .on('end', () => resolve())
        .run();
    });
  }

  /**
   * Third pass: Reduce resolution to achieve target size
   * Used when bitrate alone isn't enough
   */
  private compressWithReducedResolution(
    inputPath: string,
    outputPath: string,
    metadata: VideoMetadata,
    settings: CompressionSettings,
    targetSize: number,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    // Calculate scale factor based on how much we need to reduce
    // Start with 720p max for WhatsApp compatibility
    let targetHeight = Math.min(metadata.height, 720);

    // If original was already <= 720p, scale down further
    if (metadata.height <= 720) {
      targetHeight = Math.min(metadata.height, 480);
    }

    // Calculate proportional width (must be even for h264)
    const aspectRatio = metadata.width / metadata.height;
    let targetWidth = Math.round(targetHeight * aspectRatio);
    targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth + 1;
    targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight + 1;

    // Recalculate bitrate for reduced resolution
    const marginFactor = 0.85;
    const targetBits = targetSize * 8 * marginFactor;
    const targetBitrate = Math.floor(targetBits / metadata.duration / 1000);
    const videoBitrate = Math.max(targetBitrate - settings.audioBitrate, 400);

    this.logger.log(
      `[Compression] Reducing resolution to ${targetWidth}x${targetHeight}, bitrate: ${videoBitrate}k`,
    );

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size(`${targetWidth}x${targetHeight}`)
        .outputOptions([
          `-preset ${settings.ffmpegPreset}`,
          `-b:v ${videoBitrate}k`,
          `-maxrate ${videoBitrate}k`,
          `-bufsize ${videoBitrate}k`,
          `-b:a ${Math.min(settings.audioBitrate, 96)}k`, // Reduce audio too
          '-movflags +faststart',
          '-pix_fmt yuv420p',
          `-r ${Math.min(settings.targetFps || 30, 30)}`, // Cap at 30fps
        ])
        .output(outputPath)
        .on('start', (cmd) => {
          this.logger.debug(`[FFmpeg] Reduced resolution pass: ${cmd}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            onProgress?.(progress.percent);
          }
        })
        .on('error', (err) => reject(err))
        .on('end', () => resolve())
        .run();
    });
  }

  /**
   * Get video metadata using ffprobe
   */
  async getVideoMetadata(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) {
          reject(new Error(`FFprobe failed: ${err.message}`));
          return;
        }

        const videoStream = data.streams?.find(
          (stream) => stream.codec_type === 'video',
        );
        const audioStream = data.streams?.find(
          (stream) => stream.codec_type === 'audio',
        );

        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        // Calculate FPS from frame rate string (e.g., "30/1" or "29.97")
        let fps = 30;
        if (videoStream.r_frame_rate) {
          const parts = videoStream.r_frame_rate.split('/');
          if (parts.length === 2) {
            fps = parseInt(parts[0]) / parseInt(parts[1]);
          } else {
            fps = parseFloat(videoStream.r_frame_rate);
          }
        }

        resolve({
          width: videoStream.width || 1920,
          height: videoStream.height || 1080,
          duration: parseFloat(data.format?.duration || '0'),
          bitrate: parseInt(data.format?.bit_rate || '0') / 1000, // Convert to kbps
          fps,
          codec: videoStream.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name,
          audioBitrate: audioStream?.bit_rate
            ? parseInt(audioStream.bit_rate) / 1000
            : undefined,
        });
      });
    });
  }

  /**
   * Create a temporary directory
   */
  private async createTempDir(prefix: string): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    return tempDir;
  }

  /**
   * Clean up temporary directory
   */
  private async cleanupTempDir(tempDir: string): Promise<void> {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(
        `Failed to clean up temp dir ${tempDir}: ${error.message}`,
      );
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getExtension(mimeType: string): string {
    const extensions: Record<string, string> = {
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
      'video/webm': '.webm',
      'video/3gpp': '.3gp',
      'video/x-matroska': '.mkv',
    };
    return extensions[mimeType] || '.mp4';
  }
}
