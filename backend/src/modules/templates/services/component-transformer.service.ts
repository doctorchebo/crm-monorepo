import { Injectable, Logger } from '@nestjs/common';
import {
  TemplateButtonDto,
  TemplateComponentsDto,
  TemplateHeaderDto,
} from '../dto';
import {
  ButtonType,
  HeaderFormat,
  META_LANGUAGE_CODES,
  OtpType,
  TemplateCategory,
} from '../types';

/**
 * Meta API component structure
 */
export interface MetaComponent {
  type:
    | 'HEADER'
    | 'BODY'
    | 'FOOTER'
    | 'BUTTONS'
    | 'CAROUSEL'
    | 'LIMITED_TIME_OFFER';
  format?: string;
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[];
  };
  buttons?: MetaButton[];
  cards?: MetaCarouselCard[];
  limited_time_offer?: {
    has_expiration: boolean;
    expiration_time_ms?: number;
  };
}

export interface MetaButton {
  type: string;
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string[];
  otp_type?: string;
  autofill_text?: string;
  package_name?: string;
  signature_hash?: string;
  flow_id?: string;
  flow_action?: string;
  navigate_screen?: string;
}

export interface MetaCarouselCard {
  components: MetaComponent[];
}

/**
 * Variable mapping for positional conversion
 */
export interface VariableMapping {
  name: string;
  index: number;
  component: 'header' | 'body' | 'button';
}

/**
 * Result of template transformation
 */
export interface TransformResult {
  components: MetaComponent[];
  variableMappings: VariableMapping[];
  providerPayload: Record<string, unknown>;
}

/**
 * Service for transforming template components to Meta API format
 *
 * This service handles the conversion from our internal template representation
 * to the format required by the Meta Cloud API.
 */
@Injectable()
export class ComponentTransformerService {
  private readonly logger = new Logger(ComponentTransformerService.name);

  /**
   * Transform our template components to Meta API format
   *
   * IMPORTANT: Meta's API uses **per-component** variable numbering.
   * Header {{1}} is independent of Body {{1}} — they are separate
   * components with their own parameter arrays. Each component type
   * MUST start its variable index at 1.
   */
  transform(
    templateName: string,
    locale: string,
    components: TemplateComponentsDto,
    category: TemplateCategory,
  ): TransformResult {
    const metaComponents: MetaComponent[] = [];
    const variableMappings: VariableMapping[] = [];

    // Transform header — starts at index 1
    if (components.header) {
      const { component, mappings } = this.transformHeader(
        components.header,
        1,
      );
      if (component) {
        metaComponents.push(component);
        variableMappings.push(...mappings);
      }
    }

    // Transform body (required) — starts at index 1
    const { component: bodyComponent, mappings: bodyMappings } =
      this.transformBody(components.body, 1, category);
    metaComponents.push(bodyComponent);
    variableMappings.push(...bodyMappings);

    // Transform footer
    if (components.footer) {
      metaComponents.push({
        type: 'FOOTER',
        text: components.footer.text,
      });
    }

    // Transform buttons — starts at index 1
    if (components.buttons && components.buttons.length > 0) {
      const { component, mappings } = this.transformButtons(
        components.buttons,
        1,
      );
      metaComponents.push(component);
      variableMappings.push(...mappings);
    }

    // Transform limited time offer
    if (
      components.limitedTimeOffer &&
      category === TemplateCategory.MARKETING
    ) {
      metaComponents.push({
        type: 'LIMITED_TIME_OFFER',
        limited_time_offer: {
          has_expiration: components.limitedTimeOffer.hasExpiration,
          expiration_time_ms: components.limitedTimeOffer.expirationTimeMs,
        },
      });
    }

    // Transform carousel
    if (components.carousel && components.carousel.length > 0) {
      const { component, mappings } = this.transformCarousel(
        components.carousel,
        variableIndex,
        category,
      );
      metaComponents.push(component);
      variableMappings.push(...mappings);
    }

    // Build the provider payload
    const providerPayload = {
      name: templateName,
      language: this.mapLocaleToMetaLanguage(locale),
      category: category.toUpperCase(),
      components: metaComponents.map((comp) => this.cleanComponent(comp)),
    };

    return { components: metaComponents, variableMappings, providerPayload };
  }

  /**
   * Map locale to Meta language code
   */
  mapLocaleToMetaLanguage(locale: string): string {
    return (
      META_LANGUAGE_CODES[locale] ||
      META_LANGUAGE_CODES[locale.split('-')[0]] ||
      'en_US'
    );
  }

  /**
   * Transform header component
   */
  private transformHeader(
    header: TemplateHeaderDto,
    startIndex: number,
  ): {
    component: MetaComponent | null;
    mappings: VariableMapping[];
    nextIndex: number;
  } {
    const mappings: VariableMapping[] = [];
    let nextIndex = startIndex;

    const component: MetaComponent = {
      type: 'HEADER',
      format: header.format,
    };

    switch (header.format) {
      case HeaderFormat.TEXT:
        if (header.text) {
          // Convert named variables to positional
          const { text, newMappings, newIndex } = this.convertTextVariables(
            header.text,
            startIndex,
            'header',
          );
          component.text = text;
          mappings.push(...newMappings);
          nextIndex = newIndex;

          if (header.example && newMappings.length > 0) {
            component.example = { header_text: [header.example] };
          }
        }
        break;

      case HeaderFormat.IMAGE:
      case HeaderFormat.VIDEO:
      case HeaderFormat.DOCUMENT:
        if (header.assetHandle) {
          component.example = { header_handle: [header.assetHandle] };
        }
        break;

      case HeaderFormat.LOCATION:
        // Location doesn't need additional properties at template creation
        break;
    }

    return { component, mappings, nextIndex };
  }

  /**
   * Transform body component
   */
  private transformBody(
    body: { text: string; examples?: Record<string, string> },
    startIndex: number,
    category: TemplateCategory,
  ): {
    component: MetaComponent;
    mappings: VariableMapping[];
    nextIndex: number;
  } {
    // For authentication templates, body text is largely fixed
    if (category === TemplateCategory.AUTHENTICATION) {
      // The OTP placeholder should be the only variable
      const { text, newMappings, newIndex } = this.convertTextVariables(
        body.text,
        startIndex,
        'body',
      );

      return {
        component: {
          type: 'BODY',
          text,
          example:
            newMappings.length > 0
              ? { body_text: [newMappings.map(() => '123456')] }
              : undefined,
        },
        mappings: newMappings,
        nextIndex: newIndex,
      };
    }

    // Convert named variables to positional
    const { text, newMappings, newIndex } = this.convertTextVariables(
      body.text,
      startIndex,
      'body',
    );

    const component: MetaComponent = {
      type: 'BODY',
      text,
    };

    // Add examples if variables exist
    if (newMappings.length > 0) {
      const exampleValues = newMappings.map(
        (m) => body.examples?.[m.name] || `[${m.name}]`,
      );
      component.example = { body_text: [exampleValues] };
    }

    return { component, mappings: newMappings, nextIndex: newIndex };
  }

  /**
   * Transform buttons component
   */
  private transformButtons(
    buttons: TemplateButtonDto[],
    startIndex: number,
  ): {
    component: MetaComponent;
    mappings: VariableMapping[];
    nextIndex: number;
  } {
    const metaButtons: MetaButton[] = [];
    const mappings: VariableMapping[] = [];
    let nextIndex = startIndex;

    for (const button of buttons) {
      const metaButton: MetaButton = {
        type: this.mapButtonType(button.type),
      };

      switch (button.type) {
        case ButtonType.QUICK_REPLY:
          metaButton.text = button.text;
          break;

        case ButtonType.URL:
          metaButton.text = button.text;
          // Convert URL variable if present
          if (button.url?.includes('{{')) {
            const { text, newMappings, newIndex } = this.convertTextVariables(
              button.url,
              nextIndex,
              'button',
            );
            metaButton.url = text;
            mappings.push(...newMappings);
            nextIndex = newIndex;
            if (button.urlExample) {
              metaButton.example = [button.urlExample];
            }
          } else {
            metaButton.url = button.url;
          }
          break;

        case ButtonType.PHONE_NUMBER:
          metaButton.text = button.text;
          metaButton.phone_number = button.phoneNumber;
          break;

        case ButtonType.COPY_CODE:
          metaButton.example = button.copyCodeExample
            ? [button.copyCodeExample]
            : undefined;
          break;

        case ButtonType.OTP:
          metaButton.otp_type = this.mapOtpType(button.otpType);
          if (button.otpType === OtpType.COPY_CODE) {
            metaButton.text = button.otpText || 'Copy code';
          } else if (button.otpType === OtpType.ONE_TAP) {
            metaButton.autofill_text = 'Autofill';
            metaButton.package_name = button.packageName;
            metaButton.signature_hash = button.signatureHash;
          }
          break;

        case ButtonType.FLOW:
          metaButton.text = button.text;
          metaButton.flow_id = button.flowId;
          metaButton.flow_action = button.flowAction || 'navigate';
          metaButton.navigate_screen = button.navigateScreen;
          break;

        case ButtonType.MPM:
        case ButtonType.SPM:
          metaButton.text = button.text;
          break;
      }

      metaButtons.push(metaButton);
    }

    return {
      component: { type: 'BUTTONS', buttons: metaButtons },
      mappings,
      nextIndex,
    };
  }

  /**
   * Transform carousel cards
   */
  private transformCarousel(
    cards: NonNullable<TemplateComponentsDto['carousel']>,
    startIndex: number,
    category: TemplateCategory,
  ): { component: MetaComponent; mappings: VariableMapping[] } {
    const metaCards: MetaCarouselCard[] = [];
    const allMappings: VariableMapping[] = [];
    let currentIndex = startIndex;

    for (const card of cards) {
      const cardComponents: MetaComponent[] = [];

      // Card header (required, must be image or video)
      if (card.header) {
        const { component } = this.transformHeader(card.header, currentIndex);
        if (component) {
          cardComponents.push(component);
        }
      }

      // Card body (required)
      const {
        component: bodyComponent,
        mappings: bodyMappings,
        nextIndex,
      } = this.transformBody(card.body, currentIndex, category);
      cardComponents.push(bodyComponent);
      allMappings.push(...bodyMappings);
      currentIndex = nextIndex;

      // Card buttons
      if (card.buttons && card.buttons.length > 0) {
        const {
          component: buttonsComponent,
          mappings: buttonMappings,
          nextIndex: btnNextIndex,
        } = this.transformButtons(card.buttons, currentIndex);
        cardComponents.push(buttonsComponent);
        allMappings.push(...buttonMappings);
        currentIndex = btnNextIndex;
      }

      metaCards.push({ components: cardComponents });
    }

    return {
      component: { type: 'CAROUSEL', cards: metaCards },
      mappings: allMappings,
    };
  }

  /**
   * Convert named variables {{name}} to positional {{1}}
   */
  private convertTextVariables(
    text: string,
    startIndex: number,
    component: 'header' | 'body' | 'button',
  ): { text: string; newMappings: VariableMapping[]; newIndex: number } {
    // Match both named variables and already positional variables
    const namedPattern = /\{\{([a-z_][a-z0-9_.]*)\}\}/gi;
    const newMappings: VariableMapping[] = [];
    const variableIndexMap = new Map<string, number>();
    let currentIndex = startIndex;

    const convertedText = text.replace(namedPattern, (match, varName) => {
      // Skip if already positional (all digits)
      if (/^\d+$/.test(varName)) {
        return match;
      }

      // Check if already mapped
      if (variableIndexMap.has(varName)) {
        return `{{${variableIndexMap.get(varName)}}}`;
      }

      // Add new mapping
      variableIndexMap.set(varName, currentIndex);
      newMappings.push({
        name: varName,
        index: currentIndex,
        component,
      });

      return `{{${currentIndex++}}}`;
    });

    return { text: convertedText, newMappings, newIndex: currentIndex };
  }

  /**
   * Map our button type to Meta's button type string
   */
  private mapButtonType(type: ButtonType): string {
    const mapping: Record<ButtonType, string> = {
      [ButtonType.QUICK_REPLY]: 'QUICK_REPLY',
      [ButtonType.URL]: 'URL',
      [ButtonType.PHONE_NUMBER]: 'PHONE_NUMBER',
      [ButtonType.COPY_CODE]: 'COPY_CODE',
      [ButtonType.OTP]: 'OTP',
      [ButtonType.FLOW]: 'FLOW',
      [ButtonType.MPM]: 'MPM',
      [ButtonType.SPM]: 'SPM',
    };
    return mapping[type] || type;
  }

  /**
   * Map our OTP type to Meta's OTP type string
   */
  private mapOtpType(type?: OtpType): string {
    if (!type) return 'COPY_CODE';
    const mapping: Record<OtpType, string> = {
      [OtpType.COPY_CODE]: 'COPY_CODE',
      [OtpType.ONE_TAP]: 'ONE_TAP',
      [OtpType.ZERO_TAP]: 'ZERO_TAP',
    };
    return mapping[type] || 'COPY_CODE';
  }

  /**
   * Remove undefined properties from component for clean API payload
   */
  private cleanComponent(component: MetaComponent): Record<string, unknown> {
    const cleaned: Record<string, unknown> = { type: component.type };

    if (component.format !== undefined) cleaned.format = component.format;
    if (component.text !== undefined) cleaned.text = component.text;
    if (component.example !== undefined) cleaned.example = component.example;
    if (component.buttons !== undefined) {
      cleaned.buttons = component.buttons.map((btn) => this.cleanButton(btn));
    }
    if (component.cards !== undefined) {
      cleaned.cards = component.cards.map((card) => ({
        components: card.components.map((c) => this.cleanComponent(c)),
      }));
    }
    if (component.limited_time_offer !== undefined) {
      cleaned.limited_time_offer = component.limited_time_offer;
    }

    return cleaned;
  }

  /**
   * Remove undefined properties from button for clean API payload
   */
  private cleanButton(button: MetaButton): Record<string, unknown> {
    const cleaned: Record<string, unknown> = { type: button.type };

    if (button.text !== undefined) cleaned.text = button.text;
    if (button.url !== undefined) cleaned.url = button.url;
    if (button.phone_number !== undefined)
      cleaned.phone_number = button.phone_number;
    if (button.example !== undefined) cleaned.example = button.example;
    if (button.otp_type !== undefined) cleaned.otp_type = button.otp_type;
    if (button.autofill_text !== undefined)
      cleaned.autofill_text = button.autofill_text;
    if (button.package_name !== undefined)
      cleaned.package_name = button.package_name;
    if (button.signature_hash !== undefined)
      cleaned.signature_hash = button.signature_hash;
    if (button.flow_id !== undefined) cleaned.flow_id = button.flow_id;
    if (button.flow_action !== undefined)
      cleaned.flow_action = button.flow_action;
    if (button.navigate_screen !== undefined)
      cleaned.navigate_screen = button.navigate_screen;

    return cleaned;
  }
}
