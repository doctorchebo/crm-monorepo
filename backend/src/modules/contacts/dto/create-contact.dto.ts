import { IsOptional, IsString, Matches } from 'class-validator';

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

  @IsOptional()
  @IsString()
  avatar?: string;
}
