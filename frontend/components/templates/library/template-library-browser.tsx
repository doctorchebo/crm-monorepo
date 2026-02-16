"use client";

import { AdoptTemplateModal } from "@/components/templates/library/adopt-template-modal";
import { LibraryTemplateCard } from "@/components/templates/library/library-template-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotification } from "@/hooks/use-notification";
import type {
  AdoptTemplateResult,
  TemplateLibraryBrowseResult,
  TemplateLibraryFilterOptions,
  TemplateLibraryFilters,
  TemplateLibraryTemplateWithStatus,
} from "@/lib/api/endpoints";
import { backendApi } from "@/lib/api/endpoints";
import {
  ChevronLeft,
  ChevronRight,
  Library,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Number of items to fetch per page */
const PAGE_SIZE = 25;

/**
 * Debounce a value by a specified delay
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * The main Template Library browser component.
 * Displays a filterable, searchable, paginated grid of pre-approved templates
 * from Meta's Template Library that users can adopt into their account.
 */
export function TemplateLibraryBrowser() {
  const t = useTranslations("templates.library");
  const { addNotification } = useNotification();

  // Data state
  const [result, setResult] = useState<TemplateLibraryBrowseResult | null>(
    null,
  );
  const [filterOptions, setFilterOptions] =
    useState<TemplateLibraryFilterOptions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterLoading, setIsFilterLoading] = useState(true);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [selectedUseCase, setSelectedUseCase] = useState<string>("");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");

  // Pagination state
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(
    undefined,
  );
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  // Adopt modal state
  const [adoptTarget, setAdoptTarget] =
    useState<TemplateLibraryTemplateWithStatus | null>(null);
  const [isAdoptModalOpen, setIsAdoptModalOpen] = useState(false);

  // Debounce search
  const debouncedSearch = useDebouncedValue(searchQuery, 400);

  // Track if initial load happened
  const initialLoadDone = useRef(false);

  // Build filters object (without pagination - pagination is handled separately)
  const baseFilters = useMemo<
    Omit<TemplateLibraryFilters, "limit" | "after" | "before">
  >(() => {
    const f: Omit<TemplateLibraryFilters, "limit" | "after" | "before"> = {};
    if (debouncedSearch) f.search = debouncedSearch;
    if (selectedTopic) f.topic = selectedTopic as any;
    if (selectedUseCase) f.usecase = selectedUseCase as any;
    if (selectedIndustry) f.industry = selectedIndustry as any;
    if (selectedLanguage) f.language = selectedLanguage;
    return f;
  }, [
    debouncedSearch,
    selectedTopic,
    selectedUseCase,
    selectedIndustry,
    selectedLanguage,
  ]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentCursor(undefined);
    setCursorHistory([]);
  }, [baseFilters]);

  // Fetch filter options on mount
  useEffect(() => {
    let cancelled = false;
    async function loadFilters() {
      try {
        const options = await backendApi.templates.getLibraryFilters();
        if (!cancelled) setFilterOptions(options);
      } catch (err) {
        console.error("Failed to load library filter options:", err);
      } finally {
        if (!cancelled) setIsFilterLoading(false);
      }
    }
    loadFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build full filters with pagination
  const filters = useMemo<TemplateLibraryFilters>(
    () => ({
      ...baseFilters,
      limit: PAGE_SIZE,
      ...(currentCursor && { after: currentCursor }),
    }),
    [baseFilters, currentCursor],
  );

  // Fetch library templates when filters change
  const fetchLibrary = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await backendApi.templates.browseLibrary(
        Object.keys(filters).length > 0 ? filters : undefined,
      );
      setResult(data);
    } catch (err) {
      console.error("Failed to fetch template library:", err);
      addNotification(t("fetchFailed"), "error", 3000);
    } finally {
      setIsLoading(false);
      initialLoadDone.current = true;
    }
  }, [filters, addNotification, t]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  // Handle adopt click
  const handleAdoptClick = useCallback(
    (template: TemplateLibraryTemplateWithStatus) => {
      if (template.adopted) return;
      setAdoptTarget(template);
      setIsAdoptModalOpen(true);
    },
    [],
  );

  // Handle successful adoption
  const handleAdopted = useCallback(
    (adoptResult: AdoptTemplateResult) => {
      addNotification(
        t("adoptSuccess", { name: adoptTarget?.name || "" }),
        "success",
        4000,
      );
      // Refresh the library to update adoption status
      fetchLibrary();
    },
    [addNotification, t, adoptTarget, fetchLibrary],
  );

  // Pagination handlers
  const handleNextPage = useCallback(() => {
    if (result?.paging?.nextCursor) {
      // Store current cursor in history for "previous" navigation
      if (currentCursor) {
        setCursorHistory((prev) => [...prev, currentCursor]);
      } else {
        setCursorHistory((prev) => [...prev, ""]); // Empty string = first page
      }
      setCurrentCursor(result.paging.nextCursor);
    }
  }, [result?.paging?.nextCursor, currentCursor]);

  const handlePreviousPage = useCallback(() => {
    if (cursorHistory.length > 0) {
      const newHistory = [...cursorHistory];
      const previousCursor = newHistory.pop();
      setCursorHistory(newHistory);
      setCurrentCursor(previousCursor === "" ? undefined : previousCursor);
    }
  }, [cursorHistory]);

  // Reset all filters
  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedTopic("");
    setSelectedUseCase("");
    setSelectedIndustry("");
    setSelectedLanguage("");
  }, []);

  const hasActiveFilters =
    !!debouncedSearch ||
    !!selectedTopic ||
    !!selectedUseCase ||
    !!selectedIndustry ||
    !!selectedLanguage;

  const templates = result?.templates || [];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap gap-2">
          {/* Topic */}
          <Select value={selectedTopic} onValueChange={setSelectedTopic}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("filterTopic")} />
            </SelectTrigger>
            <SelectContent>
              {filterOptions?.topics.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Use Case */}
          <Select value={selectedUseCase} onValueChange={setSelectedUseCase}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder={t("filterUseCase")} />
            </SelectTrigger>
            <SelectContent>
              {filterOptions?.useCases.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Industry */}
          <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("filterIndustry")} />
            </SelectTrigger>
            <SelectContent>
              {filterOptions?.industries.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Language */}
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t("filterLanguage")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="en_US">English (US)</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="es_MX">Spanish (Mexico)</SelectItem>
              <SelectItem value="es_AR">Spanish (Argentina)</SelectItem>
              <SelectItem value="pt_BR">Portuguese (Brazil)</SelectItem>
              <SelectItem value="fr">French</SelectItem>
              <SelectItem value="de">German</SelectItem>
              <SelectItem value="it">Italian</SelectItem>
              <SelectItem value="ar">Arabic</SelectItem>
              <SelectItem value="hi">Hindi</SelectItem>
              <SelectItem value="id">Indonesian</SelectItem>
              <SelectItem value="ja">Japanese</SelectItem>
              <SelectItem value="ko">Korean</SelectItem>
              <SelectItem value="zh_CN">Chinese (Simplified)</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="gap-1.5 text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("clearFilters")}
            </Button>
          )}
        </div>
      </div>

      {/* Results count */}
      {!isLoading && initialLoadDone.current && (
        <div className="text-sm text-muted-foreground">
          {t("resultsCount", { count: templates.length })}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-72 w-full rounded-lg" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Library className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground mb-2">
            {hasActiveFilters ? t("noResults") : t("noTemplates")}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("clearFilters")}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template, index) => (
              <LibraryTemplateCard
                key={`${template.name}-${template.language}-${index}`}
                template={template}
                onAdopt={handleAdoptClick}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {(result?.paging?.hasNextPage || cursorHistory.length > 0) && (
            <div className="flex items-center justify-center gap-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={cursorHistory.length === 0 || isLoading}
                className="gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                {t("previousPage")}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t("pageInfo", { count: templates.length })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!result?.paging?.hasNextPage || isLoading}
                className="gap-1.5"
              >
                {t("nextPage")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Adopt Modal */}
      <AdoptTemplateModal
        template={adoptTarget}
        open={isAdoptModalOpen}
        onOpenChange={setIsAdoptModalOpen}
        onAdopted={handleAdopted}
      />
    </div>
  );
}
