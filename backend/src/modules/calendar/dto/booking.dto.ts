import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BookingLinkMemberDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  weight?: number;
}

export class CreateBookingLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must only contain lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsNumber()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  @IsEnum(['fixed', 'flexible', 'round_robin', 'collective'])
  bookingType: 'fixed' | 'flexible' | 'round_robin' | 'collective';

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(43200) // 30 days in minutes
  bufferBefore?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(43200)
  bufferAfter?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(10080) // 7 days in minutes
  minNotice?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(365)
  maxAdvanceDays?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  maxBookingsPerDay?: number;

  @IsBoolean()
  @IsOptional()
  requiresConfirmation?: boolean;

  @IsUrl()
  @IsOptional()
  videoLink?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  location?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  confirmationMessage?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BookingLinkMemberDto)
  members?: BookingLinkMemberDto[];

  @IsString()
  @IsOptional()
  calendarId?: string;
}

export class UpdateBookingLinkDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must only contain lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsNumber()
  @IsOptional()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsEnum(['fixed', 'flexible', 'round_robin', 'collective'])
  @IsOptional()
  bookingType?: 'fixed' | 'flexible' | 'round_robin' | 'collective';

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(43200)
  bufferBefore?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(43200)
  bufferAfter?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(10080)
  minNotice?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(365)
  maxAdvanceDays?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  maxBookingsPerDay?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresConfirmation?: boolean;

  @IsUrl()
  @IsOptional()
  videoLink?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  location?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  confirmationMessage?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BookingLinkMemberDto)
  members?: BookingLinkMemberDto[];
}

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  bookingLinkId: string;

  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsOptional()
  contactId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  guestName?: string;

  @IsEmail()
  @IsOptional()
  guestEmail?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  guestPhone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}

export class UpdateBookingDto {
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @IsEnum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show'])
  @IsOptional()
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  cancellationReason?: string;
}

export class BookingQueryDto {
  @IsString()
  @IsOptional()
  bookingLinkId?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsEnum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show'])
  @IsOptional()
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

  @IsString()
  @IsOptional()
  contactId?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  skip?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  take?: number;
}

export class GetAvailableSlotsDto {
  @IsString()
  @IsNotEmpty()
  bookingLinkId: string;

  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}

export class RescheduleBookingDto {
  @IsDateString()
  @IsNotEmpty()
  newStartTime: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

export class CancelBookingDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;

  @IsBoolean()
  @IsOptional()
  notifyBooker?: boolean;
}

/**
 * DTO for public (unauthenticated) booking requests
 */
export class PublicBookingDto {
  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  guestName: string;

  @IsEmail()
  @IsNotEmpty()
  guestEmail: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  guestPhone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsOptional()
  customAnswers?: Record<string, string>;
}
