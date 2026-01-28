/**
 * Contacts Import Lambda Entry Point
 *
 * Exports a single unified handler for all import actions:
 * - PARSE: Parse CSV/XLSX files from S3
 * - VALIDATE: Validate staging rows
 * - EXECUTE: Move valid rows to contacts table
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from "aws-lambda";
import * as Papa from "papaparse";
import { Readable } from "stream";
import * as XLSX from "xlsx";
import { withClient } from "./db";
import {
  BATCH_SIZE,
  DEFAULT_COUNTRY_CODE,
  ExecuteMessage,
  FieldMapping,
  ImportMessage,
  MappedContactData,
  ParseMessage,
  ParsedRow,
  ValidateMessage,
  ValidationError,
} from "./types";
import { detectHeaders, hasFullNameColumn } from "./utils/header-detector";
import {
  isValidEmail,
  isValidPhoneNumber,
  normalizePhoneNumber,
  parseName,
} from "./utils/phone-normalizer";

const s3Client = new S3Client({});
const sqsClient = new SQSClient({});

const QUEUE_URL = process.env.QUEUE_URL || "";
const IMPORT_BUCKET = process.env.IMPORT_BUCKET || "";

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body) as ImportMessage;
      console.log(`Processing message: ${body.action} for job ${body.jobId}`);

      switch (body.action) {
        case "PARSE":
          await processParse(body as ParseMessage);
          break;
        case "VALIDATE":
          await processValidate(body as ValidateMessage);
          break;
        case "EXECUTE":
          await processExecute(body as ExecuteMessage);
          break;
        default:
          console.warn(`Unknown action: ${(body as any).action}`);
      }

      console.log(
        `Successfully processed ${body.action} for job ${body.jobId}`,
      );
    } catch (error) {
      console.error(`Error processing record ${record.messageId}:`, error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}

// ============================================================================
// ACTION PROCESSORS
// ============================================================================

async function processParse(message: ParseMessage): Promise<void> {
  // Download file from S3
  const s3Response = await s3Client.send(
    new GetObjectCommand({
      Bucket: IMPORT_BUCKET,
      Key: message.s3Key,
    }),
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
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`,
          );
          values.push(
            message.jobId,
            JSON.stringify(row.data),
            row.rowNumber,
            "PENDING",
          );
        });

        await client.query(
          `INSERT INTO import_contacts_staging 
               (import_job_id, raw_data, row_number, status) 
               VALUES ${placeholders.join(", ")}`,
          values,
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
        ],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

async function processValidate(message: ValidateMessage): Promise<void> {
  const batchSize = message.batchSize || BATCH_SIZE;
  const batchStart = message.batchStart || 0;

  await withClient(async (client) => {
    // Get job and field mapping
    const jobResult = await client.query(
      `SELECT id, field_mapping FROM import_jobs WHERE id = $1`,
      [message.jobId],
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
      [message.jobId, batchSize, batchStart],
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
        fieldMapping.fullNameColumn,
      );
      const errors = validateMappedData(mapped);

      let status = "VALID";
      if (errors.length > 0) {
        status = "INVALID";
        invalidCount++;
      } else {
        // Check for duplicates (both against existing contacts and within the same import)
        const duplicateCheck = await checkDuplicate(
          client,
          mapped.phone_number,
          mapped.email,
          message.jobId,
          row.id,
        );
        if (duplicateCheck.isDuplicate) {
          status = "DUPLICATE";
          duplicateCount++;
          // Add duplicate reason to validation errors
          errors.push({
            field: "contact",
            message: duplicateCheck.reason || "Duplicate contact detected",
          });
        } else {
          validCount++;
        }
      }

      // Update staging row
      await client.query(
        `UPDATE import_contacts_staging 
             SET mapped_data = $1, validation_errors = $2, status = $3
             WHERE id = $4`,
        [JSON.stringify(mapped), JSON.stringify(errors), status, row.id],
      );
    }

    // Check if more rows to process
    const remainingResult = await client.query(
      `SELECT COUNT(*) as count FROM import_contacts_staging 
           WHERE import_job_id = $1 AND status = 'PENDING'`,
      [message.jobId],
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
        }),
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
        [message.jobId],
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
        ],
      );
    }
  });
}

async function processExecute(message: ExecuteMessage): Promise<void> {
  const batchSize = message.batchSize || BATCH_SIZE;

  await withClient(async (client) => {
    // Update job status to PROCESSING
    await client.query(
      `UPDATE import_jobs SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1`,
      [message.jobId],
    );

    // Get valid staging rows
    const stagingResult = await client.query(
      `SELECT id, mapped_data 
           FROM import_contacts_staging 
           WHERE import_job_id = $1 AND status = 'VALID'
           LIMIT $2`,
      [message.jobId, batchSize],
    );

    console.log(`Importing ${stagingResult.rows.length} contacts`);

    if (stagingResult.rows.length === 0) {
      // Check if more to process
      const remainingResult = await client.query(
        `SELECT COUNT(*) as count FROM import_contacts_staging 
             WHERE import_job_id = $1 AND status = 'VALID'`,
        [message.jobId],
      );

      if (parseInt(remainingResult.rows[0].count, 10) === 0) {
        // All done
        await client.query(
          `UPDATE import_jobs SET status = 'IMPORTED', updated_at = NOW() WHERE id = $1`,
          [message.jobId],
        );
      }
      return;
    }

    // Insert contacts in transaction
    await client.query("BEGIN");

    let importedCount = 0;
    let skippedCount = 0;
    const importErrors: { rowId: string; error: string }[] = [];

    try {
      for (const row of stagingResult.rows) {
        const data = row.mapped_data as MappedContactData;

        // Normalize phone number - returns null if empty
        const normalizedPhone = normalizePhoneNumber(
          data.phone_number,
          data.country_code,
        );
        const normalizedEmail = data.email?.toLowerCase().trim() || null;

        try {
          // Use INSERT with ON CONFLICT to handle duplicates gracefully
          // This handles race conditions and edge cases the validation might have missed
          const insertResult = await client.query(
            `INSERT INTO contacts 
                           (first_name, last_name, country_code, phone_number, email, language, source, import_job_id)
                         VALUES ($1, $2, $3, $4, $5, $6, 'IMPORT', $7)
                         ON CONFLICT DO NOTHING
                         RETURNING id`,
            [
              data.first_name,
              data.last_name || null,
              data.country_code || DEFAULT_COUNTRY_CODE,
              normalizedPhone, // null for email-only contacts
              normalizedEmail,
              data.language || null,
              message.jobId,
            ],
          );

          if (insertResult.rowCount === 0) {
            // Duplicate detected during import - mark as such
            skippedCount++;
            await client.query(
              `UPDATE import_contacts_staging 
                             SET status = 'DUPLICATE', 
                                 validation_errors = validation_errors || $1::jsonb
                             WHERE id = $2`,
              [
                JSON.stringify([
                  {
                    field: "contact",
                    message: "Duplicate contact detected during import",
                  },
                ]),
                row.id,
              ],
            );
          } else {
            importedCount++;
            // Mark staging row as processed
            await client.query(
              `UPDATE import_contacts_staging SET status = 'IMPORTED' WHERE id = $1`,
              [row.id],
            );
          }
        } catch (rowErr: any) {
          // Handle individual row errors without failing the entire batch
          console.error(`Error importing row ${row.id}:`, rowErr.message);
          skippedCount++;
          importErrors.push({ rowId: row.id, error: rowErr.message });

          await client.query(
            `UPDATE import_contacts_staging 
                         SET status = 'INVALID', 
                             validation_errors = validation_errors || $1::jsonb
                         WHERE id = $2`,
            [
              JSON.stringify([
                { field: "import", message: `Import error: ${rowErr.message}` },
              ]),
              row.id,
            ],
          );
        }
      }

      await client.query("COMMIT");
      console.log(
        `Batch complete: ${importedCount} imported, ${skippedCount} skipped`,
      );
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    // Check if more rows to process
    const remainingResult = await client.query(
      `SELECT COUNT(*) as count FROM import_contacts_staging 
           WHERE import_job_id = $1 AND status = 'VALID'`,
      [message.jobId],
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
        }),
      );
    } else {
      // All done - recalculate final counts from staging table
      const finalCountsResult = await client.query(
        `SELECT 
           COUNT(*) FILTER (WHERE status = 'IMPORTED') as imported_count,
           COUNT(*) FILTER (WHERE status = 'INVALID') as invalid_count,
           COUNT(*) FILTER (WHERE status = 'DUPLICATE') as duplicate_count
         FROM import_contacts_staging 
         WHERE import_job_id = $1`,
        [message.jobId],
      );

      const finalCounts = finalCountsResult.rows[0];

      await client.query(
        `UPDATE import_jobs 
         SET status = 'IMPORTED', 
             valid_rows = $1,
             invalid_rows = $2,
             duplicate_rows = $3,
             updated_at = NOW() 
         WHERE id = $4`,
        [
          finalCounts.imported_count,
          finalCounts.invalid_count,
          finalCounts.duplicate_count,
          message.jobId,
        ],
      );

      console.log(
        `Import job ${message.jobId} completed: ${finalCounts.imported_count} imported, ${finalCounts.invalid_count} invalid, ${finalCounts.duplicate_count} duplicates`,
      );
    }
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseCSV(content: string): {
  headers: string[];
  rows: ParsedRow[];
  totalRows: number;
} {
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
    }),
  );

  return { headers, rows, totalRows: rows.length };
}

function parseExcel(buffer: Buffer): {
  headers: string[];
  rows: ParsedRow[];
  totalRows: number;
} {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
  }) as unknown[][];

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
    if (
      Object.values(data).some((v) => v !== null && v !== undefined && v !== "")
    ) {
      rows.push({ rowNumber: i + 1, data });
    }
  }

  return { headers, rows, totalRows: rows.length };
}

function applyMapping(
  rawData: Record<string, unknown>,
  mapping: FieldMapping,
  fullNameColumn?: string,
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
    errors.push({
      field: "phone_number",
      message: "Invalid phone number format",
    });
  }

  // Validate email format if provided
  if (hasEmail && !isValidEmail(data.email!)) {
    errors.push({ field: "email", message: "Invalid email format" });
  }

  return errors;
}

/**
 * Check if a contact is a duplicate
 * Checks against:
 * 1. Existing contacts in the database
 * 2. Other rows in the same import job (staging table)
 */
async function checkDuplicate(
  client: any,
  phoneNumber?: string,
  email?: string,
  jobId?: string,
  currentRowId?: string,
): Promise<{ isDuplicate: boolean; reason?: string }> {
  // Normalize values
  const normalizedPhone = phoneNumber
    ? normalizePhoneNumber(phoneNumber)
    : null;
  const normalizedEmail = email?.toLowerCase().trim() || null;

  // If neither phone nor email, cannot be a duplicate based on contact info
  if (!normalizedPhone && !normalizedEmail) {
    return { isDuplicate: false };
  }

  // First, check against existing active contacts in the database
  const existingConditions: string[] = [];
  const existingValues: unknown[] = [];
  let paramIndex = 1;

  if (normalizedPhone) {
    existingConditions.push(`phone_number = $${paramIndex++}`);
    existingValues.push(normalizedPhone);
  }

  if (normalizedEmail) {
    existingConditions.push(`LOWER(email) = $${paramIndex++}`);
    existingValues.push(normalizedEmail);
  }

  const existingResult = await client.query(
    `SELECT id, phone_number, email FROM contacts 
     WHERE is_active = true AND (${existingConditions.join(" OR ")})
     LIMIT 1`,
    existingValues,
  );

  if (existingResult.rows.length > 0) {
    const match = existingResult.rows[0];
    const matchField =
      match.phone_number === normalizedPhone ? "phone number" : "email";
    return {
      isDuplicate: true,
      reason: `Duplicate ${matchField} already exists in contacts`,
    };
  }

  // Second, check against other rows in the same import job (staging table)
  // This prevents duplicate rows within the same file from being imported
  if (jobId && currentRowId) {
    // Get all VALID or PENDING rows in the same job that came before this one
    const stagingResult = await client.query(
      `SELECT id, mapped_data FROM import_contacts_staging 
       WHERE import_job_id = $1 
         AND id != $2 
         AND status IN ('VALID', 'PENDING')
       LIMIT 500`,
      [jobId, currentRowId],
    );

    // Check each staging row for duplicates
    for (const stagingRow of stagingResult.rows) {
      const stagingData = stagingRow.mapped_data as any;

      // Check phone number duplicate
      if (normalizedPhone && stagingData?.phone_number) {
        const stagingNormalizedPhone = normalizePhoneNumber(
          stagingData.phone_number,
        );
        if (stagingNormalizedPhone === normalizedPhone) {
          return {
            isDuplicate: true,
            reason: "Duplicate phone number within import file",
          };
        }
      }

      // Check email duplicate
      if (normalizedEmail && stagingData?.email) {
        const stagingNormalizedEmail = stagingData.email.toLowerCase().trim();
        if (stagingNormalizedEmail === normalizedEmail) {
          return {
            isDuplicate: true,
            reason: "Duplicate email within import file",
          };
        }
      }
    }
  }

  return { isDuplicate: false };
}
