/**
 * Knowledge Base Template Seed
 *
 * Seeds the database with system-level object templates for the knowledge base.
 * These templates serve as starting points for users to create structured knowledge objects.
 */

import { and, eq } from 'drizzle-orm';
import { db } from './db.connection';
import {
  kbObjectTemplates,
  kbTemplateFields,
  NewKbObjectTemplate,
  NewKbTemplateField,
} from './knowledge-base.schema';

// Valid field types from the enum
type FieldType =
  | 'short_text'
  | 'long_text'
  | 'rich_text'
  | 'number'
  | 'price'
  | 'date'
  | 'date_range'
  | 'boolean'
  | 'tags'
  | 'location'
  | 'media'
  | 'file'
  | 'select'
  | 'multi_select'
  | 'url'
  | 'email'
  | 'phone'
  | 'key_value';

/**
 * Template Categories
 */
const CATEGORIES = {
  REAL_ESTATE: 'real_estate',
  ECOMMERCE: 'e_commerce',
  HOSPITALITY: 'hospitality',
  GENERAL: 'general',
  PROFESSIONAL_SERVICES: 'professional_services',
} as const;

/**
 * System Templates Configuration
 */
interface TemplateConfig {
  template: Omit<NewKbObjectTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  fields: Omit<
    NewKbTemplateField,
    'id' | 'templateId' | 'createdAt' | 'updatedAt'
  >[];
}

const SYSTEM_TEMPLATES: TemplateConfig[] = [
  // ============================================
  // PROPERTY TEMPLATE (Real Estate)
  // ============================================
  {
    template: {
      name: 'property_listing',
      slug: 'property-listing',
      displayName: 'Property Listing',
      description:
        'Real estate property with detailed specifications, pricing, and location information',
      category: CATEGORIES.REAL_ESTATE,
      icon: 'home',
      color: '#3B82F6',
      isSystem: true,
      isActive: true,
      aiUsageHints:
        'Use this template for real estate properties. Include all relevant details about location, price, bedrooms, and amenities when answering queries.',
      aiRetrievalContext: 'Property listings for sale or rent',
      supportedIntents: [
        'property_search',
        'price_inquiry',
        'availability_check',
      ],
      fabricationWarnings: [
        'Do not make up prices',
        'Do not fabricate availability dates',
      ],
      priorityScore: 80,
    },
    fields: [
      {
        name: 'title',
        slug: 'title',
        displayName: 'Property Title',
        fieldType: 'short_text' as FieldType,
        isRequired: true,
        sortOrder: 1,
        placeholder: 'e.g., Luxury 3BR Apartment in Downtown',
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'property_type',
        slug: 'property-type',
        displayName: 'Property Type',
        fieldType: 'select' as FieldType,
        isRequired: true,
        sortOrder: 2,
        fieldConfig: {
          options: [
            { value: 'apartment', label: 'Apartment' },
            { value: 'house', label: 'House' },
            { value: 'villa', label: 'Villa' },
            { value: 'penthouse', label: 'Penthouse' },
            { value: 'studio', label: 'Studio' },
            { value: 'duplex', label: 'Duplex' },
            { value: 'townhouse', label: 'Townhouse' },
            { value: 'land', label: 'Land' },
            { value: 'commercial', label: 'Commercial' },
          ],
        },
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'listing_type',
        slug: 'listing-type',
        displayName: 'Listing Type',
        fieldType: 'select' as FieldType,
        isRequired: true,
        sortOrder: 3,
        fieldConfig: {
          options: [
            { value: 'sale', label: 'For Sale' },
            { value: 'rent', label: 'For Rent' },
            { value: 'lease', label: 'For Lease' },
          ],
        },
        aiRelevance: 'critical',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'description',
        slug: 'description',
        displayName: 'Description',
        fieldType: 'long_text' as FieldType,
        isRequired: true,
        sortOrder: 4,
        placeholder: 'Describe the property...',
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'price',
        slug: 'price',
        displayName: 'Price',
        fieldType: 'price' as FieldType,
        isRequired: true,
        sortOrder: 5,
        fieldConfig: {
          currency: 'USD',
        },
        aiRelevance: 'critical',
        aiIncludeInEmbedding: true,
        aiFieldHints: 'Price of the property in local currency',
      },
      {
        name: 'address',
        slug: 'address',
        displayName: 'Address',
        fieldType: 'location' as FieldType,
        isRequired: true,
        sortOrder: 6,
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'bedrooms',
        slug: 'bedrooms',
        displayName: 'Bedrooms',
        fieldType: 'number' as FieldType,
        isRequired: false,
        sortOrder: 7,
        fieldConfig: {
          min: 0,
          max: 20,
        },
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'bathrooms',
        slug: 'bathrooms',
        displayName: 'Bathrooms',
        fieldType: 'number' as FieldType,
        isRequired: false,
        sortOrder: 8,
        fieldConfig: {
          min: 0,
          max: 10,
        },
        aiRelevance: 'medium',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'area_sqft',
        slug: 'area-sqft',
        displayName: 'Area (sq ft)',
        fieldType: 'number' as FieldType,
        isRequired: false,
        sortOrder: 9,
        aiRelevance: 'medium',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'amenities',
        slug: 'amenities',
        displayName: 'Amenities',
        fieldType: 'tags' as FieldType,
        isRequired: false,
        sortOrder: 10,
        aiRelevance: 'medium',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'photos',
        slug: 'photos',
        displayName: 'Photos',
        fieldType: 'media' as FieldType,
        isRequired: false,
        sortOrder: 11,
        fieldConfig: {
          maxFiles: 20,
          acceptedTypes: ['image/*'],
        },
        aiRelevance: 'low',
        aiIncludeInEmbedding: false,
      },
    ],
  },

  // ============================================
  // PRODUCT TEMPLATE (E-commerce)
  // ============================================
  {
    template: {
      name: 'product',
      slug: 'product',
      displayName: 'Product',
      description:
        'E-commerce product with pricing, inventory, and specifications',
      category: CATEGORIES.ECOMMERCE,
      icon: 'package',
      color: '#10B981',
      isSystem: true,
      isActive: true,
      aiUsageHints:
        'Use for product inquiries. Always include price, availability, and key specifications.',
      aiRetrievalContext: 'Product catalog items',
      supportedIntents: ['product_search', 'price_inquiry', 'stock_check'],
      fabricationWarnings: [
        'Do not make up stock quantities',
        'Do not fabricate prices',
      ],
      priorityScore: 85,
    },
    fields: [
      {
        name: 'name',
        slug: 'name',
        displayName: 'Product Name',
        fieldType: 'short_text' as FieldType,
        isRequired: true,
        sortOrder: 1,
        aiRelevance: 'critical',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'sku',
        slug: 'sku',
        displayName: 'SKU',
        fieldType: 'short_text' as FieldType,
        isRequired: false,
        isUnique: true,
        sortOrder: 2,
        aiRelevance: 'medium',
        aiIncludeInEmbedding: false,
      },
      {
        name: 'category',
        slug: 'category',
        displayName: 'Category',
        fieldType: 'select' as FieldType,
        isRequired: true,
        sortOrder: 3,
        fieldConfig: {
          allowCustom: true,
          options: [
            { value: 'electronics', label: 'Electronics' },
            { value: 'clothing', label: 'Clothing' },
            { value: 'home', label: 'Home & Garden' },
            { value: 'sports', label: 'Sports & Outdoors' },
            { value: 'beauty', label: 'Beauty & Personal Care' },
            { value: 'toys', label: 'Toys & Games' },
            { value: 'books', label: 'Books' },
            { value: 'automotive', label: 'Automotive' },
            { value: 'other', label: 'Other' },
          ],
        },
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'description',
        slug: 'description',
        displayName: 'Description',
        fieldType: 'rich_text' as FieldType,
        isRequired: true,
        sortOrder: 4,
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'price',
        slug: 'price',
        displayName: 'Price',
        fieldType: 'price' as FieldType,
        isRequired: true,
        sortOrder: 5,
        aiRelevance: 'critical',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'in_stock',
        slug: 'in-stock',
        displayName: 'In Stock',
        fieldType: 'boolean' as FieldType,
        isRequired: false,
        sortOrder: 6,
        defaultValue: 'true',
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'stock_quantity',
        slug: 'stock-quantity',
        displayName: 'Stock Quantity',
        fieldType: 'number' as FieldType,
        isRequired: false,
        sortOrder: 7,
        aiRelevance: 'medium',
        aiIncludeInEmbedding: false,
      },
      {
        name: 'features',
        slug: 'features',
        displayName: 'Features',
        fieldType: 'tags' as FieldType,
        isRequired: false,
        sortOrder: 8,
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'images',
        slug: 'images',
        displayName: 'Product Images',
        fieldType: 'media' as FieldType,
        isRequired: false,
        sortOrder: 9,
        fieldConfig: {
          maxFiles: 10,
          acceptedTypes: ['image/*'],
        },
        aiRelevance: 'low',
        aiIncludeInEmbedding: false,
      },
    ],
  },

  // ============================================
  // SERVICE TEMPLATE (Professional Services)
  // ============================================
  {
    template: {
      name: 'service',
      slug: 'service',
      displayName: 'Service',
      description: 'Professional service offering with pricing and details',
      category: CATEGORIES.PROFESSIONAL_SERVICES,
      icon: 'briefcase',
      color: '#8B5CF6',
      isSystem: true,
      isActive: true,
      aiUsageHints:
        'Use for service inquiries. Include pricing model and deliverables.',
      aiRetrievalContext: 'Professional services offered',
      supportedIntents: ['service_inquiry', 'pricing_request', 'booking'],
      priorityScore: 75,
    },
    fields: [
      {
        name: 'name',
        slug: 'name',
        displayName: 'Service Name',
        fieldType: 'short_text' as FieldType,
        isRequired: true,
        sortOrder: 1,
        aiRelevance: 'critical',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'description',
        slug: 'description',
        displayName: 'Description',
        fieldType: 'long_text' as FieldType,
        isRequired: true,
        sortOrder: 2,
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'price',
        slug: 'price',
        displayName: 'Starting Price',
        fieldType: 'price' as FieldType,
        isRequired: false,
        sortOrder: 3,
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'pricing_model',
        slug: 'pricing-model',
        displayName: 'Pricing Model',
        fieldType: 'select' as FieldType,
        isRequired: false,
        sortOrder: 4,
        fieldConfig: {
          options: [
            { value: 'hourly', label: 'Hourly Rate' },
            { value: 'fixed', label: 'Fixed Price' },
            { value: 'monthly', label: 'Monthly Retainer' },
            { value: 'project', label: 'Per Project' },
            { value: 'custom', label: 'Custom Quote' },
          ],
        },
        aiRelevance: 'medium',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'duration',
        slug: 'duration',
        displayName: 'Typical Duration',
        fieldType: 'short_text' as FieldType,
        isRequired: false,
        sortOrder: 5,
        placeholder: 'e.g., 2-4 weeks',
        aiRelevance: 'medium',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'deliverables',
        slug: 'deliverables',
        displayName: 'Deliverables',
        fieldType: 'tags' as FieldType,
        isRequired: false,
        sortOrder: 6,
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
    ],
  },

  // ============================================
  // FAQ TEMPLATE (General)
  // ============================================
  {
    template: {
      name: 'faq',
      slug: 'faq',
      displayName: 'FAQ',
      description: 'Frequently asked question and answer pair',
      category: CATEGORIES.GENERAL,
      icon: 'help-circle',
      color: '#F59E0B',
      isSystem: true,
      isActive: true,
      aiUsageHints:
        'Use for answering common questions. Match user queries to relevant FAQ entries.',
      aiRetrievalContext: 'Frequently asked questions and answers',
      supportedIntents: ['question', 'help', 'information'],
      priorityScore: 90,
    },
    fields: [
      {
        name: 'question',
        slug: 'question',
        displayName: 'Question',
        fieldType: 'short_text' as FieldType,
        isRequired: true,
        sortOrder: 1,
        aiRelevance: 'critical',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'answer',
        slug: 'answer',
        displayName: 'Answer',
        fieldType: 'rich_text' as FieldType,
        isRequired: true,
        sortOrder: 2,
        aiRelevance: 'critical',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'category',
        slug: 'category',
        displayName: 'Category',
        fieldType: 'select' as FieldType,
        isRequired: false,
        sortOrder: 3,
        fieldConfig: {
          allowCustom: true,
          options: [
            { value: 'general', label: 'General' },
            { value: 'pricing', label: 'Pricing' },
            { value: 'shipping', label: 'Shipping' },
            { value: 'returns', label: 'Returns' },
            { value: 'technical', label: 'Technical' },
            { value: 'account', label: 'Account' },
          ],
        },
        aiRelevance: 'medium',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'keywords',
        slug: 'keywords',
        displayName: 'Keywords',
        fieldType: 'tags' as FieldType,
        isRequired: false,
        sortOrder: 4,
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
        aiFieldHints: 'Related terms that help match this FAQ to user queries',
      },
    ],
  },

  // ============================================
  // HOTEL ROOM TEMPLATE (Hospitality)
  // ============================================
  {
    template: {
      name: 'hotel_room',
      slug: 'hotel-room',
      displayName: 'Hotel Room',
      description: 'Hotel room with amenities, pricing, and availability',
      category: CATEGORIES.HOSPITALITY,
      icon: 'bed',
      color: '#EC4899',
      isSystem: true,
      isActive: true,
      aiUsageHints:
        'Use for hotel room inquiries. Include room type, price per night, and amenities.',
      aiRetrievalContext: 'Hotel room listings',
      supportedIntents: [
        'room_search',
        'availability_check',
        'booking_inquiry',
      ],
      fabricationWarnings: [
        'Do not fabricate availability',
        'Do not make up rates',
      ],
      priorityScore: 75,
    },
    fields: [
      {
        name: 'room_name',
        slug: 'room-name',
        displayName: 'Room Name',
        fieldType: 'short_text' as FieldType,
        isRequired: true,
        sortOrder: 1,
        placeholder: 'e.g., Deluxe Ocean View Suite',
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'room_type',
        slug: 'room-type',
        displayName: 'Room Type',
        fieldType: 'select' as FieldType,
        isRequired: true,
        sortOrder: 2,
        fieldConfig: {
          options: [
            { value: 'standard', label: 'Standard' },
            { value: 'deluxe', label: 'Deluxe' },
            { value: 'suite', label: 'Suite' },
            { value: 'penthouse', label: 'Penthouse' },
            { value: 'villa', label: 'Villa' },
          ],
        },
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'description',
        slug: 'description',
        displayName: 'Description',
        fieldType: 'long_text' as FieldType,
        isRequired: true,
        sortOrder: 3,
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'price_per_night',
        slug: 'price-per-night',
        displayName: 'Price Per Night',
        fieldType: 'price' as FieldType,
        isRequired: true,
        sortOrder: 4,
        aiRelevance: 'critical',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'max_occupancy',
        slug: 'max-occupancy',
        displayName: 'Maximum Occupancy',
        fieldType: 'number' as FieldType,
        isRequired: true,
        sortOrder: 5,
        fieldConfig: {
          min: 1,
          max: 10,
        },
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'bed_type',
        slug: 'bed-type',
        displayName: 'Bed Type',
        fieldType: 'select' as FieldType,
        isRequired: false,
        sortOrder: 6,
        fieldConfig: {
          options: [
            { value: 'single', label: 'Single' },
            { value: 'double', label: 'Double' },
            { value: 'queen', label: 'Queen' },
            { value: 'king', label: 'King' },
            { value: 'twin', label: 'Twin' },
          ],
        },
        aiRelevance: 'medium',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'amenities',
        slug: 'amenities',
        displayName: 'Amenities',
        fieldType: 'tags' as FieldType,
        isRequired: false,
        sortOrder: 7,
        aiRelevance: 'medium',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'photos',
        slug: 'photos',
        displayName: 'Room Photos',
        fieldType: 'media' as FieldType,
        isRequired: false,
        sortOrder: 8,
        fieldConfig: {
          maxFiles: 10,
          acceptedTypes: ['image/*'],
        },
        aiRelevance: 'low',
        aiIncludeInEmbedding: false,
      },
    ],
  },

  // ============================================
  // DOCUMENT TEMPLATE (General)
  // ============================================
  {
    template: {
      name: 'document',
      slug: 'document',
      displayName: 'Document',
      description: 'General document or article with content and metadata',
      category: CATEGORIES.GENERAL,
      icon: 'file-text',
      color: '#6366F1',
      isSystem: true,
      isActive: true,
      aiUsageHints:
        'Use for general knowledge documents. Content should be retrievable for informational queries.',
      aiRetrievalContext: 'Knowledge base documents and articles',
      supportedIntents: ['information', 'documentation', 'reference'],
      priorityScore: 70,
    },
    fields: [
      {
        name: 'title',
        slug: 'title',
        displayName: 'Title',
        fieldType: 'short_text' as FieldType,
        isRequired: true,
        sortOrder: 1,
        aiRelevance: 'critical',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'content',
        slug: 'content',
        displayName: 'Content',
        fieldType: 'rich_text' as FieldType,
        isRequired: true,
        sortOrder: 2,
        aiRelevance: 'critical',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'summary',
        slug: 'summary',
        displayName: 'Summary',
        fieldType: 'long_text' as FieldType,
        isRequired: false,
        sortOrder: 3,
        placeholder: 'Brief summary of the document',
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'category',
        slug: 'category',
        displayName: 'Category',
        fieldType: 'select' as FieldType,
        isRequired: false,
        sortOrder: 4,
        fieldConfig: {
          allowCustom: true,
          options: [
            { value: 'guide', label: 'Guide' },
            { value: 'tutorial', label: 'Tutorial' },
            { value: 'reference', label: 'Reference' },
            { value: 'policy', label: 'Policy' },
            { value: 'announcement', label: 'Announcement' },
          ],
        },
        aiRelevance: 'medium',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'tags',
        slug: 'tags',
        displayName: 'Tags',
        fieldType: 'tags' as FieldType,
        isRequired: false,
        sortOrder: 5,
        aiRelevance: 'high',
        aiIncludeInEmbedding: true,
      },
      {
        name: 'attachments',
        slug: 'attachments',
        displayName: 'Attachments',
        fieldType: 'file' as FieldType,
        isRequired: false,
        sortOrder: 6,
        fieldConfig: {
          maxFiles: 5,
        },
        aiRelevance: 'low',
        aiIncludeInEmbedding: false,
      },
    ],
  },
];

/**
 * Seed all system templates
 */
export async function seedKnowledgeBaseTemplates() {
  console.log('🌱 Starting Knowledge Base template seeding...');

  for (const config of SYSTEM_TEMPLATES) {
    try {
      // Check if template already exists
      const existingTemplate = await db.query.kbObjectTemplates.findFirst({
        where: and(
          eq(kbObjectTemplates.slug, config.template.slug!),
          eq(kbObjectTemplates.isSystem, true),
        ),
      });

      if (existingTemplate) {
        console.log(
          `  ⏭️  Template "${config.template.displayName}" already exists, skipping...`,
        );
        continue;
      }

      // Create template
      const [template] = await db
        .insert(kbObjectTemplates)
        .values(config.template)
        .returning();

      console.log(`  ✅ Created template: ${template.displayName}`);

      // Create fields
      if (config.fields.length > 0) {
        const fieldsToInsert = config.fields.map((field) => ({
          ...field,
          templateId: template.id,
        }));

        await db.insert(kbTemplateFields).values(fieldsToInsert);
        console.log(`     📝 Created ${config.fields.length} fields`);
      }
    } catch (error) {
      console.error(
        `  ❌ Error creating template "${config.template.displayName}":`,
        error,
      );
    }
  }

  console.log('🌱 Knowledge Base template seeding completed!');
}

/**
 * Clear all system templates
 */
export async function clearSystemTemplates() {
  console.log('🗑️  Clearing system templates...');

  try {
    // Delete all system templates (fields will cascade)
    const result = await db
      .delete(kbObjectTemplates)
      .where(eq(kbObjectTemplates.isSystem, true))
      .returning();

    console.log(`  ✅ Deleted ${result.length} system templates`);
  } catch (error) {
    console.error('  ❌ Error clearing system templates:', error);
  }
}

// Run seed if executed directly
if (require.main === module) {
  seedKnowledgeBaseTemplates()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    });
}
