import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ChatStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export class UpdateChatDto {
  @IsString()
  @IsOptional()
  participantName?: string;

  @IsString()
  @IsOptional()
  lastMessage?: string;

  @IsEnum(ChatStatus)
  @IsOptional()
  status?: ChatStatus;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  kanbanStageId?: string;
}
