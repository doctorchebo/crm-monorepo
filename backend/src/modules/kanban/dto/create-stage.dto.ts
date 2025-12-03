import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateStageDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsNotEmpty()
  position: number;

  @IsString()
  @IsOptional()
  color?: string;
}
