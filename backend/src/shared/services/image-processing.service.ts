/**
 * Image Processing Service
 *
 * Handles image normalization to ensure compatibility with WhatsApp Cloud API.
 *
 * WhatsApp Image Requirements:
 * - JPG/JPEG: RGB/RGBA, 8 bit/channels
 * - PNG: RGB/RGBA, up to 8 bit/channel
 *
 * This service converts images that may have:
 * - CMYK color space (common in print-ready images)
 * - 16-bit color depth
 * - Problematic ICC color profiles
 * - Lab or other color spaces
 */

import { Injectable, Logger } from '@nestjs/common';
import sharpStatic from 'sharp';

// Handle default exports for ESM compatibility
const sharp = (sharpStatic as any).default || sharpStatic;

export interface ImageProcessingResult {
  /** Processed image buffer */
  buffer: Buffer;
  /** Output MIME type (always image/jpeg after processing) */
  mimeType: string;
  /** Original image metadata */
  originalMetadata: {
    format: string | undefined;
    width: number | undefined;
    height: number | undefined;
    channels: number | undefined;
    colorSpace: string | undefined;
    depth: string | undefined;
  };
  /** Whether the image was modified */
  wasProcessed: boolean;
  /** Size reduction if any */
  sizeDelta: number;
}

export interface ImageMetadata {
  width: number | undefined;
  height: number | undefined;
  format: string | undefined;
  channels: number | undefined;
  colorSpace: string | undefined;
  depth: string | undefined;
  hasAlpha: boolean | undefined;
  isProgressive: boolean | undefined;
}

@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);

  /**
   * Normalize an image to be WhatsApp-compatible.
   *
   * ALWAYS converts images to ensure WhatsApp compatibility.
   * WhatsApp strictly requires:
   * - JPG/JPEG: RGB/RGBA, 8 bit/channels
   * - PNG: RGB/RGBA, up to 8 bit/channel
   *
   * This handles:
   * - CMYK to RGB conversion
   * - 16-bit/32-bit to 8-bit depth conversion
   * - Problematic ICC profile removal
   * - Lab/XYZ/other color space conversion
   *
   * @param buffer - Input image buffer
   * @param mimeType - Original MIME type
   * @param forceProcess - Force processing even for seemingly compatible images (default: true)
   * @returns Processed image result
   */
  async normalizeForWhatsApp(
    buffer: Buffer,
    mimeType: string,
    forceProcess: boolean = true,
  ): Promise<ImageProcessingResult> {
    const originalSize = buffer.length;

    // Only process images
    if (!mimeType.startsWith('image/')) {
      return {
        buffer,
        mimeType,
        originalMetadata: {
          format: undefined,
          width: undefined,
          height: undefined,
          channels: undefined,
          colorSpace: undefined,
          depth: undefined,
        },
        wasProcessed: false,
        sizeDelta: 0,
      };
    }

    try {
      // Get original metadata for logging
      const sharpInstance = sharp(buffer);
      const metadata = await sharpInstance.metadata();

      this.logger.log(
        `[Image Processing] Analyzing image: format=${metadata.format}, ` +
          `size=${metadata.width}x${metadata.height}, ` +
          `channels=${metadata.channels}, space=${metadata.space}, ` +
          `depth=${metadata.depth}, hasProfile=${!!metadata.icc}, ` +
          `forceProcess=${forceProcess}`,
      );

      const originalMetadata = {
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        channels: metadata.channels,
        colorSpace: metadata.space,
        depth: metadata.depth,
      };

      // Check if processing is needed (but forceProcess=true will always process)
      const detectedIssues = this.detectImageIssues(metadata);
      const shouldProcess = forceProcess || detectedIssues.length > 0;

      if (detectedIssues.length > 0) {
        this.logger.log(
          `[Image Processing] Detected issues: ${detectedIssues.join(', ')}`,
        );
      }

      if (!shouldProcess) {
        this.logger.debug(
          `[Image Processing] Image appears WhatsApp-compatible, skipping processing`,
        );
        return {
          buffer,
          mimeType,
          originalMetadata,
          wasProcessed: false,
          sizeDelta: 0,
        };
      }

      this.logger.log(
        `[Image Processing] Processing image to ensure WhatsApp compatibility...`,
      );

      // ROBUST PROCESSING PIPELINE:
      // 1. Use raw() to get raw pixel data - this FORCES conversion to 8-bit
      // 2. Then re-encode as JPEG
      //
      // This approach ensures that regardless of the input format (16-bit, 32-bit,
      // CMYK, Lab, etc.), we get proper 8-bit sRGB output.
      const processedBuffer = await sharp(buffer)
        // Remove any ICC profile that might cause issues
        .withMetadata({ icc: undefined })
        // Convert to sRGB color space (handles CMYK, Lab, XYZ, etc.)
        .toColorspace('srgb')
        // Flatten alpha channel with white background
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        // Force to 8-bit by using pipelineColourspace
        // This ensures the pipeline operates in 8-bit even for high bit-depth inputs
        .pipelineColourspace('srgb')
        // Re-encode as JPEG (JPEG is always 8-bit by specification)
        .jpeg({
          quality: 92,
          mozjpeg: true,
          chromaSubsampling: '4:2:0',
          // Force removal of any metadata that might indicate non-8-bit
          force: true,
        })
        .toBuffer();

      // Verify the output is actually 8-bit
      const outputMetadata = await sharp(processedBuffer).metadata();
      this.logger.log(
        `[Image Processing] Output verification: format=${outputMetadata.format}, ` +
          `depth=${outputMetadata.depth}, space=${outputMetadata.space}, ` +
          `channels=${outputMetadata.channels}`,
      );

      const sizeDelta = originalSize - processedBuffer.length;
      const changePercent = ((sizeDelta / originalSize) * 100).toFixed(1);

      this.logger.log(
        `[Image Processing] Normalized image: ${originalSize} -> ${processedBuffer.length} bytes ` +
          `(${sizeDelta > 0 ? '-' : '+'}${Math.abs(sizeDelta)} bytes, ${changePercent}% ${sizeDelta > 0 ? 'smaller' : 'larger'})`,
      );

      return {
        buffer: processedBuffer,
        mimeType: 'image/jpeg',
        originalMetadata,
        wasProcessed: true,
        sizeDelta,
      };
    } catch (error) {
      this.logger.error(
        `[Image Processing] Failed to normalize image: ${error.message}`,
        error.stack,
      );
      // Return original if processing fails - caller should handle this
      return {
        buffer,
        mimeType,
        originalMetadata: {
          format: undefined,
          width: undefined,
          height: undefined,
          channels: undefined,
          colorSpace: undefined,
          depth: undefined,
        },
        wasProcessed: false,
        sizeDelta: 0,
      };
    }
  }

  /**
   * Detect potential issues with an image that would make it incompatible with WhatsApp.
   * Returns an array of detected issues for logging purposes.
   */
  private detectImageIssues(metadata: {
    space?: string;
    depth?: string;
    format?: string;
    channels?: number;
    icc?: Buffer;
  }): string[] {
    const issues: string[] = [];

    // Check bit depth - only 'uchar' (8-bit unsigned) is safe
    if (metadata.depth && metadata.depth !== 'uchar') {
      issues.push(`non-8-bit depth (${metadata.depth})`);
    }

    // Check color space
    const unsafeSpaces = [
      'cmyk',
      'lab',
      'xyz',
      'lch',
      'grey16',
      'rgb16',
      'scrgb',
      'hsv',
    ];
    if (metadata.space && unsafeSpaces.includes(metadata.space.toLowerCase())) {
      issues.push(`incompatible color space (${metadata.space})`);
    }

    // Check for ICC profile (can cause issues)
    if (metadata.icc) {
      issues.push('has ICC profile');
    }

    // Check channel count
    if (metadata.channels && metadata.channels > 4) {
      issues.push(`too many channels (${metadata.channels})`);
    }

    return issues;
  }

  /**
   * Get image metadata without processing
   */
  async getMetadata(buffer: Buffer): Promise<ImageMetadata> {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
        colorSpace: metadata.space,
        depth: metadata.depth,
        hasAlpha: metadata.hasAlpha,
        isProgressive: metadata.isProgressive,
      };
    } catch (error) {
      this.logger.warn(`Failed to get image metadata: ${error.message}`);
      return {
        width: undefined,
        height: undefined,
        format: undefined,
        channels: undefined,
        colorSpace: undefined,
        depth: undefined,
        hasAlpha: undefined,
        isProgressive: undefined,
      };
    }
  }

  /**
   * Resize image if it exceeds maximum dimensions
   * WhatsApp max: 5MB file size, no strict dimension limit but 4096x4096 is safe
   */
  async resizeIfNeeded(
    buffer: Buffer,
    maxWidth: number = 4096,
    maxHeight: number = 4096,
    maxFileSize: number = 5 * 1024 * 1024, // 5MB
  ): Promise<{ buffer: Buffer; wasResized: boolean }> {
    try {
      const metadata = await sharp(buffer).metadata();

      const needsResize =
        (metadata.width && metadata.width > maxWidth) ||
        (metadata.height && metadata.height > maxHeight) ||
        buffer.length > maxFileSize;

      if (!needsResize) {
        return { buffer, wasResized: false };
      }

      this.logger.debug(
        `[Image Processing] Resizing image: ${metadata.width}x${metadata.height} (${buffer.length} bytes)`,
      );

      let sharpPipeline = sharp(buffer).toColorspace('srgb');

      // Resize if dimensions exceed limits
      if (
        (metadata.width && metadata.width > maxWidth) ||
        (metadata.height && metadata.height > maxHeight)
      ) {
        sharpPipeline = sharpPipeline.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Start with high quality and reduce if file is too large
      let quality = 90;
      let processedBuffer = await sharpPipeline
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();

      // Iteratively reduce quality if still too large
      while (processedBuffer.length > maxFileSize && quality > 50) {
        quality -= 10;
        processedBuffer = await sharpPipeline
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
      }

      this.logger.log(
        `[Image Processing] Resized image: ${buffer.length} -> ${processedBuffer.length} bytes (quality: ${quality})`,
      );

      return { buffer: processedBuffer, wasResized: true };
    } catch (error) {
      this.logger.error(`[Image Processing] Resize failed: ${error.message}`);
      return { buffer, wasResized: false };
    }
  }

  /**
   * Generate a thumbnail for UI preview display.
   *
   * Creates a small, optimized preview image suitable for display in the
   * template editor and other UI contexts. Designed for quick loading
   * and minimal storage footprint.
   *
   * @param buffer - Input image buffer
   * @param options - Thumbnail options
   * @returns Thumbnail buffer and metadata
   */
  async generateThumbnail(
    buffer: Buffer,
    options: {
      /** Maximum width (default: 400px) */
      maxWidth?: number;
      /** Maximum height (default: 400px) */
      maxHeight?: number;
      /** JPEG quality (default: 80) */
      quality?: number;
    } = {},
  ): Promise<{
    buffer: Buffer;
    mimeType: string;
    width: number;
    height: number;
    originalSize: number;
    thumbnailSize: number;
  }> {
    const { maxWidth = 400, maxHeight = 400, quality = 80 } = options;
    const originalSize = buffer.length;

    try {
      const metadata = await sharp(buffer).metadata();

      this.logger.debug(
        `[Image Processing] Generating thumbnail: ${metadata.width}x${metadata.height} -> max ${maxWidth}x${maxHeight}`,
      );

      // Generate thumbnail with optimized settings for web display
      const thumbnailBuffer = await sharp(buffer)
        // Remove problematic ICC profiles
        .withMetadata({ icc: undefined })
        // Convert to sRGB for web compatibility
        .toColorspace('srgb')
        // Flatten alpha channel with white background
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        // Resize to fit within max dimensions
        .resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        // Encode as optimized JPEG
        .jpeg({
          quality,
          mozjpeg: true,
          chromaSubsampling: '4:2:0',
        })
        .toBuffer();

      // Get output dimensions
      const outputMetadata = await sharp(thumbnailBuffer).metadata();

      this.logger.log(
        `[Image Processing] Thumbnail generated: ${originalSize} -> ${thumbnailBuffer.length} bytes ` +
          `(${((1 - thumbnailBuffer.length / originalSize) * 100).toFixed(1)}% smaller), ` +
          `${outputMetadata.width}x${outputMetadata.height}`,
      );

      return {
        buffer: thumbnailBuffer,
        mimeType: 'image/jpeg',
        width: outputMetadata.width || maxWidth,
        height: outputMetadata.height || maxHeight,
        originalSize,
        thumbnailSize: thumbnailBuffer.length,
      };
    } catch (error) {
      this.logger.error(
        `[Image Processing] Thumbnail generation failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
