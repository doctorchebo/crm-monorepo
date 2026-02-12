/**
 * Audit Filters Component
 *
 * A toolbar that provides comprehensive filtering for audit history:
 * - Category multi-select (dropdown with checkboxes)
 * - Team member select (admin/owner only)
 * - Date range picker (reusing existing DateRangeFilter)
 * - Search input with debounce
 * - Active filter indicator + clear all
 *
 * Designed to be used with the useAuditHistory hook.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DateRange, DateRangeFilter } from "@/components/ui/date-range-filter";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AuditDateRange,
  AuditHistoryFilters,
} from "@/hooks/use-audit-history";
import type { AuditCategory, AuditTeamMember } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Check, Filter, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useRef, useState } from "react";

// ==================== Constants ====================

const ALL_CATEGORIES: AuditCategory[] = [
  "pipeline",
  "contacts",
  "templates",
  "team",
  "catalog",
  "senders",
  "labels",
  "knowledge_base",
  "import",
  "settings",
  "auth",
];

// ==================== Sub-components ====================

interface CategoryMultiSelectProps {
  selected: AuditCategory[];
  onChange: (categories: AuditCategory[]) => void;
  disabled?: boolean;
}

const CategoryMultiSelect = memo(function CategoryMultiSelect({
  selected,
  onChange,
  disabled,
}: CategoryMultiSelectProps) {
  const t = useTranslations("audit");
  const tCategories = useTranslations("audit.categories");
  const [open, setOpen] = useState(false);

  const toggleCategory = useCallback(
    (category: AuditCategory) => {
      const isSelected = selected.includes(category);
      if (isSelected) {
        onChange(selected.filter((c) => c !== category));
      } else {
        onChange([...selected, category]);
      }
    },
    [selected, onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-8 text-xs gap-1.5",
            selected.length > 0 && "border-primary",
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          {t("filters.categories")}
          {selected.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-4 px-1 text-[10px] rounded-full"
            >
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("filters.category")} className="h-9" />
          <CommandList>
            <CommandEmpty>No categories found.</CommandEmpty>
            <CommandGroup>
              {ALL_CATEGORIES.map((category) => {
                const isSelected = selected.includes(category);
                return (
                  <CommandItem
                    key={category}
                    value={category}
                    onSelect={() => toggleCategory(category)}
                    className="cursor-pointer"
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    {tCategories(category)}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});

interface TeamMemberSelectProps {
  members: AuditTeamMember[];
  selectedUserId: number | undefined;
  onChange: (userId: number | undefined) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

const TeamMemberSelect = memo(function TeamMemberSelect({
  members,
  selectedUserId,
  onChange,
  isLoading,
  disabled,
}: TeamMemberSelectProps) {
  const t = useTranslations("audit.filters");

  if (isLoading || members.length === 0) return null;

  return (
    <Select
      value={selectedUserId !== undefined ? String(selectedUserId) : "all"}
      onValueChange={(value) =>
        onChange(value === "all" ? undefined : Number(value))
      }
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "h-8 text-xs w-[180px]",
          selectedUserId !== undefined && "border-primary",
        )}
      >
        <SelectValue placeholder={t("teamMember")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("allMembers")}</SelectItem>
        {members.map((member) => (
          <SelectItem key={member.id} value={String(member.id)}>
            <span className="truncate">{member.name}</span>
            <span className="text-muted-foreground ml-1 text-[10px]">
              ({member.role})
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});

// ==================== Main Component ====================

export interface AuditFiltersProps {
  /** Current filters state */
  filters: AuditHistoryFilters;
  /** Callback to set categories */
  onCategoriesChange: (categories: AuditCategory[]) => void;
  /** Callback to set team member filter */
  onUserIdChange: (userId: number | undefined) => void;
  /** Callback to set date range */
  onDateRangeChange: (range: AuditDateRange) => void;
  /** Callback to set search text */
  onSearchChange: (search: string) => void;
  /** Callback to clear all filters */
  onClearAll: () => void;
  /** Team members for the filter dropdown */
  teamMembers?: AuditTeamMember[];
  /** Whether team members are loading */
  teamMembersLoading?: boolean;
  /** Whether the entire filter bar is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
  /** Layout direction */
  layout?: "horizontal" | "vertical";
}

export const AuditFilters = memo(function AuditFilters({
  filters,
  onCategoriesChange,
  onUserIdChange,
  onDateRangeChange,
  onSearchChange,
  onClearAll,
  teamMembers = [],
  teamMembersLoading = false,
  disabled = false,
  className,
  layout = "horizontal",
}: AuditFiltersProps) {
  const t = useTranslations("audit");

  // Debounced search
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync external filter changes
  useEffect(() => {
    setSearchInput(filters.search ?? "");
  }, [filters.search]);

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchInput(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchChange(value);
      }, 400);
    },
    [onSearchChange],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Count active filters
  const activeFilterCount =
    (filters.categories?.length ? 1 : 0) +
    (filters.userId !== undefined ? 1 : 0) +
    (filters.dateRange?.startDate || filters.dateRange?.endDate ? 1 : 0) +
    (filters.search ? 1 : 0);

  // Convert hook date range to component date range
  const dateRangeValue: DateRange = {
    startDate: filters.dateRange?.startDate ?? null,
    endDate: filters.dateRange?.endDate ?? null,
  };

  const isVertical = layout === "vertical";

  return (
    <div
      className={cn(
        "flex gap-2",
        isVertical ? "flex-col" : "flex-wrap items-center",
        className,
      )}
    >
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder={t("searchPlaceholder")}
          disabled={disabled}
          className="h-8 text-xs pl-8 w-[200px]"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => handleSearchInput("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Category multi-select */}
      <CategoryMultiSelect
        selected={filters.categories ?? []}
        onChange={onCategoriesChange}
        disabled={disabled}
      />

      {/* Team member */}
      <TeamMemberSelect
        members={teamMembers}
        selectedUserId={filters.userId}
        onChange={onUserIdChange}
        isLoading={teamMembersLoading}
        disabled={disabled}
      />

      {/* Date range */}
      <DateRangeFilter
        value={dateRangeValue}
        onChange={(range) =>
          onDateRangeChange({
            startDate: range.startDate,
            endDate: range.endDate,
          })
        }
        compact
        showPresets
        disabled={disabled}
      />

      {/* Active filter count + Clear all */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {t("filters.activeFilters", { count: activeFilterCount })}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
            onClick={onClearAll}
            disabled={disabled}
          >
            <X className="h-3 w-3 mr-1" />
            {t("filters.clearAll")}
          </Button>
        </div>
      )}
    </div>
  );
});

export default AuditFilters;
