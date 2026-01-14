/**
 * Contacts Import Lambda Entry Point
 *
 * Exports handlers for:
 * - handleFileParse: Parse CSV/XLSX files from S3
 * - handleValidation: Validate staging rows
 * - handleImportExecution: Move valid rows to contacts table
 */

import { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import * as Papa from "papaparse";
import * as XLSX from "xlsx";
import { Readable } from "stream";
import { withClient } from "./db";
import {
    ImportMessage,
    ParseMessage,
    ValidateMessage,
    ExecuteMessage,
    ParsedRow,
    FieldMapping,
    MappedContactData,
    ValidationError,
    BATCH_SIZE,
    DEFAULT_COUNTRY_CODE,
    REQUIRED_FIELDS,
} from "./types";
import { detectHeaders, hasFullNameColumn } from "./utils/header-detector";
import {
    normalizePhoneNumber,
    isValidPhoneNumber,
    isValidEmail,
    parseName,
} from "./utils/phone-normalizer";

const s3Client = new S3Client({});
const sqsClient = new SQSClient({});

const QUEUE_URL = process.env.QUEUE_URL || "";
const IMPORT_BUCKET = process.env.IMPORT_BUCKET || "";

// ============================================================================
// FILE PARSER HANDLER
// ============================================================================
export async function handleFileParse(
    event: SQSEvent
): Promise<SQSBatchResponse> {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
        try {
            const message: ParseMessage = JSON.parse(record.body);

            if (message.action !== "PARSE") {
                console.log(`Skipping non-PARSE message: ${message.action}`);
                continue;
            }

            console.log(`Processing PARSE job: ${message.jobId}`);

            // Download file from S3
            const s3Response = await s3Client.send(
                new GetObjectCommand({
                    Bucket: IMPORT_BUCKET,
                    Key: message.s3Key,
                })
            );

            if (!s3Response.Body) {
                throw new Error("Empty S3 response body");
            }

            // Convert stream to buffer
            const chunks: Uint8Array[] = [];
            const stream = s3Response.Body as Readable;
            for await (const chunk of stream) {
                chunks.push(chunk as Uint8Array);
            }
            const buffer = Buffer.concat(chunks);

            // Parse based on file extension
            const isExcel =
                message.originalFilename.endsWith(".xlsx") ||
                message.originalFilename.endsWith(".xls");
            const parsedRows = isExcel
                ? parseExcel(buffer)
                : parseCSV(buffer.toString("utf-8"));

            console.log(`Parsed ${parsedRows.rows.length} rows from file`);

            // Auto-detect headers
            const headerSuggestions = detectHeaders(parsedRows.headers);
            const fullNameColumn = hasFullNameColumn(parsedRows.headers);

            // Insert rows into staging table
            await withClient(async (client) => {
                // Start transaction
                await client.query("BEGIN");

                try {
                    // Insert staging rows in batches
                    for (let i = 0; i < parsedRows.rows.length; i += 500) {
                        const batch = parsedRows.rows.slice(i, i + 500);
                        const values: unknown[] = [];
                        const placeholders: string[] = [];

                        batch.forEach((row, idx) => {
                            const offset = idx * 4;
                            placeholders.push(
                                `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
                            );
                            values.push(
                                message.jobId,
                                JSON.stringify(row.data),
                                row.rowNumber,
                                "PENDING"
                            );
                        });

                        await client.query(
                            `INSERT INTO import_contacts_staging 
               (import_job_id, raw_data, row_number, status) 
               VALUES ${placeholders.join(", ")}`,
                            values
                        );
                    }

                    // Update job with total rows and suggested mappings
                    await client.query(
                        `UPDATE import_jobs 
             SET status = 'UPLOADED', 
                 total_rows = $1,
                 field_mapping = $2,
                 updated_at = NOW()
             WHERE id = $3`,
                        [
                            parsedRows.totalRows,
                            JSON.stringify({
                                suggestions: headerSuggestions,
                                fullNameColumn,
                                headers: parsedRows.headers,
                            }),
                            message.jobId,
                        ]
                    );

                    await client.query("COMMIT");
                } catch (err) {
                    await client.query("ROLLBACK");
                    throw err;
                }
            });

            console.log(`Successfully processed PARSE job: ${message.jobId}`);
        } catch (error) {
            console.error(`Error processing record:`, error);
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }
    }

    return { batchItemFailures };
}

// ============================================================================
// VALIDATION HANDLER
// ============================================================================
export async function handleValidation(
    event: SQSEvent
): Promise<SQSBatchResponse> {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
        try {
            const message: ValidateMessage = JSON.parse(record.body);

            if (message.action !== "VALIDATE") {
                console.log(`Skipping non-VALIDATE message: ${message.action}`);
                continue;
            }

            console.log(`Processing VALIDATE job: ${message.jobId}`);
            const batchSize = message.batchSize || BATCH_SIZE;
            const batchStart = message.batchStart || 0;

            await withClient(async (client) => {
                // Get job and field mapping
                const jobResult = await client.query(
                    `SELECT id, field_mapping FROM import_jobs WHERE id = $1`,
                    [message.jobId]
                );

                if (jobResult.rows.length === 0) {
                    throw new Error(`Job not found: ${message.jobId}`);
                }

                const fieldMapping = jobResult.rows[0].field_mapping as {
                    mapping: FieldMapping;
                    fullNameColumn?: string;
                };

                if (!fieldMapping?.mapping) {
                    throw new Error("No field mapping configured for job");
                }

                // Get staging rows to validate
                const stagingResult = await client.query(
                    `SELECT id, raw_data, row_number 
           FROM import_contacts_staging 
           WHERE import_job_id = $1 AND status = 'PENDING'
           ORDER BY row_number
           LIMIT $2 OFFSET $3`,
                    [message.jobId, batchSize, batchStart]
                );

                console.log(`Validating ${stagingResult.rows.length} rows`);

                let validCount = 0;
                let invalidCount = 0;
                let duplicateCount = 0;

                for (const row of stagingResult.rows) {
                    const rawData = row.raw_data as Record<string, unknown>;
                    const mapped = applyMapping(
                        rawData,
                        fieldMapping.mapping,
                        fieldMapping.fullNameColumn
                    );
                    const errors = validateMappedData(mapped);

                    let status = "VALID";
                    if (errors.length > 0) {
                        status = "INVALID";
                        invalidCount++;
                    } else {
                        // Check for duplicates
                        const isDuplicate = await checkDuplicate(
                            client,
                            mapped.phone_number,
                            mapped.email
                        );
                        if (isDuplicate) {
                            status = "DUPLICATE";
                            duplicateCount++;
                        } else {
                            validCount++;
                        }
                    }

                    // Update staging row
                    await client.query(
                        `UPDATE import_contacts_staging 
             SET mapped_data = $1, validation_errors = $2, status = $3
             WHERE id = $4`,
                        [
                            JSON.stringify(mapped),
                            JSON.stringify(errors),
                            status,
                            row.id,
                        ]
                    );
                }

                // Check if more rows to process
                const remainingResult = await client.query(
                    `SELECT COUNT(*) as count FROM import_contacts_staging 
           WHERE import_job_id = $1 AND status = 'PENDING'`,
                    [message.jobId]
                );

                const remainingCount = parseInt(remainingResult.rows[0].count, 10);

                if (remainingCount > 0) {
                    // Queue next batch
                    await sqsClient.send(
                        new SendMessageCommand({
                            QueueUrl: QUEUE_URL,
                            MessageBody: JSON.stringify({
                                action: "VALIDATE",
                                jobId: message.jobId,
                                batchStart: batchStart + batchSize,
                                batchSize,
                            }),
                        })
                    );
                } else {
                    // All rows validated, update job status
                    const countsResult = await client.query(
                        `SELECT 
               COUNT(*) FILTER (WHERE status = 'VALID') as valid_count,
               COUNT(*) FILTER (WHERE status = 'INVALID') as invalid_count,
               COUNT(*) FILTER (WHERE status = 'DUPLICATE') as duplicate_count
             FROM import_contacts_staging 
             WHERE import_job_id = $1`,
                        [message.jobId]
                    );

                    await client.query(
                        `UPDATE import_jobs 
             SET status = 'VALIDATED',
                 valid_rows = $1,
                 invalid_rows = $2,
                 duplicate_rows = $3,
                 updated_at = NOW()
             WHERE id = $4`,
                        [
                            countsResult.rows[0].valid_count,
                            countsResult.rows[0].invalid_count,
                            countsResult.rows[0].duplicate_count,
                            message.jobId,
                        ]
                    );
                }
            });

            console.log(`Successfully processed VALIDATE job: ${message.jobId}`);
        } catch (error) {
            console.error(`Error processing record:`, error);
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }
    }

    return { batchItemFailures };
}

// ============================================================================
// IMPORT EXECUTOR HANDLER
// ============================================================================
export async function handleImportExecution(
    event: SQSEvent
): Promise<SQSBatchResponse> {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
        try {
            const message: ExecuteMessage = JSON.parse(record.body);

            if (message.action !== "EXECUTE") {
                console.log(`Skipping non-EXECUTE message: ${message.action}`);
                continue;
            }

            console.log(`Processing EXECUTE job: ${message.jobId}`);
            const batchSize = message.batchSize || BATCH_SIZE;

            await withClient(async (client) => {
                // Update job status to PROCESSING
                await client.query(
                    `UPDATE import_jobs SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1`,
                    [message.jobId]
                );

                // Get valid staging rows
                const stagingResult = await client.query(
                    `SELECT id, mapped_data 
           FROM import_contacts_staging 
           WHERE import_job_id = $1 AND status = 'VALID'
           LIMIT $2`,
                    [message.jobId, batchSize]
                );

                console.log(`Importing ${stagingResult.rows.length} contacts`);

                if (stagingResult.rows.length === 0) {
                    // Check if more to process
                    const remainingResult = await client.query(
                        `SELECT COUNT(*) as count FROM import_contacts_staging 
             WHERE import_job_id = $1 AND status = 'VALID'`,
                        [message.jobId]
                    );

                    if (parseInt(remainingResult.rows[0].count, 10) === 0) {
                        // All done
                        await client.query(
                            `UPDATE import_jobs SET status = 'IMPORTED', updated_at = NOW() WHERE id = $1`,
                            [message.jobId]
                        );
                    }
                    return;
                }

                // Insert contacts in transaction
                await client.query("BEGIN");

                try {
                    for (const row of stagingResult.rows) {
                        const data = row.mapped_data as MappedContactData;

                        await client.query(
                            `INSERT INTO contacts 
               (first_name, last_name, country_code, phone_number, email, language, source, import_job_id)
               VALUES ($1, $2, $3, $4, $5, $6, 'IMPORT', $7)`,
                            [
                                data.first_name,
                                data.last_name || null,
                                data.country_code || DEFAULT_COUNTRY_CODE,
                                normalizePhoneNumber(data.phone_number || "", data.country_code),
                                data.email || null,
                                data.language || null,
                                message.jobId,
                            ]
                        );

                        // Mark staging row as processed (change status so it's not picked up again)
                        await client.query(
                            `UPDATE import_contacts_staging SET status = 'IMPORTED' WHERE id = $1`,
                            [row.id]
                        );
                    }

                    await client.query("COMMIT");
                } catch (err) {
                    await client.query("ROLLBACK");
                    throw err;
                }

                // Check if more rows to process
                const remainingResult = await client.query(
                    `SELECT COUNT(*) as count FROM import_contacts_staging 
           WHERE import_job_id = $1 AND status = 'VALID'`,
                    [message.jobId]
                );

                const remainingCount = parseInt(remainingResult.rows[0].count, 10);

                if (remainingCount > 0) {
                    // Queue next batch
                    await sqsClient.send(
                        new SendMessageCommand({
                            QueueUrl: QUEUE_URL,
                            MessageBody: JSON.stringify({
                                action: "EXECUTE",
                                jobId: message.jobId,
                                batchSize,
                            }),
                        })
                    );
                } else {
                    // All done
                    await client.query(
                        `UPDATE import_jobs SET status = 'IMPORTED', updated_at = NOW() WHERE id = $1`,
                        [message.jobId]
                    );
                }
            });

            console.log(`Successfully processed EXECUTE job: ${message.jobId}`);
        } catch (error) {
            console.error(`Error processing record:`, error);
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }
    }

    return { batchItemFailures };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseCSV(content: string): { headers: string[]; rows: ParsedRow[]; totalRows: number } {
    const result = Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
    });

    const headers = result.meta.fields || [];
    const rows: ParsedRow[] = (result.data as Record<string, unknown>[]).map(
        (data, idx) => ({
            rowNumber: idx + 2, // +2 because row 1 is headers, and we're 1-indexed
            data,
        })
    );

    return { headers, rows, totalRows: rows.length };
}

function parseExcel(buffer: Buffer): { headers: string[]; rows: ParsedRow[]; totalRows: number } {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];

    if (jsonData.length === 0) {
        return { headers: [], rows: [], totalRows: 0 };
    }

    const headers = (jsonData[0] as string[]).map((h) => String(h || "").trim());
    const rows: ParsedRow[] = [];

    for (let i = 1; i < jsonData.length; i++) {
        const rowData = jsonData[i] as unknown[];
        const data: Record<string, unknown> = {};

        headers.forEach((header, idx) => {
            data[header] = rowData[idx];
        });

        // Skip empty rows
        if (Object.values(data).some((v) => v !== null && v !== undefined && v !== "")) {
            rows.push({ rowNumber: i + 1, data });
        }
    }

    return { headers, rows, totalRows: rows.length };
}

function applyMapping(
    rawData: Record<string, unknown>,
    mapping: FieldMapping,
    fullNameColumn?: string
): MappedContactData {
    const result: MappedContactData = {};

    // Apply direct mappings
    for (const [sourceCol, targetField] of Object.entries(mapping)) {
        if (targetField && rawData[sourceCol] !== undefined) {
            result[targetField] = String(rawData[sourceCol] || "").trim();
        }
    }

    // Handle full name splitting
    if (fullNameColumn && rawData[fullNameColumn]) {
        const { firstName, lastName } = parseName(String(rawData[fullNameColumn]));
        if (!result.first_name) {
            result.first_name = firstName;
        }
        if (!result.last_name) {
            result.last_name = lastName || undefined;
        }
    }

    return result;
}

function validateMappedData(data: MappedContactData): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check required fields
    if (!data.first_name?.trim()) {
        errors.push({ field: "first_name", message: "First name is required" });
    }

    // Must have either phone or email
    const hasPhone = data.phone_number?.trim();
    const hasEmail = data.email?.trim();

    if (!hasPhone && !hasEmail) {
        errors.push({
            field: "phone_number",
            message: "Either phone number or email is required",
        });
    }

    // Validate phone format if provided
    if (hasPhone && !isValidPhoneNumber(data.phone_number!)) {
        errors.push({ field: "phone_number", message: "Invalid phone number format" });
    }

    // Validate email format if provided
    if (hasEmail && !isValidEmail(data.email!)) {
        errors.push({ field: "email", message: "Invalid email format" });
    }

    return errors;
}

async function checkDuplicate(
    client: any,
    phoneNumber?: string,
    email?: string
): Promise<boolean> {
    if (!phoneNumber && !email) return false;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (phoneNumber) {
        const normalized = normalizePhoneNumber(phoneNumber);
        conditions.push(`phone_number = $${paramIndex++}`);
        values.push(normalized);
    }

    if (email) {
        conditions.push(`email = $${paramIndex++}`);
        values.push(email.toLowerCase().trim());
    }

    const result = await client.query(
        `SELECT id FROM contacts 
     WHERE is_active = true AND (${conditions.join(" OR ")})
     LIMIT 1`,
        values
    );

    return result.rows.length > 0;
}

// Add IMPORTED status to types for tracking
declare module "./types" {
    interface StagingRowStatus {
        IMPORTED: "IMPORTED";
    }
}
