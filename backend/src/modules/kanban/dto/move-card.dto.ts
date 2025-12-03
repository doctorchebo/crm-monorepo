import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class MoveCardDto {
  @IsString()
  @IsNotEmpty()
  cardId: string;

  @IsString()
  @IsNotEmpty()
  targetStageId: string;

  @IsNumber()
  @IsNotEmpty()
  position: number;
}
