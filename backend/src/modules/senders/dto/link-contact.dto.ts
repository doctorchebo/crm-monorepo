import { IsBoolean, IsNumber, IsOptional, IsUUID } from 'class-validator';

export class LinkContactDto {
  @IsUUID()
  contactId: string;

  @IsNumber()
  senderId: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
