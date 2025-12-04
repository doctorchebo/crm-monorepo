import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateChatDto {
  @IsString()
  @IsNotEmpty()
  businessPhone: string;

  @IsString()
  @IsNotEmpty()
  participantPhone: string;

  @IsString()
  @IsOptional()
  participantName?: string;

  @IsString()
  @IsOptional()
  customerId?: string;
}
