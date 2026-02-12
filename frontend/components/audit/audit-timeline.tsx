/**
 * Audit Timeline Component
 *
 * Renders a chronological list of audit entries as a timeline with:
 * - Category-aware icons and color coding
 * - User attribution and relative timestamps
 * - Expandable change details
 * - Loading skeletons, empty, and error states
 *
 * Reusable across: global audit page, entity history panels, per-section views.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  AuditAction,
  AuditCategory,
  AuditEntry,
} from "@/lib/api/endpoints";
import { formatAuditDescription } from "@/lib/audit-description";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Edit2,
  FileText,
  History,
  Import,
  Key,
  type LucideIcon,
  Mail,
  MessageSquare,
  Package,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Shield,
  Shuffle,
  Tag,
  Trash2,
  User,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useState } from "react";

// ==================== Icon & Color Mapping ====================

interface IconConfig {
  icon: LucideIcon;
  bg: string;
  text: string;
}

/**
 * Map of audit categories to their visual representation.
 */
const CATEGORY_ICONS: Record<AuditCategory, IconConfig> = {
  pipeline: {
    icon: ArrowRight,
    bg: "bg-indigo-100 dark:bg-indigo-950",
    text: "text-indigo-600 dark:text-indigo-400",
  },
  contacts: {
    icon: Users,
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-600 dark:text-blue-400",
  },
  templates: {
    icon: FileText,
    bg: "bg-violet-100 dark:bg-violet-950",
    text: "text-violet-600 dark:text-violet-400",
  },
  team: {
    icon: UserPlus,
    bg: "bg-teal-100 dark:bg-teal-950",
    text: "text-teal-600 dark:text-teal-400",
  },
  catalog: {
    icon: Package,
    bg: "bg-orange-100 dark:bg-orange-950",
    text: "text-orange-600 dark:text-orange-400",
  },
  senders: {
    icon: Send,
    bg: "bg-cyan-100 dark:bg-cyan-950",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  labels: {
    icon: Tag,
    bg: "bg-pink-100 dark:bg-pink-950",
    text: "text-pink-600 dark:text-pink-400",
  },
  knowledge_base: {
    icon: MessageSquare,
    bg: "bg-emerald-100 dark:bg-emerald-950",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  import: {
    icon: Import,
    bg: "bg-amber-100 dark:bg-amber-950",
    text: "text-amber-600 dark:text-amber-400",
  },
  settings: {
    icon: Settings,
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
  },
  auth: {
    icon: Key,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },
};

/**
 * Specific icon overrides for certain actions.
 */
const ACTION_ICON_OVERRIDES: Partial<Record<AuditAction, IconConfig>> = {
  // Destructive actions
  stage_deleted: {
    icon: Trash2,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },
  contact_deleted: {
    icon: Trash2,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },
  contacts_bulk_deleted: {
    icon: Trash2,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },
  template_deleted: {
    icon: Trash2,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },
  member_removed: {
    icon: Trash2,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },
  catalog_item_deleted: {
    icon: Trash2,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },
  label_deleted: {
    icon: Trash2,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },
  kb_object_deleted: {
    icon: Trash2,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },
  account_deleted: {
    icon: Trash2,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },

  // Create actions
  stage_created: {
    icon: Plus,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-600 dark:text-green-400",
  },
  contact_created: {
    icon: Plus,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-600 dark:text-green-400",
  },
  template_created: {
    icon: Plus,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-600 dark:text-green-400",
  },
  catalog_item_created: {
    icon: Plus,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-600 dark:text-green-400",
  },
  label_created: {
    icon: Plus,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-600 dark:text-green-400",
  },
  kb_object_created: {
    icon: Plus,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-600 dark:text-green-400",
  },
  member_added: {
    icon: UserPlus,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-600 dark:text-green-400",
  },

  // Update / Edit actions
  stage_updated: {
    icon: Edit2,
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-600 dark:text-blue-400",
  },
  contact_updated: {
    icon: Edit2,
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-600 dark:text-blue-400",
  },
  template_updated: {
    icon: Edit2,
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-600 dark:text-blue-400",
  },
  setting_changed: {
    icon: Settings,
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
  },

  // Reorder
  stage_reordered: {
    icon: Shuffle,
    bg: "bg-amber-100 dark:bg-amber-950",
    text: "text-amber-600 dark:text-amber-400",
  },

  // AI actions
  ai_paused: {
    icon: Bot,
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
  },
  ai_resumed: {
    icon: Bot,
    bg: "bg-cyan-100 dark:bg-cyan-950",
    text: "text-cyan-600 dark:text-cyan-400",
  },

  // Auth
  sign_in: {
    icon: Key,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-600 dark:text-green-400",
  },
  sign_out: {
    icon: Key,
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
  },

  // Role / permission changes
  role_changed: {
    icon: Shield,
    bg: "bg-purple-100 dark:bg-purple-950",
    text: "text-purple-600 dark:text-purple-400",
  },
  custom_role_created: {
    icon: Shield,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-600 dark:text-green-400",
  },
  custom_role_updated: {
    icon: Shield,
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-600 dark:text-blue-400",
  },
  custom_role_deleted: {
    icon: Shield,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },

  // Invitation
  invitation_sent: {
    icon: Mail,
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-600 dark:text-blue-400",
  },
  invitation_accepted: {
    icon: Mail,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-600 dark:text-green-400",
  },
  invitation_revoked: {
    icon: Mail,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },

  // Import
  import_started: {
    icon: Download,
    bg: "bg-amber-100 dark:bg-amber-950",
    text: "text-amber-600 dark:text-amber-400",
  },
  import_completed: {
    icon: Download,
    bg: "bg-green-100 dark:bg-green-950",
    text: "text-green-600 dark:text-green-400",
  },
  import_rolled_back: {
    icon: Download,
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-600 dark:text-red-400",
  },

  // Handoff / transitions
  handoff_requested: {
    icon: User,
    bg: "bg-orange-100 dark:bg-orange-950",
    text: "text-orange-600 dark:text-orange-400",
  },
  handoff_resolved: {
    icon: Zap,
    bg: "bg-emerald-100 dark:bg-emerald-950",
    text: "text-emerald-600 dark:text-emerald-400",
  },
};

const DEFAULT_ICON: IconConfig = {
  icon: Clock,
  bg: "bg-gray-100 dark:bg-gray-800",
  text: "text-gray-600 dark:text-gray-400",
};

/**
 * Get icon config for an audit entry — action override > category default > fallback.
 */
function getIconConfig(
  action: AuditAction | null,
  category: AuditCategory | null,
): IconConfig {
  if (action && ACTION_ICON_OVERRIDES[action]) {
    return ACTION_ICON_OVERRIDES[action]!;
  }
  if (category && CATEGORY_ICONS[category]) {
    return CATEGORY_ICONS[category];
  }
  return DEFAULT_ICON;
}

// ==================== Time Formatting ====================

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: diffDays > 365 ? "numeric" : undefined,
  });
}

function formatFullTimestamp(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ==================== Sub-components ====================

/**
 * Renders the expandable changes section for an audit entry.
 */
const AuditChangesDetail = memo(function AuditChangesDetail({
  changes,
  metadata,
}: {
  changes: Record<string, { from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown>;
}) {
  const t = useTranslations("audit");

  const hasChanges = changes && Object.keys(changes).length > 0;
  const hasMetadata = Object.keys(metadata).length > 0;

  if (!hasChanges && !hasMetadata) {
    return (
      <p className="text-xs text-muted-foreground italic">
        {t("entry.noChanges")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Field-level changes */}
      {hasChanges && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("entry.changes")}
          </p>
          <div className="space-y-1">
            {Object.entries(changes).map(([field, change]) => {
              const isValidChange =
                change &&
                typeof change === "object" &&
                "from" in change &&
                "to" in change;
              if (!isValidChange) {
                return (
                  <div
                    key={field}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
                  >
                    <span className="font-medium text-foreground">{field}</span>
                    <code className="px-1 py-0.5 rounded bg-muted text-[11px]">
                      {formatChangeValue(change)}
                    </code>
                  </div>
                );
              }
              return (
                <div
                  key={field}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
                >
                  <span className="font-medium text-foreground">{field}</span>
                  <span className="text-muted-foreground">
                    {t("entry.changedFrom")}
                  </span>
                  <code className="px-1 py-0.5 rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 text-[11px]">
                    {formatChangeValue(change.from)}
                  </code>
                  <span className="text-muted-foreground">
                    {t("entry.changedTo")}
                  </span>
                  <code className="px-1 py-0.5 rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 text-[11px]">
                    {formatChangeValue(change.to)}
                  </code>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metadata */}
      {hasMetadata && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("entry.metadata")}
          </p>
          <div className="rounded border bg-muted/50 p-2 text-[11px] font-mono overflow-x-auto">
            {Object.entries(metadata).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">{key}:</span>
                <span className="text-foreground break-all">
                  {formatChangeValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Format a change value for display — handles objects, arrays, nulls, etc.
 */
function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value || '""';
  if (typeof value === "number") return String(value);
  if (Array.isArray(value))
    return value.length === 0 ? "[]" : JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ==================== AuditTimelineItem ====================

export interface AuditTimelineItemProps {
  entry: AuditEntry;
  /** Show the category badge (useful in global view, hide in per-category views) */
  showCategory?: boolean;
  /** Whether to show inline entity name */
  showEntityName?: boolean;
  /** Callback when entity is clicked */
  onEntityClick?: (entityType: string, entityId: string) => void;
  /** Callback to make the whole item clickable (e.g. navigate to chat) */
  onClick?: () => void;
  /** Compact mode for sidebar/sheet contexts — hides expandable details */
  compact?: boolean;
}

export const AuditTimelineItem = memo(function AuditTimelineItem({
  entry,
  showCategory = true,
  showEntityName = true,
  onEntityClick,
  onClick,
  compact = false,
}: AuditTimelineItemProps) {
  const t = useTranslations("audit");
  const tCategories = useTranslations("audit.categories");
  const tActions = useTranslations("audit.actions");
  const [isExpanded, setIsExpanded] = useState(false);

  const iconConfig = getIconConfig(entry.action, entry.category);
  const Icon = iconConfig.icon;

  const hasDetails =
    (entry.changes && Object.keys(entry.changes).length > 0) ||
    Object.keys(entry.metadata).length > 0;

  const isEntityClickable = onEntityClick && entry.entityType && entry.entityId;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "flex gap-3 p-3 rounded-lg border bg-card text-left w-full",
        onClick && "hover:bg-accent/50 transition-colors cursor-pointer",
      )}
    >
      {/* Icon circle */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          iconConfig.bg,
          iconConfig.text,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top row: category badge + entity name */}
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {showCategory && entry.category && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {tCategories(entry.category)}
            </Badge>
          )}
          {showEntityName && entry.entityName && (
            <span
              className={cn(
                "text-xs font-medium truncate max-w-[200px]",
                isEntityClickable &&
                  "text-primary hover:underline cursor-pointer",
              )}
              onClick={
                isEntityClickable
                  ? () => onEntityClick!(entry.entityType!, entry.entityId!)
                  : undefined
              }
            >
              {entry.entityName}
            </span>
          )}
        </div>

        {/* Description — locale-aware, generated from action + metadata */}
        {(() => {
          const description = formatAuditDescription(entry, tActions);
          return description ? (
            <p className="text-sm text-foreground leading-snug">
              {description}
            </p>
          ) : null;
        })()}

        {/* Meta row: user, time */}
        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
          {entry.userName && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {entry.userName}
            </span>
          )}
          {!entry.userName && entry.userId && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {t("entry.unknownUser")}
            </span>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(entry.createdAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">
                  {formatFullTimestamp(entry.createdAt)}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Expandable details — hidden in compact mode */}
        {!compact && hasDetails && (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {t("entry.viewDetails")}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 pl-1 border-l-2 border-muted ml-1">
              <div className="pl-3">
                <AuditChangesDetail
                  changes={entry.changes}
                  metadata={entry.metadata}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
});

// ==================== AuditTimeline ====================

export interface AuditTimelineProps {
  /** Audit entries to display */
  items: AuditEntry[];
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Error from data fetching */
  error?: Error;
  /** Whether filters are active (affects empty state messaging) */
  hasFilters?: boolean;
  /** Show category badge on each item */
  showCategory?: boolean;
  /** Show entity name on each item */
  showEntityName?: boolean;
  /** Callback when retry is requested */
  onRetry?: () => void;
  /** Callback when an entity reference is clicked */
  onEntityClick?: (entityType: string, entityId: string) => void;
  /** Additional class name */
  className?: string;
}

/**
 * Renders a scrollable list of audit entries with loading/empty/error states.
 */
export const AuditTimeline = memo(function AuditTimeline({
  items,
  isLoading,
  error,
  hasFilters = false,
  showCategory = true,
  showEntityName = true,
  onRetry,
  onEntityClick,
  className,
}: AuditTimelineProps) {
  const t = useTranslations("audit");

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-[200px] text-center",
          className,
        )}
      >
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground mb-4">{t("error")}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("retry")}
          </Button>
        )}
      </div>
    );
  }

  // Loading state
  if (isLoading && items.length === 0) {
    return (
      <div className={cn("p-4 space-y-3", className)}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="w-8 h-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-full max-w-[280px]" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-[200px] text-center",
          className,
        )}
      >
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <History className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-sm mb-1">
          {hasFilters ? t("noMatchingResults") : t("noHistory")}
        </h3>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          {hasFilters ? t("noMatchingResultsDesc") : t("noHistoryDesc")}
        </p>
      </div>
    );
  }

  // Timeline
  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="p-3 space-y-2">
        {items.map((entry) => (
          <AuditTimelineItem
            key={entry.id}
            entry={entry}
            showCategory={showCategory}
            showEntityName={showEntityName}
            onEntityClick={onEntityClick}
          />
        ))}
      </div>
    </ScrollArea>
  );
});

// ==================== Exports ====================

export {
  ACTION_ICON_OVERRIDES,
  CATEGORY_ICONS,
  formatChangeValue,
  formatFullTimestamp,
  formatRelativeTime,
  getIconConfig,
};
export type { IconConfig };
