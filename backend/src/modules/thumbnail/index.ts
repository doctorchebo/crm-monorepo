/**
 * Thumbnail Module Barrel Export
 *
 * All thumbnails are generated via AWS Lambda.
 * No local fallback - if Lambda fails, thumbnail is not generated.
 */

export * from './thumbnail-queue.service';
export * from './thumbnail.module';
export * from './thumbnail.service';
export * from './thumbnail.types';
