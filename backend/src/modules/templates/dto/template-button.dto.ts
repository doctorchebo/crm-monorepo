import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ButtonType, OtpType, TEMPLATE_LIMITS } from '../types';

/**
 * DTO for template button component
 * Supports all button types: quick reply, URL, phone, copy code, OTP, flow, catalog, MPM
 */
export class TemplateButtonDto {
  @IsEnum(ButtonType, {
    message: `Button type must be one of: ${Object.values(ButtonType).join(', ')}`,
  })
  @IsNotEmpty()
  type: ButtonType;

  /**
   * Button label text
   * Max 25 characters for most button types
   */
  @ValidateIf((o) =>
    [
      ButtonType.QUICK_REPLY,
      ButtonType.URL,
      ButtonType.PHONE_NUMBER,
      ButtonType.FLOW,
      ButtonType.CATALOG,
      ButtonType.MPM,
      ButtonType.SPM,
    ].includes(o.type),
  )
  @IsString()
  @IsNotEmpty({ message: 'Button text is required' })
  @MaxLength(TEMPLATE_LIMITS.BUTTON_TEXT_MAX_LENGTH, {
    message: `Button text cannot exceed ${TEMPLATE_LIMITS.BUTTON_TEXT_MAX_LENGTH} characters`,
  })
  text?: string;

  // === URL Button Properties ===

  /**
   * URL for URL buttons
   * Max 2000 characters, can end with {{1}} for dynamic suffix
   */
  @ValidateIf((o) => o.type === ButtonType.URL)
  @IsString()
  @IsNotEmpty({ message: 'URL is required for URL buttons' })
  @MaxLength(TEMPLATE_LIMITS.BUTTON_URL_MAX_LENGTH, {
    message: `URL cannot exceed ${TEMPLATE_LIMITS.BUTTON_URL_MAX_LENGTH} characters`,
  })
  url?: string;

  /**
   * Example value for URL variable (if url contains {{1}})
   */
  @ValidateIf((o) => o.type === ButtonType.URL)
  @IsOptional()
  @IsString()
  urlExample?: string;

  // === Phone Number Button Properties ===

  /**
   * Phone number with country code for PHONE_NUMBER buttons
   * Max 20 characters
   */
  @ValidateIf((o) => o.type === ButtonType.PHONE_NUMBER)
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @MaxLength(TEMPLATE_LIMITS.PHONE_NUMBER_MAX_LENGTH, {
    message: `Phone number cannot exceed ${TEMPLATE_LIMITS.PHONE_NUMBER_MAX_LENGTH} characters`,
  })
  @Matches(/^\+?[0-9]+$/, {
    message: 'Phone number must contain only digits and optional leading +',
  })
  phoneNumber?: string;

  // === Copy Code Button Properties ===

  /**
   * Example code for COPY_CODE buttons
   * Max 15 characters
   */
  @ValidateIf((o) => o.type === ButtonType.COPY_CODE)
  @IsString()
  @IsNotEmpty({ message: 'Example code is required for copy code buttons' })
  @MaxLength(TEMPLATE_LIMITS.COPY_CODE_MAX_LENGTH, {
    message: `Copy code cannot exceed ${TEMPLATE_LIMITS.COPY_CODE_MAX_LENGTH} characters`,
  })
  copyCodeExample?: string;

  // === OTP Button Properties ===

  /**
   * OTP type for authentication templates
   */
  @ValidateIf((o) => o.type === ButtonType.OTP)
  @IsEnum(OtpType, {
    message: `OTP type must be one of: ${Object.values(OtpType).join(', ')}`,
  })
  otpType?: OtpType;

  /**
   * Custom text for OTP copy code button
   */
  @ValidateIf(
    (o) => o.type === ButtonType.OTP && o.otpType === OtpType.COPY_CODE,
  )
  @IsOptional()
  @IsString()
  @MaxLength(TEMPLATE_LIMITS.BUTTON_TEXT_MAX_LENGTH)
  otpText?: string;

  /**
   * Android package name for ONE_TAP OTP
   */
  @ValidateIf((o) => o.type === ButtonType.OTP && o.otpType === OtpType.ONE_TAP)
  @IsOptional()
  @IsString()
  packageName?: string;

  /**
   * Android app signature hash for ONE_TAP OTP
   */
  @ValidateIf((o) => o.type === ButtonType.OTP && o.otpType === OtpType.ONE_TAP)
  @IsOptional()
  @IsString()
  signatureHash?: string;

  // === Flow Button Properties ===

  /**
   * Flow ID for FLOW buttons
   */
  @ValidateIf((o) => o.type === ButtonType.FLOW)
  @IsString()
  @IsNotEmpty({ message: 'Flow ID is required for flow buttons' })
  flowId?: string;

  /**
   * Flow action type
   */
  @ValidateIf((o) => o.type === ButtonType.FLOW)
  @IsOptional()
  @IsString()
  flowAction?: 'navigate' | 'data_exchange';

  /**
   * Screen to navigate to for FLOW buttons
   */
  @ValidateIf((o) => o.type === ButtonType.FLOW && o.flowAction === 'navigate')
  @IsOptional()
  @IsString()
  navigateScreen?: string;
}
