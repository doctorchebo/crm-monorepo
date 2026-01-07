/**
 * Video Compression Module - Public API
 *
 * Export only what consumers need to use from this module.
 */

// Module
export { VideoCompressionModule } from './video-compression.module';

// Services
export { CompressionQueueService } from './compression-queue.service';
export { VideoCompressionService } from './video-compression.service';

// Types
export {
  COMPRESSION_EVENTS,
  COMPRESSION_PRESETS,
  CompressionJobData,
  CompressionPreset,
  CompressionResult,
  CompressionStatus,
  CompressionStatusEvent,
  UPLOAD_FILE_SIZE_LIMITS,
  VIDEO_COMPRESSION_JOB_NAME,
  VIDEO_COMPRESSION_QUEUE_NAME,
  WHATSAPP_SEND_LIMITS,
  getCompressionPreset,
  isWithinUploadLimits,
  needsCompression,
} from './video-compression.types';
