import {
  IsArray,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateContactDto {
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Matches(/^\+\d{1,3}$/, {
    message: 'Country code must be in format +XXX',
  })
  countryCode: string;

  @IsString()
  @Matches(/^\+\d{6,15}$/, {
    message: 'Phone number must be in E.164 format (e.g., +14155552671)',
  })
  phoneNumber: string; // Full phone number including country code (e.g., +59167131914)

  @IsArray()
  @IsNumber({}, { each: true })
  senderIds: number[]; // IDs of the WhatsApp Business phones this contact is linked to

  @IsOptional()
  @IsString()
  avatar?: string;
}
