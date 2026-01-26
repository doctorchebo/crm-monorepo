/**
 * Structured Logging Utility
 *
 * Provides consistent JSON-formatted logging for CloudWatch.
 * All logs are structured for easy querying and analysis.
 */

import { StructuredLog } from "./types";

/**
 * Log a structured message to stdout (CloudWatch Logs)
 */
function log(
  level: StructuredLog["level"],
  message: string,
  jobId?: string,
  context?: Record<string, unknown>,
): void {
  const entry: StructuredLog = {
    level,
    message,
    jobId,
    context,
    timestamp: new Date().toISOString(),
  };

  // CloudWatch Logs expects JSON on stdout
  console.log(JSON.stringify(entry));
}

/**
 * Structured logger for consistent CloudWatch log format
 */
export const logger = {
  /**
   * Log info message
   */
  info: (message: string, jobId?: string, context?: Record<string, unknown>) =>
    log("INFO", message, jobId, context),

  /**
   * Log warning message
   */
  warn: (message: string, jobId?: string, context?: Record<string, unknown>) =>
    log("WARN", message, jobId, context),

  /**
   * Log error message
   */
  error: (message: string, jobId?: string, context?: Record<string, unknown>) =>
    log("ERROR", message, jobId, context),

  /**
   * Log debug message (only in development)
   */
  debug: (
    message: string,
    jobId?: string,
    context?: Record<string, unknown>,
  ) => {
    if (process.env.NODE_ENV !== "production") {
      log("DEBUG", message, jobId, context);
    }
  },
};

/**
 * Extract a meaningful error message from any error type
 * Handles AWS SDK v3 errors, standard Errors, and unknown types
 */
export function extractErrorMessage(error: unknown): string {
  // Standard Error instance
  if (error instanceof Error) {
    return error.message || error.name || "Unknown Error";
  }

  // AWS SDK v3 errors and similar objects with message property
  if (error && typeof error === "object") {
    const errorObj = error as Record<string, unknown>;

    // Try common error properties in order of preference
    if (typeof errorObj.message === "string" && errorObj.message) {
      return errorObj.message;
    }
    if (typeof errorObj.Message === "string" && errorObj.Message) {
      return errorObj.Message;
    }
    if (typeof errorObj.errorMessage === "string" && errorObj.errorMessage) {
      return errorObj.errorMessage;
    }
    if (typeof errorObj.name === "string" && errorObj.name) {
      // AWS SDK errors often have a name like "NoSuchKey"
      const code = typeof errorObj.Code === "string" ? errorObj.Code : "";
      return code ? `${errorObj.name}: ${code}` : errorObj.name;
    }
    if (typeof errorObj.code === "string" && errorObj.code) {
      return errorObj.code;
    }
    if (typeof errorObj.Code === "string" && errorObj.Code) {
      return errorObj.Code;
    }

    // Try to stringify the object for debugging
    try {
      const str = JSON.stringify(error);
      if (str && str !== "{}") {
        return `Error object: ${str.substring(0, 500)}`;
      }
    } catch {
      // JSON.stringify can fail on circular references
    }
  }

  // String error
  if (typeof error === "string" && error) {
    return error;
  }

  // Fallback
  return `Unknown error type: ${typeof error}`;
}

/**
 * Extract detailed error information for logging
 * Includes stack trace and additional AWS SDK error details
 */
export function extractErrorDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {
    message: extractErrorMessage(error),
    type: typeof error,
  };

  if (error instanceof Error) {
    details.name = error.name;
    details.stack = error.stack?.split("\n").slice(0, 5).join("\n"); // First 5 lines
  }

  if (error && typeof error === "object") {
    const errorObj = error as Record<string, unknown>;

    // AWS SDK v3 specific properties
    if (errorObj.$metadata) {
      details.awsMetadata = errorObj.$metadata;
    }
    if (errorObj.Code) {
      details.awsCode = errorObj.Code;
    }
    if (errorObj.$fault) {
      details.awsFault = errorObj.$fault;
    }
    if (errorObj.$retryable) {
      details.awsRetryable = errorObj.$retryable;
    }
  }

  return details;
}
