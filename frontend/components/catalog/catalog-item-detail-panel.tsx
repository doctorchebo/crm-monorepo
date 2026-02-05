"use client";

/**
 * CatalogItemDetailPanel
 *
 * Sidebar panel component for displaying catalog item details.
 * Used within the ChatSidebar when viewing a catalog item from a message.
 *
 * Architecture:
 * - Receives item data from CatalogMessageItem (lightweight, from message metadata)
 * - Optionally fetches full item data for additional details
 * - Matches WhatsApp Web's catalog item detail view style
 * - Provides actions: Send via WhatsApp, Copy link, External link
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  MessageCircle,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useState } from "react";

/**
 * Catalog item data from message metadata
 */
export interface CatalogMessageItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  salePrice?: number | null;
  currency: string;
  link?: string | null;
  retailerId?: string | null;
  status: string;
  mainImageUrl?: string | null;
  mainThumbnailUrl?: string | null;
}

interface CatalogItemDetailPanelProps {
  /** The catalog item to display */
  item: CatalogMessageItem;
  /** Callback when panel should be closed */
  onClose?: () => void;
  /** Callback to send this item to chat */
  onSendToChat?: (item: CatalogMessageItem) => void;
}

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
 * Get status configuration for display
 */
function getStatusConfig(status: string) {
  switch (status.toUpperCase()) {
    case "APPROVED":
      return {
        color:
          "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300 border border-green-200 dark:border-green-500/30",
        icon: Check,
        label: "Approved",
      };
    case "PENDING_APPROVAL":
      return {
        color:
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-500/30",
        icon: Clock,
        label: "Pending",
      };
    case "REJECTED":
      return {
        color:
          "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300 border border-red-200 dark:border-red-500/30",
        icon: X,
        label: "Rejected",
      };
    case "DRAFT":
      return {
        color:
          "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30",
        icon: Clock,
        label: "Draft",
      };
    default:
      return {
        color:
          "bg-gray-100 text-gray-800 dark:bg-gray-500/20 dark:text-gray-300 border border-gray-200 dark:border-gray-500/30",
        icon: Clock,
        label: status.replace(/_/g, " ").toLowerCase(),
      };
  }
}

/**
 * CatalogItemDetailPanel - Sidebar panel for viewing catalog item details
 *
 * Displays:
 * - Product image
 * - Name, price, sale price
 * - Description
 * - Status badge
 * - Action buttons (Send via WhatsApp, Copy link, External link)
 */
export function CatalogItemDetailPanel({
  item,
  onClose,
  onSendToChat,
}: CatalogItemDetailPanelProps) {
  const t = useTranslations("catalog");
  const [copySuccess, setCopySuccess] = useState(false);

  const statusConfig = getStatusConfig(item.status);
  const StatusIcon = statusConfig.icon;
  const imageUrl = item.mainImageUrl || item.mainThumbnailUrl;

  /**
   * Copy product link to clipboard
   */
  const handleCopyLink = useCallback(async () => {
    if (!item.link) return;

    try {
      await navigator.clipboard.writeText(item.link);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  }, [item.link]);

  /**
   * Open product link in new tab
   */
  const handleOpenLink = useCallback(() => {
    if (item.link) {
      window.open(item.link, "_blank", "noopener,noreferrer");
    }
  }, [item.link]);

  /**
   * Send item to current chat
   */
  const handleSendToChat = useCallback(() => {
    onSendToChat?.(item);
  }, [item, onSendToChat]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header with close button */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm truncate flex-1 mr-2">
          {t("detail.title") || "Product Details"}
        </h3>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Product Image */}
          <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={item.name}
                fill
                className="object-cover"
                sizes="(max-width: 400px) 100vw, 400px"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-6xl">📦</span>
              </div>
            )}

            {/* Status badge */}
            <div className="absolute top-3 left-3">
              <Badge className={cn("gap-1 text-xs", statusConfig.color)}>
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
              </Badge>
            </div>

            {/* External link icon */}
            {item.link && (
              <button
                onClick={handleOpenLink}
                className="absolute top-3 right-3 p-2 bg-white/90 dark:bg-black/50 rounded-full hover:bg-white dark:hover:bg-black/70 transition-colors"
                title={t("detail.openLink") || "Open product link"}
              >
                <ExternalLink className="h-4 w-4 text-gray-700 dark:text-gray-200" />
              </button>
            )}
          </div>

          {/* Product Name and Price */}
          <div>
            <h2 className="text-lg font-semibold leading-tight mb-2">
              {item.name}
            </h2>

            <div className="flex items-baseline gap-2">
              {item.salePrice ? (
                <>
                  <span className="text-xl font-bold text-destructive">
                    {formatPrice(item.salePrice, item.currency)}
                  </span>
                  <span className="text-base text-muted-foreground line-through">
                    {formatPrice(item.price, item.currency)}
                  </span>
                </>
              ) : (
                <span className="text-xl font-bold">
                  {formatPrice(item.price, item.currency)}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              size="sm"
              onClick={handleSendToChat}
              disabled={!onSendToChat}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              {t("detail.sendViaWhatsapp") || "Send"}
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={handleCopyLink}
              disabled={!item.link}
              title={t("detail.copyLink") || "Copy link"}
            >
              {copySuccess ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={handleOpenLink}
              disabled={!item.link}
              title={t("detail.openLink") || "Open link"}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>

          <Separator />

          {/* Description */}
          {item.description && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                {t("form.description") || "Description"}
              </h4>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {item.description}
              </p>
            </div>
          )}

          {/* Product Details */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t("detail.title") || "Details"}
            </h4>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              {item.retailerId && (
                <>
                  <dt className="text-muted-foreground">
                    {t("detail.itemCode") || "Item Code"}
                  </dt>
                  <dd className="font-medium truncate" title={item.retailerId}>
                    {item.retailerId}
                  </dd>
                </>
              )}

              <dt className="text-muted-foreground">
                {t("detail.status") || "Status"}
              </dt>
              <dd className="font-medium capitalize">
                {item.status.replace(/_/g, " ").toLowerCase()}
              </dd>
            </dl>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
