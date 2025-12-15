/**
 * Thumbnail Processor Service
 * Handles the actual thumbnail generation for images, videos, and PDFs
 */

import { getThumbnailConfig } from '@config/thumbnail.config';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { encode } from 'blurhash';
import * as ffmpegModule from 'fluent-ffmpeg';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharpStatic from 'sharp';
import { ThumbnailResult } from './thumbnail.types';

// Handle default exports for ESM compatibility
const sharp = (sharpStatic as any).default || sharpStatic;
const ffmpeg = (ffmpegModule as any).default || ffmpegModule;

// PDF processing - will be loaded dynamically
let mupdf: any;
let PDFDocument: any;

// Try to get bundled ffmpeg paths
let ffmpegPath: string | undefined;
let ffprobePath: string | undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  ffmpegPath = ffmpegInstaller.path;
} catch {
  // Try ffmpeg-static as fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ffmpegPath = require('ffmpeg-static');
  } catch {
    // Neither package found, will check system path
  }
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
  ffprobePath = ffprobeInstaller.path;
} catch {
  // ffprobe installer not found, will try system path
}

@Injectable()
export class ThumbnailProcessorService implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailProcessorService.name);
  private readonly config = getThumbnailConfig();
  private ffmpegAvailable = false;
  private pdfAvailable = false;

  async onModuleInit() {
    // Configure ffmpeg with bundled binary if available
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
      this.logger.log(`Using bundled ffmpeg: ${ffmpegPath}`);
    }
    if (ffprobePath) {
      ffmpeg.setFfprobePath(ffprobePath);
    }

    // Check if ffmpeg is available on the system
    try {
      await this.checkFfmpegAvailability();
      this.ffmpegAvailable = true;
      this.logger.log('FFmpeg is available - video thumbnails enabled');
    } catch (error) {
      this.ffmpegAvailable = false;
      this.logger.warn(
        'FFmpeg not found on system - video thumbnails will be disabled. Install FFmpeg to enable video thumbnails.',
      );
    }

    // Initialize PDF processing using mupdf (native bindings, works on Windows)
    // Use eval to prevent SWC from transforming the dynamic import to require()
    try {
      // eslint-disable-next-line no-eval
      const dynamicImport = eval('(moduleName) => import(moduleName)');
      mupdf = await dynamicImport('mupdf');
      const pdfLib = await import('pdf-lib');
      PDFDocument = pdfLib.PDFDocument;
      this.pdfAvailable = true;
      this.logger.log('PDF processing available - document thumbnails enabled');
    } catch (error) {
      this.pdfAvailable = false;
      this.logger.warn(
        `PDF processing not available: ${error.message}. Document thumbnails will be disabled.`,
      );
    }
  }

  private checkFfmpegAvailability(): Promise<void> {
    return new Promise((resolve, reject) => {
      const testCommand = ffmpeg();
      testCommand.ffprobe((err: any) => {
        // If we get an error about no input, ffmpeg is installed
        // If we get "not found" error, it's not installed
        if (err && err.message?.toLowerCase().includes('not found')) {
          reject(new Error('FFmpeg not found'));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Generate thumbnail from buffer based on media type
   */
  async generateThumbnail(
    buffer: Buffer,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    mimeType: string,
  ): Promise<ThumbnailResult> {
    try {
      switch (mediaType) {
        case 'image':
          return await this.generateImageThumbnail(buffer);
        case 'video':
          return await this.generateVideoThumbnail(buffer, mimeType);
        case 'document':
          // Generate thumbnail for PDFs
          if (mimeType === 'application/pdf') {
            return await this.generatePdfThumbnail(buffer);
          }
          // No thumbnail for other documents
          return {
            success: true,
            // No thumbnail generated - frontend will show icon
          };
        case 'audio':
          // No thumbnail for audio
          return {
            success: true,
          };
        default:
          return {
            success: false,
            error: `Unsupported media type: ${mediaType}`,
          };
      }
    } catch (error) {
      this.logger.error(
        `Thumbnail generation failed: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate thumbnail for image
   * - Resizes to max 300x300 (maintaining aspect ratio)
   * - Compresses to JPEG 80% quality
   * - Generates blurhash for progressive loading
   */
  async generateImageThumbnail(buffer: Buffer): Promise<ThumbnailResult> {
    const { image: imageConfig, blurhash: blurhashConfig } = this.config;

    try {
      // Get original image metadata
      const image = sharp(buffer);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error('Could not read image dimensions');
      }

      this.logger.debug(
        `Processing image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`,
      );

      // Generate thumbnail
      const thumbnailBuffer = await image
        .resize({
          width: imageConfig.maxWidth,
          height: imageConfig.maxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({
          quality: imageConfig.quality,
          progressive: imageConfig.progressive,
        })
        .toBuffer();

      // Generate blurhash from a small version of the thumbnail
      const blurhash = await this.generateBlurhash(thumbnailBuffer);

      this.logger.debug(
        `Generated thumbnail: ${thumbnailBuffer.length} bytes, blurhash: ${blurhash}`,
      );

      return {
        success: true,
        thumbnailKey: '', // Will be set by the job processor after S3 upload
        width: metadata.width,
        height: metadata.height,
        blurhash,
      };
    } catch (error) {
      this.logger.error(`Image thumbnail failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate thumbnail for video
   * - Extracts frame at 1 second
   * - Resizes to max 300x300
   * - Generates blurhash
   */
  async generateVideoThumbnail(
    buffer: Buffer,
    mimeType: string,
  ): Promise<ThumbnailResult> {
    // Check if ffmpeg is available before attempting video processing
    if (!this.ffmpegAvailable) {
      this.logger.warn(
        'Skipping video thumbnail generation - ffmpeg is not available. ' +
          'Install ffmpeg on the system or add ffmpeg-static package.',
      );
      return {
        success: false,
        thumbnailKey: '',
        error: 'FFmpeg not available for video thumbnail generation',
      };
    }

    const { video: videoConfig } = this.config;
    const tempDir = await this.createTempDir('video-thumb-');

    try {
      // Determine file extension from MIME type
      const extension = this.getExtensionFromMimeType(mimeType);
      const inputPath = path.join(tempDir, `input.${extension}`);
      const outputPath = path.join(tempDir, 'thumb.jpg');

      // Write buffer to temp file (ffmpeg needs file access)
      await fs.writeFile(inputPath, buffer);

      this.logger.debug(`Video temp file written: ${inputPath}`);

      // Get video metadata first
      const videoInfo = await this.getVideoMetadata(inputPath);

      // Extract frame using ffmpeg
      await this.extractVideoFrame(inputPath, outputPath, videoConfig);

      // Read the generated thumbnail
      const thumbnailBuffer = await fs.readFile(outputPath);

      // Resize thumbnail if needed
      const resizedThumbnail = await sharp(thumbnailBuffer)
        .resize({
          width: videoConfig.maxWidth,
          height: videoConfig.maxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Generate blurhash
      const blurhash = await this.generateBlurhash(resizedThumbnail);

      this.logger.debug(
        `Generated video thumbnail: ${resizedThumbnail.length} bytes`,
      );

      return {
        success: true,
        thumbnailKey: '', // Will be set after S3 upload
        width: videoInfo.width,
        height: videoInfo.height,
        blurhash,
        duration: videoInfo.duration,
      };
    } catch (error) {
      this.logger.error(`Video thumbnail failed: ${error.message}`);
      throw error;
    } finally {
      // Clean up temp directory
      await this.cleanupTempDir(tempDir);
    }
  }

  /**
   * Generate thumbnail for PDF document
   * Renders the first page as an image using pdfjs-dist with canvas
   */
  async generatePdfThumbnail(buffer: Buffer): Promise<ThumbnailResult> {
    if (!this.pdfAvailable) {
      this.logger.warn(
        'Skipping PDF thumbnail generation - PDF processing is not available.',
      );
      return {
        success: false,
        error: 'PDF processing not available',
      };
    }

    try {
      // Get PDF page count using pdf-lib
      let pageCount = 1;
      try {
        const pdfDoc = await PDFDocument.load(buffer);
        pageCount = pdfDoc.getPageCount();
        this.logger.debug(`PDF has ${pageCount} pages`);
      } catch (err) {
        this.logger.warn(`Could not read PDF page count: ${err.message}`);
      }

      // Render first page to image using pdfjs-dist
      const firstPageBuffer = await this.renderPdfPageToImage(buffer, 1);

      if (!firstPageBuffer) {
        throw new Error('PDF conversion failed - no pages rendered');
      }

      this.logger.debug(
        `PDF first page rendered: ${firstPageBuffer.length} bytes`,
      );

      // Resize and convert to JPEG
      const resizedThumbnail = await sharp(firstPageBuffer)
        .resize({
          width: 300,
          height: 400,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Get dimensions
      const metadata = await sharp(resizedThumbnail).metadata();

      // Generate blurhash
      const blurhash = await this.generateBlurhash(resizedThumbnail);

      this.logger.debug(
        `Generated PDF thumbnail: ${resizedThumbnail.length} bytes, ${pageCount} pages`,
      );

      return {
        success: true,
        thumbnailKey: '', // Will be set after S3 upload
        width: metadata.width || 300,
        height: metadata.height || 400,
        blurhash,
        // Store page count in duration field (reusing the field)
        duration: pageCount,
      };
    } catch (error) {
      this.logger.error(`PDF thumbnail failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate blurhash from image buffer
   */
  async generateBlurhash(imageBuffer: Buffer): Promise<string> {
    const { blurhash: config } = this.config;

    try {
      // Resize to small dimensions for blurhash
      const { data, info } = await sharp(imageBuffer)
        .raw()
        .ensureAlpha()
        .resize(config.resizeWidth, config.resizeHeight, { fit: 'inside' })
        .toBuffer({ resolveWithObject: true });

      // Generate blurhash
      const blurhash = encode(
        new Uint8ClampedArray(data),
        info.width,
        info.height,
        config.componentX,
        config.componentY,
      );

      return blurhash;
    } catch (error) {
      this.logger.warn(`Blurhash generation failed: ${error.message}`);
      return ''; // Return empty string if blurhash fails
    }
  }

  /**
   * Get video metadata using ffprobe
   */
  private getVideoMetadata(
    filePath: string,
  ): Promise<{ width: number; height: number; duration: number }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) {
          reject(new Error(`FFprobe failed: ${err.message}`));
          return;
        }

        const videoStream = data.streams?.find(
          (stream) => stream.codec_type === 'video',
        );

        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        resolve({
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          duration: data.format?.duration || 0,
        });
      });
    });
  }

  /**
   * Extract a frame from video using ffmpeg
   */
  private extractVideoFrame(
    inputPath: string,
    outputPath: string,
    config: { extractTime: string },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(config.extractTime)
        .frames(1)
        .output(outputPath)
        .outputOptions(['-vf', 'scale=300:-1', '-q:v', '3'])
        .on('end', () => {
          this.logger.debug(`Frame extracted to: ${outputPath}`);
          resolve();
        })
        .on('error', (err) => {
          // If seek fails (video shorter than 1s), try extracting first frame
          if (err.message.includes('seek')) {
            this.logger.debug('Video too short, extracting first frame');
            ffmpeg(inputPath)
              .frames(1)
              .output(outputPath)
              .outputOptions(['-vf', 'scale=300:-1', '-q:v', '3'])
              .on('end', () => resolve())
              .on('error', (err2) => reject(err2))
              .run();
          } else {
            reject(new Error(`FFmpeg failed: ${err.message}`));
          }
        })
        .run();
    });
  }

  /**
   * Get thumbnail buffer for a processed result
   * Call this after generateThumbnail to get the actual buffer
   */
  async getThumbnailBuffer(
    originalBuffer: Buffer,
    mediaType: 'image' | 'video' | 'document',
    mimeType: string,
  ): Promise<Buffer> {
    if (mediaType === 'image') {
      return this.getImageThumbnailBuffer(originalBuffer);
    } else if (mediaType === 'video') {
      return this.getVideoThumbnailBuffer(originalBuffer, mimeType);
    } else if (mediaType === 'document' && mimeType === 'application/pdf') {
      return this.getPdfThumbnailBuffer(originalBuffer);
    }
    throw new Error(`Cannot generate thumbnail buffer for: ${mediaType}`);
  }

  /**
   * Get resized image buffer
   */
  private async getImageThumbnailBuffer(buffer: Buffer): Promise<Buffer> {
    const { image: config } = this.config;

    return sharp(buffer)
      .resize({
        width: config.maxWidth,
        height: config.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: config.quality,
        progressive: config.progressive,
      })
      .toBuffer();
  }

  /**
   * Get video thumbnail buffer
   */
  private async getVideoThumbnailBuffer(
    buffer: Buffer,
    mimeType: string,
  ): Promise<Buffer> {
    const { video: videoConfig } = this.config;
    const tempDir = await this.createTempDir('video-thumb-buf-');

    try {
      const extension = this.getExtensionFromMimeType(mimeType);
      const inputPath = path.join(tempDir, `input.${extension}`);
      const outputPath = path.join(tempDir, 'thumb.jpg');

      await fs.writeFile(inputPath, buffer);
      await this.extractVideoFrame(inputPath, outputPath, videoConfig);

      const thumbnailBuffer = await fs.readFile(outputPath);

      // Resize if needed
      return sharp(thumbnailBuffer)
        .resize({
          width: videoConfig.maxWidth,
          height: videoConfig.maxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } finally {
      await this.cleanupTempDir(tempDir);
    }
  }

  /**
   * Get PDF thumbnail buffer using pdfjs-dist with canvas
   */
  private async getPdfThumbnailBuffer(buffer: Buffer): Promise<Buffer> {
    // Render first page to image
    const firstPageBuffer = await this.renderPdfPageToImage(buffer, 1);

    if (!firstPageBuffer) {
      throw new Error('PDF conversion failed');
    }

    return sharp(firstPageBuffer)
      .resize({
        width: 300,
        height: 400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  /**
   * Render a specific PDF page to an image buffer using mupdf
   */
  private async renderPdfPageToImage(
    buffer: Buffer,
    pageNumber: number,
    scale: number = 2,
  ): Promise<Buffer> {
    // Load PDF document with mupdf
    const doc = mupdf.Document.openDocument(buffer, 'application/pdf');

    try {
      // Get page count
      const pageCount = doc.countPages();
      if (pageNumber < 1 || pageNumber > pageCount) {
        throw new Error(
          `Invalid page number: ${pageNumber}, document has ${pageCount} pages`,
        );
      }

      // Get the requested page (0-indexed in mupdf)
      const page = doc.loadPage(pageNumber - 1);

      // Get page bounds
      const bounds = page.getBounds();
      const width = Math.floor((bounds[2] - bounds[0]) * scale);
      const height = Math.floor((bounds[3] - bounds[1]) * scale);

      // Create a pixmap for rendering
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(scale, scale),
        mupdf.ColorSpace.DeviceRGB,
        false, // no alpha
        true, // use annotations
      );

      // Get PNG data from pixmap
      const pngBuffer = pixmap.asPNG();

      this.logger.debug(`Rendered PDF page ${pageNumber}: ${width}x${height}`);

      return Buffer.from(pngBuffer);
    } finally {
      // Cleanup
      doc.destroy();
    }
  }

  /**
   * Create temporary directory
   */
  private async createTempDir(prefix: string): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
  }

  /**
   * Clean up temporary directory
   */
  private async cleanupTempDir(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(
        `Failed to cleanup temp dir ${dirPath}: ${error.message}`,
      );
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'video/x-matroska': 'mkv',
      'video/webm': 'webm',
      'video/3gpp': '3gp',
    };

    return mimeToExt[mimeType.toLowerCase()] || 'mp4';
  }
}
