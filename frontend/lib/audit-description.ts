// ============================================================================
// Audit Description Formatter
// ============================================================================
// Generates locale-aware audit descriptions from structured data (action,
// entityName, metadata) instead of relying on pre-rendered strings stored
// at write time. This solves the mixed-language problem where descriptions
// were stored in whatever language the user/system happened to use.
//
// USAGE:
//   const t = useTranslations("audit.actions");
//   const description = formatAuditDescription(entry, t);
//
// ADDING NEW ACTIONS:
//   1. Add the action key to the switch statement below
//   2. Add corresponding i18n keys in messages/en.json and messages/es.json
//      under "audit.actions.<action_key>"
// ============================================================================

import type { AuditAction, AuditEntry } from "@/lib/api/endpoints";

/**
 * Minimal translation function interface — matches what
 * `useTranslations("audit.actions")` returns from next-intl.
 */
type TranslationFn = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * Build a localized description string for an audit entry.
 *
 * Uses `action` + `entityName` + `metadata` to produce the text in the
 * viewer's locale. Falls back to the raw `entry.description` stored in
 * the DB for unknown/legacy actions.
 *
 * @param entry  - The audit entry from the API
 * @param t      - Translation function scoped to "audit.actions"
 * @returns A human-readable description string
 */
export function formatAuditDescription(
  entry: AuditEntry,
  t: TranslationFn,
): string {
  const { action, entityName, metadata } = entry;
  if (!action) return entry.description ?? "";

  const name = entityName ?? "";
  const meta = (metadata ?? {}) as Record<string, unknown>;

  const description = buildDescription(action, name, meta, t);

  // If the builder returned a valid string, use it; otherwise fall back to
  // whatever was stored in the DB (legacy entries written before this change).
  return description ?? entry.description ?? "";
}

// ---------------------------------------------------------------------------
// Internal: map action → i18n key with interpolation values
// ---------------------------------------------------------------------------

function buildDescription(
  action: AuditAction,
  name: string,
  meta: Record<string, unknown>,
  t: TranslationFn,
): string | null {
  switch (action) {
    // -- Pipeline / Workflow ------------------------------------------------
    case "stage_created":
      return t("stage_created", { name });
    case "stage_updated":
      return t("stage_updated", { name });
    case "stage_deleted":
      return t("stage_deleted", { name });
    case "stage_reordered":
      return t("stage_reordered");
    case "stage_default_changed":
      return t("stage_default_changed", { name });

    case "chat_transitioned":
      return buildChatTransitionedDescription(meta, t);

    case "handoff_requested":
      return t("handoff_requested");
    case "handoff_resolved":
      return t("handoff_resolved");

    case "ai_paused":
      return meta.reason
        ? t("ai_paused_with_reason", { reason: String(meta.reason) })
        : t("ai_paused");
    case "ai_resumed":
      return t("ai_resumed");

    case "chat_assigned":
      return meta.assigneeName
        ? t("chat_assigned", { name: String(meta.assigneeName) })
        : t("chat_assigned_id", { id: String(meta.assigneeId ?? "") });
    case "chat_reassigned":
      return t("chat_reassigned");
    case "chat_unassigned":
      return t("chat_unassigned");

    case "message_sent_human":
      return t("message_sent_human");
    case "message_sent_ai":
      return t("message_sent_ai");
    case "message_deleted":
      return t("message_deleted");
    case "message_edited":
      return t("message_edited");
    case "note_added":
      return t("note_added");
    case "note_deleted":
      return t("note_deleted");

    case "chat_created":
      return name ? t("chat_created_named", { name }) : t("chat_created");
    case "chat_deleted":
      return name ? t("chat_deleted_named", { name }) : t("chat_deleted");

    case "lock_acquired":
      return t("lock_acquired");
    case "lock_released":
      return t("lock_released");
    case "lock_force_released":
      return t("lock_force_released");

    // -- Contacts -----------------------------------------------------------
    case "contact_created":
      return t("contact_created", { name });
    case "contact_updated":
      return t("contact_updated", { name });
    case "contact_deleted":
      return t("contact_deleted", { name });
    case "contacts_bulk_deleted":
      return t("contacts_bulk_deleted", {
        count: Number(meta.count ?? 0),
      });

    // -- Templates ----------------------------------------------------------
    case "template_created":
      return t("template_created", { name });
    case "template_updated":
      return t("template_updated", { name });
    case "template_deleted":
      return t("template_deleted", { name });
    case "template_submitted":
      return t("template_submitted", { name });
    case "template_version_created":
      return t("template_version_created", { name });

    // -- Team ---------------------------------------------------------------
    case "member_added":
      return t("member_added", { name });
    case "member_removed":
      return t("member_removed", { name });
    case "role_changed":
      return t("role_changed", { name });
    case "invitation_sent":
      return meta.email
        ? t("invitation_sent", { email: String(meta.email) })
        : t("invitation_sent_generic");
    case "invitation_accepted":
      return t("invitation_accepted");
    case "invitation_revoked":
      return t("invitation_revoked");
    case "invitation_expired":
      return t("invitation_expired");
    case "custom_role_created":
      return t("custom_role_created", { name });
    case "custom_role_updated":
      return t("custom_role_updated", { name });
    case "custom_role_deleted":
      return t("custom_role_deleted", { name });

    // -- Catalog ------------------------------------------------------------
    case "catalog_item_created":
      return t("catalog_item_created", { name });
    case "catalog_item_updated":
      return t("catalog_item_updated", { name });
    case "catalog_item_deleted":
      return t("catalog_item_deleted", { name });
    case "catalog_linked":
      return name ? t("catalog_linked_named", { name }) : t("catalog_linked");
    case "catalog_unlinked":
      return name
        ? t("catalog_unlinked_named", { name })
        : t("catalog_unlinked");
    case "collection_created":
      return t("collection_created", { name });
    case "collection_deleted":
      return t("collection_deleted", { name });
    case "catalog_bulk_import":
      return t("catalog_bulk_import", {
        count: Number(meta.count ?? 0),
      });

    // -- Senders ------------------------------------------------------------
    case "sender_created":
      return t("sender_created", { name });
    case "sender_updated":
      return t("sender_updated", { name });
    case "sender_removed":
      return t("sender_removed", { name });
    case "sender_synced":
      return t("sender_synced");

    // -- Labels -------------------------------------------------------------
    case "label_created":
      return t("label_created", { name });
    case "label_updated":
      return t("label_updated", { name });
    case "label_deleted":
      return t("label_deleted", { name });
    case "labels_applied": {
      const labels = Array.isArray(meta.labelNames)
        ? (meta.labelNames as string[]).join(", ")
        : "";
      const chatCount = Array.isArray(meta.chatIds)
        ? (meta.chatIds as string[]).length
        : 0;
      return t("labels_applied", { labels, count: chatCount });
    }
    case "labels_removed": {
      const labels = Array.isArray(meta.labelNames)
        ? (meta.labelNames as string[]).join(", ")
        : "";
      const chatCount = Array.isArray(meta.chatIds)
        ? (meta.chatIds as string[]).length
        : 0;
      return t("labels_removed", { labels, count: chatCount });
    }

    // -- Knowledge Base -----------------------------------------------------
    case "kb_object_created":
      return t("kb_object_created", { name });
    case "kb_object_updated":
      return t("kb_object_updated", { name });
    case "kb_object_deleted":
      return t("kb_object_deleted", { name });
    case "kb_object_published":
      return t("kb_object_published", { name });
    case "kb_template_created":
      return t("kb_template_created", { name });
    case "kb_template_updated":
      return t("kb_template_updated", { name });
    case "kb_template_deleted":
      return t("kb_template_deleted", { name });

    // -- Import Jobs --------------------------------------------------------
    case "import_started":
      return name ? t("import_started_named", { name }) : t("import_started");
    case "import_completed": {
      const total = meta.totalImported as number | undefined;
      return total
        ? t("import_completed_count", { count: total })
        : t("import_completed");
    }
    case "import_rolled_back":
      return t("import_rolled_back");

    // -- Settings -----------------------------------------------------------
    case "setting_changed":
      return t("setting_changed", {
        name: name || String(meta.entityId ?? ""),
      });

    // -- Auth ---------------------------------------------------------------
    case "sign_in":
      return t("sign_in");
    case "sign_up":
      return t("sign_up");
    case "sign_out":
      return t("sign_out");
    case "password_changed":
      return t("password_changed");
    case "password_reset_requested":
      return t("password_reset_requested");
    case "password_reset_completed":
      return t("password_reset_completed");
    case "account_deleted":
      return t("account_deleted");

    default:
      // Unknown action — return null so caller can fall back to raw description
      return null;
  }
}

// ---------------------------------------------------------------------------
// chat_transitioned: the most complex case
// ---------------------------------------------------------------------------
// The metadata stores a `reasonKey` that maps to a well-known i18n key,
// plus optional `fromStageName`/`toStageName` for interpolation.
// Legacy entries may still have a free-text `reason` field.
// ---------------------------------------------------------------------------

function buildChatTransitionedDescription(
  meta: Record<string, unknown>,
  t: TranslationFn,
): string {
  const reasonKey = meta.reasonKey as string | undefined;
  const toStageName = (meta.toStageName ??
    meta.targetStageName ??
    "") as string;
  const fromStageName = (meta.fromStageName ?? "") as string;
  const ruleName = (meta.ruleName ?? "") as string;

  if (reasonKey) {
    switch (reasonKey) {
      case "kanban_drag":
        return t("chat_transition_kanban", { stageName: toStageName });
      case "pipeline_manual":
        return t("chat_transition_pipeline");
      case "modal_assignment":
        return t("chat_transition_modal");
      case "rule_matched":
        return t("chat_transition_rule", { ruleName });
      case "workflow_initialized":
        return t("chat_transition_workflow_init");
      case "bulk_transition":
        return t("chat_transition_bulk");
      default:
        // Unknown reasonKey — try a generic description
        return t("chat_transitioned_generic", {
          from: fromStageName,
          to: toStageName,
        });
    }
  }

  // Legacy entries without reasonKey — build something from available data
  if (fromStageName && toStageName) {
    return t("chat_transitioned_generic", {
      from: fromStageName,
      to: toStageName,
    });
  }

  if (toStageName) {
    return t("chat_transition_to", { stageName: toStageName });
  }

  return t("chat_transitioned_fallback");
}
