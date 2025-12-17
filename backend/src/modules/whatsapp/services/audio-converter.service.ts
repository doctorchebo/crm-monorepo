/**
 * Audio Converter Service
 * Converts audio files to WhatsApp-compatible formats (OGG/Opus)
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as ffmpegModule from 'fluent-ffmpeg';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Handle default exports for ESM compatibility
const ffmpeg = (ffmpegModule as any).default || ffmpegModule;

// Try to get bundled ffmpeg paths
let ffmpegPath: string | undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  ffmpegPath = ffmpegInstaller.path;
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ffmpegPath = require('ffmpeg-static');
  } catch {
    // Will use system ffmpeg
  }
}

@Injectable()
export class AudioConverterService implements OnModuleInit {
  private readonly logger = new Logger(AudioConverterService.name);
  private ffmpegAvailable = false;

  async onModuleInit() {
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
      this.logger.log(`Using bundled ffmpeg from: ${ffmpegPath}`);
    }

    // Test ffmpeg availability
    try {
      await this.testFfmpeg();
      this.ffmpegAvailable = true;
      this.logger.log('FFmpeg is available for audio conversion');
    } catch (error) {
      this.logger.warn(
        `FFmpeg not available: ${error.message}. Audio conversion will be disabled.`,
      );
    }
  }

  private async testFfmpeg(): Promise<void> {
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
   * Check if a mime type needs conversion for WhatsApp
   */
  needsConversion(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase();
    // WhatsApp supports: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg (opus only)
    // Webm needs conversion
    return (
      normalized.includes('webm') ||
      normalized === 'audio/wav' ||
      normalized === 'audio/wave'
    );
  }

  /**
   * Convert audio buffer to OGG/Opus format for WhatsApp compatibility
   */
  async convertToOggOpus(
    inputBuffer: Buffer,
    inputMimeType: string,
  ): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
    if (!this.ffmpegAvailable) {
      throw new Error('FFmpeg is not available for audio conversion');
    }

    const tempDir = os.tmpdir();
    const inputExt = this.getExtensionFromMimeType(inputMimeType);
    const inputPath = path.join(
      tempDir,
      `audio-input-${Date.now()}${inputExt}`,
    );
    const outputPath = path.join(tempDir, `audio-output-${Date.now()}.ogg`);

    try {
      // Write input buffer to temp file
      await fs.writeFile(inputPath, inputBuffer);

      // Convert to OGG/Opus
      await this.runFfmpegConversion(inputPath, outputPath);

      // Read output file
      const outputBuffer = await fs.readFile(outputPath);

      this.logger.log(
        `Audio converted: ${inputMimeType} → audio/ogg (${inputBuffer.length} → ${outputBuffer.length} bytes)`,
      );

      return {
        buffer: outputBuffer,
        mimeType: 'audio/ogg',
        extension: '.ogg',
      };
    } finally {
      // Cleanup temp files
      await this.cleanupFile(inputPath);
      await this.cleanupFile(outputPath);
    }
  }

  private runFfmpegConversion(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libopus')
        .audioBitrate('64k')
        .audioChannels(1)
        .audioFrequency(48000)
        .format('ogg')
        .on('start', (cmd: string) => {
          this.logger.debug(`FFmpeg command: ${cmd}`);
        })
        .on('error', (err: Error) => {
          this.logger.error(`FFmpeg conversion error: ${err.message}`);
          reject(err);
        })
        .on('end', () => {
          resolve();
        })
        .save(outputPath);
    });
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes('webm')) return '.webm';
    if (normalized.includes('ogg')) return '.ogg';
    if (normalized.includes('wav') || normalized.includes('wave'))
      return '.wav';
    if (normalized.includes('mp3') || normalized.includes('mpeg'))
      return '.mp3';
    if (normalized.includes('aac')) return '.aac';
    if (normalized.includes('mp4')) return '.m4a';
    return '.audio';
  }

  private async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Check if ffmpeg is available
   */
  isAvailable(): boolean {
    return this.ffmpegAvailable;
  }
}
