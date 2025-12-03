import { IsNotEmpty, IsString } from 'class-validator';

export enum TeamRole {
  OWNER = 'owner',
  MEMBER = 'member',
}

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  description?: string;
}
