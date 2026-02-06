/**
 * DateRangeFilter Component
 *
 * A reusable date range picker component for filtering data by date.
 * Can be used across different parts of the application:
 * - Activity logs filtering
 * - Chat history filtering
 * - Report date ranges
 * - Analytics dashboards
 *
 * Features:
 * - Start and end date selection
 * - Preset quick filters (Today, Last 7 days, etc.)
 * - Clear/reset functionality
 * - Accessible keyboard navigation
 * - Mobile-friendly design
 */

"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  endOfDay,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useMemo, useState } from "react";

export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

export interface DateRangePreset {
  id: string;
  label: string;
  getValue: () => DateRange;
}

export interface DateRangeFilterProps {
  /** Current date range value */
  value: DateRange;
  /** Callback when date range changes */
  onChange: (range: DateRange) => void;
  /** Optional class name for styling */
  className?: string;
  /** Whether the filter is disabled */
  disabled?: boolean;
  /** Placeholder text when no dates selected */
  placeholder?: string;
  /** Whether to show preset quick filters */
  showPresets?: boolean;
  /** Custom presets (will replace defaults if provided) */
  customPresets?: DateRangePreset[];
  /** Minimum selectable date */
  minDate?: Date;
  /** Maximum selectable date (defaults to today) */
  maxDate?: Date;
  /** Whether to show the clear button */
  showClear?: boolean;
  /** Compact mode - smaller button size */
  compact?: boolean;
}

/**
 * Get default date range presets
 */
function getDefaultPresets(
  t: ReturnType<typeof useTranslations>,
): DateRangePreset[] {
  return [
    {
      id: "today",
      label: t("today"),
      getValue: () => ({
        startDate: startOfDay(new Date()),
        endDate: endOfDay(new Date()),
      }),
    },
    {
      id: "yesterday",
      label: t("yesterday"),
      getValue: () => {
        const yesterday = subDays(new Date(), 1);
        return {
          startDate: startOfDay(yesterday),
          endDate: endOfDay(yesterday),
        };
      },
    },
    {
      id: "last7days",
      label: t("last7Days"),
      getValue: () => ({
        startDate: startOfDay(subDays(new Date(), 6)),
        endDate: endOfDay(new Date()),
      }),
    },
    {
      id: "last30days",
      label: t("last30Days"),
      getValue: () => ({
        startDate: startOfDay(subDays(new Date(), 29)),
        endDate: endOfDay(new Date()),
      }),
    },
    {
      id: "thisWeek",
      label: t("thisWeek"),
      getValue: () => ({
        startDate: startOfWeek(new Date(), { weekStartsOn: 1 }),
        endDate: endOfDay(new Date()),
      }),
    },
    {
      id: "thisMonth",
      label: t("thisMonth"),
      getValue: () => ({
        startDate: startOfMonth(new Date()),
        endDate: endOfDay(new Date()),
      }),
    },
  ];
}

/**
 * Format date range for display
 */
function formatDateRange(range: DateRange, placeholder: string): string {
  if (!range.startDate && !range.endDate) {
    return placeholder;
  }

  const formatStr = "MMM d, yyyy";

  if (range.startDate && range.endDate) {
    // Same day
    if (range.startDate.toDateString() === range.endDate.toDateString()) {
      return format(range.startDate, formatStr);
    }
    return `${format(range.startDate, formatStr)} - ${format(range.endDate, formatStr)}`;
  }

  if (range.startDate) {
    return `From ${format(range.startDate, formatStr)}`;
  }

  if (range.endDate) {
    return `Until ${format(range.endDate, formatStr)}`;
  }

  return placeholder;
}

/**
 * DateRangeFilter - Reusable date range picker with presets
 */
export const DateRangeFilter = memo(function DateRangeFilter({
  value,
  onChange,
  className,
  disabled = false,
  placeholder,
  showPresets = true,
  customPresets,
  minDate,
  maxDate = new Date(),
  showClear = true,
  compact = false,
}: DateRangeFilterProps) {
  const t = useTranslations("dateFilter");
  const [isOpen, setIsOpen] = useState(false);

  // Placeholder text
  const placeholderText = placeholder || t("selectDateRange");

  // Use custom presets or default ones
  const presets = useMemo(
    () => customPresets || getDefaultPresets(t),
    [customPresets, t],
  );

  // Check if a date range is currently active
  const hasValue = value.startDate !== null || value.endDate !== null;

  // Handle preset selection
  const handlePresetClick = useCallback(
    (preset: DateRangePreset) => {
      const range = preset.getValue();
      onChange(range);
      setIsOpen(false);
    },
    [onChange],
  );

  // Handle clear
  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange({ startDate: null, endDate: null });
    },
    [onChange],
  );

  // Handle popover open change
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  // Display text for button
  const displayText = formatDateRange(value, placeholderText);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size={compact ? "sm" : "default"}
            disabled={disabled}
            className={cn(
              "justify-start text-left font-normal",
              !hasValue && "text-muted-foreground",
              compact ? "h-8 px-2 text-xs" : "min-w-[200px]",
            )}
          >
            <CalendarIcon
              className={cn("mr-2", compact ? "h-3 w-3" : "h-4 w-4")}
            />
            <span className="truncate">{displayText}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="start" side="bottom">
          <div className="flex flex-col sm:flex-row">
            {/* Presets sidebar */}
            {showPresets && presets.length > 0 && (
              <div className="border-b sm:border-b-0 sm:border-r p-2 space-y-1 min-w-[140px]">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                  {t("quickSelect")}
                </p>
                {presets.map((preset) => (
                  <Button
                    key={preset.id}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs h-8"
                    onClick={() => handlePresetClick(preset)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            )}

            {/* Calendar */}
            <div className="p-3">
              {/* Selection instruction */}
              <p className="text-xs text-muted-foreground text-center mb-2">
                {value.startDate && !value.endDate
                  ? t("selectEndDate")
                  : t("selectStartDate")}
              </p>

              <Calendar
                mode="range"
                selected={
                  value.startDate && value.endDate
                    ? { from: value.startDate, to: value.endDate }
                    : value.startDate
                      ? { from: value.startDate, to: value.startDate }
                      : undefined
                }
                onSelect={(range) => {
                  if (!range) return;
                  // Handle range selection
                  if ("from" in range && range.from) {
                    if (
                      range.to &&
                      range.to.getTime() !== range.from.getTime()
                    ) {
                      // Full range selected
                      onChange({
                        startDate: startOfDay(range.from),
                        endDate: endOfDay(range.to),
                      });
                      setIsOpen(false);
                    } else {
                      // Only start date selected
                      onChange({
                        startDate: startOfDay(range.from),
                        endDate: null,
                      });
                    }
                  }
                }}
                disabled={(date: Date) => {
                  if (minDate && date < minDate) return true;
                  if (maxDate && date > maxDate) return true;
                  return false;
                }}
                numberOfMonths={1}
                initialFocus
              />

              {/* Current selection display */}
              {hasValue && (
                <div className="mt-2 pt-2 border-t flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {formatDateRange(value, "")}
                  </span>
                  {showClear && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={handleClear}
                    >
                      {t("clear")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear button outside popover */}
      {showClear && hasValue && !compact && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleClear}
          disabled={disabled}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">{t("clearDateRange")}</span>
        </Button>
      )}
    </div>
  );
});

export default DateRangeFilter;
