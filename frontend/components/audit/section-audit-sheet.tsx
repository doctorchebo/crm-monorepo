/**
 * Section Audit History Sheet
 *
 * A reusable Sheet (slide-in panel) that shows audit history
 * pre-filtered to a specific category. Used across section pages:
 * - Contacts page → category "contacts"
 * - Templates page → category "templates"
 * - Team page → category "team"
 * - Catalog page → category "catalog"
 * - Senders page → category "senders"
 * - Knowledge Base page → category "knowledge_base"
 *
 * Also exports a small hook-style button for consistent placement.
 *
 * Usage:
 * ```tsx
 * const [showAudit, setShowAudit] = useState(false);
 *
 * // In header actions:
 * <SectionAuditButton onClick={() => setShowAudit(true)} />
 *
 * // At component root:
 * <SectionAuditSheet
 *   open={showAudit}
 *   onOpenChange={setShowAudit}
 *   category="contacts"
 * />
 * ```
 */

"use client";

import { AuditLogPanel } from "@/components/audit/audit-log-panel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import type { AuditCategory } from "@/lib/api/endpoints";
import { History } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

// ==================== Sheet Component ====================

export interface SectionAuditSheetProps {
  /** Whether the sheet is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** The audit category to pre-filter to */
  category: AuditCategory;
  /** Which side the sheet slides from */
  side?: "right" | "left";
  /** Width class for the sheet */
  width?: string;
}

export const SectionAuditSheet = memo(function SectionAuditSheet({
  open,
  onOpenChange,
  category,
  side = "right",
  width = "w-[520px] sm:max-w-[520px]",
}: SectionAuditSheetProps) {
  const t = useTranslations("audit");
  const tCategories = useTranslations("audit.categories");

  const categoryLabel = tCategories(category);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={`${width} p-0 flex flex-col`}>
        <SheetHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <SheetTitle className="text-base">{t("title")}</SheetTitle>
          <SheetDescription className="text-xs">
            {categoryLabel}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <AuditLogPanel
            showHeader={false}
            asCard={false}
            hookOptions={{
              initialFilters: { categories: [category] },
              initialPageSize: 20,
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
});

// ==================== Button Component ====================

export interface SectionAuditButtonProps {
  /** Click handler to open the sheet */
  onClick: () => void;
  /** Optional label override */
  label?: string;
  /** Button size variant */
  size?: "default" | "sm" | "lg" | "icon";
  /** Button style variant */
  variant?: "outline" | "ghost" | "default" | "secondary";
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

export const SectionAuditButton = memo(function SectionAuditButton({
  onClick,
  label,
  size = "sm",
  variant = "outline",
  disabled = false,
  className,
}: SectionAuditButtonProps) {
  const t = useTranslations("audit");
  const { isAdminOrOwner, isLoading } = useCurrentUserRole();

  // Only visible to admin/owner — section-level audit shows all team activity
  if (isLoading || !isAdminOrOwner) return null;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      <History className="h-4 w-4 mr-2" />
      {label ?? t("title")}
    </Button>
  );
});

export default SectionAuditSheet;
