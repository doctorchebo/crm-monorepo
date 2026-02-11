import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '@database/db.connection';
import {
  contacts,
  importContactsStaging,
  ImportJob,
  importJobs,
  ImportMappingProfile,
  importMappingProfiles,
} from '@database/schema';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { and, count, eq, sql } from 'drizzle-orm';
import * as path from 'path';
import { AuditWriteService } from '../audit/audit-write.service';
import {
  FieldMappingData,
  ImportJobResponse,
  StagingPreviewResponse,
  UploadUrlResponse,
} from './dto';

@Injectable()
export class ImportJobsService {
  private readonly logger = new Logger(ImportJobsService.name);
  private readonly s3Client: S3Client;
  private readonly sqsClient: SQSClient;
  private readonly importBucket: string;
  private readonly importQueueUrl: string;
  private readonly useLocalProcessing: boolean;

  constructor(
    private configService: ConfigService,
    private auditService: AuditWriteService,
  ) {
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
    });
    this.sqsClient = new SQSClient({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
    });
    this.importBucket = this.configService.get(
      'CONTACTS_IMPORT_BUCKET',
      'contacts-import-files',
    );
    this.importQueueUrl = this.configService.get(
      'CONTACTS_IMPORT_QUEUE_URL',
      'contacts-import-queue',
    );

    // If in dev and using local DB, run handler locally because Lambda can't reach localhost
    const nodeEnv = this.configService.get('NODE_ENV', 'development');
    const dbUrl = this.configService.get('DATABASE_URL', '');
    const isLocalDb =
      dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

    this.useLocalProcessing = nodeEnv === 'development' && isLocalDb;

    if (this.useLocalProcessing) {
      this.logger.log(
        'UseLocalProcessing ENABLED: Executing Lambda code locally via child process.',
      );
    }
  }

  /**
   * Create a new import job and return a presigned URL for upload
   */
  async createJob(
    userId: number,
    originalFilename: string,
  ): Promise<UploadUrlResponse> {
    // Create job record
    const [job] = await db
      .insert(importJobs)
      .values({
        userId,
        originalFilename,
        status: 'UPLOADED',
      })
      .returning();

    // Generate S3 key
    const s3Key = `imports/${userId}/${job.id}/${originalFilename}`;

    // Update job with S3 key
    await db.update(importJobs).set({ s3Key }).where(eq(importJobs.id, job.id));

    // Generate presigned upload URL
    const command = new PutObjectCommand({
      Bucket: this.importBucket,
      Key: s3Key,
      ContentType: this.getContentType(originalFilename),
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    this.logger.log(`Created import job ${job.id} for user ${userId}`);

    await this.auditService.logImportStarted({
      userId,
      entityId: job.id,
      entityName: originalFilename,
    });

    return {
      jobId: job.id,
      uploadUrl,
      s3Key,
    };
  }

  /**
   * Notify backend that file upload is complete, trigger parsing
   */
  async notifyUploadComplete(jobId: string, userId: number): Promise<void> {
    const job = await this.getJob(jobId, userId);

    if (!job.s3Key) {
      throw new BadRequestException('Job has no S3 key');
    }

    const payload = {
      action: 'PARSE',
      jobId: job.id,
      s3Key: job.s3Key,
      userId: job.userId,
      originalFilename: job.originalFilename,
    };

    if (this.useLocalProcessing) {
      await this.invokeLocalHandler(payload);
    } else {
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.importQueueUrl,
          MessageBody: JSON.stringify(payload),
        }),
      );
    }

    this.logger.log(`Triggered parsing for job ${jobId}`);
  }

  /**
   * Get a single import job
   */
  async getJob(jobId: string, userId: number): Promise<ImportJob> {
    const [job] = await db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, jobId), eq(importJobs.userId, userId)));

    if (!job) {
      throw new NotFoundException(`Import job not found: ${jobId}`);
    }

    return job;
  }

  /**
   * Get all import jobs for a user
   */
  async getJobs(userId: number): Promise<ImportJobResponse[]> {
    const jobs = await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.userId, userId))
      .orderBy(sql`${importJobs.createdAt} DESC`);

    return jobs.map(this.mapJobToResponse);
  }

  /**
   * Save field mapping configuration
   */
  async saveFieldMapping(
    jobId: string,
    userId: number,
    mapping: Record<string, string | null>,
    fullNameColumn?: string,
    defaultCountryCode?: string,
  ): Promise<ImportJobResponse> {
    const job = await this.getJob(jobId, userId);

    // Get existing suggestions from parsed data
    const existingMapping = (job.fieldMapping as FieldMappingData) || {};

    const newFieldMapping: FieldMappingData = {
      ...existingMapping,
      mapping,
      fullNameColumn,
      defaultCountryCode,
    };

    const [updated] = await db
      .update(importJobs)
      .set({
        fieldMapping: newFieldMapping,
        status: 'MAPPED',
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, jobId))
      .returning();

    this.logger.log(`Saved field mapping for job ${jobId}`);

    return this.mapJobToResponse(updated);
  }

  /**
   * Trigger validation for a job
   */
  async triggerValidation(
    jobId: string,
    userId: number,
    batchSize: number = 500,
  ): Promise<void> {
    const job = await this.getJob(jobId, userId);

    if (job.status !== 'MAPPED') {
      throw new BadRequestException('Job must be in MAPPED status to validate');
    }

    const payload = {
      action: 'VALIDATE',
      jobId: job.id,
      batchStart: 0,
      batchSize,
    };

    if (this.useLocalProcessing) {
      // Update status immediately for local feeling
      await db
        .update(importJobs)
        .set({ status: 'QUEUED', updatedAt: new Date() })
        .where(eq(importJobs.id, jobId));

      this.invokeLocalHandler(payload).catch((err) => {
        this.logger.error(`Local validation failed for job ${jobId}`, err);
      });
    } else {
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.importQueueUrl,
          MessageBody: JSON.stringify(payload),
        }),
      );

      await db
        .update(importJobs)
        .set({ status: 'QUEUED', updatedAt: new Date() })
        .where(eq(importJobs.id, jobId));
    }

    this.logger.log(`Triggered validation for job ${jobId}`);
  }

  /**
   * Get staging rows preview
   */
  async getStagingPreview(
    jobId: string,
    userId: number,
    skip: number = 0,
    take: number = 50,
    statusFilter?: string,
  ): Promise<StagingPreviewResponse> {
    await this.getJob(jobId, userId); // Verify access

    // Build query conditions
    let conditions = eq(importContactsStaging.importJobId, jobId);
    if (statusFilter) {
      conditions = and(
        conditions,
        eq(importContactsStaging.status, statusFilter),
      ) as typeof conditions;
    }

    // Get rows
    const rows = await db
      .select()
      .from(importContactsStaging)
      .where(conditions)
      .orderBy(importContactsStaging.rowNumber)
      .limit(take)
      .offset(skip);

    // Get counts
    const [counts] = await db
      .select({
        total: count(),
        valid: sql<number>`COUNT(*) FILTER (WHERE status = 'VALID')`,
        invalid: sql<number>`COUNT(*) FILTER (WHERE status = 'INVALID')`,
        duplicate: sql<number>`COUNT(*) FILTER (WHERE status = 'DUPLICATE')`,
      })
      .from(importContactsStaging)
      .where(eq(importContactsStaging.importJobId, jobId));

    return {
      rows: rows.map(this.mapStagingRowToResponse),
      total: Number(counts?.total || 0),
      validCount: Number(counts?.valid || 0),
      invalidCount: Number(counts?.invalid || 0),
      duplicateCount: Number(counts?.duplicate || 0),
    };
  }

  /**
   * Commit the import (move valid rows to contacts)
   */
  async commitImport(
    jobId: string,
    userId: number,
    batchSize: number = 500,
  ): Promise<void> {
    const job = await this.getJob(jobId, userId);

    if (job.status !== 'VALIDATED') {
      throw new BadRequestException(
        'Job must be in VALIDATED status to commit',
      );
    }

    const payload = {
      action: 'EXECUTE',
      jobId: job.id,
      batchSize,
    };

    if (this.useLocalProcessing) {
      // Update status immediately
      await db
        .update(importJobs)
        .set({ status: 'QUEUED', updatedAt: new Date() })
        .where(eq(importJobs.id, jobId));

      this.invokeLocalHandler(payload).catch((err) => {
        this.logger.error(`Local execution failed for job ${jobId}`, err);
      });
    } else {
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.importQueueUrl,
          MessageBody: JSON.stringify(payload),
        }),
      );

      await db
        .update(importJobs)
        .set({ status: 'QUEUED', updatedAt: new Date() })
        .where(eq(importJobs.id, jobId));
    }

    this.logger.log(`Triggered import execution for job ${jobId}`);

    await this.auditService.logImportCompleted({
      userId,
      entityId: jobId,
      metadata: { status: 'QUEUED', batchSize },
    });
  }

  /**
   * Rollback an import (delete created contacts)
   */
  async rollbackImport(jobId: string, userId: number): Promise<void> {
    const job = await this.getJob(jobId, userId);

    if (job.status !== 'IMPORTED' && job.status !== 'FAILED') {
      throw new BadRequestException(
        'Job must be IMPORTED or FAILED to rollback',
      );
    }

    // Delete contacts created by this job
    // Note: Assuming contacts has importJobId based on standard pattern
    await db.delete(contacts).where(eq(contacts.importJobId, jobId));

    // Reset job status
    await db
      .update(importJobs)
      .set({
        status: 'VALIDATED', // Go back to validated state so they can try again
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, jobId));

    this.logger.log(`Rolled back import job ${jobId}`);

    await this.auditService.logImportRolledBack({
      userId,
      entityId: jobId,
    });
  }

  /**
   * Delete an import job
   */

  async deleteJob(jobId: string, userId: number): Promise<void> {
    // Verify existence and ownership
    await this.getJob(jobId, userId);

    await db.delete(importJobs).where(eq(importJobs.id, jobId));
    this.logger.log(`Deleted import job ${jobId}`);

    await this.auditService.log({
      userId,
      category: 'import',
      action: 'import_started',
      entityType: 'import_job',
      entityId: jobId,
      description: `Deleted import job ${jobId}`,
    });
  }

  /**
   * Get all mapping profiles
   */
  async getMappingProfiles(userId: number): Promise<ImportMappingProfile[]> {
    return db
      .select()
      .from(importMappingProfiles)
      .where(eq(importMappingProfiles.userId, userId))
      .orderBy(importMappingProfiles.createdAt);
  }

  /**
   * Create a mapping profile
   */
  async createMappingProfile(
    userId: number,
    providerName: string,
    mapping: Record<string, string | null>,
  ): Promise<ImportMappingProfile> {
    const [profile] = await db
      .insert(importMappingProfiles)
      .values({
        userId,
        providerName,
        mapping,
      })
      .returning();

    return profile;
  }

  /**
   * Delete a mapping profile
   */
  async deleteMappingProfile(profileId: string, userId: number): Promise<void> {
    const [profile] = await db
      .select()
      .from(importMappingProfiles)
      .where(
        and(
          eq(importMappingProfiles.id, profileId),
          eq(importMappingProfiles.userId, userId),
        ),
      );

    if (!profile) {
      throw new NotFoundException('Mapping profile not found');
    }

    await db
      .delete(importMappingProfiles)
      .where(eq(importMappingProfiles.id, profileId));
  }

  private async invokeLocalHandler(payload: any): Promise<void> {
    // Construct path to the runner script
    const runnerPath = path.resolve(
      process.cwd(),
      '../infrastructure/lambda/contacts-import/src/local-runner.ts',
    );

    this.logger.log(`Invoking Lambda handler locally: ${runnerPath}`);
    this.logger.debug(`Payload: ${JSON.stringify(payload)}`);

    // Mock Event
    const event = {
      Records: [
        {
          messageId: 'local-msg-' + Date.now(),
          receiptHandle: 'local-handle',
          body: JSON.stringify(payload),
          attributes: {},
          messageAttributes: {},
          md5OfBody: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'local-queue',
          awsRegion: 'us-east-1',
        },
      ],
    };

    // Prepare environment variables for the child process
    const env = {
      ...process.env,
      IMPORT_BUCKET: this.importBucket,
      QUEUE_URL: this.importQueueUrl,
      // Force SSL off for local execution if using local DB
      DATABASE_SSL: 'false',
    };

    const lambdaDir = path.dirname(path.dirname(runnerPath)); // Up to contacts-import/

    return new Promise((resolve, reject) => {
      this.logger.log(`Running in: ${lambdaDir}`);

      // Spawn process: npx ts-node src/local-runner.ts
      // Use shell: true for Windows npx compatibility
      // Input is piped via stdin
      const child = spawn('npx', ['ts-node', 'src/local-runner.ts'], {
        cwd: lambdaDir,
        env: env,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'], // piped stdin, stdout, stderr
      });

      // Handle errors on spawn
      child.on('error', (err) => {
        this.logger.error(`Failed to start child process: ${err.message}`);
        reject(err);
      });

      // Capture output
      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      // Handle exit
      child.on('close', (code) => {
        if (code !== 0) {
          this.logger.error(`Local Lambda stderr: ${stderrData}`);
          this.logger.warn(`Local Lambda stdout (partial): ${stdoutData}`);
          reject(new Error(`Lambda execution failed with code ${code}`));
        } else {
          this.logger.log(`Local Lambda stdout: ${stdoutData}`);
          if (stderrData) {
            // Sometimes stderr has warnings even on success
            this.logger.warn(`Local Lambda warnings: ${stderrData}`);
          }
          resolve();
        }
      });

      // Write payload to stdin
      try {
        const eventJson = JSON.stringify(event);
        child.stdin.write(eventJson);
        child.stdin.end();
      } catch (err: any) {
        this.logger.error(`Error writing to stdin: ${err.message}`);
        // Ensure we kill the child if we failed to write
        child.kill();
        reject(err);
      }
    });
  }

  private getContentType(filename: string): string {
    if (filename.endsWith('.csv')) return 'text/csv';
    if (filename.endsWith('.xlsx'))
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return 'application/octet-stream';
  }

  private mapJobToResponse(job: ImportJob): ImportJobResponse {
    return {
      id: job.id,
      userId: job.userId,
      originalFilename: job.originalFilename,
      status: job.status as
        | 'UPLOADED'
        | 'MAPPED'
        | 'VALIDATED'
        | 'QUEUED'
        | 'PROCESSING'
        | 'IMPORTED'
        | 'FAILED',
      totalRows: job.totalRows || 0,
      validRows: job.validRows || 0,
      invalidRows: job.invalidRows || 0,
      duplicateRows: job.duplicateRows || 0,
      createdAt: job.createdAt || new Date(),
      updatedAt: job.updatedAt || job.createdAt || new Date(),
      fieldMapping: (job.fieldMapping as FieldMappingData) || {},
    };
  }

  private mapStagingRowToResponse(row: any): any {
    return {
      id: row.id,
      rowNumber: row.rowNumber,
      rawData: row.rawData,
      mappedData: row.mappedData,
      validationErrors: row.validationErrors,
      status: row.status,
    };
  }
}
