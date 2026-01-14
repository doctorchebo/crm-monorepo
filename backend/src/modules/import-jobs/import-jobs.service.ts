import { db } from '@database/db.connection';
import {
    importJobs,
    importContactsStaging,
    importMappingProfiles,
    contacts,
    ImportJob,
    ImportContactStaging,
    ImportMappingProfile,
} from '@database/schema';
import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, count, sql } from 'drizzle-orm';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
    FieldMappingData,
    ImportJobResponse,
    StagingPreviewResponse,
    StagingRowResponse,
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

    constructor(private configService: ConfigService) {
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
            '',
        );
        // Use local processing when in development or when queue URL is not set
        this.useLocalProcessing =
            this.configService.get('NODE_ENV', 'development') === 'development' ||
            !this.importQueueUrl;
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
        await db
            .update(importJobs)
            .set({ s3Key })
            .where(eq(importJobs.id, job.id));

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

        if (this.useLocalProcessing) {
            // Local development: parse synchronously
            this.logger.log(`Using local parsing for job ${jobId} (dev mode)`);
            await this.parseFileLocally(job);
        } else {
            // Production: send to SQS for Lambda processing
            await this.sqsClient.send(
                new SendMessageCommand({
                    QueueUrl: this.importQueueUrl,
                    MessageBody: JSON.stringify({
                        action: 'PARSE',
                        jobId: job.id,
                        s3Key: job.s3Key,
                        userId: job.userId,
                        originalFilename: job.originalFilename,
                    }),
                }),
            );
        }

        this.logger.log(`Triggered parsing for job ${jobId}`);
    }

    /**
     * Parse file locally (for development mode)
     */
    private async parseFileLocally(job: ImportJob): Promise<void> {
        try {
            // Download file from S3
            const response = await this.s3Client.send(
                new GetObjectCommand({
                    Bucket: this.importBucket,
                    Key: job.s3Key!,
                }),
            );

            const bodyStream = response.Body;
            if (!bodyStream) {
                throw new Error('Empty response from S3');
            }

            // Convert stream to buffer
            const chunks: Uint8Array[] = [];
            for await (const chunk of bodyStream as AsyncIterable<Uint8Array>) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            // Parse based on file type
            let rows: Record<string, string>[] = [];
            let headers: string[] = [];
            const filename = job.originalFilename || '';

            if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
                // Parse Excel
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                if (rows.length > 0) {
                    headers = Object.keys(rows[0]);
                }
            } else {
                // Parse CSV
                const csvContent = buffer.toString('utf-8');
                const result = Papa.parse(csvContent, {
                    header: true,
                    skipEmptyLines: true,
                });
                rows = result.data as Record<string, string>[];
                headers = result.meta.fields || [];
            }

            // Auto-detect field mappings
            const suggestions = this.detectFieldMappings(headers);

            // Insert staging rows in batches to avoid stack overflow
            const BATCH_SIZE = 1000;
            if (rows.length > 0) {
                for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                    const batch = rows.slice(i, i + BATCH_SIZE);
                    await db.insert(importContactsStaging).values(
                        batch.map((row, idx) => ({
                            importJobId: job.id,
                            rawData: row,
                            rowNumber: i + idx + 1,
                            status: 'PENDING',
                        })),
                    );

                    // Log progress for large files
                    if (rows.length > 10000 && (i + BATCH_SIZE) % 10000 === 0) {
                        this.logger.log(`Parsed ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} rows for job ${job.id}`);
                    }
                }
            }

            // Update job with parsed data
            await db
                .update(importJobs)
                .set({
                    totalRows: rows.length,
                    fieldMapping: {
                        headers,
                        suggestions,
                    },
                    updatedAt: new Date(),
                })
                .where(eq(importJobs.id, job.id));

            this.logger.log(
                `Parsed ${rows.length} rows from ${filename} for job ${job.id}`,
            );
        } catch (error) {
            this.logger.error(`Failed to parse file for job ${job.id}:`, error);
            await db
                .update(importJobs)
                .set({
                    status: 'FAILED',
                    errorMessage: `Parse error: ${(error as Error).message}`,
                    updatedAt: new Date(),
                })
                .where(eq(importJobs.id, job.id));
            throw error;
        }
    }

    /**
     * Auto-detect field mappings from headers
     */
    private detectFieldMappings(headers: string[]): Array<{
        sourceColumn: string;
        suggestedField: string | null;
        confidence: number;
    }> {
        const headerPatterns: Record<string, RegExp[]> = {
            first_name: [/first[\s_-]?name/i, /^first$/i, /nombre/i, /^name$/i],
            last_name: [/last[\s_-]?name/i, /^last$/i, /apellido/i, /surname/i],
            phone_number: [/phone/i, /tel/i, /mobile/i, /cell/i, /numero/i],
            email: [/email/i, /e-mail/i, /correo/i, /mail/i],
            country_code: [/country[\s_-]?code/i, /^country$/i, /codigo/i],
            language: [/language/i, /lang/i, /idioma/i],
        };

        return headers.map((header) => {
            for (const [field, patterns] of Object.entries(headerPatterns)) {
                for (const pattern of patterns) {
                    if (pattern.test(header)) {
                        return {
                            sourceColumn: header,
                            suggestedField: field,
                            confidence: pattern.test(header.toLowerCase()) ? 0.9 : 0.7,
                        };
                    }
                }
            }
            return {
                sourceColumn: header,
                suggestedField: null,
                confidence: 0,
            };
        });
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
            throw new BadRequestException(
                'Job must be in MAPPED status to validate',
            );
        }

        if (this.useLocalProcessing) {
            // Local development: start validation in background, return immediately
            this.logger.log(`Using local validation for job ${jobId} (dev mode)`);

            // Set status to VALIDATING immediately
            await db
                .update(importJobs)
                .set({
                    status: 'VALIDATING',
                    validRows: 0,
                    invalidRows: 0,
                    duplicateRows: 0,
                    updatedAt: new Date()
                })
                .where(eq(importJobs.id, jobId));

            // Run validation async (fire and forget)
            this.validateLocally(job).catch((err) => {
                this.logger.error(`Background validation failed for job ${jobId}:`, err);
            });
        } else {
            // Production: send to SQS for Lambda processing
            await this.sqsClient.send(
                new SendMessageCommand({
                    QueueUrl: this.importQueueUrl,
                    MessageBody: JSON.stringify({
                        action: 'VALIDATE',
                        jobId: job.id,
                        batchStart: 0,
                        batchSize,
                    }),
                }),
            );

            // Update status
            await db
                .update(importJobs)
                .set({ status: 'QUEUED', updatedAt: new Date() })
                .where(eq(importJobs.id, jobId));
        }

        this.logger.log(`Triggered validation for job ${jobId}`);
    }

    /**
     * Validate staging rows locally (for development mode)
     */
    private async validateLocally(job: ImportJob): Promise<void> {
        try {
            const fieldMapping = job.fieldMapping as FieldMappingData;
            const mapping = fieldMapping?.mapping || {};

            let validCount = 0;
            let invalidCount = 0;
            let duplicateCount = 0;

            // Track seen phones/emails for duplicate detection across all batches
            const seenPhones = new Set<string>();
            const seenEmails = new Set<string>();

            // Process in batches to handle large datasets
            const BATCH_SIZE = 1000;
            let offset = 0;
            let hasMore = true;

            while (hasMore) {
                // Fetch batch of staging rows
                const stagingRows = await db
                    .select()
                    .from(importContactsStaging)
                    .where(eq(importContactsStaging.importJobId, job.id))
                    .orderBy(importContactsStaging.rowNumber)
                    .limit(BATCH_SIZE)
                    .offset(offset);

                if (stagingRows.length === 0) {
                    hasMore = false;
                    break;
                }

                // Process batch
                const updates: Array<{ id: string; mappedData: Record<string, string>; errors: any[]; status: string }> = [];

                for (const row of stagingRows) {
                    const rawData = row.rawData as Record<string, string>;
                    const mappedData: Record<string, string> = {};
                    const errors: Array<{ field: string; message: string }> = [];

                    // Apply mapping
                    for (const [sourceCol, targetField] of Object.entries(mapping)) {
                        if (targetField && rawData[sourceCol] !== undefined) {
                            mappedData[targetField] = rawData[sourceCol]?.trim() || '';
                        }
                    }

                    // Validate required fields
                    if (!mappedData.first_name) {
                        errors.push({ field: 'first_name', message: 'First name is required' });
                    }

                    const hasPhone = mappedData.phone_number && mappedData.phone_number.length > 0;
                    const hasEmail = mappedData.email && mappedData.email.length > 0;

                    if (!hasPhone && !hasEmail) {
                        errors.push({ field: 'phone_number', message: 'Either phone or email is required' });
                    }

                    // Validate email format
                    if (hasEmail && !this.isValidEmail(mappedData.email)) {
                        errors.push({ field: 'email', message: 'Invalid email format' });
                    }

                    // Validate phone format (basic)
                    if (hasPhone && mappedData.phone_number.replace(/\D/g, '').length < 7) {
                        errors.push({ field: 'phone_number', message: 'Phone number too short' });
                    }

                    // Check for duplicates within file
                    let isDuplicate = false;
                    if (hasPhone) {
                        const normalizedPhone = mappedData.phone_number.replace(/\D/g, '');
                        if (seenPhones.has(normalizedPhone)) {
                            isDuplicate = true;
                        } else {
                            seenPhones.add(normalizedPhone);
                        }
                    }
                    if (hasEmail && !isDuplicate) {
                        const normalizedEmail = mappedData.email.toLowerCase();
                        if (seenEmails.has(normalizedEmail)) {
                            isDuplicate = true;
                        } else {
                            seenEmails.add(normalizedEmail);
                        }
                    }

                    // Determine status
                    let status: string;
                    if (isDuplicate) {
                        status = 'DUPLICATE';
                        duplicateCount++;
                    } else if (errors.length > 0) {
                        status = 'INVALID';
                        invalidCount++;
                    } else {
                        status = 'VALID';
                        validCount++;
                    }

                    updates.push({ id: row.id, mappedData, errors, status });
                }

                // Batch update staging rows
                for (const update of updates) {
                    await db
                        .update(importContactsStaging)
                        .set({
                            mappedData: update.mappedData,
                            validationErrors: update.errors,
                            status: update.status,
                        })
                        .where(eq(importContactsStaging.id, update.id));
                }

                offset += stagingRows.length;

                // Update job with current progress (for frontend polling)
                await db
                    .update(importJobs)
                    .set({
                        validRows: validCount,
                        invalidRows: invalidCount,
                        duplicateRows: duplicateCount,
                        updatedAt: new Date(),
                    })
                    .where(eq(importJobs.id, job.id));

                // Log progress for large files
                if (offset % 10000 === 0) {
                    this.logger.log(`Validated ${offset}/${job.totalRows} rows for job ${job.id}`);
                }

                // Check if we got less than batch size (last batch)
                if (stagingRows.length < BATCH_SIZE) {
                    hasMore = false;
                }
            }

            // Update job with counts
            await db
                .update(importJobs)
                .set({
                    status: 'VALIDATED',
                    validRows: validCount,
                    invalidRows: invalidCount,
                    duplicateRows: duplicateCount,
                    updatedAt: new Date(),
                })
                .where(eq(importJobs.id, job.id));

            this.logger.log(
                `Validated ${validCount + invalidCount + duplicateCount} rows for job ${job.id}: ${validCount} valid, ${invalidCount} invalid, ${duplicateCount} duplicates`,
            );
        } catch (error) {
            this.logger.error(`Failed to validate job ${job.id}:`, error);
            await db
                .update(importJobs)
                .set({
                    status: 'FAILED',
                    errorMessage: `Validation error: ${(error as Error).message}`,
                    updatedAt: new Date(),
                })
                .where(eq(importJobs.id, job.id));
            throw error;
        }
    }

    /**
     * Simple email validation
     */
    private isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

        if (this.useLocalProcessing) {
            // Local development: execute synchronously
            this.logger.log(`Using local import execution for job ${jobId} (dev mode)`);
            await this.commitImportLocally(job);
        } else {
            // Production: send to SQS for Lambda processing
            await this.sqsClient.send(
                new SendMessageCommand({
                    QueueUrl: this.importQueueUrl,
                    MessageBody: JSON.stringify({
                        action: 'EXECUTE',
                        jobId: job.id,
                        batchSize,
                    }),
                }),
            );

            // Update status
            await db
                .update(importJobs)
                .set({ status: 'QUEUED', updatedAt: new Date() })
                .where(eq(importJobs.id, jobId));
        }

        this.logger.log(`Triggered import execution for job ${jobId}`);
    }

    /**
     * Execute import locally (for development mode)
     */
    private async commitImportLocally(job: ImportJob): Promise<void> {
        try {
            let importedCount = 0;
            let skippedCount = 0;

            // Process in batches to handle large datasets
            const BATCH_SIZE = 1000;
            let offset = 0;
            let hasMore = true;

            while (hasMore) {
                // Fetch batch of valid staging rows
                const validRows = await db
                    .select()
                    .from(importContactsStaging)
                    .where(
                        and(
                            eq(importContactsStaging.importJobId, job.id),
                            eq(importContactsStaging.status, 'VALID'),
                        ),
                    )
                    .orderBy(importContactsStaging.rowNumber)
                    .limit(BATCH_SIZE)
                    .offset(offset);

                if (validRows.length === 0) {
                    hasMore = false;
                    break;
                }

                // Prepare batch of contacts to insert
                const contactsToInsert: Array<{
                    firstName: string;
                    lastName?: string;
                    email?: string;
                    language: string;
                    countryCode: string;
                    phoneNumber: string;
                    source: string;
                    importJobId: string;
                    isActive: boolean;
                }> = [];

                for (const row of validRows) {
                    const mappedData = row.mappedData as Record<string, string>;

                    // Build phone number with country code
                    let phoneNumber = mappedData.phone_number || '';
                    const countryCode = mappedData.country_code || '+1';

                    if (phoneNumber) {
                        phoneNumber = phoneNumber.replace(/\D/g, '');
                    }

                    // Skip if no phone number
                    if (!phoneNumber) {
                        skippedCount++;
                        continue;
                    }

                    contactsToInsert.push({
                        firstName: mappedData.first_name || 'Unknown',
                        lastName: mappedData.last_name || undefined,
                        email: mappedData.email || undefined,
                        language: mappedData.language || 'en',
                        countryCode: countryCode,
                        phoneNumber: phoneNumber,
                        source: 'IMPORT',
                        importJobId: job.id,
                        isActive: true,
                    });
                }

                // Batch insert contacts (in smaller chunks if needed)
                if (contactsToInsert.length > 0) {
                    const INSERT_CHUNK_SIZE = 100; // Smaller chunks for inserts
                    for (let i = 0; i < contactsToInsert.length; i += INSERT_CHUNK_SIZE) {
                        const chunk = contactsToInsert.slice(i, i + INSERT_CHUNK_SIZE);
                        await db.insert(contacts).values(chunk);
                        importedCount += chunk.length;
                    }
                }

                offset += validRows.length;

                // Log progress for large files
                if (offset % 10000 === 0) {
                    this.logger.log(`Imported ${importedCount} contacts for job ${job.id}`);
                }

                // Check if we got less than batch size (last batch)
                if (validRows.length < BATCH_SIZE) {
                    hasMore = false;
                }
            }

            // Update job status
            await db
                .update(importJobs)
                .set({
                    status: 'IMPORTED',
                    updatedAt: new Date(),
                })
                .where(eq(importJobs.id, job.id));

            this.logger.log(
                `Imported ${importedCount} contacts for job ${job.id}${skippedCount > 0 ? ` (${skippedCount} skipped - no phone)` : ''}`,
            );
        } catch (error) {
            this.logger.error(`Failed to execute import for job ${job.id}:`, error);
            await db
                .update(importJobs)
                .set({
                    status: 'FAILED',
                    errorMessage: `Import error: ${(error as Error).message}`,
                    updatedAt: new Date(),
                })
                .where(eq(importJobs.id, job.id));
            throw error;
        }
    }

    /**
     * Rollback an import (soft delete all contacts from this job)
     */
    async rollbackImport(jobId: string, userId: number): Promise<{ count: number }> {
        const job = await this.getJob(jobId, userId);

        if (job.status !== 'IMPORTED') {
            throw new BadRequestException('Can only rollback imported jobs');
        }

        // Soft delete all contacts from this import
        const result = await db
            .update(contacts)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(contacts.importJobId, jobId));

        // Update job status
        await db
            .update(importJobs)
            .set({ status: 'FAILED', errorMessage: 'Rolled back by user', updatedAt: new Date() })
            .where(eq(importJobs.id, jobId));

        this.logger.log(`Rolled back import job ${jobId}`);

        // Return count of affected rows (approximation)
        return { count: job.validRows || 0 };
    }

    /**
     * Delete a job and all associated data
     */
    async deleteJob(jobId: string, userId: number): Promise<void> {
        const job = await this.getJob(jobId, userId);

        // Prevent deleting completed imports without rollback
        if (job.status === 'IMPORTED') {
            throw new BadRequestException(
                'Cannot delete imported job. Use rollback first.',
            );
        }

        await db.delete(importJobs).where(eq(importJobs.id, jobId));

        this.logger.log(`Deleted import job ${jobId}`);
    }

    // ==================== Mapping Profiles ====================

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
     * Get all mapping profiles for a user
     */
    async getMappingProfiles(userId: number): Promise<ImportMappingProfile[]> {
        return db
            .select()
            .from(importMappingProfiles)
            .where(eq(importMappingProfiles.userId, userId))
            .orderBy(sql`${importMappingProfiles.createdAt} DESC`);
    }

    /**
     * Delete a mapping profile
     */
    async deleteMappingProfile(profileId: string, userId: number): Promise<void> {
        const result = await db
            .delete(importMappingProfiles)
            .where(
                and(
                    eq(importMappingProfiles.id, profileId),
                    eq(importMappingProfiles.userId, userId),
                ),
            );

        this.logger.log(`Deleted mapping profile ${profileId}`);
    }

    // ==================== Helper Methods ====================

    private getContentType(filename: string): string {
        if (filename.endsWith('.csv')) return 'text/csv';
        if (filename.endsWith('.xlsx'))
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (filename.endsWith('.xls')) return 'application/vnd.ms-excel';
        return 'application/octet-stream';
    }

    private mapJobToResponse(job: ImportJob): ImportJobResponse {
        return {
            id: job.id,
            userId: job.userId,
            status: job.status as ImportJobResponse['status'],
            originalFilename: job.originalFilename,
            totalRows: job.totalRows || 0,
            validRows: job.validRows || 0,
            invalidRows: job.invalidRows || 0,
            duplicateRows: job.duplicateRows || 0,
            fieldMapping: job.fieldMapping as FieldMappingData | null,
            createdAt: job.createdAt!,
            updatedAt: job.updatedAt!,
        };
    }

    private mapStagingRowToResponse(
        row: ImportContactStaging,
    ): StagingRowResponse {
        return {
            id: row.id,
            rowNumber: row.rowNumber,
            rawData: row.rawData as Record<string, unknown>,
            mappedData: row.mappedData as Record<string, unknown> | null,
            validationErrors: (row.validationErrors || []) as StagingRowResponse['validationErrors'],
            status: row.status as StagingRowResponse['status'],
        };
    }
}
