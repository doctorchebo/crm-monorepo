import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { TEMPLATE_LIMITS } from '../types';

/**
 * DTO for template footer component
 */
export class TemplateFooterDto {
  /**
   * Footer text - no variables allowed
   * Max 60 characters
   */
  @IsString()
  @IsNotEmpty({ message: 'Footer text cannot be empty if provided' })
  @MaxLength(TEMPLATE_LIMITS.FOOTER_MAX_LENGTH, {
    message: `Footer text cannot exceed ${TEMPLATE_LIMITS.FOOTER_MAX_LENGTH} characters`,
  })
  text: string;
}
