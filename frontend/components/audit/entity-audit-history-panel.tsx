/**
 * Entity Audit History Panel
 *
 * A Sheet (slide-in panel) that shows the audit history for a specific entity
 * such as a contact, template, catalog item, etc.
 *
 * Usage:
 * ```tsx
 * <EntityAuditHistoryPanel
 *   open={showHistory}
 *   onOpenChange={setShowHistory}
 *   entityType="contact"
 *   entityId={contact.id}
 *   entityName={contact.name}
 * />
 * ```
 *
 * Can be placed on any detail page or modal to show the entity's change history.
 */

"use client";

import { AuditTimeline } from "@/components/audit/audit-timeline";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useEntityAuditHistory } from "@/hooks/use-audit-history";
import type { AuditEntityType } from "@/lib/api/endpoints";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

// ==================== Main Component ====================

export interface EntityAuditHistoryPanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** The type of entity */
  entityType: AuditEntityType;
  /** The ID of the entity */
  entityId: string;
  /** Display name of the entity (shown in header) */
  entityName?: string;
  /** Which side the sheet slides from */
  side?: "right" | "left";
  /** Width class for the sheet */
  width?: string;
}

export const EntityAuditHistoryPanel = memo(function EntityAuditHistoryPanel({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityName,
  side = "right",
  width = "w-[420px] sm:max-w-[420px]",
}: EntityAuditHistoryPanelProps) {
  const t = useTranslations("audit");
  const tEntityTypes = useTranslations("audit.entityTypes");

  const { items, isLoading, error, refresh } = useEntityAuditHistory({
    entityType,
    entityId,
    enabled: open,
  });

  const entityTypeLabel = tEntityTypes(entityType);
  const title = entityName
    ? `${entityTypeLabel}: ${entityName}`
    : entityTypeLabel;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={`${width} p-0 flex flex-col`}>
        <SheetHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base truncate pr-2">
              {t("title")}
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => refresh()}
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
          <SheetDescription className="truncate text-xs">
            {title}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <AuditTimeline
            items={items}
            isLoading={isLoading}
            error={error}
            showCategory={true}
            showEntityName={false}
            onRetry={refresh}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
});

export default EntityAuditHistoryPanel;
