import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * DTO for creating a sender manually
 *
 * Note: In production, prefer using Meta Embedded Signup which
 * automatically creates senders with all required information.
 * Manual creation is primarily useful for testing purposes.
 */
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
  phoneNumberId?: string; // Meta Cloud API phone number ID (for manual entry)
}
