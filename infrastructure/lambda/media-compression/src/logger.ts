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
  context?: Record<string, unknown>
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
    context?: Record<string, unknown>
  ) => {
    if (process.env.NODE_ENV !== "production") {
      log("DEBUG", message, jobId, context);
    }
  },
};
