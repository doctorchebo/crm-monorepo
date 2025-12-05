export class TestTemplateDto {
  templateVersionId: string;
  to: string; // Phone number to send test to
  vars: Record<string, any>; // Test variables
}
