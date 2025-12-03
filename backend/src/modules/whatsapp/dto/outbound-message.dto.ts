import {
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
} from 'class-validator';

export class OutboundMessageDto {
  @IsPhoneNumber()
  to: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsString()
  @IsOptional()
  mediaUrl?: string;
}
