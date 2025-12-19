"use client";

import { ChevronDown, Loader, Search, X } from "lucide-react";
import React, { memo, useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useDebouncedSearch } from "../hooks/use-debounced-search";
import type { Template } from "../types";

// ============================================================================
// Types & Interfaces
// ============================================================================

interface TemplatesPanelProps {
  templates: Template[];
  templatesLoading: boolean;
  onApplyTemplate: (template: Template) => void;
  t: (key: string) => string;
  /**
   * Default collapsed state
   * @default false
   */
  defaultCollapsed?: boolean;
}

interface TemplateButtonProps {
  template: Template;
  onClick: (template: Template) => void;
}

interface TemplateSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder: string;
  isPending?: boolean;
}

interface TemplateGridProps {
  templates: Template[];
  onApplyTemplate: (template: Template) => void;
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
 * Individual template button - memoized to prevent re-renders when search changes
 */
const TemplateButton = memo(function TemplateButton({
  template,
  onClick,
}: TemplateButtonProps) {
  const handleClick = useCallback(() => {
    onClick(template);
  }, [template, onClick]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      className="text-left justify-start h-auto py-1 px-2 text-xs"
    >
      <span className="truncate">{template.displayName || template.name}</span>
    </Button>
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
    [onChange]
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
 */
const TemplateGrid = memo(function TemplateGrid({
  templates,
  onApplyTemplate,
}: TemplateGridProps) {
  return (
    <div className="grid grid-cols-2 gap-1 overflow-y-auto">
      {templates.map((template) => (
        <TemplateButton
          key={template.id}
          template={template}
          onClick={onApplyTemplate}
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

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Filter templates by search query
 * Uses case-insensitive matching on displayName or name
 */
function filterTemplates(templates: Template[], query: string): Template[] {
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
 */
export const TemplatesPanel = memo(function TemplatesPanel({
  templates,
  templatesLoading,
  onApplyTemplate,
  t,
  defaultCollapsed = false,
}: TemplatesPanelProps) {
  // Collapsed state with localStorage persistence
  const [isCollapsed, setIsCollapsed] = useState(() =>
    getInitialCollapsedState(defaultCollapsed)
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

  // Memoized filtered templates - only recomputes when templates or query changes
  const filteredTemplates = useMemo(
    () => filterTemplates(templates, searchQuery),
    [templates, searchQuery]
  );

  // Determine content to render
  const hasTemplates = Array.isArray(templates) && templates.length > 0;
  const hasFilteredTemplates =
    Array.isArray(filteredTemplates) && filteredTemplates.length > 0;
  const isSearchActive = searchQuery.trim().length > 0;

  // Template count for header
  const templateCount = templatesLoading ? "..." : templates.length;

  return (
    <div className="border-t bg-muted/30 flex-shrink-0">
      <Collapsible open={!isCollapsed} onOpenChange={handleCollapsedChange}>
        {/* Header with toggle */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {t("availableTemplates")} ({templateCount})
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                !isCollapsed && "rotate-180"
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
