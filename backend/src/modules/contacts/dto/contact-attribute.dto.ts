import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export type AttributeValueType =
  | 'string'
  | 'number'
  | 'date'
  | 'phone'
  | 'email';

export class CreateContactAttributeDto {
  @IsString()
  @MaxLength(100)
  key: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsEnum(['string', 'number', 'date', 'phone', 'email'])
  valueType?: AttributeValueType;

  @IsOptional()
  @IsString()
  chatId?: string;
}

export class UpdateContactAttributeDto {
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsEnum(['string', 'number', 'date', 'phone', 'email'])
  valueType?: AttributeValueType;

  @IsOptional()
  @IsString()
  chatId?: string;
}

export class BulkUpsertAttributesDto {
  @IsOptional()
  attributes?: Array<{
    key: string;
    value?: string;
    valueType?: AttributeValueType;
  }>;

  @IsOptional()
  @IsString()
  chatId?: string;
}
