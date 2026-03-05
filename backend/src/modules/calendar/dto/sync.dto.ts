import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateSyncConnectionDto {
  @IsEnum(['google', 'outlook', 'apple', 'caldav'])
  @IsNotEmpty()
  provider: 'google' | 'outlook' | 'apple' | 'caldav';

  @IsString()
  @IsNotEmpty()
  accessToken: string;

  @IsString()
  @IsOptional()
  refreshToken?: string;

  @IsString()
  @IsOptional()
  externalCalendarId?: string;

  @IsString()
  @IsOptional()
  externalCalendarName?: string;

  @IsString()
  @IsOptional()
  calendarId?: string;

  @IsBoolean()
  @IsOptional()
  syncEnabled?: boolean;

  @IsEnum(['one_way_to_external', 'one_way_from_external', 'two_way'])
  @IsOptional()
  syncDirection?: 'one_way_to_external' | 'one_way_from_external' | 'two_way';
}

export class UpdateSyncConnectionDto {
  @IsString()
  @IsOptional()
  accessToken?: string;

  @IsString()
  @IsOptional()
  refreshToken?: string;

  @IsBoolean()
  @IsOptional()
  syncEnabled?: boolean;

  @IsEnum(['one_way_to_external', 'one_way_from_external', 'two_way'])
  @IsOptional()
  syncDirection?: 'one_way_to_external' | 'one_way_from_external' | 'two_way';

  @IsString()
  @IsOptional()
  calendarId?: string;
}

export class SyncConnectionQueryDto {
  @IsEnum(['google', 'outlook', 'apple', 'caldav'])
  @IsOptional()
  provider?: 'google' | 'outlook' | 'apple' | 'caldav';

  @IsBoolean()
  @IsOptional()
  activeOnly?: boolean;

  @IsString()
  @IsOptional()
  calendarId?: string;
}

export class InitiateOAuthDto {
  @IsEnum(['google', 'outlook', 'apple'])
  @IsNotEmpty()
  provider: 'google' | 'outlook' | 'apple';

  @IsString()
  @IsOptional()
  redirectUri?: string;

  @IsString()
  @IsOptional()
  calendarId?: string;

  @IsEnum(['one_way_to_external', 'one_way_from_external', 'two_way'])
  @IsOptional()
  syncDirection?: 'one_way_to_external' | 'one_way_from_external' | 'two_way';

  @IsString()
  @IsOptional()
  syncFrequency?: string;
}

export class OAuthCallbackDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsEnum(['google', 'outlook', 'apple'])
  @IsNotEmpty()
  provider: 'google' | 'outlook' | 'apple';
}

export class ManualSyncDto {
  @IsString()
  @IsOptional()
  connectionId?: string;

  @IsString()
  @IsOptional()
  calendarId?: string;

  @IsBoolean()
  @IsOptional()
  fullSync?: boolean;
}
