import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { TriggerType } from './create-rule.dto';

export class UpdateRuleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TriggerType)
  @IsOptional()
  triggerType?: TriggerType;

  @IsObject()
  @IsOptional()
  triggerCondition?: Record<string, any>;

  @IsString()
  @IsOptional()
  responseTemplate?: string;

  @IsString()
  @IsOptional()
  llmPrompt?: string;

  @IsString()
  @IsOptional()
  kanbanStageId?: string;
}
