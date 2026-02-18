import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class EventAttendeeDto {
  @IsEnum(['user', 'contact', 'external'])
  @IsNotEmpty()
  attendeeType: 'user' | 'contact' | 'external';

  @IsNumber()
  @IsOptional()
  userId?: number;

  @IsString()
  @IsOptional()
  contactId?: string;

  @IsString()
  @IsOptional()
  externalEmail?: string;

  @IsString()
  @IsOptional()
  externalName?: string;

  @IsBoolean()
  @IsOptional()
  isOrganizer?: boolean;

  @IsBoolean()
  @IsOptional()
  isOptional?: boolean;
}

export class EventReminderDto {
  @IsEnum(['email', 'push', 'whatsapp', 'in_app'])
  method: 'email' | 'push' | 'whatsapp' | 'in_app';

  @IsNumber()
  @Min(0)
  @Max(10080) // Max 1 week in minutes
  minutesBefore: number;
}

export class RecurrenceRuleDto {
  @IsEnum(['daily', 'weekly', 'monthly', 'yearly'])
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(365)
  interval?: number;

  @IsArray()
  @IsOptional()
  @IsNumber({}, { each: true })
  byDay?: number[]; // 0-6 for Sunday-Saturday

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(31)
  byMonthDay?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(12)
  byMonth?: number;

  @IsDateString()
  @IsOptional()
  until?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(999)
  count?: number;
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  calendarId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @IsEnum(['meeting', 'event', 'reminder', 'task', 'out_of_office', 'other'])
  @IsOptional()
  eventType?: string;

  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @IsDateString()
  @IsNotEmpty()
  endTime: string;

  @IsBoolean()
  @IsOptional()
  isAllDay?: boolean;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  location?: string;

  @IsUrl()
  @IsOptional()
  locationUrl?: string;

  @IsBoolean()
  @IsOptional()
  isOnline?: boolean;

  @IsUrl()
  @IsOptional()
  videoConferenceUrl?: string;

  @IsString()
  @IsOptional()
  videoConferenceProvider?: string;

  @IsString()
  @IsOptional()
  videoConferenceId?: string;

  @IsEnum(['confirmed', 'tentative', 'cancelled'])
  @IsOptional()
  status?: string;

  @IsEnum(['public', 'private', 'calendar_default'])
  @IsOptional()
  visibility?: string;

  @IsBoolean()
  @IsOptional()
  showAsBusy?: boolean;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EventAttendeeDto)
  attendees?: EventAttendeeDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EventReminderDto)
  reminders?: EventReminderDto[];

  @ValidateNested()
  @IsOptional()
  @Type(() => RecurrenceRuleDto)
  recurrence?: RecurrenceRuleDto;

  // CRM integration
  @IsString()
  @IsOptional()
  relatedContactId?: string;

  @IsString()
  @IsOptional()
  relatedChatId?: string;

  // For creating from email input
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  attendeeEmails?: string[];
}

export class UpdateEventDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @IsDateString()
  @IsOptional()
  startTime?: string;

  @IsDateString()
  @IsOptional()
  endTime?: string;

  @IsBoolean()
  @IsOptional()
  isAllDay?: boolean;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  location?: string;

  @IsUrl()
  @IsOptional()
  locationUrl?: string;

  @IsBoolean()
  @IsOptional()
  isOnline?: boolean;

  @IsUrl()
  @IsOptional()
  videoConferenceUrl?: string;

  @IsString()
  @IsOptional()
  videoConferenceProvider?: string;

  @IsEnum(['confirmed', 'tentative', 'cancelled'])
  @IsOptional()
  status?: string;

  @IsEnum(['public', 'private', 'calendar_default'])
  @IsOptional()
  visibility?: string;

  @IsBoolean()
  @IsOptional()
  showAsBusy?: boolean;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EventAttendeeDto)
  attendees?: EventAttendeeDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EventReminderDto)
  reminders?: EventReminderDto[];

  @ValidateNested()
  @IsOptional()
  @Type(() => RecurrenceRuleDto)
  recurrence?: RecurrenceRuleDto;

  // CRM integration
  @IsString()
  @IsOptional()
  relatedContactId?: string;

  @IsString()
  @IsOptional()
  relatedChatId?: string;
}

export class EventQueryDto {
  @IsString()
  @IsOptional()
  calendarId?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsBoolean()
  @IsOptional()
  includeCancelled?: boolean;

  @IsBoolean()
  @IsOptional()
  includeDeleted?: boolean;

  @IsString()
  @IsOptional()
  relatedContactId?: string;

  @IsString()
  @IsOptional()
  relatedChatId?: string;

  @IsString()
  @IsOptional()
  eventType?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  skip?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  take?: number;
}

export class UpdateRecurringEventDto extends UpdateEventDto {
  @IsEnum(['this', 'this_and_following', 'all'])
  @IsNotEmpty()
  updateScope: 'this' | 'this_and_following' | 'all';

  @IsDateString()
  @IsOptional()
  instanceDate?: string;
}

export class RespondToEventDto {
  @IsEnum(['accepted', 'declined', 'tentative'])
  @IsNotEmpty()
  response: 'accepted' | 'declined' | 'tentative';

  @IsString()
  @IsOptional()
  @MaxLength(500)
  message?: string;
}
