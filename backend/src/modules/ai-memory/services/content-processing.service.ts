import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
 */
@Injectable()
export class ContentProcessingService {
  private readonly logger = new Logger(ContentProcessingService.name);
  private readonly enableOcr: boolean;
  private readonly enableImageDescription: boolean;
  private readonly enableTranscription: boolean;
  private readonly maxDocumentChars: number;
  private readonly maxAudioDurationSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly providerRegistry: ProviderRegistry,
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
          const description = await this.describeImage(request.fileUrl);
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
      const transcription = await this.transcribeAudio(request.fileUrl);

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
   */
  private async extractPdfText(
    fileUrl: string,
  ): Promise<{ text: string; pageCount: number }> {
    try {
      // Fetch the PDF
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();

      // Use mupdf (already in dependencies)
      const mupdf = await import('mupdf');
      const document = mupdf.Document.openDocument(
        Buffer.from(arrayBuffer),
        'application/pdf',
      );

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
   */
  private async fetchTextContent(fileUrl: string): Promise<string> {
    const response = await fetch(fileUrl);
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
   */
  private async describeImage(fileUrl: string): Promise<string | null> {
    const visionProvider = this.getVisionProvider();
    if (!visionProvider) return null;

    try {
      const response = await visionProvider.analyzeImage({
        imageUrl: fileUrl,
        prompt:
          'Describe this image in detail. Focus on any text, data, or information that would be relevant for future reference. Keep the description concise but comprehensive.',
        maxTokens: 500,
      });

      return response.description || null;
    } catch (error) {
      this.logger.error('Image description failed:', error);
      return null;
    }
  }

  /**
   * Transcribe audio using configured transcription provider
   */
  private async transcribeAudio(fileUrl: string): Promise<string | null> {
    const transcriptionProvider = this.getTranscriptionProvider();
    if (!transcriptionProvider) return null;

    try {
      const response = await transcriptionProvider.transcribe({
        audioUrl: fileUrl,
        format: 'mp3',
      });

      return response.text || null;
    } catch (error) {
      this.logger.error('Audio transcription failed:', error);
      return null;
    }
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
