import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Contact name structure following WhatsApp Cloud API format
 */
export class ContactNameDto {
  @IsString()
  formatted_name: string;

  @IsString()
  @IsOptional()
  first_name?: string;

  @IsString()
  @IsOptional()
  last_name?: string;

  @IsString()
  @IsOptional()
  middle_name?: string;

  @IsString()
  @IsOptional()
  prefix?: string;

  @IsString()
  @IsOptional()
  suffix?: string;
}

/**
 * Phone number structure for contact
 */
export class ContactPhoneDto {
  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  type?: 'CELL' | 'MAIN' | 'IPHONE' | 'HOME' | 'WORK';

  @IsString()
  @IsOptional()
  wa_id?: string;
}

/**
 * Individual contact data to send
 */
export class ContactDto {
  @ValidateNested()
  @Type(() => ContactNameDto)
  name: ContactNameDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactPhoneDto)
  @IsOptional()
  phones?: ContactPhoneDto[];
}

/**
 * DTO for sending contacts via WhatsApp
 * POST /whatsapp/send-contacts
 */
export class SendContactsDto {
  @IsString()
  @IsNotEmpty()
  to: string;

  @IsNumber()
  @IsOptional()
  senderId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts: ContactDto[];
}
