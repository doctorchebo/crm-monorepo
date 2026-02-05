"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Check, Package, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Catalog item image
 */
interface CatalogItemImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  isMain: boolean;
  sortOrder: number;
}

/**
 * Catalog item type
 * Fields align with Meta Commerce catalog requirements
 */
interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  salePrice: number | null;
  currency: string;
  link: string | null;
  retailerId: string | null;
  availability: string;
  condition: string;
  brand: string | null;
  status: string;
  statusMessage: string | null;
  images: CatalogItemImage[];
  mainImageUrl: string | null;
  mainThumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CatalogSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (items: CatalogItem[]) => void;
  maxSelection?: number;
  initialSelected?: CatalogItem[];
}

const MAX_DISPLAY_NAMES = 5;

/**
 * Format price for display
 */
function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(price / 100);
}

/**
 * Catalog Selector Modal
 *
 * Modal for selecting catalog items to send in chat:
 * - Search functionality
 * - Grid view with checkboxes
 * - Selected items shown at bottom (up to 5 titles)
 * - Only shows approved and visible items
 */
export function CatalogSelectorModal({
  open,
  onOpenChange,
  onSelect,
  maxSelection = 10,
  initialSelected = [],
}: CatalogSelectorModalProps) {
  const t = useTranslations("catalog");

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const {
    value: searchQuery,
    debouncedValue: debouncedSearch,
    setValue: setSearchQuery,
  } = useDebouncedValue("", { delay: 300 });
  const [selectedItems, setSelectedItems] =
    useState<CatalogItem[]>(initialSelected);

  // Fetch catalog items (only approved and visible)
  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await backendApi.catalog.listItems({
        availableOnly: true,
        limit: 50,
        search: debouncedSearch || undefined,
      });

      setItems(response.items);
    } catch (error) {
      console.error("Error fetching catalog items:", error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch]);

  // Fetch on mount and when search changes
  useEffect(() => {
    if (open) {
      fetchItems();
    }
  }, [open, fetchItems]);

  // Track previous open state to detect transitions
  const prevOpenRef = useRef(open);
  // Track initialSelected in a ref to use during open transition without causing re-renders
  const initialSelectedRef = useRef(initialSelected);
  initialSelectedRef.current = initialSelected;

  // Handle modal open/close transitions
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    const isNowOpen = open;

    if (!wasOpen && isNowOpen) {
      // Modal just opened - initialize with passed selection (from ref to avoid dependency)
      setSelectedItems(initialSelectedRef.current);
    } else if (wasOpen && !isNowOpen) {
      // Modal just closed - reset state
      setSearchQuery("");
      setSelectedItems([]);
    }

    prevOpenRef.current = open;
  }, [open]); // Only depend on open - initialSelected accessed via ref

  // Toggle item selection
  const toggleItem = (item: CatalogItem) => {
    setSelectedItems((prev) => {
      const isSelected = prev.some((i) => i.id === item.id);

      if (isSelected) {
        return prev.filter((i) => i.id !== item.id);
      }

      if (prev.length >= maxSelection) {
        return prev;
      }

      return [...prev, item];
    });
  };

  // Get display text for selected items
  const getSelectedDisplayText = () => {
    if (selectedItems.length === 0) return "";

    const displayNames = selectedItems
      .slice(0, MAX_DISPLAY_NAMES)
      .map((item) => item.name)
      .join(", ");

    if (selectedItems.length > MAX_DISPLAY_NAMES) {
      return `${displayNames}, +${selectedItems.length - MAX_DISPLAY_NAMES} more`;
    }

    return displayNames;
  };

  // Handle send
  const handleSend = () => {
    onSelect(selectedItems);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("send.selectItems")}</DialogTitle>
          <DialogDescription>
            {t("send.maxItems", { max: maxSelection })}
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("send.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Items Grid */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">{t("send.noResults")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {items.map((item) => {
                const isSelected = selectedItems.some((i) => i.id === item.id);
                const imageUrl = item.mainThumbnailUrl || item.mainImageUrl;

                return (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item)}
                    disabled={
                      !isSelected && selectedItems.length >= maxSelection
                    }
                    className={cn(
                      "relative aspect-square rounded-lg overflow-hidden border-2 transition-all text-left",
                      isSelected
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-transparent hover:border-gray-200",
                      !isSelected &&
                        selectedItems.length >= maxSelection &&
                        "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {/* Image */}
                    <div className="relative w-full h-full bg-muted">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-3xl">📦</span>
                        </div>
                      )}

                      {/* Gradient overlay for text */}
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />

                      {/* Selection indicator - radio button style with theme-safe colors */}
                      <div
                        className={cn(
                          "absolute top-2 right-2 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                          isSelected
                            ? "bg-emerald-500 border-emerald-500"
                            : "bg-white/90 border-white/60 dark:bg-gray-800/90 dark:border-gray-600/60",
                        )}
                      >
                        {isSelected && (
                          <Check
                            className="h-3 w-3 text-white"
                            strokeWidth={3}
                          />
                        )}
                      </div>

                      {/* Item info */}
                      <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
                        <p className="text-sm font-medium line-clamp-1">
                          {item.name}
                        </p>
                        <p className="text-xs opacity-90">
                          {formatPrice(
                            item.salePrice || item.price,
                            item.currency,
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Selected Items Footer */}
        {selectedItems.length > 0 && (
          <div className="border-t pt-4 -mx-6 px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {t("send.selectedItems", { count: selectedItems.length })}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {getSelectedDisplayText()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedItems([])}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={selectedItems.length === 0}>
            {t("send.send")} ({selectedItems.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
