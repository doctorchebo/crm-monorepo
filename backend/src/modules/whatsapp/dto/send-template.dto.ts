import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * DTO for sending a WhatsApp template message from the chat page.
 *
 * Unlike free-form text messages (which are subject to the 24-hour window),
 * approved template messages can be sent at any time. This DTO captures the
 * template identity and its resolved variables so the backend can build the
 * proper Meta Cloud API `type: 'template'` payload.
 *
 * Variables should be keyed the same way they appear in the template body:
 * - Named variables: `{ "customer.first_name": "John" }`
 * - Positional variables (library templates): `{ "1": "John", "2": "$50" }`
 *
 * The backend will determine named→positional conversion automatically.
 */
export class SendTemplateDto {
  /** Recipient phone number (E.164 format recommended) */
  @IsString()
  @IsNotEmpty()
  to: string;

  /** Sender ID (WhatsApp Business phone number record) */
  @IsNumber()
  senderId: number;

  /** Template UUID from the templates table */
  @IsString()
  @IsNotEmpty()
  templateId: string;

  /** Locale code for the template (e.g., 'en', 'es', 'en_US') */
  @IsString()
  @IsNotEmpty()
  locale: string;

  /**
   * Resolved variable values.
   *
   * For **named** templates (custom): `{ "customer.first_name": "John" }`
   * For **positional** templates (library): `{ "1": "John", "2": "50" }`
   *
   * Empty object `{}` is valid for templates with no variables.
   */
  @IsObject()
  variables: Record<string, string>;

  /** Chat ID — used for conversation window validation and message storage */
  @IsString()
  @IsOptional()
  chatId?: string;

  /** Optional reply-to message ID */
  @IsString()
  @IsOptional()
  replyToMessageId?: string;
}
