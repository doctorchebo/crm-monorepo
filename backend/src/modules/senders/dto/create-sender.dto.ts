import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateSenderDto {
  @IsString()
  @Matches(/^\+\d{1,3}\d{1,14}$/, {
    message: 'Phone number must be in E.164 format (e.g., +14155552671)',
  })
  phoneNumber: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  twilioPhoneNumberSid?: string;

  @IsOptional()
  @IsString()
  twilioMessagingServiceSid?: string;

  @IsOptional()
  @IsString()
  twilioAccountSid?: string;
}
