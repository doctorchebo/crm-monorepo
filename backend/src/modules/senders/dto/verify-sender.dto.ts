import { IsString, Matches } from 'class-validator';

/**
 * DTO for verifying a sender phone number and retrieving its phoneNumberId from Meta
 */
export class VerifySenderDto {
  @IsString()
  @Matches(/^\+\d{1,3}\d{1,14}$/, {
    message: 'Phone number must be in E.164 format (e.g., +14155552671)',
  })
  phoneNumber: string;
}
