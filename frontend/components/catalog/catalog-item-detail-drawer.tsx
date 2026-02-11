"use client";

import { EntityAuditHistoryPanel } from "@/components/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CatalogStatusUpdateEvent,
  useCatalogWebSocket,
} from "@/hooks/use-catalog-websocket";
import { useNotification } from "@/hooks/use-notification";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  History,
  Loader2,
  MessageCircle,
  Pencil,
  RefreshCw,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useState } from "react";

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
  status: CatalogItemStatus;
  statusMessage: string | null;
  images: CatalogItemImage[];
  mainImageUrl: string | null;
  mainThumbnailUrl: string | null;
  whatsappProductLink?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CatalogItemDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CatalogItem | null;
  onEdit: () => void;
  /** Team ID for WebSocket subscription */
  teamId?: number;
  /** Called when item status changes after sync - parent should refresh item data */
  onStatusChange?: (itemId: string, newStatus: CatalogItemStatus) => void;
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
 * Get status config
 */
function getStatusConfig(status: CatalogItemStatus) {
  switch (status) {
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
        label: "Pending Approval",
      };
    case "REJECTED":
      return {
        color:
          "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300 border border-red-200 dark:border-red-500/30",
        icon: X,
        label: "Rejected",
      };
    case "NEEDS_UPDATE":
      return {
        color:
          "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30",
        icon: Clock,
        label: "Needs Update",
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
 * Catalog Item Detail Drawer
 *
 * Displays detailed view of a catalog item:
 * - Image gallery
 * - Product information
 * - Price and availability
 * - Actions: Edit, Send via WhatsApp, Copy link
 * - Real-time status updates via WebSocket (no polling)
 *
 * Architecture:
 * - Uses WebSocket for instant status updates when Meta sends webhooks
 * - Manual refresh available as fallback
 * - Shows connection status indicator
 */
export function CatalogItemDetailDrawer({
  open,
  onOpenChange,
  item,
  onEdit,
  onStatusChange,
  teamId,
}: CatalogItemDetailDrawerProps) {
  const t = useTranslations("catalog");
  const { addNotification } = useNotification();

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  /**
   * Handle real-time status updates from WebSocket
   */
  const handleWebSocketStatusUpdate = useCallback(
    (event: CatalogStatusUpdateEvent) => {
      // Only handle updates for the current item
      if (item && event.itemId === item.id) {
        onStatusChange?.(item.id, event.newStatus as CatalogItemStatus);
        addNotification(
          t("syncSingleChanged", {
            name: event.itemName,
            status: event.newStatus.replace(/_/g, " ").toLowerCase(),
          }),
          event.newStatus === "APPROVED" ? "success" : "info",
        );
      }
    },
    [item, onStatusChange, addNotification, t],
  );

  /**
   * Connect to WebSocket for real-time updates
   * Only active when drawer is open and item is pending
   */
  const { isConnected } = useCatalogWebSocket({
    teamId: teamId ?? null,
    onStatusUpdate: handleWebSocketStatusUpdate,
    enabled: open && item?.status === "PENDING_APPROVAL",
  });

  /**
   * Manual sync status for the current item
   * Used as fallback when WebSocket is not connected or user wants immediate refresh
   */
  const syncItemStatus = useCallback(async () => {
    if (!item) return false;

    try {
      setIsSyncing(true);
      const result = await backendApi.catalog.syncSingleStatus(item.id);

      if (result.changed) {
        // Notify parent of status change
        onStatusChange?.(item.id, result.currentStatus as CatalogItemStatus);

        // Show notification
        addNotification(
          t("syncSingleChanged", {
            name: result.itemName,
            status: result.currentStatus.replace(/_/g, " ").toLowerCase(),
          }),
          result.currentStatus === "APPROVED" ? "success" : "info",
        );

        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to sync item status:", error);
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [item, onStatusChange, addNotification, t]);

  /**
   * Manual refresh handler
   */
  const handleManualRefresh = async () => {
    const changed = await syncItemStatus();
    if (!changed && item) {
      addNotification(t("syncSingleNoChange", { name: item.name }), "info");
    }
  };

  if (!item) return null;

  const statusConfig = getStatusConfig(item.status);
  const StatusIcon = statusConfig.icon;
  const mainImageUrl =
    item.images[selectedImageIndex]?.url || item.mainImageUrl;

  // Copy link to clipboard
  const handleCopyLink = async () => {
    if (!item.link) return;

    try {
      await navigator.clipboard.writeText(item.link);
      addNotification(t("detail.linkCopied"), "success");
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  // Open WhatsApp product link
  const handleSendViaWhatsApp = () => {
    if (item.whatsappProductLink) {
      window.open(item.whatsappProductLink, "_blank");
    } else if (item.link) {
      // Fallback to sharing the product link
      const text = encodeURIComponent(`Check out ${item.name}: ${item.link}`);
      window.open(`https://wa.me/?text=${text}`, "_blank");
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-6">
          <SheetHeader className="sr-only">
            <SheetTitle>{item.name}</SheetTitle>
            <SheetDescription>Product details</SheetDescription>
          </SheetHeader>

          {/* Main Image */}
          <div className="relative aspect-[4/3] min-h-[280px] bg-muted rounded-lg overflow-hidden mb-4 mt-2">
            {mainImageUrl ? (
              <Image
                src={mainImageUrl}
                alt={item.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-6xl">📦</span>
              </div>
            )}

            {/* Status badge */}
            <div className="absolute top-3 left-3">
              <Badge className={cn("gap-1", statusConfig.color)}>
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
              </Badge>
            </div>

            {/* Product link icon */}
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-3 right-3 p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
              >
                <ExternalLink className="h-4 w-4 text-gray-700" />
              </a>
            )}
          </div>

          {/* Thumbnail Gallery */}
          {item.images.length > 1 && (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 min-h-[88px]">
              {item.images.map((image, index) => (
                <button
                  key={image.id}
                  onClick={() => setSelectedImageIndex(index)}
                  className={cn(
                    "relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors",
                    selectedImageIndex === index
                      ? "border-primary"
                      : "border-transparent hover:border-gray-300",
                  )}
                >
                  <Image
                    src={image.thumbnailUrl || image.url}
                    alt={`${item.name} - Image ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Title and Price */}
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-2">{item.name}</h2>

            <div className="flex items-baseline gap-2">
              {item.salePrice ? (
                <>
                  <span className="text-2xl font-bold text-destructive">
                    {formatPrice(item.salePrice, item.currency)}
                  </span>
                  <span className="text-lg text-muted-foreground line-through">
                    {formatPrice(item.price, item.currency)}
                  </span>
                </>
              ) : (
                <span className="text-2xl font-bold">
                  {formatPrice(item.price, item.currency)}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mb-6">
            <Button
              className="flex-1"
              onClick={handleSendViaWhatsApp}
              disabled={!item.link && !item.whatsappProductLink}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              {t("detail.sendViaWhatsapp")}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyLink}
              disabled={!item.link}
            >
              <Copy className="h-4 w-4" />
            </Button>

            <Button variant="outline" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowHistory(true)}
            >
              <History className="h-4 w-4" />
            </Button>
          </div>

          <Separator className="my-4" />

          {/* Description */}
          {item.description && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Description
              </h3>
              <p className="text-sm whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {/* Product Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t("detail.title")}
            </h3>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              {item.retailerId && (
                <>
                  <dt className="text-muted-foreground">
                    {t("detail.itemCode")}
                  </dt>
                  <dd className="font-medium">{item.retailerId}</dd>
                </>
              )}

              <dt className="text-muted-foreground">
                {t("detail.availability")}
              </dt>
              <dd className="font-medium capitalize">{item.availability}</dd>

              <dt className="text-muted-foreground">{t("detail.condition")}</dt>
              <dd className="font-medium capitalize">{item.condition}</dd>

              {item.brand && (
                <>
                  <dt className="text-muted-foreground">{t("detail.brand")}</dt>
                  <dd className="font-medium">{item.brand}</dd>
                </>
              )}

              {item.link && (
                <>
                  <dt className="text-muted-foreground">{t("detail.link")}</dt>
                  <dd className="font-medium truncate">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {item.link}
                    </a>
                  </dd>
                </>
              )}
            </dl>
          </div>

          {/* Approval Status Message */}
          {item.status === "PENDING_APPROVAL" && (
            <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                    {t("approval.pending")}
                  </h4>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    {t("approval.pendingDescription")}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleManualRefresh}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-3 w-3" />
                      )}
                      {t("syncSingleStatus")}
                    </Button>
                    {/* Real-time connection indicator */}
                    <div
                      className={cn(
                        "flex items-center gap-1 text-xs px-2 py-1 rounded-full",
                        isConnected
                          ? "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30"
                          : "text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800",
                      )}
                      title={
                        isConnected
                          ? "Real-time updates active"
                          : "Real-time updates unavailable"
                      }
                    >
                      {isConnected ? (
                        <>
                          <Wifi className="h-3 w-3" />
                          <span>Live</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-3 w-3" />
                          <span>Offline</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {item.status === "REJECTED" && item.statusMessage && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-start gap-3">
                <X className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-800 dark:text-red-200">
                    {t("approval.rejected")}
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    {t("approval.rejectionReason")}: {item.statusMessage}
                  </p>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {item && (
        <EntityAuditHistoryPanel
          open={showHistory}
          onOpenChange={setShowHistory}
          entityType="catalog_item"
          entityId={item.id}
          entityName={item.name}
        />
      )}
    </>
  );
}
