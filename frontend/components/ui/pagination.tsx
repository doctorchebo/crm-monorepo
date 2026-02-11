"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export interface PaginationProps {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Called when page changes */
  /** Called when page changes */
  onPageChange: (page: number) => void;
  /** Current page size */
  pageSize?: number;
  /** Called when page size changes */
  onPageSizeChange?: (size: number) => void;
  /** Available page size options */
  pageSizeOptions?: number[];
  /** Optional translations */
  translations?: {
    page?: string; // e.g., "Page {current} of {total}"
    previous?: string;
    next?: string;
    first?: string;
    last?: string;
    rowsPerPage?: string;
  };
  /** Whether to show compact version (just buttons, no text) */
  compact?: boolean;
  /** Optional className for styling */
  className?: string;
}

/**
 * Reusable Pagination component
 * Displays page indicator, navigation buttons, and optional page size selector
 * Ensures page numbers are handled safely as numbers
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  translations,
  compact = false,
  className = "",
}: PaginationProps) {
  // Ensure inputs are numbers to prevent string concatenation bugs
  const currentPage = Number(page);
  const total = Number(totalPages);

  // If there's no data and not on first page, strictly we might want to return null but
  // usually we want to show controls if there are pages.
  // Here we hide if total pages is 0 or 1 AND no page size selector is needed.
  // But if onPageSizeChange is provided, we might still want to show the selector even if 1 page.
  if (total <= 1 && !onPageSizeChange) {
    return null;
  }

  const pageText =
    translations?.page
      ?.replace("{current}", String(currentPage))
      ?.replace("{total}", String(total)) || `Page ${currentPage} of ${total}`;

  const previousText = translations?.previous || "Previous";
  const nextText = translations?.next || "Next";
  const rowsPerPageText = translations?.rowsPerPage || "Rows per page";

  // Accessible labels for icon-only buttons
  const firstLabel = translations?.first || "First page";
  const lastLabel = translations?.last || "Last page";

  return (
    <div
      className={`flex flex-col sm:flex-row items-center gap-4 ${compact ? "justify-center" : "justify-between"} ${className}`}
    >
      {/* Page Size Selector - shown in both compact and non-compact modes */}
      {onPageSizeChange && pageSize && (
        <div className="flex items-center space-x-2 text-sm text-muted-foreground order-2 sm:order-1">
          <span>{rowsPerPageText}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={String(pageSize)} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Navigation Controls */}
      <div
        className={`flex items-center gap-2 lg:gap-6 order-1 sm:order-2 w-full sm:w-auto ${compact ? "justify-center" : "justify-between sm:justify-end"}`}
      >
        {!compact && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {pageText}
          </span>
        )}
        <div className="flex items-center gap-2">
          {/* First Page Button */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 hidden sm:flex"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(1)}
            title={firstLabel}
          >
            <ChevronsLeft className="h-4 w-4" />
            <span className="sr-only">{firstLabel}</span>
          </Button>

          {/* Previous Page Button */}
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            {compact ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {previousText}
              </>
            )}
          </Button>

          {compact && (
            <span className="text-sm text-muted-foreground min-w-[80px] text-center">
              {pageText}
            </span>
          )}

          {/* Next Page Button */}
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= total}
            onClick={() => onPageChange(currentPage + 1)}
          >
            {compact ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                {nextText}
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>

          {/* Last Page Button */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 hidden sm:flex"
            disabled={currentPage >= total}
            onClick={() => onPageChange(total)}
            title={lastLabel}
          >
            <ChevronsRight className="h-4 w-4" />
            <span className="sr-only">{lastLabel}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
