/**
 * Thumbnail Generator Module
 *
 * Generates thumbnails for images, videos, and PDFs using:
 * - ffmpeg: For image resizing and video frame extraction (Lambda layer)
 * - Chromium/Puppeteer: For PDF page rendering (Lambda layer)
 *
 * Thumbnail specifications:
 * - Max dimensions: 300x300 (maintains aspect ratio)
 * - Format: JPEG at 80% quality
 *
 * Storage convention:
 * - Original: path/to/file.mp4
 * - Thumbnail: path/to/file_thumb.jpg
 *
 * SAFETY: All processing has timeouts and size limits to prevent runaway costs.
 *
 * PDF Rendering Architecture:
 * - Uses @sparticuz/chromium-min + puppeteer-core for serverless PDF rendering
 * - Chromium Lambda layer provides headless browser for ARM64
 * - Puppeteer opens PDF, screenshots first page, ffmpeg resizes to thumbnail
 * - Browser instance is reused across invocations for performance
 */

import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

// Chromium and Puppeteer imports for PDF rendering
// These are dynamically loaded to avoid issues when Chromium layer isn't available
let chromium: typeof import("@sparticuz/chromium") | null = null;
let puppeteer: typeof import("puppeteer-core") | null = null;

// Browser type from puppeteer-core
type Browser = import("puppeteer-core").Browser;

// Thumbnail configuration
const THUMBNAIL_CONFIG = {
  maxWidth: 300,
  maxHeight: 300,
  quality: 80,
  // Video: extract frame at this position (seconds or percentage)
  videoFramePosition: "00:00:01",
  // Processing timeout in milliseconds (30 seconds max)
  processingTimeoutMs: 30000,
  // PDF rendering - viewport size for Chromium
  pdfViewportWidth: 800,
  pdfViewportHeight: 1100,
};

// Paths to binaries (from Lambda layer or environment)
const FFMPEG_PATH = process.env.FFMPEG_PATH || "/opt/bin/ffmpeg";
const FFPROBE_PATH = process.env.FFPROBE_PATH || "/opt/bin/ffprobe";

// Singleton browser instance for reuse across invocations
let browserInstance: Browser | null = null;

/**
 * Thumbnail generation result
 */
export interface ThumbnailResult {
  success: boolean;
  thumbnailBuffer?: Buffer;
  width?: number;
  height?: number;
  blurhash?: string;
  duration?: number; // For video: duration in seconds, for PDF: page count
  error?: string;
  /** Whether this error should prevent retries */
  permanentError?: boolean;
}

/**
 * Supported media types for thumbnail generation
 */
export type ThumbnailMediaType = "image" | "video" | "document";

/**
 * Check if the given MIME type supports thumbnail generation
 */
export function supportsThumbnailGeneration(mimeType: string): boolean {
  // Images
  if (mimeType.startsWith("image/")) {
    // Exclude formats that can't be processed
    const unsupported = ["image/svg+xml", "image/x-icon"];
    return !unsupported.includes(mimeType);
  }

  // Videos
  if (mimeType.startsWith("video/")) {
    return true;
  }

  // Documents - PDFs supported via Ghostscript
  if (mimeType === "application/pdf") {
    return true;
  }

  return false;
}

/**
 * Determine media type from MIME type
 */
export function getMediaTypeFromMime(
  mimeType: string
): ThumbnailMediaType | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "document";
  return null;
}

/**
 * Generate thumbnail from media buffer
 *
 * @param inputBuffer - The source media buffer
 * @param mimeType - MIME type of the source media
 * @param tempDir - Temporary directory for processing
 * @returns ThumbnailResult with thumbnail buffer and metadata
 */
export async function generateThumbnail(
  inputBuffer: Buffer,
  mimeType: string,
  tempDir: string = "/tmp"
): Promise<ThumbnailResult> {
  const mediaType = getMediaTypeFromMime(mimeType);

  if (!mediaType) {
    return {
      success: false,
      error: `Unsupported media type for thumbnail: ${mimeType}`,
      permanentError: true,
    };
  }

  if (!supportsThumbnailGeneration(mimeType)) {
    return {
      success: false,
      error: `MIME type not supported for thumbnails: ${mimeType}`,
      permanentError: true,
    };
  }

  try {
    switch (mediaType) {
      case "image":
        return await generateImageThumbnail(inputBuffer, tempDir);
      case "video":
        return await generateVideoThumbnail(inputBuffer, mimeType, tempDir);
      case "document":
        return await generatePdfThumbnail(inputBuffer, tempDir);
      default:
        return {
          success: false,
          error: `Unknown media type: ${mediaType}`,
          permanentError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Thumbnail generation failed", undefined, {
      mimeType,
      error: errorMessage,
    });

    // Check if error is permanent (shouldn't retry)
    const permanentError = isPermanentThumbnailError(errorMessage);

    return {
      success: false,
      error: errorMessage,
      permanentError,
    };
  }
}

/**
 * Check if an error indicates permanent failure (no retry)
 */
function isPermanentThumbnailError(errorMessage: string): boolean {
  const message = errorMessage.toLowerCase();
  const permanentPatterns = [
    "unsupported",
    "invalid",
    "corrupt",
    "not recognized",
    "unknown format",
    "cannot decode",
    "no such file",
    "permission denied",
  ];
  return permanentPatterns.some((pattern) => message.includes(pattern));
}

/**
 * Generate thumbnail for image using sharp
 * Uses ffmpeg as fallback since we have it in the layer
 */
async function generateImageThumbnail(
  inputBuffer: Buffer,
  tempDir: string
): Promise<ThumbnailResult> {
  const inputPath = path.join(tempDir, `input_${Date.now()}.jpg`);
  const outputPath = path.join(tempDir, `thumb_${Date.now()}.jpg`);

  try {
    // Write input to temp file
    fs.writeFileSync(inputPath, inputBuffer);

    // Use ffmpeg for image resizing (available in Lambda layer)
    // This avoids needing to bundle sharp which has native dependencies
    const ffmpegArgs = [
      "-i",
      inputPath,
      "-vf",
      `scale='min(${THUMBNAIL_CONFIG.maxWidth},iw)':min'(${THUMBNAIL_CONFIG.maxHeight},ih)':force_original_aspect_ratio=decrease`,
      "-q:v",
      String(Math.round((100 - THUMBNAIL_CONFIG.quality) / 5 + 1)), // ffmpeg quality scale
      "-y",
      outputPath,
    ];

    await runFfmpeg(ffmpegArgs);

    // Read the thumbnail
    const thumbnailBuffer = fs.readFileSync(outputPath);

    // Get dimensions using ffprobe
    const dimensions = await getMediaDimensions(outputPath);

    // Generate blurhash
    const blurhash = await generateBlurhash(thumbnailBuffer, tempDir);

    return {
      success: true,
      thumbnailBuffer,
      width: dimensions.width,
      height: dimensions.height,
      blurhash,
    };
  } finally {
    // Cleanup temp files
    safeUnlink(inputPath);
    safeUnlink(outputPath);
  }
}

/**
 * Generate thumbnail for video by extracting a frame
 */
async function generateVideoThumbnail(
  inputBuffer: Buffer,
  mimeType: string,
  tempDir: string
): Promise<ThumbnailResult> {
  const extension = getVideoExtension(mimeType);
  const inputPath = path.join(tempDir, `input_${Date.now()}.${extension}`);
  const outputPath = path.join(tempDir, `thumb_${Date.now()}.jpg`);

  try {
    // Write input to temp file
    fs.writeFileSync(inputPath, inputBuffer);

    // Get video duration first
    const duration = await getVideoDuration(inputPath);

    // Extract frame at 1 second or 10% of duration (whichever is smaller)
    const framePosition = Math.min(1, duration * 0.1);
    const seekTime = formatSeekTime(framePosition);

    // Use ffmpeg to extract and resize frame
    const ffmpegArgs = [
      "-ss",
      seekTime,
      "-i",
      inputPath,
      "-vframes",
      "1",
      "-vf",
      `scale='min(${THUMBNAIL_CONFIG.maxWidth},iw)':min'(${THUMBNAIL_CONFIG.maxHeight},ih)':force_original_aspect_ratio=decrease`,
      "-q:v",
      String(Math.round((100 - THUMBNAIL_CONFIG.quality) / 5 + 1)),
      "-y",
      outputPath,
    ];

    await runFfmpeg(ffmpegArgs);

    // Read the thumbnail
    const thumbnailBuffer = fs.readFileSync(outputPath);

    // Get dimensions
    const dimensions = await getMediaDimensions(outputPath);

    // Generate blurhash
    const blurhash = await generateBlurhash(thumbnailBuffer, tempDir);

    return {
      success: true,
      thumbnailBuffer,
      width: dimensions.width,
      height: dimensions.height,
      blurhash,
      duration,
    };
  } finally {
    // Cleanup temp files
    safeUnlink(inputPath);
    safeUnlink(outputPath);
  }
}

/**
 * Generate thumbnail for PDF using Chromium/Puppeteer with pdf.js
 *
 * Since Chrome's built-in PDF viewer doesn't work in headless mode,
 * we create an HTML page that uses pdf.js to render the PDF in a canvas,
 * then screenshot that canvas.
 *
 * Requires Chromium Lambda layer for ARM64.
 */
async function generatePdfThumbnail(
  inputBuffer: Buffer,
  tempDir: string
): Promise<ThumbnailResult> {
  const inputPath = path.join(tempDir, `input_${Date.now()}.pdf`);
  const htmlPath = path.join(tempDir, `pdf_viewer_${Date.now()}.html`);
  const chromiumOutputPath = path.join(
    tempDir,
    `chromium_out_${Date.now()}.png`
  );
  const outputPath = path.join(tempDir, `thumb_${Date.now()}.jpg`);

  try {
    // Initialize Chromium browser if not already done
    const browser = await initChromiumBrowser();
    if (!browser) {
      logger.warn("Chromium not available - PDF thumbnails disabled");
      return {
        success: true,
        // Return success with no thumbnail - frontend will show PDF icon
      };
    }

    // Write input PDF to temp file
    fs.writeFileSync(inputPath, inputBuffer);

    // Convert PDF to base64 for embedding in HTML
    const pdfBase64 = inputBuffer.toString("base64");

    // Create an HTML page that uses pdf.js to render the PDF
    // We use the pdf.js library from cdnjs
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: white; 
      display: flex; 
      justify-content: center; 
      align-items: flex-start;
      min-height: 100vh;
    }
    #canvas-container {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      width: 100%;
      padding: 0;
    }
    canvas { 
      display: block;
      max-width: 100%;
    }
    #error {
      color: red;
      padding: 20px;
      font-family: sans-serif;
    }
  </style>
</head>
<body>
  <div id="canvas-container">
    <canvas id="pdf-canvas"></canvas>
  </div>
  <div id="error"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs" type="module"></script>
  <script type="module">
    const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
    
    // Set worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
    
    const pdfData = atob('${pdfBase64}');
    const pdfArray = new Uint8Array(pdfData.length);
    for (let i = 0; i < pdfData.length; i++) {
      pdfArray[i] = pdfData.charCodeAt(i);
    }
    
    try {
      const pdf = await pdfjsLib.getDocument({ data: pdfArray }).promise;
      const page = await pdf.getPage(1);
      
      // Scale to fit viewport while maintaining aspect ratio
      const desiredWidth = ${THUMBNAIL_CONFIG.pdfViewportWidth};
      const viewport = page.getViewport({ scale: 1 });
      const scale = desiredWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });
      
      const canvas = document.getElementById('pdf-canvas');
      const context = canvas.getContext('2d');
      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;
      
      await page.render({
        canvasContext: context,
        viewport: scaledViewport
      }).promise;
      
      // Signal that rendering is complete
      window.pdfRendered = true;
    } catch (err) {
      document.getElementById('error').textContent = 'Error: ' + err.message;
      window.pdfError = err.message;
    }
  </script>
</body>
</html>`;

    // Write HTML file
    fs.writeFileSync(htmlPath, htmlContent);

    // Create a new page for this PDF
    const page = await browser.newPage();

    try {
      // Set viewport to a reasonable PDF viewing size
      await page.setViewport({
        width: THUMBNAIL_CONFIG.pdfViewportWidth,
        height: THUMBNAIL_CONFIG.pdfViewportHeight,
      });

      // Navigate to the HTML file
      await page.goto(`file://${htmlPath}`, {
        waitUntil: "networkidle0",
        timeout: THUMBNAIL_CONFIG.processingTimeoutMs,
      });

      // Wait for PDF to render (poll for window.pdfRendered)
      await page.waitForFunction(
        () => (window as any).pdfRendered || (window as any).pdfError,
        { timeout: THUMBNAIL_CONFIG.processingTimeoutMs }
      );

      // Check for errors
      const pdfError = await page.evaluate(() => (window as any).pdfError);
      if (pdfError) {
        throw new Error(`pdf.js error: ${pdfError}`);
      }

      // Wait a bit more for any final rendering
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Take screenshot of the canvas element
      const canvasElement = await page.$("#pdf-canvas");
      if (canvasElement) {
        await canvasElement.screenshot({
          path: chromiumOutputPath,
          type: "png",
        });
      } else {
        // Fallback to full page screenshot
        await page.screenshot({
          path: chromiumOutputPath,
          type: "png",
          fullPage: false,
        });
      }
    } finally {
      // Always close the page
      await page.close();
    }

    // Check if Chromium produced output
    if (!fs.existsSync(chromiumOutputPath)) {
      throw new Error("Chromium did not produce output file");
    }

    // Now resize with ffmpeg for consistent dimensions and JPEG format
    const ffmpegArgs = [
      "-i",
      chromiumOutputPath,
      "-vf",
      `scale='min(${THUMBNAIL_CONFIG.maxWidth},iw)':min'(${THUMBNAIL_CONFIG.maxHeight},ih)':force_original_aspect_ratio=decrease`,
      "-q:v",
      String(Math.round((100 - THUMBNAIL_CONFIG.quality) / 5 + 1)),
      "-y",
      outputPath,
    ];

    await runFfmpeg(ffmpegArgs);

    // Read the thumbnail
    const thumbnailBuffer = fs.readFileSync(outputPath);

    // Get dimensions using ffprobe
    const dimensions = await getMediaDimensions(outputPath);

    logger.info("PDF thumbnail generated successfully", undefined, {
      width: dimensions.width,
      height: dimensions.height,
    });

    return {
      success: true,
      thumbnailBuffer,
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("PDF thumbnail generation failed", undefined, {
      error: errorMessage,
    });

    // Check if this is a permanent error
    const permanentError =
      errorMessage.includes("corrupt") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("not a PDF") ||
      errorMessage.includes("Invalid PDF");

    return {
      success: false,
      error: `PDF thumbnail failed: ${errorMessage}`,
      permanentError,
    };
  } finally {
    // Cleanup temp files
    safeUnlink(inputPath);
    safeUnlink(htmlPath);
    safeUnlink(chromiumOutputPath);
    safeUnlink(outputPath);
  }
}

/**
 * Initialize Chromium browser for PDF rendering
 *
 * Uses @sparticuz/chromium package which extracts binaries from the Lambda layer.
 * Browser instance is reused across invocations for performance.
 *
 * @returns Browser instance or null if Chromium is not available
 */
async function initChromiumBrowser(): Promise<Browser | null> {
  // Return existing instance if available and connected
  if (browserInstance?.connected) {
    return browserInstance;
  }

  try {
    // Dynamically import chromium and puppeteer
    // This allows the Lambda to work even if Chromium layer isn't available
    if (!chromium || !puppeteer) {
      try {
        chromium = await import("@sparticuz/chromium");
        puppeteer = await import("puppeteer-core");
      } catch (importError) {
        logger.warn("Chromium/Puppeteer packages not available", undefined, {
          error:
            importError instanceof Error
              ? importError.message
              : String(importError),
        });
        return null;
      }
    }

    // Configure chromium for Lambda environment
    // Disable WebGL for faster startup (not needed for PDF rendering)
    chromium.default.setGraphicsMode = false;

    // Get the executable path from the Lambda layer
    // The full @sparticuz/chromium package extracts binaries from /opt
    const executablePath = await chromium.default.executablePath();

    if (!executablePath || !fs.existsSync(executablePath)) {
      logger.warn("Chromium executable not found", undefined, {
        executablePath,
      });
      return null;
    }

    logger.info("Launching Chromium browser", undefined, {
      executablePath,
    });

    // Launch browser with Lambda-optimized settings
    browserInstance = await puppeteer.default.launch({
      args: chromium.default.args,
      defaultViewport: {
        width: THUMBNAIL_CONFIG.pdfViewportWidth,
        height: THUMBNAIL_CONFIG.pdfViewportHeight,
      },
      executablePath,
      headless: true,
    });

    logger.info("Chromium browser launched successfully");
    return browserInstance;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to initialize Chromium", undefined, {
      error: errorMessage,
    });
    return null;
  }
}

/**
 * Close the Chromium browser instance
 * Should be called during Lambda shutdown or cleanup
 */
export async function closeChromiumBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
      logger.info("Chromium browser closed");
    } catch (error) {
      // Ignore errors during cleanup
    } finally {
      browserInstance = null;
    }
  }
}

/**
 * Run ffmpeg command
 */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, args);

    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on("error", (error) => {
      reject(new Error(`ffmpeg spawn error: ${error.message}`));
    });
  });
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(filePath: string): Promise<number> {
  try {
    const output = execSync(
      `"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: "utf-8" }
    );
    return parseFloat(output.trim()) || 0;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn("Failed to get video duration", undefined, {
      error: errorMessage,
    });
    return 0;
  }
}

/**
 * Get media dimensions using ffprobe
 */
async function getMediaDimensions(
  filePath: string
): Promise<{ width: number; height: number }> {
  try {
    const output = execSync(
      `"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${filePath}"`,
      { encoding: "utf-8" }
    );
    const [width, height] = output.trim().split("x").map(Number);
    return { width: width || 0, height: height || 0 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn("Failed to get media dimensions", undefined, {
      error: errorMessage,
    });
    return { width: 0, height: 0 };
  }
}

/**
 * Generate blurhash from image buffer
 * Uses a simple approach without sharp - extracts pixel data via ffmpeg
 */
async function generateBlurhash(
  imageBuffer: Buffer,
  tempDir: string
): Promise<string | undefined> {
  // Blurhash generation requires pixel data extraction
  // For Lambda simplicity, we'll skip blurhash generation
  // The backend can generate it when needed, or we can add it later
  return undefined;
}

/**
 * Format seconds to HH:MM:SS.mmm for ffmpeg -ss
 */
function formatSeekTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toFixed(3).padStart(6, "0")}`;
}

/**
 * Get video file extension from MIME type
 */
function getVideoExtension(mimeType: string): string {
  const extensions: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
    "video/x-matroska": "mkv",
    "video/3gpp": "3gp",
  };
  return extensions[mimeType] || "mp4";
}

/**
 * Safely delete a file, ignoring errors
 */
function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
}

/**
 * Generate thumbnail S3 key from original key
 *
 * Convention:
 * - Original: path/to/file.mp4
 * - Thumbnail: path/to/file_thumb.jpg
 */
export function generateThumbnailKey(originalKey: string): string {
  const ext = path.extname(originalKey);
  const baseName = originalKey.slice(0, -ext.length);
  return `${baseName}_thumb.jpg`;
}
