import { Injectable } from '@nestjs/common';
import { TemplateButtonDto } from '../dto';
import {
  ButtonType,
  OtpType,
  TEMPLATE_LIMITS,
  TemplateCategory,
} from '../types';
import { ValidationError } from './validation-error.interface';

/**
 * Service for validating template buttons
 * Enforces WhatsApp/Meta button rules and constraints
 */
@Injectable()
export class ButtonValidatorService {
  /**
   * Validate an array of buttons
   */
  validate(
    buttons: TemplateButtonDto[] | undefined,
    category: TemplateCategory,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!buttons || buttons.length === 0) {
      return errors;
    }

    // Check total button count
    if (buttons.length > TEMPLATE_LIMITS.MAX_BUTTONS_TOTAL) {
      errors.push({
        field: 'buttons',
        message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_BUTTONS_TOTAL} buttons. Found ${buttons.length}.`,
        severity: 'error',
        code: 'BUTTON_COUNT_EXCEEDED',
      });
    }

    // Count buttons by type
    const buttonCounts = this.countButtonsByType(buttons);

    // Validate button type limits
    errors.push(...this.validateButtonTypeLimits(buttonCounts));

    // Validate button ordering (quick replies must be grouped)
    errors.push(...this.validateButtonOrdering(buttons));

    // Validate individual buttons
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      errors.push(...this.validateButton(button, i, category));
    }

    // Category-specific validation
    errors.push(...this.validateCategoryRestrictions(buttons, category));

    return errors;
  }

  /**
   * Count buttons by their type
   */
  private countButtonsByType(
    buttons: TemplateButtonDto[],
  ): Map<ButtonType, number> {
    const counts = new Map<ButtonType, number>();

    for (const button of buttons) {
      counts.set(button.type, (counts.get(button.type) || 0) + 1);
    }

    return counts;
  }

  /**
   * Validate button type limits
   */
  private validateButtonTypeLimits(
    counts: Map<ButtonType, number>,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    const urlCount = counts.get(ButtonType.URL) || 0;
    if (urlCount > TEMPLATE_LIMITS.MAX_URL_BUTTONS) {
      errors.push({
        field: 'buttons',
        message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_URL_BUTTONS} URL buttons. Found ${urlCount}.`,
        severity: 'error',
        code: 'URL_BUTTON_LIMIT_EXCEEDED',
      });
    }

    const phoneCount = counts.get(ButtonType.PHONE_NUMBER) || 0;
    if (phoneCount > TEMPLATE_LIMITS.MAX_PHONE_BUTTONS) {
      errors.push({
        field: 'buttons',
        message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_PHONE_BUTTONS} phone number button. Found ${phoneCount}.`,
        severity: 'error',
        code: 'PHONE_BUTTON_LIMIT_EXCEEDED',
      });
    }

    const copyCodeCount = counts.get(ButtonType.COPY_CODE) || 0;
    if (copyCodeCount > TEMPLATE_LIMITS.MAX_COPY_CODE_BUTTONS) {
      errors.push({
        field: 'buttons',
        message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_COPY_CODE_BUTTONS} copy code button. Found ${copyCodeCount}.`,
        severity: 'error',
        code: 'COPY_CODE_BUTTON_LIMIT_EXCEEDED',
      });
    }

    const otpCount = counts.get(ButtonType.OTP) || 0;
    if (otpCount > TEMPLATE_LIMITS.MAX_OTP_BUTTONS) {
      errors.push({
        field: 'buttons',
        message: `Cannot have more than ${TEMPLATE_LIMITS.MAX_OTP_BUTTONS} OTP button. Found ${otpCount}.`,
        severity: 'error',
        code: 'OTP_BUTTON_LIMIT_EXCEEDED',
      });
    }

    return errors;
  }

  /**
   * Validate that quick reply buttons are grouped together
   * Meta requires: all quick reply buttons must be contiguous
   */
  private validateButtonOrdering(
    buttons: TemplateButtonDto[],
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    let foundNonQuickReply = false;
    let foundQuickReplyAfterOther = false;

    for (const button of buttons) {
      if (button.type === ButtonType.QUICK_REPLY) {
        if (foundNonQuickReply) {
          foundQuickReplyAfterOther = true;
          break;
        }
      } else {
        foundNonQuickReply = true;
      }
    }

    if (foundQuickReplyAfterOther) {
      errors.push({
        field: 'buttons',
        message:
          'Quick reply buttons must be grouped together. Move all quick reply buttons to the beginning of the list.',
        severity: 'error',
        code: 'QUICK_REPLY_NOT_GROUPED',
      });
    }

    return errors;
  }

  /**
   * Validate individual button properties
   */
  private validateButton(
    button: TemplateButtonDto,
    index: number,
    category: TemplateCategory,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const fieldPrefix = `buttons[${index}]`;

    switch (button.type) {
      case ButtonType.QUICK_REPLY:
        errors.push(...this.validateQuickReplyButton(button, fieldPrefix));
        break;
      case ButtonType.URL:
        errors.push(...this.validateUrlButton(button, fieldPrefix));
        break;
      case ButtonType.PHONE_NUMBER:
        errors.push(...this.validatePhoneButton(button, fieldPrefix));
        break;
      case ButtonType.COPY_CODE:
        errors.push(...this.validateCopyCodeButton(button, fieldPrefix));
        break;
      case ButtonType.OTP:
        errors.push(...this.validateOtpButton(button, fieldPrefix, category));
        break;
      case ButtonType.FLOW:
        errors.push(...this.validateFlowButton(button, fieldPrefix));
        break;
      case ButtonType.MPM:
      case ButtonType.SPM:
        errors.push(...this.validateTextOnlyButton(button, fieldPrefix));
        break;
    }

    return errors;
  }

  private validateQuickReplyButton(
    button: TemplateButtonDto,
    fieldPrefix: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!button.text) {
      errors.push({
        field: `${fieldPrefix}.text`,
        message: 'Quick reply button text is required',
        severity: 'error',
        code: 'QUICK_REPLY_TEXT_REQUIRED',
      });
    } else if (button.text.length > TEMPLATE_LIMITS.BUTTON_TEXT_MAX_LENGTH) {
      errors.push({
        field: `${fieldPrefix}.text`,
        message: `Quick reply text cannot exceed ${TEMPLATE_LIMITS.BUTTON_TEXT_MAX_LENGTH} characters`,
        severity: 'error',
        code: 'QUICK_REPLY_TEXT_TOO_LONG',
      });
    }

    return errors;
  }

  private validateUrlButton(
    button: TemplateButtonDto,
    fieldPrefix: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!button.text) {
      errors.push({
        field: `${fieldPrefix}.text`,
        message: 'URL button text is required',
        severity: 'error',
        code: 'URL_BUTTON_TEXT_REQUIRED',
      });
    }

    if (!button.url) {
      errors.push({
        field: `${fieldPrefix}.url`,
        message: 'URL is required for URL buttons',
        severity: 'error',
        code: 'URL_REQUIRED',
      });
      return errors;
    }

    // Validate URL format
    if (
      !button.url.startsWith('https://') &&
      !button.url.startsWith('http://')
    ) {
      errors.push({
        field: `${fieldPrefix}.url`,
        message: 'URL must start with http:// or https://',
        severity: 'error',
        code: 'URL_INVALID_PROTOCOL',
      });
    }

    // Check for blocked URL shorteners
    const urlLower = button.url.toLowerCase();
    for (const shortener of TEMPLATE_LIMITS.BLOCKED_URL_SHORTENERS) {
      if (urlLower.includes(shortener)) {
        errors.push({
          field: `${fieldPrefix}.url`,
          message: `URL shortener ${shortener} is not allowed`,
          severity: 'error',
          code: 'URL_SHORTENER_BLOCKED',
        });
        break;
      }
    }

    // Check if URL has variable and example is provided
    if (button.url.includes('{{1}}') && !button.urlExample) {
      errors.push({
        field: `${fieldPrefix}.urlExample`,
        message: 'URL contains variable {{1}} but no example was provided',
        severity: 'error',
        code: 'URL_EXAMPLE_REQUIRED',
      });
    }

    return errors;
  }

  private validatePhoneButton(
    button: TemplateButtonDto,
    fieldPrefix: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!button.text) {
      errors.push({
        field: `${fieldPrefix}.text`,
        message: 'Phone button text is required',
        severity: 'error',
        code: 'PHONE_BUTTON_TEXT_REQUIRED',
      });
    }

    if (!button.phoneNumber) {
      errors.push({
        field: `${fieldPrefix}.phoneNumber`,
        message: 'Phone number is required',
        severity: 'error',
        code: 'PHONE_NUMBER_REQUIRED',
      });
      return errors;
    }

    // Validate phone number format
    const phonePattern = /^\+?[0-9]{1,20}$/;
    if (!phonePattern.test(button.phoneNumber)) {
      errors.push({
        field: `${fieldPrefix}.phoneNumber`,
        message: 'Phone number must contain only digits and optional leading +',
        severity: 'error',
        code: 'PHONE_NUMBER_INVALID_FORMAT',
      });
    }

    if (button.phoneNumber.length > TEMPLATE_LIMITS.PHONE_NUMBER_MAX_LENGTH) {
      errors.push({
        field: `${fieldPrefix}.phoneNumber`,
        message: `Phone number cannot exceed ${TEMPLATE_LIMITS.PHONE_NUMBER_MAX_LENGTH} characters`,
        severity: 'error',
        code: 'PHONE_NUMBER_TOO_LONG',
      });
    }

    return errors;
  }

  private validateCopyCodeButton(
    button: TemplateButtonDto,
    fieldPrefix: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!button.copyCodeExample) {
      errors.push({
        field: `${fieldPrefix}.copyCodeExample`,
        message: 'Example code is required for copy code button',
        severity: 'error',
        code: 'COPY_CODE_EXAMPLE_REQUIRED',
      });
    } else if (
      button.copyCodeExample.length > TEMPLATE_LIMITS.COPY_CODE_MAX_LENGTH
    ) {
      errors.push({
        field: `${fieldPrefix}.copyCodeExample`,
        message: `Copy code cannot exceed ${TEMPLATE_LIMITS.COPY_CODE_MAX_LENGTH} characters`,
        severity: 'error',
        code: 'COPY_CODE_TOO_LONG',
      });
    }

    return errors;
  }

  private validateOtpButton(
    button: TemplateButtonDto,
    fieldPrefix: string,
    category: TemplateCategory,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // OTP buttons only allowed in authentication templates
    if (category !== TemplateCategory.AUTHENTICATION) {
      errors.push({
        field: `${fieldPrefix}.type`,
        message: 'OTP buttons are only allowed in authentication templates',
        severity: 'error',
        code: 'OTP_BUTTON_WRONG_CATEGORY',
      });
    }

    if (!button.otpType) {
      errors.push({
        field: `${fieldPrefix}.otpType`,
        message: 'OTP type is required for OTP buttons',
        severity: 'error',
        code: 'OTP_TYPE_REQUIRED',
      });
    }

    // ONE_TAP requires additional fields
    if (button.otpType === OtpType.ONE_TAP) {
      if (!button.packageName) {
        errors.push({
          field: `${fieldPrefix}.packageName`,
          message: 'Package name is required for one-tap OTP buttons',
          severity: 'error',
          code: 'OTP_PACKAGE_NAME_REQUIRED',
        });
      }
      if (!button.signatureHash) {
        errors.push({
          field: `${fieldPrefix}.signatureHash`,
          message: 'Signature hash is required for one-tap OTP buttons',
          severity: 'error',
          code: 'OTP_SIGNATURE_HASH_REQUIRED',
        });
      }
    }

    return errors;
  }

  private validateFlowButton(
    button: TemplateButtonDto,
    fieldPrefix: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!button.text) {
      errors.push({
        field: `${fieldPrefix}.text`,
        message: 'Flow button text is required',
        severity: 'error',
        code: 'FLOW_BUTTON_TEXT_REQUIRED',
      });
    }

    if (!button.flowId) {
      errors.push({
        field: `${fieldPrefix}.flowId`,
        message: 'Flow ID is required for flow buttons',
        severity: 'error',
        code: 'FLOW_ID_REQUIRED',
      });
    }

    return errors;
  }

  private validateTextOnlyButton(
    button: TemplateButtonDto,
    fieldPrefix: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!button.text) {
      errors.push({
        field: `${fieldPrefix}.text`,
        message: 'Button text is required',
        severity: 'error',
        code: 'BUTTON_TEXT_REQUIRED',
      });
    }

    return errors;
  }

  /**
   * Validate category-specific button restrictions
   */
  private validateCategoryRestrictions(
    buttons: TemplateButtonDto[],
    category: TemplateCategory,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Authentication templates have specific button requirements
    if (category === TemplateCategory.AUTHENTICATION) {
      const hasOtp = buttons.some((b) => b.type === ButtonType.OTP);
      const hasOtherButtons = buttons.some((b) => b.type !== ButtonType.OTP);

      if (!hasOtp) {
        errors.push({
          field: 'buttons',
          message: 'Authentication templates must have an OTP button',
          severity: 'warning',
          code: 'AUTH_MISSING_OTP_BUTTON',
        });
      }

      if (hasOtherButtons) {
        errors.push({
          field: 'buttons',
          message: 'Authentication templates should only have OTP buttons',
          severity: 'warning',
          code: 'AUTH_EXTRA_BUTTONS',
        });
      }
    }

    return errors;
  }
}
