/**
 * Template Variables Utilities
 *
 * Provides utilities for mapping contact data to template variables.
 * This module creates a centralized, maintainable way to:
 * - Define which contact fields map to which template variables
 * - Resolve variable values from contact data and custom attributes
 * - Filter to only show variables that have actual values
 *
 * The structure mirrors the backend variable_definitions table categories:
 * - customer: Contact-level data (first_name, last_name, email, phone)
 * - custom: User-defined custom attributes
 */

import type { ContactAttribute, VariableDefinition } from "@/lib/api/endpoints";

/**
 * Contact data interface matching the CustomerProfile component's expected structure
 */
export interface ContactData {
  contactId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phoneNumber: string;
}

/**
 * Represents a resolved template variable with its value
 */
export interface ResolvedTemplateVariable {
  /** The full variable syntax, e.g., "{{customer.first_name}}" */
  variable: string;
  /** The category of the variable (customer, custom, etc.) */
  category: string;
  /** The property name within the category */
  property: string;
  /** The display-friendly label for the variable */
  displayName: string;
  /** The resolved value (never null/undefined - only included if has value) */
  value: string;
  /** Sort order for consistent display */
  sortOrder: number;
}

/**
 * Configuration for a customer field to variable mapping
 */
interface CustomerFieldMapping {
  /** The property name used in template variables */
  property: string;
  /** Display-friendly label */
  displayName: string;
  /** Function to extract value from contact data */
  getValue: (contact: ContactData) => string | null | undefined;
  /** Sort order for display */
  sortOrder: number;
}

/**
 * Maps contact fields to template variable definitions.
 * This is the single source of truth for which customer fields
 * are available as template variables.
 *
 * To add a new customer variable:
 * 1. Add entry here with property, displayName, getValue function, and sortOrder
 * 2. The system will automatically include it if the contact has a value
 */
const CUSTOMER_FIELD_MAPPINGS: CustomerFieldMapping[] = [
  {
    property: "first_name",
    displayName: "First Name",
    getValue: (contact) => contact.firstName,
    sortOrder: 1,
  },
  {
    property: "last_name",
    displayName: "Last Name",
    getValue: (contact) => contact.lastName,
    sortOrder: 2,
  },
  {
    property: "full_name",
    displayName: "Full Name",
    getValue: (contact) => {
      const parts = [contact.firstName, contact.lastName].filter(Boolean);
      return parts.length > 0 ? parts.join(" ") : null;
    },
    sortOrder: 3,
  },
  {
    property: "email",
    displayName: "Email",
    getValue: (contact) => contact.email,
    sortOrder: 4,
  },
  {
    property: "phone",
    displayName: "Phone Number",
    getValue: (contact) => contact.phoneNumber,
    sortOrder: 5,
  },
];

/**
 * Known attribute categories from the SUGGESTED_KEYS in customer-profile.
 * Used to determine the correct variable prefix for custom attributes.
 */
const ATTRIBUTE_CATEGORIES: Record<string, string> = {
  // Order-related
  order_id: "order",
  order_total: "order",
  order_status: "order",
  order_date: "order",
  delivery_date: "order",
  tracking_number: "order",
  tracking_url: "order",
  // Property-related
  property_address: "property",
  property_price: "property",
  property_type: "property",
  viewing_date: "property",
};

/**
 * Get the category for an attribute key.
 * Returns 'custom' if not a known category.
 */
function getAttributeCategory(key: string): string {
  return ATTRIBUTE_CATEGORIES[key] || "custom";
}

/**
 * Format a variable name into the template syntax.
 * @example formatVariableSyntax("customer", "first_name") => "{{customer.first_name}}"
 */
export function formatVariableSyntax(
  category: string,
  property: string
): string {
  return `{{${category}.${property}}}`;
}

/**
 * Resolve all customer-level template variables from contact data.
 * Only returns variables that have actual values (non-empty strings).
 *
 * @param contact - The contact data to extract variables from
 * @returns Array of resolved variables, sorted by sortOrder
 */
export function resolveCustomerVariables(
  contact: ContactData | null
): ResolvedTemplateVariable[] {
  if (!contact) {
    return [];
  }

  const resolved: ResolvedTemplateVariable[] = [];

  for (const mapping of CUSTOMER_FIELD_MAPPINGS) {
    const value = mapping.getValue(contact);

    // Only include if has a non-empty value
    if (value && value.trim()) {
      resolved.push({
        variable: formatVariableSyntax("customer", mapping.property),
        category: "customer",
        property: mapping.property,
        displayName: mapping.displayName,
        value: value.trim(),
        sortOrder: mapping.sortOrder,
      });
    }
  }

  return resolved.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Resolve custom attribute variables.
 * Maps contact attributes to their appropriate template variable syntax.
 *
 * @param attributes - Array of contact attributes
 * @param limit - Optional limit on number of attributes to return
 * @returns Array of resolved variables
 */
export function resolveAttributeVariables(
  attributes: ContactAttribute[],
  limit?: number
): ResolvedTemplateVariable[] {
  const resolved: ResolvedTemplateVariable[] = [];
  const attrsToProcess = limit ? attributes.slice(0, limit) : attributes;

  for (let i = 0; i < attrsToProcess.length; i++) {
    const attr = attrsToProcess[i];

    // Only include if has a non-empty value
    if (attr.value && attr.value.trim()) {
      const category = getAttributeCategory(attr.key);

      resolved.push({
        variable: formatVariableSyntax(category, attr.key),
        category,
        property: attr.key,
        displayName: formatDisplayName(attr.key),
        value: attr.value.trim(),
        sortOrder: 100 + i, // After customer variables
      });
    }
  }

  return resolved;
}

/**
 * Convert a snake_case key to a display-friendly title.
 * @example formatDisplayName("order_total") => "Order Total"
 */
function formatDisplayName(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Get all resolved template variables for a contact.
 * Combines customer variables and custom attribute variables.
 * Only returns variables that have actual values.
 *
 * @param contact - The contact data
 * @param attributes - The contact's custom attributes
 * @param options - Configuration options
 * @returns Array of all resolved variables, sorted appropriately
 */
export function getAllResolvedVariables(
  contact: ContactData | null,
  attributes: ContactAttribute[],
  options: {
    /** Maximum number of custom attributes to include */
    maxAttributes?: number;
    /** Whether to include customer variables */
    includeCustomer?: boolean;
    /** Whether to include attribute variables */
    includeAttributes?: boolean;
  } = {}
): ResolvedTemplateVariable[] {
  const {
    maxAttributes = 5,
    includeCustomer = true,
    includeAttributes = true,
  } = options;

  const variables: ResolvedTemplateVariable[] = [];

  if (includeCustomer) {
    variables.push(...resolveCustomerVariables(contact));
  }

  if (includeAttributes) {
    variables.push(...resolveAttributeVariables(attributes, maxAttributes));
  }

  return variables.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Check if a contact has any template variables with values.
 * Useful for conditionally showing/hiding the variables section.
 */
export function hasAnyVariables(
  contact: ContactData | null,
  attributes: ContactAttribute[]
): boolean {
  return getAllResolvedVariables(contact, attributes).length > 0;
}

/**
 * Match variable definitions from backend with contact data to get resolved values.
 * This is useful when you have the full variable definitions and want to show
 * which ones are available for a specific contact.
 *
 * @param definitions - Variable definitions from the backend
 * @param contact - Contact data
 * @param attributes - Contact attributes
 * @returns Map of variable name to resolved value (only includes variables with values)
 */
export function matchDefinitionsWithValues(
  definitions: VariableDefinition[],
  contact: ContactData | null,
  attributes: ContactAttribute[]
): Map<string, { definition: VariableDefinition; value: string }> {
  const result = new Map<
    string,
    { definition: VariableDefinition; value: string }
  >();

  if (!contact) {
    return result;
  }

  // Build a lookup for attribute values
  const attributeValues = new Map(
    attributes.map((attr) => [attr.key, attr.value])
  );

  for (const def of definitions) {
    let value: string | null | undefined = null;

    // Handle customer category - map to contact fields
    if (def.category === "customer") {
      const mapping = CUSTOMER_FIELD_MAPPINGS.find(
        (m) => m.property === def.property
      );
      if (mapping) {
        value = mapping.getValue(contact);
      }
    }
    // Handle custom/order/property categories - look up in attributes
    else if (["custom", "order", "property"].includes(def.category)) {
      value = attributeValues.get(def.property) || null;
    }

    // Only include if has a non-empty value
    if (value && value.trim()) {
      const variableName = `${def.category}.${def.property}`;
      result.set(variableName, {
        definition: def,
        value: value.trim(),
      });
    }
  }

  return result;
}
