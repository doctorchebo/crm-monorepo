"use client";

import { TemplateStatusBadge } from "@/components/templates/template-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TemplateApprovalStatusValue } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  Eye,
  EyeOff,
  Loader2,
  MoreVertical,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Locale data structure for template cards
 */
export interface TemplateLocaleData {
  id: string;
  locale: string;
  body: string;
  header?: string;
  footer?: string;
  category?: string;
  approvalStatus?: TemplateApprovalStatusValue;
  qualityRating?: "high" | "medium" | "low" | null;
  rejectionReason?: string | null;
  metaTemplateId?: string | null;
  isVisible?: boolean;
}

/**
 * Template data structure for the card
 */
export interface TemplateCardData {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  isVisible: boolean;
  isActive: boolean;
  locales?: TemplateLocaleData[];
  platforms?: Array<{
    platformName: string;
    isEnabled: boolean;
  }>;
}

/**
 * Props for the TemplateCard component
 */
interface TemplateCardProps {
  /** Template data */
  template: TemplateCardData;
  /** Click handler for card (called when clicking header, not carousel items) */
  onClick?: () => void;
  /** Handler for locale-specific click (when clicking a carousel item) */
  onLocaleClick?: (locale: TemplateLocaleData) => void;
  /** Handler for delete action */
  onDelete?: () => void;
  /** Handler for sync status action */
  onSyncStatus?: (locale: TemplateLocaleData) => void;
  /** Whether sync is in progress for this template */
  isSyncing?: boolean;
  /** Whether to check if sync is available for a locale */
  canSyncStatus?: (locale: TemplateLocaleData) => boolean;
  /** Whether the card is in selectable mode (shows space for selection checkbox) */
  isSelectable?: boolean;
}

/**
 * Locale display names mapping
 */
const LOCALE_DISPLAY_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ar: "Arabic",
  hi: "Hindi",
  tr: "Turkish",
};

/**
 * Get display name for a locale code
 */
function getLocaleDisplayName(locale: string): string {
  return LOCALE_DISPLAY_NAMES[locale] || locale.toUpperCase();
}

/**
 * Truncate text to a maximum length with ellipsis
 */
function truncateText(text: string, maxLength: number = 80): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Get platform badges for display
 */
function getPlatformBadges(
  platforms?: Array<{ platformName: string; isEnabled: boolean }>,
): string[] {
  if (!platforms) return ["WhatsApp"];
  return platforms.filter((p) => p.isEnabled).map((p) => p.platformName);
}

/**
 * Single locale slide content
 */
function LocaleSlide({
  locale,
  template,
  t,
}: {
  locale: TemplateLocaleData;
  template: TemplateCardData;
  t: ReturnType<typeof useTranslations>;
}) {
  const status = locale.approvalStatus || "draft";
  // Use locale-specific visibility if available, otherwise fall back to template visibility
  const isVisible = locale.isVisible ?? template.isVisible;

  return (
    <div className="space-y-2">
      {/* Locale header with status and visibility */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            {getLocaleDisplayName(locale.locale)}
          </span>
          <span className="text-xs text-muted-foreground">
            ({locale.locale.toUpperCase()})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Approval Status Badge */}
          <TemplateStatusBadge
            status={status}
            qualityRating={locale.qualityRating ?? undefined}
            showQuality={status === "approved"}
          />
          {/* Visibility indicator */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs",
                    isVisible
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                  )}
                >
                  {isVisible ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {isVisible
                    ? t("visible") || "Visible"
                    : t("hidden") || "Hidden"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Body preview */}
      <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md border border-blue-100 dark:border-blue-900">
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
          {truncateText(locale.body, 100)}
        </p>
      </div>

      {/* Category badge */}
      {locale.category && (
        <div className="flex gap-1 flex-wrap">
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded capitalize",
              locale.category === "marketing"
                ? "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300"
                : locale.category === "authentication"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                  : "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
            )}
          >
            {t(`categories.${locale.category}`) || locale.category}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Template Card Component with Locale Carousel
 *
 * Displays a template card with a carousel for switching between locales.
 * Each locale shows its own approval status, visibility, body content, and category.
 */
export function TemplateCard({
  template,
  onClick,
  onLocaleClick,
  onDelete,
  onSyncStatus,
  isSyncing,
  canSyncStatus,
  isSelectable = false,
}: TemplateCardProps) {
  const t = useTranslations("templates");
  const tCommon = useTranslations("common");
  // Track active slide index to know which locale is currently visible
  const [activeIndex, setActiveIndex] = useState(0);

  const locales = template.locales || [];
  const hasMultipleLocales = locales.length > 1;

  // Determine the currently active locale based on carousel index
  const activeLocale = locales[activeIndex];

  // Check if the ACTIVE locale is syncable (has metaTemplateId)
  // This ensures we sync the status of the locale the user is actually looking at
  const isSyncable = activeLocale && canSyncStatus?.(activeLocale);

  // Handle click on a locale slide
  const handleLocaleClick = (
    e: React.MouseEvent,
    locale: TemplateLocaleData,
  ) => {
    e.stopPropagation();
    if (onLocaleClick) {
      onLocaleClick(locale);
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <Card
      className="p-4 hover:shadow-lg transition-shadow group relative cursor-pointer"
      onClick={onClick}
    >
      {/* Template Header */}
      <div className="mb-3">
        <div
          className={cn(
            "flex items-start justify-between mb-2 pr-8",
            isSelectable && "pl-6",
          )}
        >
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">
              {template.displayName || template.name}
            </h3>
            {template.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {template.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Locale Carousel */}
      {locales.length > 0 ? (
        <Carousel className="mb-3" onIndexChange={setActiveIndex}>
          <CarouselContent>
            {locales.map((locale) => (
              <CarouselItem key={locale.id}>
                <div
                  onClick={(e) => handleLocaleClick(e, locale)}
                  className="cursor-pointer"
                >
                  <LocaleSlide locale={locale} template={template} t={t} />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          {hasMultipleLocales && (
            <>
              <CarouselPrevious className="left-0 opacity-0 group-hover:opacity-100" />
              <CarouselNext className="right-0 opacity-0 group-hover:opacity-100" />
              <CarouselDots className="mt-2" />
            </>
          )}
        </Carousel>
      ) : (
        <div className="text-sm text-muted-foreground italic mb-3">
          {t("noLocales") || "No locales configured"}
        </div>
      )}

      {/* Footer: Platforms */}
      <div className="flex gap-1 flex-wrap">
        {getPlatformBadges(template.platforms).map((platform) => (
          <span
            key={platform}
            className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded"
          >
            {platform}
          </span>
        ))}
      </div>

      {/* Hover Options */}
      <div
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-muted"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Sync Status option - Only for currently visible locale */}
            {isSyncable && onSyncStatus && activeLocale && (
              <DropdownMenuItem
                onClick={() => onSyncStatus(activeLocale)}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t("syncSingleStatus") || "Refresh Status"}
                {/* Show locale name in tooltip or label to be clear */}
                <span className="ml-2 text-xs text-muted-foreground uppercase bg-muted px-1 rounded">
                  {activeLocale.locale}
                </span>
              </DropdownMenuItem>
            )}

            {/* Add separator only if sync option exists */}
            {isSyncable && onSyncStatus && <DropdownMenuSeparator />}

            {/* Delete option */}
            <DropdownMenuItem onClick={onDelete} className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              {tCommon("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

export default TemplateCard;
