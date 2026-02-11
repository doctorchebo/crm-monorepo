-- ============================================================================
-- Migration 089: Template Schema Cleanup and Documentation
-- ============================================================================
-- 
-- This migration documents the schema design decisions for template approval tracking
-- and adds comments to clarify the purpose of each field.
--
-- SCHEMA DESIGN DECISIONS:
-- ========================
--
-- 1. APPROVAL STATUS SOURCE OF TRUTH
--    The template_locales.approval_status field is the SINGLE SOURCE OF TRUTH
--    for the current Meta approval status. This field should ONLY be updated
--    from Meta API responses (webhooks or sync calls).
--
-- 2. VERSION STATUS IS HISTORICAL
--    The template_versions.status field tracks the submission state of each
--    individual version. It serves as an audit trail of version submissions
--    but is NOT the source of truth for current approval status.
--
-- 3. META TEMPLATE ID LOCATION
--    The template_locales.meta_template_id is the primary storage for Meta's
--    template ID. Each template name + language combination gets ONE Meta ID.
--    The template_versions.provider_id is DEPRECATED - it exists for backward
--    compatibility but should not be relied upon for new code.
--
-- 4. FIELD PURPOSES:
--    template_locales:
--      - approval_status: Current Meta approval status (source of truth)
--      - meta_template_id: Meta's template ID (source of truth)
--      - quality_rating: Current quality rating from Meta
--      - rejection_reason: Reason if template is rejected
--      - submitted_at: When first submitted for approval
--      - reviewed_at: When Meta completed review
--      - meta_response: Full Meta API response for debugging
--
--    template_versions:
--      - status: Historical status of this specific version submission
--      - provider_id: DEPRECATED - use template_locales.meta_template_id
--      - provider_response: API response for this specific version submission
--
-- ============================================================================

-- Add comments to clarify the purpose of each field

COMMENT ON COLUMN template_locales.approval_status IS 
  'Current Meta Cloud API approval status. SOURCE OF TRUTH. Values: draft, pending, approved, rejected, paused, disabled, appeal_requested';

COMMENT ON COLUMN template_locales.meta_template_id IS 
  'Template ID assigned by Meta Cloud API. SOURCE OF TRUTH. Used for all status sync operations.';

COMMENT ON COLUMN template_versions.status IS 
  'Historical status of this version submission. Values: draft, pending_approval, approved, rejected, disabled';

COMMENT ON COLUMN template_versions.provider_id IS 
  'DEPRECATED: Use template_locales.meta_template_id instead. Kept for backward compatibility.';

-- Note: We intentionally do NOT remove provider_id from template_versions
-- to maintain backward compatibility and preserve historical data.
-- New code should use template_locales.meta_template_id exclusively.
