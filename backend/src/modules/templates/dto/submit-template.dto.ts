export class SubmitTemplateDto {
  templateId: string;
  locale: string;
  provider: string; // 'twilio', 'meta', etc
  platforms?: string[];
}
