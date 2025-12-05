/**
 * Database Migration for Template Feature
 * 
 * This migration creates all necessary tables for the template management system:
 * - templates: Main template records
 * - template_locales: Multi-language variants
 * - template_variables: Placeholder metadata
 * - template_versions: Versioning and provider submission status
 * - template_tests: Test message records
 * - template_platforms: Platform availability configuration
 */

-- TODO: Run the following SQL statements in your database

-- Templates table - business-facing templates with friendly placeholders
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id INTEGER NOT NULL,
  name VARCHAR NOT NULL,
  description TEXT,
  is_visible BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_templates_owner_id ON templates(owner_id);

-- Template Locales - multi-language, multi-platform variants
CREATE TABLE IF NOT EXISTS template_locales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  locale VARCHAR(10) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'text',
  header TEXT,
  body TEXT NOT NULL,
  footer TEXT,
  example_vars JSONB DEFAULT '{}',
  active_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(template_id, locale)
);

CREATE INDEX idx_template_locales_template_id ON template_locales(template_id);

-- Template Variables - metadata about placeholders
CREATE TABLE IF NOT EXISTS template_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locale_id UUID NOT NULL REFERENCES template_locales(id) ON DELETE CASCADE,
  var_name VARCHAR NOT NULL,
  var_type VARCHAR(20) DEFAULT 'string',
  validator JSONB DEFAULT '{}',
  is_required BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_template_variables_locale_id ON template_variables(locale_id);

-- Template Versions - versioning and provider submission status
CREATE TABLE IF NOT EXISTS template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  locale_id UUID NOT NULL REFERENCES template_locales(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  provider_id VARCHAR,
  provider_name VARCHAR(50),
  provider_response JSONB,
  platforms JSONB DEFAULT '["whatsapp"]',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_template_versions_template_id ON template_versions(template_id);
CREATE INDEX idx_template_versions_status ON template_versions(status);

-- Template Tests - test sends via sandbox
CREATE TABLE IF NOT EXISTS template_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id UUID REFERENCES template_versions(id) ON DELETE CASCADE,
  tester_user_id INTEGER NOT NULL,
  test_phone_number VARCHAR NOT NULL,
  test_payload JSONB NOT NULL,
  test_result JSONB,
  delivery_status VARCHAR(20),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_template_tests_template_version_id ON template_tests(template_version_id);
CREATE INDEX idx_template_tests_tester_user_id ON template_tests(tester_user_id);

-- Template Platforms - configuration for which platforms each template supports
CREATE TABLE IF NOT EXISTS template_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  platform_name VARCHAR(50) NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(template_id, platform_name)
);

CREATE INDEX idx_template_platforms_template_id ON template_platforms(template_id);
