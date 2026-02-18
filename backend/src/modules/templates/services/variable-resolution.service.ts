import { db } from '@database/db.connection';
import {
  chats,
  contactAttributes,
  contacts,
  senders,
  templateLocales,
  templateMedia,
  templateVariables,
} from '@database/schema';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { S3Service } from '@shared/services/s3.service';
import { and, eq } from 'drizzle-orm';

/**
 * Variable prefixes for structured naming convention
 * These must match the categories in the variable_definitions table
 */
export const VARIABLE_PREFIXES = {
  CUSTOMER: 'customer', // customer.first_name, customer.email
  CHAT: 'chat', // chat.participant_name, chat.participant_phone
  SENDER: 'sender', // sender.business_name, sender.business_phone
  ORDER: 'order', // order.order_id, order.order_total
  PROPERTY: 'property', // property.property_address, property.property_price
  SYSTEM: 'system', // system.current_date, system.greeting
  CUSTOM: 'custom', // custom.<any_key> for user-defined variables
} as const;

/**
 * Core customer fields available via customer.* prefix
 */
export const CUSTOMER_FIELDS = [
  'first_name',
  'last_name',
  'full_name',
  'email',
  'phone',
  'country_code',
] as const;

/**
 * Chat fields available via chat.* prefix
 */
export const CHAT_FIELDS = [
  'participant_name',
  'participant_phone',
  'last_message_time',
  'chat_start_date',
] as const;

/**
 * Sender/Business fields available via sender.* prefix
 */
export const SENDER_FIELDS = ['business_name', 'business_phone'] as const;

/**
 * Order fields available via order.* prefix
 */
export const ORDER_FIELDS = [
  'order_id',
  'order_total',
  'order_status',
  'order_date',
  'delivery_date',
  'tracking_number',
  'tracking_url',
] as const;

/**
 * Property fields available via property.* prefix (for real estate CRM)
 */
export const PROPERTY_FIELDS = [
  'property_address',
  'property_price',
  'property_type',
  'bedrooms',
  'bathrooms',
  'square_feet',
  'listing_url',
  'viewing_date',
] as const;

/**
 * System fields available via system.* prefix
 */
export const SYSTEM_FIELDS = [
  'current_date',
  'current_time',
  'current_datetime',
  'day_of_week',
  'greeting',
  'business_name',
  'business_phone',
] as const;

export type VariablePrefix = keyof typeof VARIABLE_PREFIXES;

export interface VariableResolutionResult {
  resolved: Record<string, string>;
  unresolved: string[];
  errors: VariableError[];
}

export interface VariableError {
  variable: string;
  message: string;
  type: 'missing' | 'invalid_type' | 'validation_failed';
}

export interface ResolvedTemplate {
  success: boolean;
  body: string;
  header?: string;
  footer?: string;
  resolvedVariables: Record<string, string>;
  unresolvedVariables: string[];
  errors: VariableError[];
}

/**
 * Variable Resolution Engine
 * Resolves template variables from multiple sources with priority:
 * 1. Explicit overrides (manual input at send time)
 * 2. Contact attributes (custom.*)
 * 3. Contact fields (customer.*)
 * 4. System fields (system.*)
 */
@Injectable()
export class VariableResolutionService {
  private readonly logger = new Logger(VariableResolutionService.name);

  constructor(private readonly s3Service: S3Service) {}

  /**
   * Parse a variable name into prefix and field.
   *
   * Supports two formats:
   * - **Named**: `"customer.first_name"` → `{ prefix: "customer", field: "first_name" }`
   * - **Positional**: `"1"`, `"2"` → `{ prefix: "positional", field: "1" }`
   *
   * Positional variables are used by Meta Template Library templates.
   * They can only be resolved from explicit overrides, not from contact data.
   */
  parseVariable(
    varName: string,
  ): { prefix: string; field: string; isPositional?: boolean } | null {
    // Check for positional variable (pure numeric: "1", "2", "3", etc.)
    if (/^\d+$/.test(varName)) {
      return { prefix: 'positional', field: varName, isPositional: true };
    }

    const parts = varName.split('.');
    if (parts.length !== 2) {
      return null;
    }
    return { prefix: parts[0], field: parts[1] };
  }

  /**
   * Validate variable name follows flexible naming convention.
   *
   * FLEXIBLE APPROACH: Accept any prefix.field format for custom business variables.
   * Known prefixes are resolved from system data, unknown prefixes from contact attributes.
   *
   * Also accepts **positional** variable names (`"1"`, `"2"`, etc.) used by
   * Meta Template Library templates.
   */
  validateVariableName(varName: string): {
    isValid: boolean;
    error?: string;
    isCustomPrefix?: boolean;
    isPositional?: boolean;
  } {
    const parsed = this.parseVariable(varName);

    if (!parsed) {
      return {
        isValid: false,
        error: `Invalid variable format: "${varName}". Use prefix.field format (e.g., customer.first_name, promotion.end_date) or positional (1, 2, 3)`,
      };
    }

    // Positional variables are always valid
    if (parsed.isPositional) {
      return { isValid: true, isPositional: true };
    }

    const { prefix, field } = parsed;

    // Validate prefix format (lowercase letters and underscores, starting with letter)
    if (!/^[a-z][a-z_]*$/.test(prefix)) {
      return {
        isValid: false,
        error: `Invalid prefix format "${prefix}". Use lowercase letters starting with a letter`,
      };
    }

    // Validate field format (lowercase letters, numbers, underscores, starting with letter)
    if (!/^[a-z][a-z0-9_]*$/.test(field)) {
      return {
        isValid: false,
        error: `Invalid field name "${field}". Use lowercase letters, numbers, and underscores (must start with a letter)`,
      };
    }

    // Check if this is a known prefix or a custom one
    const validPrefixes = Object.values(VARIABLE_PREFIXES);
    const isCustomPrefix = !validPrefixes.includes(prefix as any);

    return { isValid: true, isCustomPrefix };
  }

  /**
   * Get customer profile data for variable resolution
   */
  async getCustomerData(contactId: string): Promise<{
    customer: Record<string, string>;
    custom: Record<string, string | null>;
  }> {
    const contact = await db.query.contacts.findFirst({
      where: and(
        eq(contacts.contactId, contactId),
        eq(contacts.isActive, true),
      ),
    });

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    // Get custom attributes
    const attributes = await db.query.contactAttributes.findMany({
      where: eq(contactAttributes.contactId, contactId),
    });

    const custom = attributes.reduce(
      (map, attr) => {
        map[attr.key] = attr.value;
        return map;
      },
      {} as Record<string, string | null>,
    );

    return {
      customer: {
        first_name: contact.firstName || '',
        last_name: contact.lastName || '',
        full_name: [contact.firstName, contact.lastName]
          .filter(Boolean)
          .join(' '),
        email: contact.email || '',
        phone: contact.phoneNumber || '',
      },
      custom,
    };
  }

  /**
   * Get system data for variable resolution
   */
  async getSystemData(
    senderId?: number,
    chatId?: string,
  ): Promise<Record<string, string>> {
    const now = new Date();
    const systemData: Record<string, string> = {
      current_date: now.toLocaleDateString(),
      current_time: now.toLocaleTimeString(),
      business_name: '',
      business_phone: '',
    };

    // Get sender info if available
    if (senderId) {
      const sender = await db.query.senders.findFirst({
        where: eq(senders.id, senderId),
      });
      if (sender) {
        systemData.business_phone = sender.phoneNumber;
        systemData.business_name = sender.displayName || '';
      }
    }

    return systemData;
  }

  /**
   * Get chat data for variable resolution
   */
  async getChatData(chatId?: string): Promise<Record<string, string>> {
    const chatData: Record<string, string> = {
      participant_name: '',
      participant_phone: '',
      last_message_time: '',
      chat_start_date: '',
    };

    if (chatId) {
      const chat = await db.query.chats.findFirst({
        where: eq(chats.chatId, chatId),
      });
      if (chat) {
        chatData.participant_name = chat.participantName || '';
        chatData.participant_phone = chat.participantPhone || '';
        chatData.last_message_time = chat.lastMessageTime
          ? chat.lastMessageTime.toLocaleString()
          : '';
        chatData.chat_start_date = chat.createdAt
          ? chat.createdAt.toLocaleDateString()
          : '';
      }
    }

    return chatData;
  }

  /**
   * Get sender data for variable resolution
   */
  async getSenderData(senderId?: number): Promise<Record<string, string>> {
    const senderData: Record<string, string> = {
      business_name: '',
      business_phone: '',
    };

    if (senderId) {
      const sender = await db.query.senders.findFirst({
        where: eq(senders.id, senderId),
      });
      if (sender) {
        senderData.business_name = sender.displayName || '';
        senderData.business_phone = sender.phoneNumber || '';
      }
    }

    return senderData;
  }

  /**
   * Resolve a single variable from available data sources.
   *
   * Resolution priority:
   * 1. Explicit overrides (manual input at send time)
   * 2. Known prefixes resolve from their respective data sources
   * 3. Unknown/custom prefixes resolve from contact custom attributes
   *    - Uses "prefix.field" as the attribute key (e.g., "promotion.end_date")
   *    - Falls back to just "field" for compatibility
   */
  resolveVariable(
    varName: string,
    customerData: {
      customer: Record<string, string>;
      custom: Record<string, string | null>;
    },
    systemData: Record<string, string>,
    chatData: Record<string, string>,
    senderData: Record<string, string>,
    overrides?: Record<string, string>,
  ): { value: string | null; source: string } {
    // Priority 1: Explicit overrides
    if (overrides && varName in overrides) {
      const overrideValue = overrides[varName];

      // If the override is a variable reference like {{customer.first_name}},
      // re-resolve it from data sources instead of returning the literal string.
      const refMatch = overrideValue.match(/^\{\{([^}]+)\}\}$/);
      if (refMatch) {
        // Pass empty overrides to prevent infinite recursion
        return this.resolveVariable(
          refMatch[1],
          customerData,
          systemData,
          chatData,
          senderData,
          {},
        );
      }

      return { value: overrideValue, source: 'override' };
    }

    const parsed = this.parseVariable(varName);
    if (!parsed) {
      return { value: null, source: 'invalid' };
    }

    // Positional variables can ONLY be resolved from overrides.
    // If we reach here, the override was not provided.
    if (parsed.isPositional) {
      return { value: null, source: 'positional_unresolved' };
    }

    const { prefix, field } = parsed;
    const validPrefixes = Object.values(VARIABLE_PREFIXES);

    // Priority 2: Customer data (custom.* prefix)
    if (prefix === VARIABLE_PREFIXES.CUSTOM) {
      const value = customerData.custom[field];
      return { value: value ?? null, source: 'custom_attribute' };
    }

    // Priority 3: Customer fields (customer.* prefix)
    if (prefix === VARIABLE_PREFIXES.CUSTOMER) {
      const value = customerData.customer[field];
      return { value: value ?? null, source: 'contact' };
    }

    // Priority 4: Chat fields (chat.* prefix)
    if (prefix === VARIABLE_PREFIXES.CHAT) {
      const value = chatData[field];
      return { value: value ?? null, source: 'chat' };
    }

    // Priority 5: Sender fields (sender.* prefix)
    if (prefix === VARIABLE_PREFIXES.SENDER) {
      const value = senderData[field];
      return { value: value ?? null, source: 'sender' };
    }

    // Priority 6: System fields (system.* prefix)
    if (prefix === VARIABLE_PREFIXES.SYSTEM) {
      const value = systemData[field];
      return { value: value ?? null, source: 'system' };
    }

    // Priority 7: Order fields - resolve from custom attributes
    if (prefix === VARIABLE_PREFIXES.ORDER) {
      const value = customerData.custom[field];
      return { value: value ?? null, source: 'custom_attribute' };
    }

    // Priority 8: Property fields - resolve from custom attributes
    if (prefix === VARIABLE_PREFIXES.PROPERTY) {
      const value = customerData.custom[field];
      return { value: value ?? null, source: 'custom_attribute' };
    }

    // Priority 9: Unknown/Custom prefixes - resolve from contact custom attributes
    // This enables flexible variables like "promotion.end_date", "campaign.name", etc.
    // Users can define these as contact attributes with the full "prefix.field" key
    // or just the "field" name for convenience
    if (!validPrefixes.includes(prefix as any)) {
      // First try the full variable name as attribute key (e.g., "promotion.end_date")
      let value = customerData.custom[varName];
      if (value !== undefined && value !== null) {
        return { value, source: 'custom_attribute' };
      }

      // Fall back to just the field name (e.g., "end_date")
      value = customerData.custom[field];
      if (value !== undefined && value !== null) {
        return { value, source: 'custom_attribute' };
      }

      return { value: null, source: 'custom_attribute_missing' };
    }

    return { value: null, source: 'unknown' };
  }

  /**
   * Resolve all variables for a template
   */
  async resolveTemplateVariables(
    templateBody: string,
    contactId: string,
    options?: {
      senderId?: number;
      chatId?: string;
      overrides?: Record<string, string>;
    },
  ): Promise<VariableResolutionResult> {
    // Extract variables from template
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = variableRegex.exec(templateBody)) !== null) {
      const varName = match[1].trim();
      if (!variables.includes(varName)) {
        variables.push(varName);
      }
    }

    if (variables.length === 0) {
      return { resolved: {}, unresolved: [], errors: [] };
    }

    // Get data from all sources
    const customerData = await this.getCustomerData(contactId);
    const systemData = await this.getSystemData(
      options?.senderId,
      options?.chatId,
    );
    const chatData = await this.getChatData(options?.chatId);
    const senderData = await this.getSenderData(options?.senderId);

    const resolved: Record<string, string> = {};
    const unresolved: string[] = [];
    const errors: VariableError[] = [];

    for (const varName of variables) {
      // Validate variable name
      const validation = this.validateVariableName(varName);
      if (!validation.isValid) {
        errors.push({
          variable: varName,
          message: validation.error!,
          type: 'invalid_type',
        });
        unresolved.push(varName);
        continue;
      }

      // Resolve variable
      const result = this.resolveVariable(
        varName,
        customerData,
        systemData,
        chatData,
        senderData,
        options?.overrides,
      );

      if (result.value !== null && result.value !== '') {
        resolved[varName] = result.value;
      } else {
        unresolved.push(varName);
        errors.push({
          variable: varName,
          message: `Variable "${varName}" could not be resolved`,
          type: 'missing',
        });
      }
    }

    return { resolved, unresolved, errors };
  }

  /**
   * Render a template with resolved variables.
   *
   * Variable names are regex-escaped so dots (e.g. `customer.first_name`)
   * match literally and don't act as wildcards.
   */
  renderTemplate(template: string, variables: Record<string, string>): string {
    let rendered = template;

    Object.entries(variables).forEach(([key, value]) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const placeholder = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g');
      rendered = rendered.replace(placeholder, value);
    });

    return rendered;
  }

  /**
   * Full template resolution - resolve and render
   */
  async resolveAndRenderTemplate(
    localeId: string,
    contactId: string,
    options?: {
      senderId?: number;
      chatId?: string;
      overrides?: Record<string, string>;
    },
  ): Promise<ResolvedTemplate> {
    // Get template locale
    const locale = await db.query.templateLocales.findFirst({
      where: eq(templateLocales.id, localeId),
    });

    if (!locale) {
      throw new NotFoundException(`Template locale ${localeId} not found`);
    }

    // Resolve variables
    const resolution = await this.resolveTemplateVariables(
      locale.body,
      contactId,
      options,
    );

    // Get template variable definitions to check required fields
    const variableDefs = await db.query.templateVariables.findMany({
      where: eq(templateVariables.localeId, localeId),
    });

    // Check for required but unresolved variables
    const requiredErrors: VariableError[] = [];
    for (const varDef of variableDefs) {
      if (varDef.isRequired && resolution.unresolved.includes(varDef.varName)) {
        requiredErrors.push({
          variable: varDef.varName,
          message: `Required variable "${varDef.varName}" is missing`,
          type: 'missing',
        });
      }
    }

    // Validate parameter types for library templates
    const typeErrors = this.validateParameterTypes(
      resolution.resolved,
      locale.bodyParamTypes as string[] | null,
      locale.parameterFormat,
    );

    const allErrors = [...resolution.errors, ...requiredErrors, ...typeErrors];
    const hasBlockingErrors = requiredErrors.length > 0;

    // Render template with resolved variables
    const renderedBody = this.renderTemplate(locale.body, resolution.resolved);
    const renderedHeader = locale.header
      ? this.renderTemplate(locale.header, resolution.resolved)
      : undefined;
    const renderedFooter = locale.footer
      ? this.renderTemplate(locale.footer, resolution.resolved)
      : undefined;

    return {
      success: !hasBlockingErrors,
      body: renderedBody,
      header: renderedHeader,
      footer: renderedFooter,
      resolvedVariables: resolution.resolved,
      unresolvedVariables: resolution.unresolved,
      errors: allErrors,
    };
  }

  // ==================== Parameter Type Validation ====================

  /**
   * Validation patterns for Meta's Template Library parameter types.
   * These are soft validations — they produce warnings but don't block sending.
   *
   * The bodyParamTypes array on template_locales stores the expected type
   * for each positional parameter: e.g., ["TEXT", "AMOUNT", "DATE"]
   */
  private static readonly PARAM_TYPE_VALIDATORS: Record<
    string,
    { pattern: RegExp; description: string }
  > = {
    TEXT: {
      pattern: /^.+$/s,
      description: 'Any non-empty text',
    },
    AMOUNT: {
      // Matches: 100, 100.00, 1,000.00, $100, USD 100, 100 USD, etc.
      pattern:
        /^[\$€£¥₹]?\s*[\d,]+\.?\d*\s*[A-Z]{0,3}$|^[A-Z]{3}\s*[\d,]+\.?\d*$/i,
      description: 'A monetary amount (e.g., "100.00", "$50", "USD 1,000")',
    },
    DATE: {
      // Matches: 2026-01-15, 01/15/2026, Jan 15 2026, January 15, 2026, 15-01-2026, etc.
      pattern:
        /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$|^[A-Za-z]+\.?\s+\d{1,2},?\s*\d{0,4}$|^\d{1,2}\s+[A-Za-z]+\.?\s*\d{0,4}$/,
      description: 'A date (e.g., "2026-01-15", "Jan 15, 2026", "15/01/2026")',
    },
    PHONE_NUMBER: {
      // Matches: +1234567890, (123) 456-7890, 123-456-7890, etc.
      pattern: /^\+?[\d\s().-]{7,20}$/,
      description: 'A phone number (e.g., "+1234567890", "(123) 456-7890")',
    },
    EMAIL: {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      description: 'An email address (e.g., "user@example.com")',
    },
    NUMBER: {
      // Matches: 42, 3.14, 1,000, -5, etc.
      pattern: /^-?[\d,]+\.?\d*$/,
      description: 'A number (e.g., "42", "3.14", "1,000")',
    },
    ADDRESS: {
      // Any non-empty string with at least one space (basic address heuristic)
      pattern: /^.{5,}$/,
      description: 'An address (at least 5 characters)',
    },
  };

  /**
   * Validate resolved variable values against their expected parameter types
   * from Meta's Template Library.
   *
   * Only applies to library templates (parameterFormat === 'positional').
   * Returns warning-level errors that don't block sending but inform the user.
   *
   * @param resolved - Map of variable name → resolved value
   * @param bodyParamTypes - Array of Meta param types from template_locales (e.g., ["TEXT", "AMOUNT", "DATE"])
   * @param parameterFormat - 'positional' for library templates, 'named' for custom
   */
  validateParameterTypes(
    resolved: Record<string, string>,
    bodyParamTypes: string[] | null | undefined,
    parameterFormat: string | null | undefined,
  ): VariableError[] {
    // Only validate library templates with positional parameters
    if (
      !bodyParamTypes ||
      bodyParamTypes.length === 0 ||
      parameterFormat !== 'positional'
    ) {
      return [];
    }

    const errors: VariableError[] = [];

    for (let i = 0; i < bodyParamTypes.length; i++) {
      const paramType = bodyParamTypes[i];
      const varName = String(i + 1); // Positional variables: "1", "2", "3"
      const value = resolved[varName];

      // Skip unresolved variables (handled by required-var checks)
      if (value === undefined || value === null || value === '') {
        continue;
      }

      const validator =
        VariableResolutionService.PARAM_TYPE_VALIDATORS[paramType];
      if (!validator) {
        // Unknown param type — skip validation
        continue;
      }

      if (!validator.pattern.test(value.trim())) {
        errors.push({
          variable: varName,
          message: `Parameter {{${varName}}} expects ${validator.description}, but received: "${value.length > 50 ? value.substring(0, 50) + '...' : value}"`,
          type: 'validation_failed',
        });
      }
    }

    if (errors.length > 0) {
      this.logger.warn(
        `Parameter type validation warnings for positional template: ${errors.length} issue(s)`,
      );
    }

    return errors;
  }

  /**
   * Get auto-fill suggestions for a template based on contact profile.
   *
   * IMPORTANT: Variables are extracted directly from the template body/header/footer
   * content, NOT from the template_variables table. The body is the source of truth.
   * This ensures the variable list always matches what's actually in the template.
   */
  async getAutoFillSuggestions(
    localeId: string,
    contactId: string,
    options?: {
      senderId?: number;
      chatId?: string;
    },
  ): Promise<{
    suggestions: Record<string, string>;
    missing: string[];
    variables: Array<{
      name: string;
      value: string | null;
      isRequired: boolean;
      source: string;
    }>;
  }> {
    // Get template locale
    const locale = await db.query.templateLocales.findFirst({
      where: eq(templateLocales.id, localeId),
    });

    if (!locale) {
      throw new NotFoundException(`Template locale ${localeId} not found`);
    }

    // Get data sources
    const customerData = await this.getCustomerData(contactId);
    const systemData = await this.getSystemData(
      options?.senderId,
      options?.chatId,
    );
    const chatData = await this.getChatData(options?.chatId);
    const senderData = await this.getSenderData(options?.senderId);

    const suggestions: Record<string, string> = {};
    const missing: string[] = [];
    const variables: Array<{
      name: string;
      value: string | null;
      isRequired: boolean;
      source: string;
    }> = [];

    // Handle positional templates (library templates with {{1}}, {{2}}, etc.)
    if (locale.parameterFormat === 'positional') {
      const bodyVars = this.extractPositionalVars(locale.body);
      const paramTypes = (locale.bodyParamTypes as string[] | null) || [];

      for (const posVar of bodyVars) {
        const typeHint = paramTypes[parseInt(posVar, 10) - 1] || 'TEXT';
        variables.push({
          name: posVar,
          value: null,
          isRequired: true,
          source: `positional:${typeHint}`,
        });
        missing.push(posVar);
      }

      // Also include header variables for non-TEXT headers (media/location)
      this.appendHeaderVariables(locale, variables, missing);

      // Enrich media header variables with fresh pre-signed URLs from templateMedia
      await this.enrichHeaderMediaVariables(locale.id, variables, missing);

      return { suggestions, missing, variables };
    }

    // For named variables: extract directly from template content (source of truth)
    const templateContent = [
      locale.header || '',
      locale.body || '',
      locale.footer || '',
    ].join('\n');

    const extractedVars = this.extractNamedVariables(templateContent);

    for (const varName of extractedVars) {
      const result = this.resolveVariable(
        varName,
        customerData,
        systemData,
        chatData,
        senderData,
      );

      variables.push({
        name: varName,
        value: result.value,
        isRequired: true, // Named variables are always required
        source: result.source,
      });

      if (result.value !== null && result.value !== '') {
        suggestions[varName] = result.value;
      } else {
        missing.push(varName);
      }
    }

    // Also include header variables for non-TEXT headers (media/location)
    this.appendHeaderVariables(locale, variables, missing);

    // Enrich media header variables with fresh pre-signed URLs from templateMedia
    await this.enrichHeaderMediaVariables(locale.id, variables, missing);

    return { suggestions, missing, variables };
  }

  /**
   * Append synthetic header variables for templates with non-TEXT headers.
   * LOCATION headers need lat/lng/name/address.
   * IMAGE/VIDEO/DOCUMENT headers need a media URL.
   * TEXT headers with {{...}} are already captured by extractNamedVariables.
   */
  private appendHeaderVariables(
    locale: any,
    variables: Array<{
      name: string;
      value: string | null;
      isRequired: boolean;
      source: string;
    }>,
    missing: string[],
  ): void {
    const headerFormat = (locale.headerFormat || '').toUpperCase();
    if (!headerFormat || headerFormat === 'TEXT') return;

    // Check if variables already contain header entries (avoid duplicates)
    const existingNames = new Set(variables.map((v) => v.name));

    // Extract pre-existing media data from the approved template components.
    // For IMAGE/VIDEO/DOCUMENT, the media is already baked into the template
    // as an asset handle — the link/filename are stored in components.header.
    const compHeader = locale.components?.header ?? {};
    const mediaLink: string | null = compHeader.link || null;
    const mediaFilename: string | null = compHeader.filename || null;

    const headerVarDefs: Array<{
      name: string;
      value: string | null;
      isRequired: boolean;
      source: string;
    }> = [];

    switch (headerFormat) {
      case 'LOCATION':
        // Pre-populate from template's stored location data if available.
        // These were set during template creation and preserved across Meta sync.
        headerVarDefs.push(
          {
            name: 'header_location_latitude',
            value:
              compHeader.latitude != null ? String(compHeader.latitude) : null,
            isRequired: true,
            source: 'header:location',
          },
          {
            name: 'header_location_longitude',
            value:
              compHeader.longitude != null
                ? String(compHeader.longitude)
                : null,
            isRequired: true,
            source: 'header:location',
          },
          {
            name: 'header_location_name',
            value: compHeader.name || null,
            isRequired: false,
            source: 'header:location',
          },
          {
            name: 'header_location_address',
            value: compHeader.address || null,
            isRequired: false,
            source: 'header:location',
          },
        );
        break;

      case 'IMAGE':
        // Pre-fill from the approved template's stored media link
        headerVarDefs.push({
          name: 'header_image',
          value: mediaLink,
          isRequired: true,
          source: 'header:image',
        });
        break;

      case 'VIDEO':
        headerVarDefs.push({
          name: 'header_video',
          value: mediaLink,
          isRequired: true,
          source: 'header:video',
        });
        break;

      case 'DOCUMENT':
        headerVarDefs.push(
          {
            name: 'header_document',
            value: mediaLink,
            isRequired: true,
            source: 'header:document',
          },
          {
            name: 'header_document_filename',
            value: mediaFilename,
            isRequired: false,
            source: 'header:document',
          },
        );
        break;
    }

    for (const def of headerVarDefs) {
      if (existingNames.has(def.name)) continue;
      variables.push({
        name: def.name,
        value: def.value,
        isRequired: def.isRequired,
        source: def.source,
      });
      // Only mark as missing if required AND not pre-filled
      if (def.isRequired && !def.value) {
        missing.push(def.name);
      }
    }
  }

  /**
   * Enrich media header variables with a fresh pre-signed URL from the
   * templateMedia table.
   *
   * IMPORTANT: After Lambda thumbnail generation, the templateMedia.s3Key
   * is overwritten to point to the thumbnail image. The original file is
   * preserved in templateMedia.originalS3Key for send-time download by
   * Meta's servers. The frontend uses s3Key (thumbnail) as a visual preview.
   */
  private async enrichHeaderMediaVariables(
    localeId: string,
    variables: Array<{
      name: string;
      value: string | null;
      isRequired: boolean;
      source: string;
    }>,
    missing: string[],
  ): Promise<void> {
    const MEDIA_VAR_NAMES = new Set([
      'header_image',
      'header_video',
      'header_document',
    ]);
    const mediaVars = variables.filter((v) => MEDIA_VAR_NAMES.has(v.name));
    if (mediaVars.length === 0) return;

    try {
      // No status filter — s3Key points to the thumbnail after Lambda
      // processing regardless of uploadStatus value
      const headerMedia = await db.query.templateMedia.findFirst({
        where: and(
          eq(templateMedia.localeId, localeId),
          eq(templateMedia.componentType, 'header'),
        ),
        orderBy: (tm, { desc }) => [desc(tm.createdAt)],
      });

      if (!headerMedia?.s3Key) return;

      const { url: freshUrl } =
        await this.s3Service.generatePresignedDownloadUrl(headerMedia.s3Key, {
          expiresIn: 3600,
        });

      for (const mv of mediaVars) {
        mv.value = freshUrl;
        const idx = missing.indexOf(mv.name);
        if (idx !== -1) missing.splice(idx, 1);
      }

      // Also emit the filename from the media record
      const filenameVar = variables.find(
        (v) => v.name === 'header_document_filename',
      );
      if (filenameVar && !filenameVar.value && headerMedia.originalFilename) {
        filenameVar.value = headerMedia.originalFilename;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to enrich media URLs for locale ${localeId}: ${error.message}`,
      );
    }
  }

  /**
   * Extract named variables from template content.
   * Matches {{category.property}} or {{simple}} syntax.
   * e.g., "Hi {{customer.first_name}}" → ["customer.first_name"]
   */
  private extractNamedVariables(content: string): string[] {
    const regex = /\{\{([^}]+)\}\}/g;
    const vars: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      const varName = match[1].trim();
      // Skip positional variables (pure numbers)
      if (/^\d+$/.test(varName)) continue;
      if (!vars.includes(varName)) {
        vars.push(varName);
      }
    }

    return vars;
  }

  // ==================== Positional Variable Helpers ====================

  /**
   * Extract positional variable numbers from a template body.
   * e.g., `"Hello {{1}}, your code is {{2}}"` → `["1", "2"]`
   */
  private extractPositionalVars(body: string): string[] {
    const regex = /\{\{(\d+)\}\}/g;
    const vars: string[] = [];
    let match;
    while ((match = regex.exec(body)) !== null) {
      const num = match[1];
      if (!vars.includes(num)) {
        vars.push(num);
      }
    }
    return vars.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }

  /**
   * Resolve a positional-to-named variable mapping.
   *
   * The frontend sends a mapping like:
   * ```json
   * {
   *   "1": { "source": "customer.first_name" },
   *   "2": { "source": "custom.promo_code" },
   *   "3": { "value": "SUMMER2026" }         // manual override
   * }
   * ```
   *
   * This method resolves each source variable from contact/system data,
   * returning the final positional → value map ready for sending:
   * ```json
   * { "1": "John", "2": "WELCOME10", "3": "SUMMER2026" }
   * ```
   *
   * If a mapping entry has `value` (manual text), it's used directly.
   * If it has `source` (a named variable like `customer.first_name`),
   * it's resolved from the appropriate data source.
   *
   * @param mapping - Map of position → { source?: string, value?: string }
   * @param contactId - Contact to resolve variables for
   * @param options - Optional senderId, chatId for additional data sources
   * @returns Map of position → resolved value
   */
  async resolvePositionalMapping(
    mapping: Record<string, { source?: string; value?: string }>,
    contactId: string,
    options?: {
      senderId?: number;
      chatId?: string;
    },
  ): Promise<{
    resolved: Record<string, string>;
    unresolved: string[];
    errors: VariableError[];
  }> {
    // Load all data sources once
    const customerData = await this.getCustomerData(contactId);
    const systemData = await this.getSystemData(
      options?.senderId,
      options?.chatId,
    );
    const chatData = await this.getChatData(options?.chatId);
    const senderData = await this.getSenderData(options?.senderId);

    const resolved: Record<string, string> = {};
    const unresolved: string[] = [];
    const errors: VariableError[] = [];

    for (const [position, entry] of Object.entries(mapping)) {
      // Direct manual value takes priority
      if (
        entry.value !== undefined &&
        entry.value !== null &&
        entry.value !== ''
      ) {
        resolved[position] = entry.value;
        continue;
      }

      // Resolve from named source variable
      if (entry.source) {
        const result = this.resolveVariable(
          entry.source,
          customerData,
          systemData,
          chatData,
          senderData,
        );

        if (result.value !== null && result.value !== '') {
          resolved[position] = result.value;
        } else {
          unresolved.push(position);
          errors.push({
            variable: position,
            message: `Source variable "${entry.source}" for position {{${position}}} could not be resolved`,
            type: 'missing',
          });
        }
      } else {
        // No value and no source — unresolved
        unresolved.push(position);
        errors.push({
          variable: position,
          message: `No value or source provided for position {{${position}}}`,
          type: 'missing',
        });
      }
    }

    return { resolved, unresolved, errors };
  }
}
