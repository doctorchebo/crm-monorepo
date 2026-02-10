import { Injectable } from '@nestjs/common';
import { TemplateHeaderDto } from '../dto';
import { HeaderFormat, TEMPLATE_LIMITS, TemplateCategory } from '../types';
import {
  ValidationError,
  validateVariablePositions,
} from './validation-error.interface';

/**
 * Service for validating template headers
 * Supports text, image, video, document, and location formats
 */
@Injectable()
export class HeaderValidatorService {
  /**
   * Validate a template header
   */
  validate(
    header: TemplateHeaderDto | undefined,
    category: TemplateCategory,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!header) {
      return errors; // Header is optional
    }

    switch (header.format) {
      case HeaderFormat.TEXT:
        errors.push(...this.validateTextHeader(header));
        break;
      case HeaderFormat.IMAGE:
        errors.push(...this.validateMediaHeader(header, 'image'));
        break;
      case HeaderFormat.VIDEO:
        errors.push(...this.validateMediaHeader(header, 'video'));
        break;
      case HeaderFormat.DOCUMENT:
        errors.push(...this.validateMediaHeader(header, 'document'));
        break;
      case HeaderFormat.LOCATION:
        errors.push(...this.validateLocationHeader(header, category));
        break;
      default:
        errors.push({
          field: 'header.format',
          message: `Unknown header format: ${header.format}`,
          severity: 'error',
          code: 'HEADER_UNKNOWN_FORMAT',
        });
    }

    return errors;
  }

  private validateTextHeader(header: TemplateHeaderDto): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!header.text) {
      errors.push({
        field: 'header.text',
        message: 'Text is required for text headers',
        severity: 'error',
        code: 'HEADER_TEXT_REQUIRED',
      });
      return errors;
    }

    if (header.text.length > TEMPLATE_LIMITS.HEADER_TEXT_MAX_LENGTH) {
      errors.push({
        field: 'header.text',
        message: `Header text cannot exceed ${TEMPLATE_LIMITS.HEADER_TEXT_MAX_LENGTH} characters`,
        severity: 'error',
        code: 'HEADER_TEXT_TOO_LONG',
      });
    }

    // Check variable positions (Meta API doesn't allow variables at start/end)
    errors.push(
      ...validateVariablePositions(header.text, 'header.text', 'Header'),
    );

    // Check for variables in header
    const variables = header.text.match(/\{\{[^}]+\}\}/g) || [];
    if (variables.length > TEMPLATE_LIMITS.HEADER_TEXT_MAX_VARIABLES) {
      errors.push({
        field: 'header.text',
        message: `Header can only contain ${TEMPLATE_LIMITS.HEADER_TEXT_MAX_VARIABLES} variable`,
        severity: 'error',
        code: 'HEADER_TOO_MANY_VARIABLES',
      });
    }

    // If header has variable, example must be provided
    if (variables.length > 0 && !header.example) {
      errors.push({
        field: 'header.example',
        message: 'Example value is required when header contains a variable',
        severity: 'error',
        code: 'HEADER_EXAMPLE_REQUIRED',
      });
    }

    return errors;
  }

  private validateMediaHeader(
    header: TemplateHeaderDto,
    mediaType: 'image' | 'video' | 'document',
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Either assetHandle or link must be provided
    if (!header.assetHandle && !header.link) {
      errors.push({
        field: 'header',
        message: `${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} header requires either an asset handle or a link`,
        severity: 'error',
        code: `HEADER_${mediaType.toUpperCase()}_REQUIRED`,
      });
    }

    // If link is provided, validate URL format
    if (header.link) {
      if (
        !header.link.startsWith('https://') &&
        !header.link.startsWith('http://')
      ) {
        errors.push({
          field: 'header.link',
          message: 'Media URL must start with http:// or https://',
          severity: 'error',
          code: 'HEADER_LINK_INVALID_PROTOCOL',
        });
      }
    }

    return errors;
  }

  private validateLocationHeader(
    header: TemplateHeaderDto,
    category: TemplateCategory,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Location headers are not allowed in authentication templates
    if (category === TemplateCategory.AUTHENTICATION) {
      errors.push({
        field: 'header.format',
        message: 'Location headers are not allowed in authentication templates',
        severity: 'error',
        code: 'HEADER_LOCATION_NOT_ALLOWED',
      });
    }

    return errors;
  }
}
