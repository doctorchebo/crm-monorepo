import { Logger } from '@nestjs/common';

/**
 * Exponential Backoff Retry Utility
 *
 * Implements retry logic with exponential backoff to prevent:
 * - Infinite retry loops that can cause WABA bans
 * - Rate limiting issues
 * - Resource exhaustion
 *
 * CRITICAL: Never retry failed WhatsApp API calls infinitely.
 * Meta will ban accounts that make repeated failed requests.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum number of retry attempts before giving up
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Base delay in milliseconds for exponential backoff
 * First retry: 1000ms, Second: 2000ms, Third: 4000ms
 */
export const BASE_DELAY_MS = 1000;

/**
 * Maximum delay cap to prevent extremely long waits
 */
export const MAX_DELAY_MS = 30000;

/**
 * Jitter factor to add randomness to retry delays (0-1)
 * Helps prevent thundering herd problem
 */
export const JITTER_FACTOR = 0.2;

// ============================================================================
// Types
// ============================================================================

export interface RetryConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
  /**
   * Function to determine if an error is retryable
   * Default: retry on network errors and 5xx status codes
   */
  isRetryable?: (error: any) => boolean;
  /**
   * Logger instance for logging retry attempts
   */
  logger?: Logger;
  /**
   * Operation name for logging purposes
   */
  operationName?: string;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
}

export interface RetryAttemptInfo {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: Error;
}

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Determine if an error is retryable
 * Non-retryable errors: validation errors, auth errors, rate limits near quota
 */
export function isRetryableError(error: any): boolean {
  // If we have an HTTP status code
  if (error.response?.status) {
    const status = error.response.status;

    // Don't retry client errors (except 429 rate limiting)
    if (status >= 400 && status < 500) {
      // Rate limiting - might be retryable but we should be careful
      if (status === 429) {
        // Check if we have retry-after header
        const retryAfter = error.response.headers?.['retry-after'];
        // Only retry if retry-after is reasonable (< 60 seconds)
        return retryAfter && parseInt(retryAfter, 10) < 60;
      }
      return false;
    }

    // Server errors are generally retryable
    if (status >= 500) {
      return true;
    }
  }

  // Network errors are retryable
  if (
    error.code === 'ECONNRESET' ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ENOTFOUND' ||
    error.message?.includes('network') ||
    error.message?.includes('timeout')
  ) {
    return true;
  }

  // WhatsApp API specific non-retryable errors
  const message = error.message?.toLowerCase() || '';
  const nonRetryablePatterns = [
    'invalid',
    'unauthorized',
    'forbidden',
    'not found',
    'bad request',
    'template not approved',
    'conversation window',
    'outside 24',
    'rate limit exceeded',
    'spam',
    'blocked',
    'banned',
  ];

  for (const pattern of nonRetryablePatterns) {
    if (message.includes(pattern)) {
      return false;
    }
  }

  // Default: don't retry unknown errors to be safe
  return false;
}

// ============================================================================
// Delay Calculation
// ============================================================================

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  baseDelayMs: number = BASE_DELAY_MS,
  maxDelayMs: number = MAX_DELAY_MS,
  jitterFactor: number = JITTER_FACTOR,
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);

  // Cap at maximum
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (random +/- jitterFactor%)
  const jitter = cappedDelay * jitterFactor * (Math.random() * 2 - 1);

  return Math.round(cappedDelay + jitter);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Main Retry Function
// ============================================================================

/**
 * Execute a function with exponential backoff retry
 *
 * @param fn - The async function to execute
 * @param config - Retry configuration
 * @returns RetryResult with success status and result or error
 *
 * @example
 * const result = await withRetry(
 *   () => sendWhatsAppMessage(payload),
 *   {
 *     maxAttempts: 3,
 *     operationName: 'sendWhatsAppMessage',
 *     logger: this.logger,
 *   }
 * );
 *
 * if (!result.success) {
 *   // Log error and don't retry further
 *   this.logger.error(`Failed after ${result.attempts} attempts: ${result.error.message}`);
 * }
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
): Promise<RetryResult<T>> {
  const {
    maxAttempts = MAX_RETRY_ATTEMPTS,
    baseDelayMs = BASE_DELAY_MS,
    maxDelayMs = MAX_DELAY_MS,
    jitterFactor = JITTER_FACTOR,
    isRetryable = isRetryableError,
    logger,
    operationName = 'operation',
  } = config;

  let lastError: Error | undefined;
  let totalDelayMs = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt,
        totalDelayMs,
      };
    } catch (error) {
      lastError = error as Error;

      // Log the attempt
      if (logger) {
        logger.warn(
          `${operationName} failed on attempt ${attempt}/${maxAttempts}: ${lastError.message}`,
        );
      }

      // Check if we should retry
      if (attempt >= maxAttempts) {
        if (logger) {
          logger.error(
            `${operationName} failed permanently after ${maxAttempts} attempts. Last error: ${lastError.message}`,
          );
        }
        break;
      }

      if (!isRetryable(error)) {
        if (logger) {
          logger.error(
            `${operationName} failed with non-retryable error: ${lastError.message}`,
          );
        }
        break;
      }

      // Calculate and apply delay
      const delayMs = calculateDelay(
        attempt,
        baseDelayMs,
        maxDelayMs,
        jitterFactor,
      );
      totalDelayMs += delayMs;

      if (logger) {
        logger.log(
          `${operationName}: Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts})`,
        );
      }

      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxAttempts,
    totalDelayMs,
  };
}

/**
 * Decorator-style retry wrapper for class methods
 * Creates a new function that wraps the original with retry logic
 */
export function createRetryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: RetryConfig = {},
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const result = await withRetry(() => fn(...args), config);
    if (!result.success) {
      throw result.error;
    }
    return result.result;
  }) as T;
}
