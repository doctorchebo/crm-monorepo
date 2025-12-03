import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export enum TriggerType {
  KEYWORD = 'keyword',
  EMOTION = 'emotion',
  TIME = 'time',
  MANUAL = 'manual',
}

export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(TriggerType)
  @IsNotEmpty()
  triggerType: TriggerType;

  @IsObject()
  @IsNotEmpty()
  triggerCondition: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  responseTemplate: string;

  @IsString()
  @IsOptional()
  llmPrompt?: string;

  @IsString()
  @IsOptional()
  kanbanStageId?: string;
}
