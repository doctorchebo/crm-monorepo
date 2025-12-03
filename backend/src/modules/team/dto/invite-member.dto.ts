import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { TeamRole } from './create-team.dto';

export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsEnum(TeamRole)
  @IsNotEmpty()
  role: TeamRole;
}
