/**
 * Thumbnail Configuration
 * Settings for image and video thumbnail generation
 */

export interface ThumbnailConfig {
  image: {
    maxWidth: number;
    maxHeight: number;
    quality: number;
    format: 'jpeg' | 'webp';
    progressive: boolean;
  };
  video: {
    extractTime: string; // FFmpeg time format (00:00:01)
    maxWidth: number;
    maxHeight: number;
    format: 'jpeg';
  };
  blurhash: {
    componentX: number;
    componentY: number;
    resizeWidth: number;
    resizeHeight: number;
  };
  job: {
    attempts: number;
    backoffType: 'exponential' | 'fixed';
    backoffDelay: number; // milliseconds
    removeOnComplete: boolean;
    removeOnFail: boolean;
    timeout: number; // milliseconds
  };
  limits: {
    maxFileSizeForInlineProcessing: number; // bytes
    concurrency: number;
    rateLimit: {
      max: number;
      duration: number; // milliseconds
    };
  };
}

export const thumbnailConfig: ThumbnailConfig = {
  image: {
    maxWidth: 300,
    maxHeight: 300,
    quality: 80,
    format: 'jpeg',
    progressive: true,
  },
  video: {
    extractTime: '00:00:01', // 1 second into video
    maxWidth: 300,
    maxHeight: 300,
    format: 'jpeg',
  },
  blurhash: {
    componentX: 4,
    componentY: 3,
    resizeWidth: 32,
    resizeHeight: 32,
  },
  job: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 1000, // 1s, 2s, 4s
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for debugging
    timeout: 60000, // 1 minute max per job
  },
  limits: {
    maxFileSizeForInlineProcessing: 50 * 1024 * 1024, // 50MB
    concurrency: 3, // Process 3 thumbnails at a time
    rateLimit: {
      max: 10,
      duration: 1000, // 10 jobs per second max
    },
  },
};

export const getThumbnailConfig = (): ThumbnailConfig => thumbnailConfig;
