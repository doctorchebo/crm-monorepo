/**
 * Database seed file
 * Populates the variable_definitions table with system-level variables
 */

import { and, asc, eq } from 'drizzle-orm';
import { db } from './db.connection';
import { NewVariableDefinition, variableDefinitions } from './schema';

/**
 * Variable Definition Categories
 */
const CATEGORIES = {
  CUSTOMER: 'customer',
  CHAT: 'chat',
  SENDER: 'sender',
  ORDER: 'order',
  PROPERTY: 'property',
  SYSTEM: 'system',
} as const;

/**
 * Data Types for variables
 */
const DATA_TYPES = {
  STRING: 'string',
  NUMBER: 'number',
  DATE: 'date',
  DATETIME: 'datetime',
  PHONE: 'phone',
  EMAIL: 'email',
  CURRENCY: 'currency',
  URL: 'url',
  BOOLEAN: 'boolean',
} as const;

/**
 * System-level variable definitions
 * These are the ONLY variables users can use in templates
 */
const VARIABLE_DEFINITIONS: NewVariableDefinition[] = [
  // ============================================
  // CUSTOMER VARIABLES (from contacts table)
  // ============================================
  {
    category: CATEGORIES.CUSTOMER,
    property: 'first_name',
    displayName: 'First Name',
    description: "Customer's first name",
    dataType: DATA_TYPES.STRING,
    sourceTable: 'contacts',
    sourceColumn: 'first_name',
    fallbackValue: 'Customer',
    isRequired: false,
    isSystem: true,
    sortOrder: 1,
  },
  {
    category: CATEGORIES.CUSTOMER,
    property: 'last_name',
    displayName: 'Last Name',
    description: "Customer's last name",
    dataType: DATA_TYPES.STRING,
    sourceTable: 'contacts',
    sourceColumn: 'last_name',
    fallbackValue: '',
    isRequired: false,
    isSystem: true,
    sortOrder: 2,
  },
  {
    category: CATEGORIES.CUSTOMER,
    property: 'full_name',
    displayName: 'Full Name',
    description: "Customer's full name (first + last)",
    dataType: DATA_TYPES.STRING,
    sourceTable: 'contacts',
    sourceColumn: null, // Computed from first_name + last_name
    fallbackValue: 'Customer',
    isRequired: false,
    isSystem: true,
    sortOrder: 3,
  },
  {
    category: CATEGORIES.CUSTOMER,
    property: 'email',
    displayName: 'Email',
    description: "Customer's email address",
    dataType: DATA_TYPES.EMAIL,
    sourceTable: 'contacts',
    sourceColumn: 'email',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 4,
  },
  {
    category: CATEGORIES.CUSTOMER,
    property: 'phone',
    displayName: 'Phone Number',
    description: "Customer's WhatsApp phone number",
    dataType: DATA_TYPES.PHONE,
    sourceTable: 'contacts',
    sourceColumn: 'phone_number',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 5,
  },
  {
    category: CATEGORIES.CUSTOMER,
    property: 'country_code',
    displayName: 'Country Code',
    description: "Customer's phone country code",
    dataType: DATA_TYPES.STRING,
    sourceTable: 'contacts',
    sourceColumn: 'country_code',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 6,
  },

  // ============================================
  // CHAT VARIABLES (from chats table)
  // ============================================
  {
    category: CATEGORIES.CHAT,
    property: 'participant_name',
    displayName: 'Participant Name',
    description: 'Name of the chat participant',
    dataType: DATA_TYPES.STRING,
    sourceTable: 'chats',
    sourceColumn: 'participant_name',
    fallbackValue: 'there',
    isRequired: false,
    isSystem: true,
    sortOrder: 1,
  },
  {
    category: CATEGORIES.CHAT,
    property: 'participant_phone',
    displayName: 'Participant Phone',
    description: 'Phone number of the chat participant',
    dataType: DATA_TYPES.PHONE,
    sourceTable: 'chats',
    sourceColumn: 'participant_phone',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 2,
  },
  {
    category: CATEGORIES.CHAT,
    property: 'last_message_time',
    displayName: 'Last Message Time',
    description: 'When the last message was sent',
    dataType: DATA_TYPES.DATETIME,
    sourceTable: 'chats',
    sourceColumn: 'last_message_time',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 3,
  },
  {
    category: CATEGORIES.CHAT,
    property: 'chat_start_date',
    displayName: 'Chat Start Date',
    description: 'When the conversation started',
    dataType: DATA_TYPES.DATE,
    sourceTable: 'chats',
    sourceColumn: 'created_at',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 4,
  },

  // ============================================
  // SENDER VARIABLES (from senders table)
  // ============================================
  {
    category: CATEGORIES.SENDER,
    property: 'business_name',
    displayName: 'Business Name',
    description: 'Name of your business/sender',
    dataType: DATA_TYPES.STRING,
    sourceTable: 'senders',
    sourceColumn: 'display_name',
    fallbackValue: 'Our Team',
    isRequired: false,
    isSystem: true,
    sortOrder: 1,
  },
  {
    category: CATEGORIES.SENDER,
    property: 'business_phone',
    displayName: 'Business Phone',
    description: 'WhatsApp Business phone number',
    dataType: DATA_TYPES.PHONE,
    sourceTable: 'senders',
    sourceColumn: 'phone_number',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 2,
  },

  // ============================================
  // ORDER VARIABLES (for e-commerce CRM)
  // ============================================
  {
    category: CATEGORIES.ORDER,
    property: 'order_id',
    displayName: 'Order ID',
    description: 'Unique order identifier',
    dataType: DATA_TYPES.STRING,
    sourceTable: 'orders',
    sourceColumn: 'order_id',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 1,
  },
  {
    category: CATEGORIES.ORDER,
    property: 'order_total',
    displayName: 'Order Total',
    description: 'Total order amount',
    dataType: DATA_TYPES.CURRENCY,
    sourceTable: 'orders',
    sourceColumn: 'total',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 2,
  },
  {
    category: CATEGORIES.ORDER,
    property: 'order_status',
    displayName: 'Order Status',
    description: 'Current order status',
    dataType: DATA_TYPES.STRING,
    sourceTable: 'orders',
    sourceColumn: 'status',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 3,
  },
  {
    category: CATEGORIES.ORDER,
    property: 'order_date',
    displayName: 'Order Date',
    description: 'When the order was placed',
    dataType: DATA_TYPES.DATE,
    sourceTable: 'orders',
    sourceColumn: 'created_at',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 4,
  },
  {
    category: CATEGORIES.ORDER,
    property: 'delivery_date',
    displayName: 'Delivery Date',
    description: 'Expected delivery date',
    dataType: DATA_TYPES.DATE,
    sourceTable: 'orders',
    sourceColumn: 'delivery_date',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 5,
  },
  {
    category: CATEGORIES.ORDER,
    property: 'tracking_number',
    displayName: 'Tracking Number',
    description: 'Shipment tracking number',
    dataType: DATA_TYPES.STRING,
    sourceTable: 'orders',
    sourceColumn: 'tracking_number',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 6,
  },
  {
    category: CATEGORIES.ORDER,
    property: 'tracking_url',
    displayName: 'Tracking URL',
    description: 'Link to track the shipment',
    dataType: DATA_TYPES.URL,
    sourceTable: 'orders',
    sourceColumn: 'tracking_url',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 7,
  },

  // ============================================
  // PROPERTY VARIABLES (for real estate CRM)
  // ============================================
  {
    category: CATEGORIES.PROPERTY,
    property: 'property_address',
    displayName: 'Property Address',
    description: 'Full address of the property',
    dataType: DATA_TYPES.STRING,
    sourceTable: 'properties',
    sourceColumn: 'address',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 1,
  },
  {
    category: CATEGORIES.PROPERTY,
    property: 'property_price',
    displayName: 'Property Price',
    description: 'Listed price of the property',
    dataType: DATA_TYPES.CURRENCY,
    sourceTable: 'properties',
    sourceColumn: 'price',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 2,
  },
  {
    category: CATEGORIES.PROPERTY,
    property: 'property_type',
    displayName: 'Property Type',
    description: 'Type of property (house, apartment, etc.)',
    dataType: DATA_TYPES.STRING,
    sourceTable: 'properties',
    sourceColumn: 'type',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 3,
  },
  {
    category: CATEGORIES.PROPERTY,
    property: 'bedrooms',
    displayName: 'Bedrooms',
    description: 'Number of bedrooms',
    dataType: DATA_TYPES.NUMBER,
    sourceTable: 'properties',
    sourceColumn: 'bedrooms',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 4,
  },
  {
    category: CATEGORIES.PROPERTY,
    property: 'bathrooms',
    displayName: 'Bathrooms',
    description: 'Number of bathrooms',
    dataType: DATA_TYPES.NUMBER,
    sourceTable: 'properties',
    sourceColumn: 'bathrooms',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 5,
  },
  {
    category: CATEGORIES.PROPERTY,
    property: 'square_feet',
    displayName: 'Square Feet',
    description: 'Property size in square feet',
    dataType: DATA_TYPES.NUMBER,
    sourceTable: 'properties',
    sourceColumn: 'square_feet',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 6,
  },
  {
    category: CATEGORIES.PROPERTY,
    property: 'listing_url',
    displayName: 'Listing URL',
    description: 'Link to the property listing',
    dataType: DATA_TYPES.URL,
    sourceTable: 'properties',
    sourceColumn: 'listing_url',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 7,
  },
  {
    category: CATEGORIES.PROPERTY,
    property: 'viewing_date',
    displayName: 'Viewing Date',
    description: 'Scheduled property viewing date',
    dataType: DATA_TYPES.DATETIME,
    sourceTable: 'property_viewings',
    sourceColumn: 'viewing_date',
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 8,
  },

  // ============================================
  // SYSTEM VARIABLES (computed/dynamic)
  // ============================================
  {
    category: CATEGORIES.SYSTEM,
    property: 'current_date',
    displayName: 'Current Date',
    description: "Today's date",
    dataType: DATA_TYPES.DATE,
    sourceTable: null, // Computed at runtime
    sourceColumn: null,
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 1,
  },
  {
    category: CATEGORIES.SYSTEM,
    property: 'current_time',
    displayName: 'Current Time',
    description: 'Current time',
    dataType: DATA_TYPES.STRING,
    sourceTable: null,
    sourceColumn: null,
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 2,
  },
  {
    category: CATEGORIES.SYSTEM,
    property: 'current_datetime',
    displayName: 'Current Date & Time',
    description: 'Current date and time',
    dataType: DATA_TYPES.DATETIME,
    sourceTable: null,
    sourceColumn: null,
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 3,
  },
  {
    category: CATEGORIES.SYSTEM,
    property: 'day_of_week',
    displayName: 'Day of Week',
    description: 'Current day name (Monday, Tuesday, etc.)',
    dataType: DATA_TYPES.STRING,
    sourceTable: null,
    sourceColumn: null,
    fallbackValue: null,
    isRequired: false,
    isSystem: true,
    sortOrder: 4,
  },
  {
    category: CATEGORIES.SYSTEM,
    property: 'greeting',
    displayName: 'Time-based Greeting',
    description: 'Good morning/afternoon/evening based on time',
    dataType: DATA_TYPES.STRING,
    sourceTable: null,
    sourceColumn: null,
    fallbackValue: 'Hello',
    isRequired: false,
    isSystem: true,
    sortOrder: 5,
  },
];

/**
 * Seed the variable_definitions table
 */
export async function seedVariableDefinitions(): Promise<void> {
  console.log('🌱 Seeding variable_definitions...');

  let inserted = 0;
  let skipped = 0;

  for (const varDef of VARIABLE_DEFINITIONS) {
    try {
      // Check if variable already exists using select() to avoid type resolution issues
      const [existing] = await db
        .select()
        .from(variableDefinitions)
        .where(
          and(
            eq(variableDefinitions.category, varDef.category),
            eq(variableDefinitions.property, varDef.property),
          ),
        )
        .limit(1);

      if (existing) {
        console.log(
          `  ⏭️  Skipping ${varDef.category}.${varDef.property} (already exists)`,
        );
        skipped++;
        continue;
      }

      // Insert new variable definition
      await db.insert(variableDefinitions).values(varDef);
      console.log(`  ✅ Added ${varDef.category}.${varDef.property}`);
      inserted++;
    } catch (error: any) {
      console.error(
        `  ❌ Error adding ${varDef.category}.${varDef.property}: ${error.message}`,
      );
    }
  }

  console.log(`\n📊 Seed complete: ${inserted} inserted, ${skipped} skipped`);
}

/**
 * Get all variable definitions grouped by category
 */
export async function getVariableDefinitionsByCategory(): Promise<
  Record<string, typeof VARIABLE_DEFINITIONS>
> {
  const all = await db
    .select()
    .from(variableDefinitions)
    .where(eq(variableDefinitions.isActive, true))
    .orderBy(
      asc(variableDefinitions.category),
      asc(variableDefinitions.sortOrder),
    );

  const grouped: Record<string, typeof all> = {};
  for (const varDef of all) {
    if (!grouped[varDef.category]) {
      grouped[varDef.category] = [];
    }
    grouped[varDef.category].push(varDef);
  }

  return grouped;
}

/**
 * Main seed function - calls all seeders
 */
export async function seed(): Promise<void> {
  console.log('🚀 Starting database seeding...\n');

  await seedVariableDefinitions();

  console.log('\n✨ All seeding completed!');
}

// Allow running directly: npx ts-node src/database/seed.ts
if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seed script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed script failed:', error);
      process.exit(1);
    });
}
