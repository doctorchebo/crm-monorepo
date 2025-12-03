import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateStageDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  position?: number;

  @IsString()
  @IsOptional()
  color?: string;
}
