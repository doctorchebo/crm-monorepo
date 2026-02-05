"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Clock, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

/**
 * Catalog item status
 */
type CatalogItemStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_UPDATE"
  | "ARCHIVED";

/**
 * Map database status to translation key
 */
const STATUS_TRANSLATION_KEYS: Record<CatalogItemStatus, string> = {
  DRAFT: "draft",
  PENDING_APPROVAL: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  NEEDS_UPDATE: "needsUpdate",
  ARCHIVED: "archived",
};

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
 */
/**
 * Catalog item interface
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
  status: CatalogItemStatus;
  statusMessage: string | null;
  images: CatalogItemImage[];
  mainImageUrl: string | null;
  mainThumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CatalogItemCardProps {
  item: CatalogItem;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
}

/**
 * Format price for display
 */
function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(price / 100); // Price is stored in cents
}

/**
 * Get status badge color
 */
function getStatusColor(status: CatalogItemStatus): string {
  switch (status) {
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300";
    case "PENDING_APPROVAL":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300";
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300";
    case "NEEDS_UPDATE":
      return "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300";
    case "ARCHIVED":
      return "bg-gray-100 text-gray-800 dark:bg-gray-500/20 dark:text-gray-300";
    default:
      return "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300";
  }
}

/**
 * Catalog Item Card Component
 *
 * Displays a catalog item in a card format with:
 * - Product image
 * - Name, price, sale price
 * - Status badge
 * - Actions dropdown menu
 */
export function CatalogItemCard({
  item,
  onView,
  onEdit,
  onDelete,
  selectable,
  selected,
  onSelect,
}: CatalogItemCardProps) {
  const t = useTranslations("catalog");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const imageUrl = item.mainThumbnailUrl || item.mainImageUrl;
  const isPending = item.status === "PENDING_APPROVAL";

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all hover:shadow-md cursor-pointer",
        selected && "ring-2 ring-primary",
      )}
      onClick={(e) => {
        // Prevent click when dropdown menu is open or when clicking dropdown
        if (isMenuOpen) return;
        if ((e.target as HTMLElement).closest("[data-dropdown]")) return;
        if (selectable && onSelect) {
          onSelect(!selected);
        } else {
          onView();
        }
      }}
    >
      {/* Image container */}
      <div className="relative aspect-square bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={item.name}
            fill
            className="object-cover transition-opacity"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <span className="text-4xl text-muted-foreground">📦</span>
          </div>
        )}

        {/* Pending review clock indicator - top right corner (always visible when pending) */}
        {isPending && (
          <div className="absolute top-2 right-2 z-10 flex items-center justify-center h-7 w-7 bg-yellow-500 rounded-full shadow-md group-hover:hidden">
            <Clock className="h-4 w-4 text-white" />
          </div>
        )}

        {/* Status badge - top left with shadow for visibility on any background */}
        {item.status !== "DRAFT" && (
          <div
            className={cn(
              "absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shadow-md",
              // All status badges get solid backgrounds for visibility against image backgrounds
              item.status === "PENDING_APPROVAL" && "bg-yellow-500 text-white",
              item.status === "APPROVED" && "bg-green-600 text-white",
              item.status === "REJECTED" && "bg-red-600 text-white",
              item.status === "NEEDS_UPDATE" && "bg-orange-500 text-white",
              item.status === "ARCHIVED" && "bg-gray-600 text-white",
            )}
          >
            {isPending && <Clock className="h-3 w-3" />}
            {t(`status.${STATUS_TRANSLATION_KEYS[item.status]}`)}
          </div>
        )}

        {/* Dropdown menu */}
        <div
          data-dropdown
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t("editItem")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("deleteItem")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Selection checkbox */}
        {selectable && (
          <div
            data-dropdown
            className={cn(
              "absolute top-2 left-2",
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <div
              className={cn(
                "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                selected
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-white border-gray-300",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(!selected);
              }}
            >
              {selected && <span className="text-xs">✓</span>}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <CardContent className="p-3">
        <h3 className="font-medium text-sm line-clamp-1 mb-1">{item.name}</h3>

        <div className="flex items-baseline gap-2">
          {item.salePrice ? (
            <>
              <span className="text-sm font-bold text-destructive">
                {formatPrice(item.salePrice, item.currency)}
              </span>
              <span className="text-xs text-muted-foreground line-through">
                {formatPrice(item.price, item.currency)}
              </span>
            </>
          ) : (
            <span className="text-sm font-bold">
              {formatPrice(item.price, item.currency)}
            </span>
          )}
        </div>

        {item.retailerId && (
          <p className="text-xs text-muted-foreground mt-1">
            SKU: {item.retailerId}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
