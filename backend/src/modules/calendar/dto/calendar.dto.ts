import {
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCalendarDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsHexColor()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateCalendarDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsHexColor()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class ShareCalendarDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(['view', 'edit', 'manage'])
  permission: 'view' | 'edit' | 'manage';

  @IsBoolean()
  @IsOptional()
  canInviteOthers?: boolean;
}

export class CalendarQueryDto {
  @IsString()
  @IsOptional()
  teamId?: string;

  @IsBoolean()
  @IsOptional()
  includeShared?: boolean;

  @IsBoolean()
  @IsOptional()
  includeExternal?: boolean;
}
