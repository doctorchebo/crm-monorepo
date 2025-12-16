import { db } from '@database/db.connection';
import {
  chats,
  contactAttributes,
  contacts,
  senders,
  templateLocales,
  templateVariables,
} from '@database/schema';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

  /**
   * Parse a variable name into prefix and field
   * e.g., "customer.first_name" -> { prefix: "customer", field: "first_name" }
   */
  parseVariable(varName: string): { prefix: string; field: string } | null {
    const parts = varName.split('.');
    if (parts.length !== 2) {
      return null;
    }
    return { prefix: parts[0], field: parts[1] };
  }

  /**
   * Validate variable name follows naming convention
   */
  validateVariableName(varName: string): {
    isValid: boolean;
    error?: string;
  } {
    const parsed = this.parseVariable(varName);

    if (!parsed) {
      return {
        isValid: false,
        error: `Invalid variable format: "${varName}". Use prefix.field format (e.g., customer.first_name)`,
      };
    }

    const validPrefixes = Object.values(VARIABLE_PREFIXES);
    if (!validPrefixes.includes(parsed.prefix as any)) {
      return {
        isValid: false,
        error: `Invalid prefix "${parsed.prefix}". Allowed: ${validPrefixes.join(', ')}`,
      };
    }

    // Validate customer fields
    if (
      parsed.prefix === VARIABLE_PREFIXES.CUSTOMER &&
      !CUSTOMER_FIELDS.includes(parsed.field as any)
    ) {
      return {
        isValid: false,
        error: `Invalid customer field "${parsed.field}". Allowed: ${CUSTOMER_FIELDS.join(', ')}`,
      };
    }

    // Validate system fields
    if (
      parsed.prefix === VARIABLE_PREFIXES.SYSTEM &&
      !SYSTEM_FIELDS.includes(parsed.field as any)
    ) {
      return {
        isValid: false,
        error: `Invalid system field "${parsed.field}". Allowed: ${SYSTEM_FIELDS.join(', ')}`,
      };
    }

    // Custom fields can be any alphanumeric with underscores
    if (parsed.prefix === VARIABLE_PREFIXES.CUSTOM) {
      if (!/^[a-z][a-z0-9_]*$/.test(parsed.field)) {
        return {
          isValid: false,
          error: `Invalid custom field name "${parsed.field}". Use lowercase letters, numbers, and underscores`,
        };
      }
    }

    return { isValid: true };
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
   * Resolve a single variable from available data sources
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
      return { value: overrides[varName], source: 'override' };
    }

    const parsed = this.parseVariable(varName);
    if (!parsed) {
      return { value: null, source: 'invalid' };
    }

    // Priority 2: Customer data (custom attributes)
    if (parsed.prefix === VARIABLE_PREFIXES.CUSTOM) {
      const value = customerData.custom[parsed.field];
      return { value: value ?? null, source: 'custom_attribute' };
    }

    // Priority 3: Customer fields
    if (parsed.prefix === VARIABLE_PREFIXES.CUSTOMER) {
      const value = customerData.customer[parsed.field];
      return { value: value ?? null, source: 'contact' };
    }

    // Priority 4: Chat fields
    if (parsed.prefix === VARIABLE_PREFIXES.CHAT) {
      const value = chatData[parsed.field];
      return { value: value ?? null, source: 'chat' };
    }

    // Priority 5: Sender fields
    if (parsed.prefix === VARIABLE_PREFIXES.SENDER) {
      const value = senderData[parsed.field];
      return { value: value ?? null, source: 'sender' };
    }

    // Priority 6: System fields
    if (parsed.prefix === VARIABLE_PREFIXES.SYSTEM) {
      const value = systemData[parsed.field];
      return { value: value ?? null, source: 'system' };
    }

    // Priority 7: Order fields - resolve from custom attributes as fallback
    // (since there's no orders table, users can store order data as custom attributes)
    if (parsed.prefix === VARIABLE_PREFIXES.ORDER) {
      const value = customerData.custom[parsed.field];
      return { value: value ?? null, source: 'custom_attribute' };
    }

    // Priority 8: Property fields - resolve from custom attributes as fallback
    // (since there's no properties table, users can store property data as custom attributes)
    if (parsed.prefix === VARIABLE_PREFIXES.PROPERTY) {
      const value = customerData.custom[parsed.field];
      return { value: value ?? null, source: 'custom_attribute' };
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
   * Render a template with resolved variables
   */
  renderTemplate(template: string, variables: Record<string, string>): string {
    let rendered = template;

    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
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

    const allErrors = [...resolution.errors, ...requiredErrors];
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

  /**
   * Get auto-fill suggestions for a template based on contact profile
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

    // Get variable definitions
    const variableDefs = await db.query.templateVariables.findMany({
      where: eq(templateVariables.localeId, localeId),
    });

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

    for (const varDef of variableDefs) {
      const result = this.resolveVariable(
        varDef.varName,
        customerData,
        systemData,
        chatData,
        senderData,
      );

      variables.push({
        name: varDef.varName,
        value: result.value,
        isRequired: varDef.isRequired ?? true,
        source: result.source,
      });

      if (result.value !== null && result.value !== '') {
        suggestions[varDef.varName] = result.value;
      } else {
        missing.push(varDef.varName);
      }
    }

    return { suggestions, missing, variables };
  }
}
