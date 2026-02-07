import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TEMPLATE_LIMITS } from '../types';

/**
 * DTO for template body component
 */
export class TemplateBodyDto {
  /**
   * Body text with variables in {{variable_name}} format
   * Will be converted to positional format {{1}}, {{2}} for Meta API
   */
  @IsString()
  @IsNotEmpty({ message: 'Body text is required' })
  @MinLength(TEMPLATE_LIMITS.BODY_MIN_LENGTH, {
    message: 'Body text cannot be empty',
  })
  @MaxLength(TEMPLATE_LIMITS.BODY_MAX_LENGTH, {
    message: `Body text cannot exceed ${TEMPLATE_LIMITS.BODY_MAX_LENGTH} characters`,
  })
  text: string;

  /**
   * Example values for body variables
   * Keys are variable names, values are example content
   */
  @IsOptional()
  @IsObject()
  examples?: Record<string, string>;
}
