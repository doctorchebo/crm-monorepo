/**
 * Progress Tracker
 *
 * Manages progress state for long-running regeneration jobs.
 * Supports:
 * - Persistent state to resume interrupted jobs
 * - Detailed statistics tracking
 * - ETA estimation
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

const PROGRESS_FILE = path.join(__dirname, '.regeneration-progress.json');

export interface ProgressState {
  /** Job ID for tracking */
  jobId: string;
  /** When the job started */
  startedAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Total attachments to process */
  totalItems: number;
  /** Successfully processed */
  processedItems: number;
  /** Failed items */
  failedItems: number;
  /** Skipped items (already processed or not applicable) */
  skippedItems: number;
  /** Current batch number */
  currentBatch: number;
  /** Total batches */
  totalBatches: number;
  /** IDs of processed message attachments */
  processedIds: string[];
  /** IDs that failed with error messages */
  failedIds: Array<{ id: string; error: string }>;
  /** Direction filter used */
  direction: 'inbound' | 'outbound' | 'all';
  /** Whether force regeneration is enabled */
  force: boolean;
  /** Job status */
  status: 'running' | 'completed' | 'failed' | 'interrupted';
}

export class ProgressTracker {
  private state: ProgressState | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Start a new progress tracking session
   */
  startNew(
    totalItems: number,
    direction: 'inbound' | 'outbound' | 'all',
    force: boolean,
    batchSize: number,
  ): ProgressState {
    this.state = {
      jobId: `regen-${Date.now()}`,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalItems,
      processedItems: 0,
      failedItems: 0,
      skippedItems: 0,
      currentBatch: 0,
      totalBatches: Math.ceil(totalItems / batchSize),
      processedIds: [],
      failedIds: [],
      direction,
      force,
      status: 'running',
    };

    this.save();
    return this.state;
  }

  /**
   * Load existing progress state
   */
  load(): ProgressState | null {
    try {
      if (fs.existsSync(PROGRESS_FILE)) {
        const data = fs.readFileSync(PROGRESS_FILE, 'utf-8');
        this.state = JSON.parse(data);
        return this.state;
      }
    } catch (error: any) {
      this.logger.warn(`Failed to load progress state: ${error.message}`);
    }
    return null;
  }

  /**
   * Save current progress state
   */
  save(): void {
    if (!this.state) return;

    try {
      this.state.updatedAt = new Date().toISOString();
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(this.state, null, 2));
    } catch (error: any) {
      this.logger.warn(`Failed to save progress state: ${error.message}`);
    }
  }

  /**
   * Update progress after processing an item
   */
  recordSuccess(itemId: string): void {
    if (!this.state) return;

    this.state.processedItems++;
    this.state.processedIds.push(itemId);

    // Save periodically (every 10 items) to reduce IO
    if (this.state.processedItems % 10 === 0) {
      this.save();
    }
  }

  /**
   * Record a failed item
   */
  recordFailure(itemId: string, error: string): void {
    if (!this.state) return;

    this.state.failedItems++;
    this.state.failedIds.push({ id: itemId, error });
    this.save();
  }

  /**
   * Record a skipped item
   */
  recordSkipped(itemId: string): void {
    if (!this.state) return;
    this.state.skippedItems++;
  }

  /**
   * Update current batch
   */
  updateBatch(batchNumber: number): void {
    if (!this.state) return;
    this.state.currentBatch = batchNumber;
    this.save();
  }

  /**
   * Mark job as completed
   */
  complete(): void {
    if (!this.state) return;
    this.state.status = 'completed';
    this.save();
  }

  /**
   * Mark job as failed
   */
  fail(): void {
    if (!this.state) return;
    this.state.status = 'failed';
    this.save();
  }

  /**
   * Check if an item was already processed
   */
  isProcessed(itemId: string): boolean {
    return this.state?.processedIds.includes(itemId) ?? false;
  }

  /**
   * Get current state
   */
  getState(): ProgressState | null {
    return this.state;
  }

  /**
   * Clear progress state (for new runs)
   */
  clear(): void {
    try {
      if (fs.existsSync(PROGRESS_FILE)) {
        fs.unlinkSync(PROGRESS_FILE);
      }
      this.state = null;
    } catch (error: any) {
      this.logger.warn(`Failed to clear progress state: ${error.message}`);
    }
  }

  /**
   * Calculate estimated time remaining
   */
  getETA(): string {
    if (!this.state || this.state.processedItems === 0) {
      return 'Calculating...';
    }

    const elapsed = Date.now() - new Date(this.state.startedAt).getTime();
    const itemsRemaining =
      this.state.totalItems -
      this.state.processedItems -
      this.state.failedItems -
      this.state.skippedItems;

    const msPerItem = elapsed / this.state.processedItems;
    const remainingMs = msPerItem * itemsRemaining;

    if (remainingMs < 60000) {
      return `~${Math.ceil(remainingMs / 1000)} seconds`;
    } else if (remainingMs < 3600000) {
      return `~${Math.ceil(remainingMs / 60000)} minutes`;
    } else {
      const hours = Math.floor(remainingMs / 3600000);
      const minutes = Math.ceil((remainingMs % 3600000) / 60000);
      return `~${hours}h ${minutes}m`;
    }
  }

  /**
   * Get formatted summary statistics
   */
  getSummary(): Record<string, any> {
    if (!this.state) {
      return { status: 'No active job' };
    }

    const elapsed = Date.now() - new Date(this.state.startedAt).getTime();
    const elapsedStr =
      elapsed < 60000
        ? `${Math.round(elapsed / 1000)}s`
        : `${Math.round(elapsed / 60000)}m`;

    return {
      'Job ID': this.state.jobId,
      Status: this.state.status,
      Started: this.state.startedAt,
      Elapsed: elapsedStr,
      Progress: `${this.state.processedItems + this.state.failedItems + this.state.skippedItems}/${this.state.totalItems}`,
      Processed: this.state.processedItems,
      Failed: this.state.failedItems,
      Skipped: this.state.skippedItems,
      'Current Batch': `${this.state.currentBatch}/${this.state.totalBatches}`,
      ETA: this.getETA(),
    };
  }
}
