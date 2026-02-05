import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * DTO for sending location messages via WhatsApp Cloud API
 *
 * Based on Meta's Cloud API documentation:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/location-messages
 *
 * Required: latitude, longitude
 * Optional: name, address
 */
export class SendLocationDto {
  @IsString()
  to: string; // Recipient phone number

  @IsNumber()
  @IsOptional()
  senderId?: number; // Which sender this message is from

  @IsString()
  @IsOptional()
  businessPhone?: string; // Alternative: specify by phone number instead of ID

  @IsLatitude()
  latitude: number; // Location latitude in decimal degrees

  @IsLongitude()
  longitude: number; // Location longitude in decimal degrees

  @IsString()
  @IsOptional()
  @MaxLength(500)
  name?: string; // Location name (e.g., "Philz Coffee")

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  address?: string; // Full address string (e.g., "101 Forest Ave, Palo Alto, CA 94301")

  @IsString()
  @IsOptional()
  replyToMessageId?: string; // Message ID to reply to (for reply messages)
}

/**
 * Location data structure for storing in message metadata
 * This is stored in messages.metadata.location
 */
export interface LocationMetadata {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  url?: string; // Optional URL to location (if provided by sender)
}
