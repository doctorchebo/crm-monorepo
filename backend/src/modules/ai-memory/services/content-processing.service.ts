import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Service } from '@shared/services/s3.service';
import { ProviderRegistry } from '../providers';
import { TranscriptionProvider, VisionProvider } from '../providers/types';
import {
  AiMemoryError,
  AiMemoryErrorCode,
  ProcessContentRequest,
  ProcessContentResult,
  UploadedContentMetadata,
} from '../types';

/**
 * Content Processing Service
 *
 * Handles extraction of text content from various file types:
 * - Documents: PDF, Word, Text files
 * - Images: OCR and AI-powered description
 * - Audio/Video: Transcription (via configured provider)
 *
 * Uses the configured LLM provider for image description and transcription,
 * making it provider-agnostic.
 *
 * File URL Resolution:
 * - Supports S3 URIs (s3://bucket/key or s3://key) - converts to presigned URLs
 * - Supports HTTP/HTTPS URLs - passes through directly
 * - Falls back to base64 encoding for S3 files when presigned URLs fail
 */
@Injectable()
export class ContentProcessingService {
  private readonly logger = new Logger(ContentProcessingService.name);
  private readonly enableOcr: boolean;
  private readonly enableImageDescription: boolean;
  private readonly enableTranscription: boolean;
  private readonly maxDocumentChars: number;
  private readonly maxAudioDurationSeconds: number;

  /** Presigned URL expiry in seconds (1 hour) */
  private readonly presignedUrlExpiry = 3600;

  constructor(
    private readonly configService: ConfigService,
    private readonly providerRegistry: ProviderRegistry,
    @Optional() private readonly s3Service?: S3Service,
  ) {
    this.enableOcr = this.configService.get<boolean>(
      'aiMemory.processing.enableOcr',
      true,
    );
    this.enableImageDescription = this.configService.get<boolean>(
      'aiMemory.processing.enableImageDescription',
      true,
    );
    this.enableTranscription = this.configService.get<boolean>(
      'aiMemory.processing.enableTranscription',
      true,
    );
    this.maxDocumentChars = this.configService.get<number>(
      'aiMemory.processing.maxDocumentChars',
      100000,
    );
    this.maxAudioDurationSeconds = this.configService.get<number>(
      'aiMemory.processing.maxAudioDurationSeconds',
      600,
    );
  }

  /**
   * Resolve a file URL to an accessible format for external services.
   *
   * Handles:
   * - S3 URIs (s3://key or s3://bucket/key) → presigned URL
   * - HTTP/HTTPS URLs → pass through
   *
   * @param fileUrl - The file URL to resolve (may be S3 URI or HTTP URL)
   * @returns Resolved URL that external services can access
   */
  private async resolveFileUrl(fileUrl: string): Promise<string> {
    // Check if it's an S3 URI
    if (fileUrl.startsWith('s3://')) {
      return this.resolveS3Uri(fileUrl);
    }

    // HTTP/HTTPS URLs pass through directly
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      return fileUrl;
    }

    // Assume it's an S3 key if no scheme
    if (!fileUrl.includes('://')) {
      return this.resolveS3Key(fileUrl);
    }

    throw new AiMemoryError(
      `Unsupported file URL scheme: ${fileUrl}`,
      AiMemoryErrorCode.PROCESSING_FAILED,
      { fileUrl },
    );
  }

  /**
   * Resolve an S3 URI to a presigned URL
   *
   * @param s3Uri - S3 URI in format s3://key or s3://bucket/key
   * @returns Presigned download URL
   */
  private async resolveS3Uri(s3Uri: string): Promise<string> {
    if (!this.s3Service) {
      throw new AiMemoryError(
        'S3Service not available - cannot resolve S3 URI',
        AiMemoryErrorCode.PROCESSING_FAILED,
        { s3Uri },
      );
    }

    // Extract S3 key from URI (s3://key or s3://bucket/key)
    // We use a simple approach: remove s3:// prefix and treat rest as key
    const s3Key = s3Uri.replace(/^s3:\/\//, '');

    return this.resolveS3Key(s3Key);
  }

  /**
   * Resolve an S3 key to a presigned URL
   *
   * @param s3Key - The S3 object key
   * @returns Presigned download URL
   */
  private async resolveS3Key(s3Key: string): Promise<string> {
    if (!this.s3Service) {
      throw new AiMemoryError(
        'S3Service not available - cannot resolve S3 key',
        AiMemoryErrorCode.PROCESSING_FAILED,
        { s3Key },
      );
    }

    try {
      const { url } = await this.s3Service.generatePresignedDownloadUrl(s3Key, {
        expiresIn: this.presignedUrlExpiry,
      });

      this.logger.debug(`Resolved S3 key to presigned URL: ${s3Key}`);
      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned URL for ${s3Key}:`,
        error,
      );
      throw new AiMemoryError(
        `Failed to resolve S3 key to URL: ${error.message}`,
        AiMemoryErrorCode.PROCESSING_FAILED,
        { s3Key, error: error.message },
      );
    }
  }

  /**
   * Fetch file as base64 data URL (fallback for when presigned URLs fail)
   *
   * @param fileUrl - The file URL (can be S3 key, S3 URI, or HTTP URL)
   * @param mimeType - MIME type for the data URL
   * @returns Base64 data URL
   */
  private async fetchAsBase64DataUrl(
    fileUrl: string,
    mimeType: string,
  ): Promise<string> {
    let buffer: Buffer;

    // Handle S3 URIs/keys
    if (fileUrl.startsWith('s3://') || !fileUrl.includes('://')) {
      if (!this.s3Service) {
        throw new AiMemoryError(
          'S3Service not available - cannot fetch file',
          AiMemoryErrorCode.PROCESSING_FAILED,
          { fileUrl },
        );
      }

      const s3Key = fileUrl.replace(/^s3:\/\//, '');
      const downloadedBuffer = await this.s3Service.downloadFile(s3Key);

      if (!downloadedBuffer) {
        throw new AiMemoryError(
          `File not found in S3: ${s3Key}`,
          AiMemoryErrorCode.PROCESSING_FAILED,
          { s3Key },
        );
      }

      buffer = downloadedBuffer;
    } else {
      // Fetch from HTTP URL
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * Get the vision provider if available
   */
  private getVisionProvider(): VisionProvider | null {
    return this.providerRegistry.getVisionProvider();
  }

  /**
   * Get the transcription provider if available
   */
  private getTranscriptionProvider(): TranscriptionProvider | null {
    return this.providerRegistry.getTranscriptionProvider();
  }

  /**
   * Process uploaded content and extract text
   */
  async processContent(
    request: ProcessContentRequest,
  ): Promise<ProcessContentResult> {
    const contentType = this.categorizeContentType(request.mimeType);

    switch (contentType) {
      case 'document':
        return this.processDocument(request);
      case 'image':
        return this.processImage(request);
      case 'audio':
        return this.processAudio(request);
      case 'video':
        return this.processVideo(request);
      default:
        return {
          success: false,
          error: `Unsupported content type: ${request.mimeType}`,
        };
    }
  }

  /**
   * Process a document file
   */
  private async processDocument(
    request: ProcessContentRequest,
  ): Promise<ProcessContentResult> {
    try {
      const { mimeType, fileUrl } = request;
      let extractedContent = '';
      let pageCount: number | undefined;

      if (mimeType === 'application/pdf') {
        const result = await this.extractPdfText(fileUrl);
        extractedContent = result.text;
        pageCount = result.pageCount;
      } else if (
        mimeType === 'text/plain' ||
        mimeType === 'text/markdown' ||
        mimeType === 'text/csv'
      ) {
        extractedContent = await this.fetchTextContent(fileUrl);
      } else if (
        mimeType ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        // For Word documents, we would need a library like mammoth
        // For now, return a placeholder
        return {
          success: false,
          error: 'Word document processing not yet implemented',
        };
      } else {
        return {
          success: false,
          error: `Unsupported document type: ${mimeType}`,
        };
      }

      // Truncate if too long
      if (extractedContent.length > this.maxDocumentChars) {
        extractedContent =
          extractedContent.substring(0, this.maxDocumentChars) +
          '\n\n[Content truncated due to length]';
      }

      const metadata: UploadedContentMetadata = {
        userId: request.userId,
        chatId: request.chatId,
        contentType: 'document',
        processingMethod: 'extraction',
        fileName: request.fileName,
        mimeType: request.mimeType,
        pageCount,
        confidenceScore: 1.0,
      };

      return {
        success: true,
        extractedContent,
        metadata,
      };
    } catch (error) {
      this.logger.error('Failed to process document:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Process an image file
   */
  private async processImage(
    request: ProcessContentRequest,
  ): Promise<ProcessContentResult> {
    try {
      let extractedContent = '';
      let processingMethod: 'ocr' | 'description' = 'description';

      // Try OCR first if enabled
      if (this.enableOcr) {
        const ocrResult = await this.performOcr(request.fileUrl);
        if (ocrResult && ocrResult.length > 20) {
          extractedContent = `[OCR Text]: ${ocrResult}`;
          processingMethod = 'ocr';
        }
      }

      // Get AI description if enabled and OCR didn't yield much
      if (this.enableImageDescription) {
        const visionProvider = this.getVisionProvider();
        if (visionProvider) {
          const description = await this.describeImage(
            request.fileUrl,
            request.mimeType,
          );
          if (description) {
            if (extractedContent) {
              extractedContent += `\n\n[AI Description]: ${description}`;
            } else {
              extractedContent = `[AI Description]: ${description}`;
              processingMethod = 'description';
            }
          }
        }
      }

      if (!extractedContent) {
        extractedContent = `[Image: ${request.fileName || 'unknown'}]`;
      }

      const metadata: UploadedContentMetadata = {
        userId: request.userId,
        chatId: request.chatId,
        contentType: 'image',
        processingMethod,
        fileName: request.fileName,
        mimeType: request.mimeType,
        confidenceScore: 0.8,
      };

      return {
        success: true,
        extractedContent,
        metadata,
      };
    } catch (error) {
      this.logger.error('Failed to process image:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Process an audio file
   */
  private async processAudio(
    request: ProcessContentRequest,
  ): Promise<ProcessContentResult> {
    const transcriptionProvider = this.getTranscriptionProvider();
    if (!this.enableTranscription || !transcriptionProvider) {
      return {
        success: false,
        error: 'Audio transcription not enabled or no provider configured',
      };
    }

    try {
      const transcription = await this.transcribeAudio(
        request.fileUrl,
        request.mimeType,
      );

      if (!transcription) {
        return {
          success: false,
          error: 'Failed to transcribe audio',
        };
      }

      const metadata: UploadedContentMetadata = {
        userId: request.userId,
        chatId: request.chatId,
        contentType: 'audio',
        processingMethod: 'transcription',
        fileName: request.fileName,
        mimeType: request.mimeType,
        confidenceScore: 0.9,
      };

      return {
        success: true,
        extractedContent: `[Audio Transcription]: ${transcription}`,
        metadata,
      };
    } catch (error) {
      this.logger.error('Failed to process audio:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Process a video file
   */
  private async processVideo(
    request: ProcessContentRequest,
  ): Promise<ProcessContentResult> {
    // Video processing would typically extract audio and transcribe
    // For now, we'll just note that it's a video
    const metadata: UploadedContentMetadata = {
      userId: request.userId,
      chatId: request.chatId,
      contentType: 'video',
      processingMethod: 'description',
      fileName: request.fileName,
      mimeType: request.mimeType,
    };

    return {
      success: true,
      extractedContent: `[Video file: ${request.fileName || 'unknown'}]`,
      metadata,
    };
  }

  /**
   * Extract text from PDF using mupdf
   *
   * Handles S3 URIs by fetching the file buffer directly.
   */
  private async extractPdfText(
    fileUrl: string,
  ): Promise<{ text: string; pageCount: number }> {
    try {
      let buffer: Buffer;

      // Handle S3 URIs/keys
      if (fileUrl.startsWith('s3://') || !fileUrl.includes('://')) {
        if (!this.s3Service) {
          throw new Error('S3Service not available - cannot fetch PDF');
        }
        const s3Key = fileUrl.replace(/^s3:\/\//, '');
        const downloadedBuffer = await this.s3Service.downloadFile(s3Key);

        if (!downloadedBuffer) {
          throw new Error(`PDF not found in S3: ${s3Key}`);
        }

        buffer = downloadedBuffer;
      } else {
        // Fetch from HTTP URL
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }

      // Use mupdf (already in dependencies)
      const mupdf = await import('mupdf');
      const document = mupdf.Document.openDocument(buffer, 'application/pdf');

      const pageCount = document.countPages();
      let text = '';

      for (let i = 0; i < pageCount; i++) {
        const page = document.loadPage(i);
        const pageText = page.toStructuredText('preserve-whitespace').asText();
        text += `\n--- Page ${i + 1} ---\n${pageText}`;
      }

      return { text: text.trim(), pageCount };
    } catch (error) {
      this.logger.error('PDF extraction failed:', error);
      throw new AiMemoryError(
        'Failed to extract PDF text',
        AiMemoryErrorCode.PROCESSING_FAILED,
        { error: error.message },
      );
    }
  }

  /**
   * Fetch plain text content from URL
   *
   * Handles S3 URIs by fetching the file buffer directly.
   */
  private async fetchTextContent(fileUrl: string): Promise<string> {
    // Handle S3 URIs/keys
    if (fileUrl.startsWith('s3://') || !fileUrl.includes('://')) {
      if (!this.s3Service) {
        throw new Error('S3Service not available - cannot fetch text file');
      }
      const s3Key = fileUrl.replace(/^s3:\/\//, '');
      const buffer = await this.s3Service.downloadFile(s3Key);

      if (!buffer) {
        throw new Error(`Text file not found in S3: ${s3Key}`);
      }

      return buffer.toString('utf-8');
    }

    // Fetch from HTTP URL
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch text file: ${response.status}`);
    }
    return response.text();
  }

  /**
   * Perform OCR on an image
   * Note: This is a placeholder - would need Tesseract or cloud OCR service
   */
  private async performOcr(fileUrl: string): Promise<string | null> {
    // OCR would require a library like Tesseract.js or a cloud service
    // For now, return null to skip OCR
    return null;
  }

  /**
   * Get AI description of an image using vision provider
   *
   * Handles URL resolution for S3 files, falling back to base64 encoding
   * if presigned URLs fail (some AI providers may have issues with them).
   */
  private async describeImage(
    fileUrl: string,
    mimeType: string,
  ): Promise<string | null> {
    const visionProvider = this.getVisionProvider();
    if (!visionProvider) return null;

    try {
      // First, try with presigned URL
      const resolvedUrl = await this.resolveFileUrl(fileUrl);

      try {
        const response = await visionProvider.analyzeImage({
          imageUrl: resolvedUrl,
          prompt:
            'Describe this image in detail. Focus on any text, data, or information that would be relevant for future reference. Keep the description concise but comprehensive.',
          maxTokens: 500,
        });

        return response.description || null;
      } catch (urlError: any) {
        // If presigned URL fails (e.g., provider can't access it), try base64
        if (
          urlError?.details?.originalError?.code === 'invalid_image_url' ||
          urlError?.message?.includes('Failed to download')
        ) {
          this.logger.warn(
            `Presigned URL failed for image analysis, falling back to base64: ${urlError.message}`,
          );

          const base64DataUrl = await this.fetchAsBase64DataUrl(
            fileUrl,
            mimeType,
          );

          const response = await visionProvider.analyzeImage({
            imageUrl: base64DataUrl,
            prompt:
              'Describe this image in detail. Focus on any text, data, or information that would be relevant for future reference. Keep the description concise but comprehensive.',
            maxTokens: 500,
          });

          return response.description || null;
        }

        throw urlError;
      }
    } catch (error) {
      this.logger.error('Image description failed:', error);
      return null;
    }
  }

  /**
   * Transcribe audio using configured transcription provider
   *
   * Handles URL resolution for S3 files.
   */
  private async transcribeAudio(
    fileUrl: string,
    mimeType: string,
  ): Promise<string | null> {
    const transcriptionProvider = this.getTranscriptionProvider();
    if (!transcriptionProvider) return null;

    try {
      // Resolve URL for S3 files
      const resolvedUrl = await this.resolveFileUrl(fileUrl);

      // Determine audio format from MIME type
      const format = this.getAudioFormatFromMimeType(mimeType);

      const response = await transcriptionProvider.transcribe({
        audioUrl: resolvedUrl,
        format,
      });

      return response.text || null;
    } catch (error) {
      this.logger.error('Audio transcription failed:', error);
      return null;
    }
  }

  /**
   * Get audio format from MIME type
   */
  private getAudioFormatFromMimeType(
    mimeType: string,
  ): 'mp3' | 'wav' | 'ogg' | 'webm' {
    const formatMap: Record<string, 'mp3' | 'wav' | 'ogg' | 'webm'> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
    };
    return formatMap[mimeType] || 'mp3';
  }

  /**
   * Categorize content type from MIME type
   */
  private categorizeContentType(
    mimeType: string,
  ): 'document' | 'image' | 'audio' | 'video' | 'unknown' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (
      mimeType === 'application/pdf' ||
      mimeType.startsWith('text/') ||
      mimeType.includes('document') ||
      mimeType.includes('word')
    ) {
      return 'document';
    }
    return 'unknown';
  }

  /**
   * Check if content type is supported
   */
  isSupported(mimeType: string): boolean {
    const category = this.categorizeContentType(mimeType);
    return category !== 'unknown';
  }

  /**
   * Get supported MIME types
   */
  getSupportedMimeTypes(): string[] {
    return [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/webm',
      'video/mp4',
      'video/webm',
    ];
  }
}
