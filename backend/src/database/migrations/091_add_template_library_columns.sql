-- Migration: Add Template Library support columns
-- Description: Adds columns to support Meta's pre-approved Template Library feature.
--   - templates.source: Distinguishes user-created ('custom') vs library-adopted ('library') templates
--   - template_locales.library_template_name: Original Meta library template name for duplicate detection
--   - template_locales.body_param_types: Parameter type constraints enforced at send time for library templates
-- Author: Antigravity

-- 1. Add source column to templates table
ALTER TABLE "templates"
ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'custom';

COMMENT ON COLUMN "templates"."source" IS 'Template origin: ''custom'' (user-created, requires Meta approval) or ''library'' (adopted from Meta Template Library, pre-approved)';

-- 2. Add library_template_name column to template_locales table
ALTER TABLE "template_locales"
ADD COLUMN IF NOT EXISTS "library_template_name" varchar(255);

COMMENT ON COLUMN "template_locales"."library_template_name" IS 'Original Meta Template Library name (e.g., ''delivery_update_1''). Used to prevent duplicate adoption and to identify library-sourced locales.';

-- 3. Add body_param_types column to template_locales table
ALTER TABLE "template_locales"
ADD COLUMN IF NOT EXISTS "body_param_types" jsonb;

COMMENT ON COLUMN "template_locales"."body_param_types" IS 'Parameter type constraints from Meta Template Library (e.g., [\"TEXT\", \"AMOUNT\", \"DATE\"]). Values are validated at send time to prevent Meta API rejections.';

-- 4. Add index on library_template_name for fast duplicate lookups
CREATE INDEX IF NOT EXISTS "template_locales_library_template_name_index"
ON "template_locales" ("library_template_name")
WHERE "library_template_name" IS NOT NULL;

-- Down Migration (Commented out)
-- DROP INDEX IF EXISTS "template_locales_library_template_name_index";
-- ALTER TABLE "template_locales" DROP COLUMN IF EXISTS "body_param_types";
-- ALTER TABLE "template_locales" DROP COLUMN IF EXISTS "library_template_name";
-- ALTER TABLE "templates" DROP COLUMN IF EXISTS "source";
