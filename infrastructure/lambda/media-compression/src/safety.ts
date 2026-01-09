/**
 * Safety Module - Prevents Infinite Loops & Runaway Costs
 *
 * This module provides critical safeguards against:
 * 1. Infinite retry loops (max attempts exceeded)
 * 2. Stale jobs that should have been processed long ago
 * 3. Files too large to process within Lambda limits
 *
 * These safeguards are CRITICAL for preventing exorbitant AWS bills.
 */

import { logger } from "./logger";
import {
  DEFAULT_SAFETY_LIMITS,
  JobSafetyConfig,
  MediaJobMessage,
} from "./types";

/**
 * Result of safety validation
 */
export interface SafetyValidationResult {
  /** Whether the job passes safety checks */
  isValid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?:
    | "MAX_ATTEMPTS_EXCEEDED"
    | "JOB_EXPIRED"
    | "FILE_TOO_LARGE"
    | "INVALID_SAFETY_CONFIG";
  /** Whether this is a permanent failure (should not be retried) */
  permanentFailure: boolean;
  /** Current attempt number */
  attempt: number;
  /** Max attempts allowed */
  maxAttempts: number;
  /** Job age in milliseconds */
  ageMs?: number;
}

/**
 * Validate job safety configuration
 *
 * This is the FIRST thing that should be checked when processing a job.
 * If validation fails, the job should be rejected and marked as permanently failed.
 *
 * @param message - The job message to validate
 * @returns Validation result with details
 */
export function validateJobSafety(
  message: MediaJobMessage
): SafetyValidationResult {
  const safety = message.safety || {};
  const attempt = safety.attempt || 1;
  const maxAttempts = safety.maxAttempts || DEFAULT_SAFETY_LIMITS.maxAttempts;
  const maxAgeMs = safety.maxAgeMs || DEFAULT_SAFETY_LIMITS.maxAgeMs;

  // Calculate job age if createdAt is provided
  let ageMs: number | undefined;
  if (safety.createdAt) {
    try {
      const createdAt = new Date(safety.createdAt).getTime();
      ageMs = Date.now() - createdAt;
    } catch {
      // Invalid date format - ignore
    }
  }

  // Check 1: Max attempts exceeded
  if (attempt > maxAttempts) {
    logger.error("Job exceeded maximum attempts", message.jobId, {
      attempt,
      maxAttempts,
      inputKey: message.inputKey,
    });

    return {
      isValid: false,
      error: `Maximum attempts exceeded (${attempt}/${maxAttempts}). Job will not be retried.`,
      errorCode: "MAX_ATTEMPTS_EXCEEDED",
      permanentFailure: true,
      attempt,
      maxAttempts,
      ageMs,
    };
  }

  // Check 2: Job too old (stale)
  if (ageMs !== undefined && ageMs > maxAgeMs) {
    const ageMinutes = Math.round(ageMs / 60000);
    const maxAgeMinutes = Math.round(maxAgeMs / 60000);

    logger.error("Job is too old (stale)", message.jobId, {
      ageMs,
      maxAgeMs,
      ageMinutes,
      maxAgeMinutes,
      createdAt: safety.createdAt,
    });

    return {
      isValid: false,
      error: `Job is too old (${ageMinutes} minutes > ${maxAgeMinutes} minutes max). Job will not be processed.`,
      errorCode: "JOB_EXPIRED",
      permanentFailure: true,
      attempt,
      maxAttempts,
      ageMs,
    };
  }

  // All checks passed
  logger.info("Job passed safety validation", message.jobId, {
    attempt,
    maxAttempts,
    ageMs,
  });

  return {
    isValid: true,
    permanentFailure: false,
    attempt,
    maxAttempts,
    ageMs,
  };
}

/**
 * Check if file size is within limits for thumbnail generation
 *
 * @param sizeBytes - File size in bytes
 * @param jobId - Job ID for logging
 * @returns Validation result
 */
export function validateThumbnailFileSize(
  sizeBytes: number,
  jobId: string
): SafetyValidationResult {
  const maxSize = DEFAULT_SAFETY_LIMITS.maxFileSizeBytes.thumbnail;

  if (sizeBytes > maxSize) {
    const sizeMB = Math.round(sizeBytes / (1024 * 1024));
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));

    logger.error("File too large for thumbnail generation", jobId, {
      sizeBytes,
      maxSizeBytes: maxSize,
      sizeMB,
      maxSizeMB,
    });

    return {
      isValid: false,
      error: `File too large for thumbnail (${sizeMB}MB > ${maxSizeMB}MB max)`,
      errorCode: "FILE_TOO_LARGE",
      permanentFailure: true,
      attempt: 1,
      maxAttempts: 1,
    };
  }

  return {
    isValid: true,
    permanentFailure: false,
    attempt: 1,
    maxAttempts: DEFAULT_SAFETY_LIMITS.maxAttempts,
  };
}

/**
 * Check if file size is within limits for compression
 *
 * @param sizeBytes - File size in bytes
 * @param jobId - Job ID for logging
 * @returns Validation result
 */
export function validateCompressionFileSize(
  sizeBytes: number,
  jobId: string
): SafetyValidationResult {
  const maxSize = DEFAULT_SAFETY_LIMITS.maxFileSizeBytes.compression;

  if (sizeBytes > maxSize) {
    const sizeGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(2);
    const maxSizeGB = (maxSize / (1024 * 1024 * 1024)).toFixed(2);

    logger.error("File too large for compression", jobId, {
      sizeBytes,
      maxSizeBytes: maxSize,
      sizeGB,
      maxSizeGB,
    });

    return {
      isValid: false,
      error: `File too large for compression (${sizeGB}GB > ${maxSizeGB}GB max)`,
      errorCode: "FILE_TOO_LARGE",
      permanentFailure: true,
      attempt: 1,
      maxAttempts: 1,
    };
  }

  return {
    isValid: true,
    permanentFailure: false,
    attempt: 1,
    maxAttempts: DEFAULT_SAFETY_LIMITS.maxAttempts,
  };
}

/**
 * Determine if an error should cause a permanent failure (no retry)
 *
 * Some errors indicate the job can never succeed and should not be retried:
 * - Format not supported
 * - Corrupted file
 * - Invalid input
 *
 * @param error - The error that occurred
 * @returns true if the error is permanent
 */
export function isPermanentError(error: Error | string): boolean {
  const errorMessage =
    typeof error === "string" ? error : error.message.toLowerCase();
  const message = errorMessage.toLowerCase();

  // Permanent error patterns
  const permanentPatterns = [
    "unsupported",
    "invalid",
    "corrupt",
    "not recognized",
    "no such file",
    "permission denied",
    "access denied",
    "format not supported",
    "cannot open",
    "unknown format",
    "unrecognized option",
  ];

  return permanentPatterns.some((pattern) => message.includes(pattern));
}

/**
 * Create safety config for a new job
 *
 * Use this when creating a new job to ensure proper safety tracking.
 *
 * @param overrides - Optional overrides for safety config
 * @returns Safety configuration
 */
export function createSafetyConfig(
  overrides?: Partial<JobSafetyConfig>
): JobSafetyConfig {
  return {
    attempt: 1,
    maxAttempts: DEFAULT_SAFETY_LIMITS.maxAttempts,
    createdAt: new Date().toISOString(),
    maxAgeMs: DEFAULT_SAFETY_LIMITS.maxAgeMs,
    ...overrides,
  };
}
