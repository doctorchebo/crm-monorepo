import {
  IsArray,
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

  @IsString()
  @Matches(/^\+\d{1,3}$/, {
    message: 'Country code must be in format +XXX',
  })
  countryCode: string;

  @IsString()
  @Matches(/^\d{6,15}$/, {
    message: 'Phone number must be 6-15 digits',
  })
  phoneNumber: string;

  @IsArray()
  @IsNumber({}, { each: true })
  senderIds: number[]; // IDs of the WhatsApp Business phones this contact is linked to

  @IsOptional()
  @IsString()
  avatar?: string;
}
