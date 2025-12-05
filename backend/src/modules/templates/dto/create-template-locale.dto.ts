export class CreateTemplateLocaleDto {
  locale: string; // 'en', 'es', etc
  type?: string; // 'text', 'media', etc
  header?: string; // Optional header
  body: string; // Main message with {{placeholder}} syntax
  footer?: string;
  exampleVars?: Record<string, any>; // Example values for preview
}
