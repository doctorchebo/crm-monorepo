/**
 * Database Migration for Template Approval Status
 * 
 * Adds approval status tracking to template_locales table for Meta Cloud API integration.
 * 
 * Status values (aligned with Meta's template status):
 * - draft: Template created but not submitted for approval
 * - pending: Template submitted and awaiting review
 * - approved: Template approved and can be used
 * - rejected: Template rejected by Meta
 * - paused: Template paused due to quality issues
 * - disabled: Template disabled permanently
 * - appeal_requested: Appeal has been submitted
 * 
 * Quality ratings (from Meta):
 * - pending: Quality not yet determined
 * - high: High quality, good customer feedback
 * - medium: Medium quality, some negative feedback
 * - low: Low quality, risk of being paused
 */

-- Add approval status columns to template_locales table
ALTER TABLE template_locales
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS meta_template_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS quality_rating VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS meta_response JSONB;

-- Add category column for Meta's required categorization
ALTER TABLE template_locales
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'utility';

-- Create index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_template_locales_approval_status ON template_locales(approval_status);
CREATE INDEX IF NOT EXISTS idx_template_locales_meta_template_id ON template_locales(meta_template_id);

-- Comments for documentation
COMMENT ON COLUMN template_locales.approval_status IS 'Meta Cloud API template approval status: draft, pending, approved, rejected, paused, disabled, appeal_requested';
COMMENT ON COLUMN template_locales.meta_template_id IS 'Template ID assigned by Meta Cloud API after submission';
COMMENT ON COLUMN template_locales.rejection_reason IS 'Reason for rejection if template was rejected';
COMMENT ON COLUMN template_locales.quality_rating IS 'Meta quality rating: pending, high, medium, low';
COMMENT ON COLUMN template_locales.submitted_at IS 'Timestamp when template was submitted for approval';
COMMENT ON COLUMN template_locales.reviewed_at IS 'Timestamp when Meta completed the review';
COMMENT ON COLUMN template_locales.meta_response IS 'Full response from Meta API for debugging';
COMMENT ON COLUMN template_locales.category IS 'Meta template category: authentication, marketing, utility';
