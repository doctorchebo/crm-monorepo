import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCalendarAiSettingsDto {
  @IsBoolean()
  @IsOptional()
  canViewCalendar?: boolean;

  @IsBoolean()
  @IsOptional()
  canCreateEvents?: boolean;

  @IsBoolean()
  @IsOptional()
  canModifyEvents?: boolean;

  @IsBoolean()
  @IsOptional()
  canDeleteEvents?: boolean;

  @IsBoolean()
  @IsOptional()
  canManageBookings?: boolean;

  @IsBoolean()
  @IsOptional()
  requireConfirmation?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(10080) // 7 days in minutes
  maxEventDuration?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(90)
  maxAdvanceBookingDays?: number;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  allowedCalendarIds?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  customInstructions?: string;
}

export class CalendarAiActionDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  actionType: string;

  @IsString()
  @IsOptional()
  eventId?: string;

  @IsString()
  @IsOptional()
  bookingId?: string;

  @IsString()
  @IsOptional()
  contactId?: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  actionDetails?: string;
}

export class AiCalendarQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  query: string;

  @IsString()
  @IsOptional()
  contactId?: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}

export class AiScheduleEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsOptional()
  suggestedTime?: string; // Natural language or ISO string

  @IsDateString()
  @IsOptional()
  startTime?: string; // Direct ISO date string

  @IsDateString()
  @IsOptional()
  endTime?: string; // Direct ISO date string

  @IsString()
  @IsOptional()
  eventType?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  attendees?: string[];

  @IsNumber()
  @IsOptional()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsString()
  @IsOptional()
  contactId?: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsString()
  @IsOptional()
  calendarId?: string;

  @IsBoolean()
  @IsOptional()
  requireConfirmation?: boolean;
}

export class AiRescheduleEventDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsOptional()
  newTime?: string; // Natural language or ISO string

  @IsDateString()
  @IsOptional()
  newStartTime?: string; // Direct ISO date string

  @IsDateString()
  @IsOptional()
  newEndTime?: string; // Direct ISO date string

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;

  @IsBoolean()
  @IsOptional()
  notifyAttendees?: boolean;
}

export class AiCancelEventDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;

  @IsBoolean()
  @IsOptional()
  notifyAttendees?: boolean;
}

export class AiFindAvailabilityDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  timeRange?: string; // Natural language like "next week", "tomorrow afternoon"

  @IsDateString()
  @IsOptional()
  startDate?: string; // ISO date string for direct API calls

  @IsDateString()
  @IsOptional()
  endDate?: string; // ISO date string for direct API calls

  @IsNumber()
  @IsOptional()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  participantIds?: string[];

  @IsString()
  @IsOptional()
  timezone?: string;
}
