/**
 * FFmpeg/FFprobe Configuration
 *
 * Centralized configuration for FFmpeg and FFprobe binary paths.
 * This ensures consistent path resolution across all services that use
 * FFmpeg/FFprobe (MediaAnalyzerService, ThumbnailProcessorService, etc.)
 *
 * Binary Sources (in priority order):
 * 1. @ffmpeg-installer/ffmpeg - Bundled ffmpeg binary
 * 2. ffmpeg-static - Alternative bundled ffmpeg
 * 3. @ffprobe-installer/ffprobe - Bundled ffprobe binary
 * 4. System PATH - Fallback to system-installed binaries
 *
 * Architecture Note:
 * - ffmpeg and ffprobe come from SEPARATE npm packages
 * - @ffmpeg-installer/ffmpeg provides ffmpeg.exe only
 * - @ffprobe-installer/ffprobe provides ffprobe.exe only
 * - Do NOT try to derive one path from the other
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('FFmpegConfig');

// ============================================================
// PATH RESOLUTION
// ============================================================

/**
 * Resolved FFmpeg binary path
 * Will be undefined if not found (falls back to system PATH)
 */
let resolvedFfmpegPath: string | undefined;

/**
 * Resolved FFprobe binary path
 * Will be undefined if not found (falls back to system PATH)
 */
let resolvedFfprobePath: string | undefined;

/**
 * Whether paths have been resolved
 */
let pathsResolved = false;

/**
 * Resolve FFmpeg path from installed packages
 */
function resolveFfmpegPath(): string | undefined {
  // Try @ffmpeg-installer/ffmpeg first (preferred)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    if (ffmpegInstaller?.path) {
      logger.log(
        `Found FFmpeg via @ffmpeg-installer/ffmpeg: ${ffmpegInstaller.path}`,
      );
      return ffmpegInstaller.path;
    }
  } catch {
    // Package not installed or not available for this platform
  }

  // Try ffmpeg-static as fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic) {
      const staticPath =
        typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic.path;
      if (staticPath) {
        logger.log(`Found FFmpeg via ffmpeg-static: ${staticPath}`);
        return staticPath;
      }
    }
  } catch {
    // Package not installed
  }

  logger.warn('No bundled FFmpeg found - will use system PATH');
  return undefined;
}

/**
 * Resolve FFprobe path from installed packages
 * IMPORTANT: ffprobe comes from a SEPARATE package (@ffprobe-installer/ffprobe)
 */
function resolveFfprobePath(): string | undefined {
  // Use @ffprobe-installer/ffprobe (the correct package for ffprobe)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
    if (ffprobeInstaller?.path) {
      logger.log(
        `Found FFprobe via @ffprobe-installer/ffprobe: ${ffprobeInstaller.path}`,
      );
      return ffprobeInstaller.path;
    }
  } catch {
    // Package not installed or not available for this platform
  }

  logger.warn('No bundled FFprobe found - will use system PATH');
  return undefined;
}

/**
 * Initialize and resolve all paths
 * This is called lazily on first access
 */
function ensurePathsResolved(): void {
  if (pathsResolved) return;

  logger.log('Resolving FFmpeg/FFprobe binary paths...');

  resolvedFfmpegPath = resolveFfmpegPath();
  resolvedFfprobePath = resolveFfprobePath();

  pathsResolved = true;

  // Log final configuration
  logger.log('FFmpeg configuration complete:');
  logger.log(`  FFmpeg:  ${resolvedFfmpegPath || '(system PATH)'}`);
  logger.log(`  FFprobe: ${resolvedFfprobePath || '(system PATH)'}`);
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * FFmpeg configuration object
 * Provides resolved paths for FFmpeg and FFprobe binaries
 */
export const FFmpegConfig = {
  /**
   * Get the resolved FFmpeg binary path
   * Returns undefined if not found (use system PATH)
   */
  get ffmpegPath(): string | undefined {
    ensurePathsResolved();
    return resolvedFfmpegPath;
  },

  /**
   * Get the resolved FFprobe binary path
   * Returns undefined if not found (use system PATH)
   */
  get ffprobePath(): string | undefined {
    ensurePathsResolved();
    return resolvedFfprobePath;
  },

  /**
   * Check if FFmpeg is available (bundled or system)
   */
  get hasFfmpeg(): boolean {
    ensurePathsResolved();
    return resolvedFfmpegPath !== undefined;
  },

  /**
   * Check if FFprobe is available (bundled or system)
   */
  get hasFfprobe(): boolean {
    ensurePathsResolved();
    return resolvedFfprobePath !== undefined;
  },

  /**
   * Configure fluent-ffmpeg with the resolved paths
   * Call this to set up fluent-ffmpeg with the correct binary paths
   *
   * @param ffmpegInstance - The fluent-ffmpeg module instance
   */
  configureFluetFfmpeg(ffmpegInstance: any): void {
    ensurePathsResolved();

    if (resolvedFfmpegPath) {
      ffmpegInstance.setFfmpegPath(resolvedFfmpegPath);
    }
    if (resolvedFfprobePath) {
      ffmpegInstance.setFfprobePath(resolvedFfprobePath);
    }
  },

  /**
   * Force re-resolution of paths
   * Useful for testing or if packages are installed at runtime
   */
  reset(): void {
    pathsResolved = false;
    resolvedFfmpegPath = undefined;
    resolvedFfprobePath = undefined;
  },
};

// Export types for consumers
export type FFmpegConfigType = typeof FFmpegConfig;
