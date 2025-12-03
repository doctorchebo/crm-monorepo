import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateChatDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  customerId?: string;
}
