"use client";

import {
  ChevronDown,
  Clock,
  Info,
  Library,
  Loader,
  Search,
  X,
} from "lucide-react";
import React, { memo, useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useDebouncedSearch } from "../hooks/use-debounced-search";
import type { Template } from "../types";
import {
  type ConversationWindowStatus,
  enrichTemplatesWithAvailability,
  formatTimeRemaining,
  type TemplateUnavailableReason,
  type TemplateWithAvailability,
} from "../utils";

// ============================================================================
// Types & Interfaces
// ============================================================================

interface TemplatesPanelProps {
  templates: Template[];
  templatesLoading: boolean;
  onApplyTemplate: (template: Template) => void;
  t: (key: string) => string;
  /**
   * Conversation window status - determines template availability
   * If not provided, all templates are treated as available (for backwards compatibility)
   */
  conversationWindow?: ConversationWindowStatus;
  /**
   * Customer's preferred language code (e.g., "en", "es")
   * Used to determine which locale to check for approval status
   */
  customerLanguage?: string;
  /**
   * Default collapsed state
   * @default false
   */
  defaultCollapsed?: boolean;
}

interface TemplateButtonProps {
  template: TemplateWithAvailability;
  onClick: (template: Template) => void;
  t: (key: string) => string;
}

interface TemplateSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder: string;
  isPending?: boolean;
}

interface TemplateGridProps {
  templates: TemplateWithAvailability[];
  onApplyTemplate: (template: Template) => void;
  t: (key: string) => string;
}

// ============================================================================
// Constants
// ============================================================================

const SEARCH_DEBOUNCE_DELAY = 150;
const COLLAPSED_STATE_KEY = "templates-panel-collapsed";

// ============================================================================
// Subcomponents (Memoized for performance)
// ============================================================================

/**
 * Returns the translation key for an unavailable reason
 */
function getUnavailableReasonKey(reason: TemplateUnavailableReason): string {
  switch (reason) {
    case "not_approved":
      return "templateNotApproved";
    case "no_matching_locale":
      return "templateNoMatchingLocale";
    default:
      return "templateNotApproved";
  }
}

/**
 * Individual template button - memoized to prevent re-renders when search changes
 * Handles both available and unavailable states with tooltips
 */
const TemplateButton = memo(function TemplateButton({
  template,
  onClick,
  t,
}: TemplateButtonProps) {
  const { availability } = template;
  const isAvailable = availability.isAvailable;

  const handleClick = useCallback(() => {
    if (isAvailable) {
      onClick(template);
    }
  }, [template, onClick, isAvailable]);

  const displayName = template.displayName || template.name;
  const isLibraryTemplate = template.source === "library";

  // If available, render a simple button
  if (isAvailable) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        className="text-left justify-start h-auto py-1 px-2 text-xs gap-1"
      >
        {isLibraryTemplate && (
          <Library className="h-3 w-3 flex-shrink-0 text-blue-500" />
        )}
        <span className="truncate">{displayName}</span>
      </Button>
    );
  }

  // If unavailable, render with tooltip explaining why
  const tooltipKey = availability.unavailableReason
    ? getUnavailableReasonKey(availability.unavailableReason)
    : "templateNotApproved";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled
            className="text-left justify-start h-auto py-1 px-2 text-xs opacity-50 cursor-not-allowed gap-1"
          >
            {isLibraryTemplate && (
              <Library className="h-3 w-3 flex-shrink-0 text-blue-500" />
            )}
            <span className="truncate">{displayName}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" />
            <span className="text-xs">{t(tooltipKey)}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

/**
 * Search input with clear button - isolated to prevent parent re-renders
 */
const TemplateSearchInput = memo(function TemplateSearchInput({
  value,
  onChange,
  onClear,
  placeholder,
  isPending,
}: TemplateSearchInputProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <div className="relative">
      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        className="h-7 text-xs pl-7 pr-7"
        value={value}
        onChange={handleChange}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          {isPending ? (
            <Loader className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
        </button>
      )}
    </div>
  );
});

/**
 * Grid of template buttons - memoized with stable template list
 * Sorts templates to show available ones first
 */
const TemplateGrid = memo(function TemplateGrid({
  templates,
  onApplyTemplate,
  t,
}: TemplateGridProps) {
  // Sort templates: available first, then unavailable
  const sortedTemplates = useMemo(() => {
    return [...templates].sort((a, b) => {
      if (a.availability.isAvailable === b.availability.isAvailable) {
        // Same availability - sort alphabetically
        const nameA = a.displayName || a.name;
        const nameB = b.displayName || b.name;
        return nameA.localeCompare(nameB);
      }
      // Available templates come first
      return a.availability.isAvailable ? -1 : 1;
    });
  }, [templates]);

  return (
    <div className="grid grid-cols-2 gap-1 overflow-y-auto">
      {sortedTemplates.map((template) => (
        <TemplateButton
          key={template.id}
          template={template}
          onClick={onApplyTemplate}
          t={t}
        />
      ))}
    </div>
  );
});

/**
 * Loading state indicator
 */
const LoadingState = memo(function LoadingState() {
  return (
    <div className="flex items-center justify-center py-2">
      <Loader className="h-4 w-4 animate-spin" />
    </div>
  );
});

/**
 * Empty state when no templates match search
 */
const EmptySearchState = memo(function EmptySearchState() {
  return (
    <p className="text-xs text-muted-foreground py-1">
      No templates match your search.
    </p>
  );
});

/**
 * Empty state when no templates available
 */
const NoTemplatesState = memo(function NoTemplatesState({
  message,
}: {
  message: string;
}) {
  return <p className="text-xs text-muted-foreground py-1">{message}</p>;
});

/**
 * Window status indicator showing time remaining
 */
const WindowStatusIndicator = memo(function WindowStatusIndicator({
  conversationWindow,
  t,
}: {
  conversationWindow: ConversationWindowStatus;
  t: (key: string) => string;
}) {
  if (conversationWindow.isWithinWindow) {
    const timeRemaining = formatTimeRemaining(
      conversationWindow.timeRemainingMs,
    );
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Clock className="h-3 w-3" />
              <span>{timeRemaining}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <span className="text-xs">{t("conversationWindowActive")}</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <Info className="h-3 w-3" />
            <span>{t("approvedOnly")}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <span className="text-xs">{t("conversationWindowExpired")}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Filter templates by search query
 * Uses case-insensitive matching on displayName or name
 */
function filterTemplates<T extends Template>(
  templates: T[],
  query: string,
): T[] {
  if (!query.trim()) {
    return templates;
  }

  const normalizedQuery = query.toLowerCase().trim();

  return templates.filter((template) => {
    const nameToSearch = (template.displayName || template.name).toLowerCase();
    return nameToSearch.includes(normalizedQuery);
  });
}

/**
 * Get initial collapsed state from localStorage (with SSR safety)
 */
function getInitialCollapsedState(defaultValue: boolean): boolean {
  if (typeof window === "undefined") {
    return defaultValue;
  }

  try {
    const stored = localStorage.getItem(COLLAPSED_STATE_KEY);
    return stored !== null ? stored === "true" : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Persist collapsed state to localStorage
 */
function persistCollapsedState(collapsed: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(COLLAPSED_STATE_KEY, String(collapsed));
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Templates Panel Component
 *
 * A collapsible panel that displays available message templates with search functionality.
 *
 * Performance Optimizations:
 * - Debounced search to prevent excessive re-renders during typing
 * - Memoized subcomponents to isolate re-renders
 * - useMemo for filtered results
 * - React.memo on all leaf components
 *
 * Features:
 * - Collapsible section with animation
 * - Persistent collapsed state via localStorage
 * - Search with clear button
 * - Loading, empty, and no-results states
 * - 24-hour conversation window awareness
 * - Template availability indicators with tooltips
 */
export const TemplatesPanel = memo(function TemplatesPanel({
  templates,
  templatesLoading,
  onApplyTemplate,
  t,
  conversationWindow,
  customerLanguage,
  defaultCollapsed = false,
}: TemplatesPanelProps) {
  // Collapsed state with localStorage persistence
  const [isCollapsed, setIsCollapsed] = useState(() =>
    getInitialCollapsedState(defaultCollapsed),
  );

  // Debounced search for performance
  const {
    inputValue: searchInputValue,
    debouncedQuery: searchQuery,
    isPending: isSearchPending,
    handleInputChange: handleSearchChange,
    clearSearch,
  } = useDebouncedSearch({ delay: SEARCH_DEBOUNCE_DELAY });

  // Handle collapse toggle with persistence
  const handleCollapsedChange = useCallback((open: boolean) => {
    const collapsed = !open;
    setIsCollapsed(collapsed);
    persistCollapsedState(collapsed);
  }, []);

  // Create default window status if not provided (backwards compatibility)
  const effectiveWindowStatus: ConversationWindowStatus = useMemo(
    () =>
      conversationWindow ?? {
        isWithinWindow: true, // Default to within window so all templates are available
        lastInboundMessageTime: null,
        windowExpiresAt: null,
        timeRemainingMs: 0,
      },
    [conversationWindow],
  );

  // Enrich templates with availability information
  const enrichedTemplates = useMemo(
    () =>
      enrichTemplatesWithAvailability(
        templates,
        effectiveWindowStatus,
        customerLanguage,
      ),
    [templates, effectiveWindowStatus, customerLanguage],
  );

  // Memoized filtered templates - only recomputes when templates or query changes
  const filteredTemplates = useMemo(
    () => filterTemplates(enrichedTemplates, searchQuery),
    [enrichedTemplates, searchQuery],
  );

  // Count available templates for display
  const availableCount = useMemo(
    () => enrichedTemplates.filter((t) => t.availability.isAvailable).length,
    [enrichedTemplates],
  );

  // Determine content to render
  const hasTemplates = Array.isArray(templates) && templates.length > 0;
  const hasFilteredTemplates =
    Array.isArray(filteredTemplates) && filteredTemplates.length > 0;
  const isSearchActive = searchQuery.trim().length > 0;

  // Template count for header
  const templateCount = templatesLoading ? "..." : templates.length;
  const showWindowStatus = conversationWindow !== undefined && hasTemplates;

  return (
    <div className="border-t bg-muted/30 flex-shrink-0">
      <Collapsible open={!isCollapsed} onOpenChange={handleCollapsedChange}>
        {/* Header with toggle */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                {t("availableTemplates")} ({availableCount}/{templateCount})
              </span>
              {showWindowStatus && (
                <WindowStatusIndicator
                  conversationWindow={effectiveWindowStatus}
                  t={t}
                />
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !isCollapsed && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>

        {/* Collapsible content */}
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div
            className="px-3 pb-3 flex flex-col"
            style={{ maxHeight: "140px" }}
          >
            {/* Search input - always visible when content is expanded */}
            {hasTemplates && (
              <div className="mb-2 flex-shrink-0">
                <TemplateSearchInput
                  value={searchInputValue}
                  onChange={handleSearchChange}
                  onClear={clearSearch}
                  placeholder={t("searchTemplates")}
                  isPending={isSearchPending}
                />
              </div>
            )}

            {/* Content based on state */}
            {templatesLoading ? (
              <LoadingState />
            ) : hasFilteredTemplates ? (
              <TemplateGrid
                templates={filteredTemplates}
                onApplyTemplate={onApplyTemplate}
                t={t}
              />
            ) : isSearchActive ? (
              <EmptySearchState />
            ) : (
              <NoTemplatesState message={t("noTemplatesAvailable")} />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

// Default export for backwards compatibility
export default TemplatesPanel;
