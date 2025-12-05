import { TemplateLocale } from '@database/schema';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';
import { TemplateParserService } from '../services/template-parser.service';

export interface ConvertedTemplate {
  body: string;
  variableMapping: Array<{ name: string; index: number }>;
  providerPayload: Record<string, any>;
}

/**
 * Twilio WhatsApp provider adapter
 * Converts business templates to provider format and handles submission/testing
 */
@Injectable()
export class TwilioProviderAdapter {
  private twilioClient: Twilio;

  constructor(
    private configService: ConfigService,
    private parserService: TemplateParserService,
  ) {
    const accountSid = this.configService.get('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get('TWILIO_AUTH_TOKEN');
    this.twilioClient = new Twilio(accountSid, authToken);
  }

  /**
   * Convert business template to Twilio provider format
   * Replaces friendly placeholders with numbered ones
   */
  convertTemplate(locale: TemplateLocale): ConvertedTemplate {
    const { providerBody, variableMapping } =
      this.parserService.convertToProviderFormat(locale.body);

    // Build Twilio-specific payload
    const providerPayload: Record<string, any> = {
      friendly_name: '', // Will be set by caller
      language: this.mapLocaleToTwilioLanguage(locale.locale),
      variables: variableMapping, // Store mapping for later substitution
    };

    // Add components (header, body, footer)
    const components: Record<string, any>[] = [];

    // Body component
    components.push({
      type: 'BODY',
      text: providerBody,
    });

    // Header component if present
    if (locale.header) {
      components.push({
        type: 'HEADER',
        format: this.detectHeaderFormat(locale.header),
        text: locale.header, // For now, just text headers
      });
    }

    // Footer component if present
    if (locale.footer) {
      components.push({
        type: 'FOOTER',
        text: locale.footer,
      });
    }

    providerPayload.components = components;

    return {
      body: providerBody,
      variableMapping,
      providerPayload,
    };
  }

  /**
   * Submit template to Twilio for approval
   */
  async submitTemplate(
    templateName: string,
    locale: TemplateLocale,
    businessPhoneNumber: string,
  ): Promise<{
    providerId: string;
    status: string;
    response: Record<string, any>;
  }> {
    try {
      const converted = this.convertTemplate(locale);
      converted.providerPayload.friendly_name = templateName;

      // Submit via Twilio API
      // For now, using WhatsApp Business Account template submission
      // This would typically go through Twilio Conversations or Content API

      // Placeholder implementation - actual Twilio API call would go here
      // Twilio's WhatsApp template submission happens through their API

      const submitResponse = {
        template_id: `TEMPLATE_${Date.now()}`, // Would be Twilio-assigned
        status: 'submitted',
        locale: locale.locale,
      };

      return {
        providerId: submitResponse.template_id,
        status: 'submitted',
        response: submitResponse,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to submit template to Twilio: ${error.message}`,
      );
    }
  }

  /**
   * Send test message via Twilio sandbox
   */
  async sendTestMessage(
    to: string,
    templateName: string,
    variables: Record<string, any>,
    locale: TemplateLocale,
  ): Promise<{
    messageSid: string;
    status: string;
    response: Record<string, any>;
  }> {
    try {
      const converted = this.convertTemplate(locale);

      // Render template with variables
      const rendered = this.parserService.renderTemplate(
        locale.body,
        variables,
      );

      // Send via Twilio WhatsApp sandbox
      const message = await this.twilioClient.messages.create({
        from:
          this.configService.get('TWILIO_WHATSAPP_SANDBOX_NUMBER') ||
          'whatsapp:+14155238886',
        to: `whatsapp:${to}`,
        body: rendered,
      });

      return {
        messageSid: message.sid,
        status: message.status,
        response: {
          sid: message.sid,
          status: message.status,
          dateCreated: message.dateCreated,
          dateSent: message.dateSent,
        },
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to send test message: ${error.message}`,
      );
    }
  }

  /**
   * Map locale code to Twilio language code
   */
  private mapLocaleToTwilioLanguage(locale: string): string {
    const localeMap: Record<string, string> = {
      en: 'en_US',
      es: 'es_ES',
      'es-MX': 'es_MX',
      pt: 'pt_BR',
      fr: 'fr_FR',
      de: 'de_DE',
      it: 'it_IT',
      ja: 'ja_JP',
      zh: 'zh_CN',
    };

    return localeMap[locale] || 'en_US';
  }

  /**
   * Detect header format from content
   */
  private detectHeaderFormat(
    header: string,
  ): 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' {
    if (/^https?:\/\/.*\.(jpg|jpeg|png)$/i.test(header)) {
      return 'IMAGE';
    } else if (/^https?:\/\/.*\.pdf$/i.test(header)) {
      return 'DOCUMENT';
    } else if (/^https?:\/\/.*\.(mp4|mov|avi)$/i.test(header)) {
      return 'VIDEO';
    }
    return 'TEXT';
  }

  /**
   * Parse variable placeholders for Twilio submission
   * Converts {{var_name}} ordering to indexed array
   */
  buildParameterArray(
    variables: Record<string, any>,
    variableMapping: Array<{ name: string; index: number }>,
  ): any[] {
    const params: any[] = [];

    // Sort by index and fill array
    const sorted = [...variableMapping].sort((a, b) => a.index - b.index);
    sorted.forEach(({ name, index }) => {
      params[index - 1] = variables[name] || '';
    });

    return params.filter((p) => p !== undefined);
  }
}
