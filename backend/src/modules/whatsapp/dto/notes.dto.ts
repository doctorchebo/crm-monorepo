import { IsNotEmpty, IsString } from 'class-validator';

export class SaveNoteDto {
  @IsString()
  @IsNotEmpty()
  messageId: string; // Twilio MessageSid

  @IsString()
  @IsNotEmpty()
  note: string; // The note text
}

export class GetMessageNotesDto {
  @IsString()
  @IsNotEmpty()
  messageId: string; // Twilio MessageSid
}
