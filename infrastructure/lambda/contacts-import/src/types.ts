/**
 * Shared types for contacts import Lambda functions
 */

// SQS Message types
export type ImportAction = "PARSE" | "VALIDATE" | "EXECUTE";

export interface BaseImportMessage {
  action: ImportAction;
  jobId: string;
}

export interface ParseMessage extends BaseImportMessage {
  action: "PARSE";
  s3Key: string;
  userId: number;
  originalFilename: string;
}

export interface ValidateMessage extends BaseImportMessage {
  action: "VALIDATE";
  batchStart?: number;
  batchSize?: number;
}

export interface ExecuteMessage extends BaseImportMessage {
  action: "EXECUTE";
  batchStart?: number;
  batchSize?: number;
}

export type ImportMessage = ParseMessage | ValidateMessage | ExecuteMessage;

// Database row types
export interface ImportJob {
  id: string;
  userId: number;
  status: ImportJobStatus;
  originalFilename: string | null;
  s3Key: string | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  fieldMapping: FieldMapping | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ImportJobStatus =
  | "UPLOADED"
  | "MAPPED"
  | "VALIDATED"
  | "QUEUED"
  | "PROCESSING"
  | "IMPORTED"
  | "FAILED";

export interface StagingRow {
  id: string;
  importJobId: string;
  rawData: Record<string, unknown>;
  mappedData: MappedContactData | null;
  validationErrors: ValidationError[];
  status: StagingRowStatus;
  rowNumber: number | null;
  createdAt: Date;
}

export type StagingRowStatus =
  | "PENDING"
  | "VALID"
  | "INVALID"
  | "DUPLICATE"
  | "IMPORTED";

export interface ValidationError {
  field: string;
  message: string;
}

// Field mapping types
export interface FieldMapping {
  [sourceColumn: string]: InternalField | null;
}

export type InternalField =
  | "first_name"
  | "last_name"
  | "country_code"
  | "phone_number"
  | "email"
  | "language";

export interface MappedContactData {
  first_name?: string;
  last_name?: string;
  country_code?: string;
  phone_number?: string;
  email?: string;
  language?: string;
}

// Parsed file data
export interface ParsedRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  totalRows: number;
}

// Canonical contact for import
export interface InternalContact {
  firstName: string;
  lastName: string | null;
  countryCode: string;
  phoneNumber: string;
  email: string | null;
  language: string | null;
}

// Auto-detection result
export interface HeaderSuggestion {
  sourceColumn: string;
  suggestedField: InternalField | null;
  confidence: number;
}

// Constants
export const INTERNAL_FIELDS: InternalField[] = [
  "first_name",
  "last_name",
  "country_code",
  "phone_number",
  "email",
  "language",
];

export const REQUIRED_FIELDS: InternalField[] = [
  "first_name",
  "country_code",
  "phone_number",
];

export const BATCH_SIZE = 500;
export const DEFAULT_COUNTRY_CODE = "+1"; // US default, can be configured
