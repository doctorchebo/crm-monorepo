/**
 * Media Analyzer Service
 * Analyzes media files using ffprobe to extract metadata and detect media types
 *
 * Primary Use Case:
 * - Detecting GIFs vs Videos from WhatsApp Cloud API
 *   (WhatsApp sends GIFs as video/mp4 with no distinguishing metadata in the webhook)
 *
 * GIF Detection Heuristics:
 * - No audio track (GIFs never have audio)
 * - Short duration (typically < 15 seconds)
 * - Small file size (typically < 5MB)
 * - Often low frame count relative to duration
 *
 * Architecture:
 * - Uses ffprobe (from ffmpeg) for media analysis
 * - Uses shared FFmpegConfig for binary path resolution
 * - Configurable detection thresholds
 * - Returns structured analysis results for extensibility
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FFmpegConfig } from '@shared/services/ffmpeg.config';
import * as ffmpegModule from 'fluent-ffmpeg';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Handle default exports for ESM compatibility
const ffmpeg = (ffmpegModule as any).default || ffmpegModule;

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * GIF Detection Configuration
 * These thresholds are tuned based on typical GIF characteristics
 */
export const GIF_DETECTION_CONFIG = {
  /** Maximum duration in seconds for a video to be considered a GIF */
  MAX_DURATION_SECONDS: 15,

  /** Maximum file size in bytes for a video to be considered a GIF (5MB) */
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,

  /** Minimum confidence score (0-1) to classify as GIF */
  MIN_CONFIDENCE: 0.6,

  /** Weight for "no audio" factor in confidence calculation */
  WEIGHT_NO_AUDIO: 0.5,

  /** Weight for "short duration" factor in confidence calculation */
  WEIGHT_SHORT_DURATION: 0.3,

  /** Weight for "small file size" factor in confidence calculation */
  WEIGHT_SMALL_SIZE: 0.2,
} as const;

// ============================================================
// TYPES
// ============================================================

/**
 * Raw ffprobe stream information
 */
interface FfprobeStream {
  index: number;
  codec_name?: string;
  codec_type: 'video' | 'audio' | 'subtitle' | 'data';
  width?: number;
  height?: number;
  duration?: string;
  bit_rate?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  nb_frames?: string;
}

/**
 * Raw ffprobe format information
 */
interface FfprobeFormat {
  filename: string;
  nb_streams: number;
  format_name: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
}

/**
 * Raw ffprobe output
 */
interface FfprobeData {
  streams: FfprobeStream[];
  format: FfprobeFormat;
}

/**
 * Structured media analysis result
 */
export interface MediaAnalysisResult {
  /** Duration in seconds */
  duration: number;

  /** Whether the media has an audio track */
  hasAudio: boolean;

  /** Video width in pixels (0 if no video stream) */
  width: number;

  /** Video height in pixels (0 if no video stream) */
  height: number;

  /** Frame rate as a number (e.g., 30, 24, 15) */
  frameRate: number;

  /** File size in bytes */
  fileSize: number;

  /** Number of video frames (if available) */
  frameCount: number;

  /** Video codec name (e.g., 'h264', 'vp9') */
  videoCodec: string;

  /** Audio codec name (e.g., 'aac', 'mp3') or null if no audio */
  audioCodec: string | null;

  /** Container format (e.g., 'mp4', 'mov') */
  containerFormat: string;

  /** Confidence score that this is a GIF (0-1) */
  gifConfidence: number;

  /** Whether this media is likely a GIF based on analysis */
  isLikelyGif: boolean;

  /** Detailed breakdown of GIF detection factors */
  gifDetectionFactors: {
    hasNoAudio: boolean;
    isShortDuration: boolean;
    isSmallFileSize: boolean;
    durationSeconds: number;
    fileSizeBytes: number;
  };
}

/**
 * Options for media analysis
 */
export interface MediaAnalysisOptions {
  /** Custom GIF detection thresholds (optional) */
  gifConfig?: Partial<typeof GIF_DETECTION_CONFIG>;
}

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class MediaAnalyzerService implements OnModuleInit {
  private readonly logger = new Logger(MediaAnalyzerService.name);
  private ffprobeAvailable = false;

  async onModuleInit() {
    await this.initializeFfprobe();
  }

  /**
   * Initialize ffprobe - configure fluent-ffmpeg with bundled binary paths
   * Uses shared FFmpegConfig for consistent path resolution
   */
  private async initializeFfprobe(): Promise<void> {
    // Configure fluent-ffmpeg with the resolved binary paths
    FFmpegConfig.configureFluetFfmpeg(ffmpeg);

    this.logger.log(
      `FFmpeg path: ${FFmpegConfig.ffmpegPath || '(system PATH)'}`,
    );
    this.logger.log(
      `FFprobe path: ${FFmpegConfig.ffprobePath || '(system PATH)'}`,
    );

    // Test ffprobe availability
    try {
      await this.testFfprobe();
      this.ffprobeAvailable = true;
      this.logger.log('FFprobe is available for media analysis');
    } catch (error) {
      this.logger.warn(
        `FFprobe not available: ${error.message}. Media analysis will be disabled.`,
      );
    }
  }

  /**
   * Test if ffprobe is working
   */
  private async testFfprobe(): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg.getAvailableFormats((err: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Check if ffprobe is available
   */
  isAvailable(): boolean {
    return this.ffprobeAvailable;
  }

  /**
   * Analyze a media buffer and return detailed metadata
   *
   * @param buffer - The media file as a Buffer
   * @param mimeType - The declared MIME type (e.g., 'video/mp4')
   * @param options - Analysis options
   * @returns Detailed analysis result including GIF detection
   */
  async analyzeBuffer(
    buffer: Buffer,
    mimeType: string,
    options?: MediaAnalysisOptions,
  ): Promise<MediaAnalysisResult> {
    if (!this.ffprobeAvailable) {
      this.logger.warn(
        'FFprobe not available, returning default analysis result',
      );
      return this.createDefaultResult(buffer.length);
    }

    const tempDir = os.tmpdir();
    const extension = this.getExtensionFromMimeType(mimeType);
    const tempPath = path.join(
      tempDir,
      `media-analyze-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`,
    );

    try {
      // Write buffer to temp file for ffprobe analysis
      await fs.writeFile(tempPath, buffer);

      // Run ffprobe analysis
      const probeData = await this.runFfprobe(tempPath);

      // Parse and structure the results
      const result = this.parseProbeData(probeData, buffer.length, options);

      this.logger.log(
        `[Media Analysis] duration=${result.duration.toFixed(2)}s, hasAudio=${result.hasAudio}, ` +
          `size=${(result.fileSize / 1024).toFixed(1)}KB, gifConfidence=${(result.gifConfidence * 100).toFixed(0)}%, ` +
          `isLikelyGif=${result.isLikelyGif}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `[Media Analysis] Failed to analyze media: ${error.message}`,
      );
      return this.createDefaultResult(buffer.length);
    } finally {
      // Cleanup temp file
      await this.cleanupFile(tempPath);
    }
  }

  /**
   * Analyze a media file from a file path
   *
   * @param filePath - Path to the media file
   * @param options - Analysis options
   * @returns Detailed analysis result including GIF detection
   */
  async analyzeFile(
    filePath: string,
    options?: MediaAnalysisOptions,
  ): Promise<MediaAnalysisResult> {
    if (!this.ffprobeAvailable) {
      this.logger.warn(
        'FFprobe not available, returning default analysis result',
      );
      const stats = await fs.stat(filePath);
      return this.createDefaultResult(stats.size);
    }

    try {
      const stats = await fs.stat(filePath);
      const probeData = await this.runFfprobe(filePath);
      return this.parseProbeData(probeData, stats.size, options);
    } catch (error) {
      this.logger.error(
        `[Media Analysis] Failed to analyze file: ${error.message}`,
      );
      const stats = await fs.stat(filePath).catch(() => ({ size: 0 }));
      return this.createDefaultResult(stats.size);
    }
  }

  /**
   * Quick check if a video buffer is likely a GIF
   * Convenience method that only returns the boolean result
   */
  async isLikelyGif(
    buffer: Buffer,
    mimeType: string = 'video/mp4',
  ): Promise<boolean> {
    const result = await this.analyzeBuffer(buffer, mimeType);
    return result.isLikelyGif;
  }

  /**
   * Run ffprobe on a file and return raw probe data
   */
  private runFfprobe(filePath: string): Promise<FfprobeData> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err: Error | null, data: FfprobeData) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * Parse ffprobe data into structured analysis result
   */
  private parseProbeData(
    data: FfprobeData,
    fileSize: number,
    options?: MediaAnalysisOptions,
  ): MediaAnalysisResult {
    const config = { ...GIF_DETECTION_CONFIG, ...options?.gifConfig };

    // Extract stream information
    const videoStream = data.streams.find((s) => s.codec_type === 'video');
    const audioStream = data.streams.find((s) => s.codec_type === 'audio');

    // Parse duration
    const duration = parseFloat(data.format.duration || '0');

    // Parse frame rate
    let frameRate = 0;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      frameRate = den ? num / den : num;
    }

    // Parse frame count
    const frameCount = parseInt(videoStream?.nb_frames || '0', 10);

    // Calculate GIF detection factors
    const hasNoAudio = !audioStream;
    const isShortDuration = duration <= config.MAX_DURATION_SECONDS;
    const isSmallFileSize = fileSize <= config.MAX_FILE_SIZE_BYTES;

    // Calculate confidence score
    let gifConfidence = 0;
    if (hasNoAudio) gifConfidence += config.WEIGHT_NO_AUDIO;
    if (isShortDuration) gifConfidence += config.WEIGHT_SHORT_DURATION;
    if (isSmallFileSize) gifConfidence += config.WEIGHT_SMALL_SIZE;

    // Determine if likely GIF
    // Primary factor: NO AUDIO (this is the most reliable indicator)
    // Secondary factors: short duration and small size add confidence
    const isLikelyGif = hasNoAudio && gifConfidence >= config.MIN_CONFIDENCE;

    return {
      duration,
      hasAudio: !!audioStream,
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      frameRate,
      fileSize,
      frameCount,
      videoCodec: videoStream?.codec_name || 'unknown',
      audioCodec: audioStream?.codec_name || null,
      containerFormat: data.format.format_name || 'unknown',
      gifConfidence,
      isLikelyGif,
      gifDetectionFactors: {
        hasNoAudio,
        isShortDuration,
        isSmallFileSize,
        durationSeconds: duration,
        fileSizeBytes: fileSize,
      },
    };
  }

  /**
   * Create a default result when analysis is not possible
   */
  private createDefaultResult(fileSize: number): MediaAnalysisResult {
    return {
      duration: 0,
      hasAudio: true, // Assume has audio (conservative default)
      width: 0,
      height: 0,
      frameRate: 0,
      fileSize,
      frameCount: 0,
      videoCodec: 'unknown',
      audioCodec: null,
      containerFormat: 'unknown',
      gifConfidence: 0,
      isLikelyGif: false,
      gifDetectionFactors: {
        hasNoAudio: false,
        isShortDuration: false,
        isSmallFileSize: false,
        durationSeconds: 0,
        fileSizeBytes: fileSize,
      },
    };
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'video/webm': '.webm',
      'video/x-msvideo': '.avi',
      'video/x-matroska': '.mkv',
      'image/gif': '.gif',
    };
    return mimeToExt[mimeType.toLowerCase()] || '.mp4';
  }

  /**
   * Safely cleanup a temporary file
   */
  private async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
