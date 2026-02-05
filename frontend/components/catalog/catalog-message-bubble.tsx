"use client";

/**
 * CatalogMessageBubble
 * Chat bubble component for displaying catalog item messages
 *
 * Single item: Product image, name, price, "View" button
 * Multiple items: Stacked images, "Name and X other products", "View All" button
 *
 * Follows WhatsApp Product Message style with card layout.
 */

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WhatsAppStatusIcon } from "@/components/whatsapp-status-icon";
import { cn } from "@/lib/utils";
import { Clock, ExternalLink, Package } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { memo, useMemo } from "react";
import { MessageActionsMenu } from "../message-actions-menu";

/**
 * Catalog item data embedded in message
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

interface CatalogMessageBubbleProps {
  items: CatalogMessageItem[];
  isOutbound: boolean;
  timestamp: string;
  messageId: string;
  status?: "pending" | "sent" | "delivered" | "read" | "failed";
  onViewItem?: (item: CatalogMessageItem) => void;
  onViewAll?: (items: CatalogMessageItem[]) => void;
  onReply?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  deliveredAt?: string;
  readAt?: string;
  isHighlighted?: boolean;
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
 * Check if item is pending approval
 */
function isPendingApproval(status: string): boolean {
  return status === "PENDING_APPROVAL";
}

/**
 * Get initials from product name
 */
function getProductInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export const CatalogMessageBubble = memo(function CatalogMessageBubble({
  items,
  isOutbound,
  timestamp,
  messageId,
  status = "sent",
  onViewItem,
  onViewAll,
  onReply,
  onDelete,
  deliveredAt,
  readAt,
  isHighlighted,
}: CatalogMessageBubbleProps) {
  const t = useTranslations("catalog");

  const isSingleItem = items.length === 1;
  const firstItem = items[0];
  const additionalCount = items.length - 1;

  // Format timestamp
  const timeString = useMemo(() => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [timestamp]);

  if (isSingleItem && firstItem) {
    // Single product layout (WhatsApp Product Message style)
    return (
      <div
        className={cn(
          "flex -mx-2 px-2 rounded transition-colors duration-500",
          isOutbound ? "justify-end" : "justify-start",
          isHighlighted && "bg-yellow-100 dark:bg-yellow-900/30 animate-pulse",
        )}
      >
        <div
          className={cn(
            "group relative rounded-lg overflow-hidden max-w-xs w-64",
            isOutbound ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {/* Actions menu positioned in top-right corner - visible on hover */}
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <MessageActionsMenu
              messageId={messageId}
              messageTimestamp={timestamp}
              isOutbound={isOutbound}
              onReply={onReply}
              onDelete={isOutbound && onDelete ? onDelete : undefined}
            />
          </div>

          {/* Product Image */}
          <div className="relative aspect-square bg-muted/50">
            {firstItem.mainThumbnailUrl || firstItem.mainImageUrl ? (
              <Image
                src={firstItem.mainThumbnailUrl || firstItem.mainImageUrl || ""}
                alt={firstItem.name}
                fill
                className="object-cover"
                sizes="256px"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package
                  className={cn(
                    "h-16 w-16",
                    isOutbound
                      ? "text-primary-foreground/30"
                      : "text-muted-foreground/30",
                  )}
                />
              </div>
            )}

            {/* Pending approval indicator */}
            {isPendingApproval(firstItem.status) && (
              <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/90 text-white text-xs">
                <Clock className="h-3 w-3" />
                <span>{t("pendingApproval")}</span>
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="p-3 space-y-1">
            <h4 className="font-medium text-sm line-clamp-2">
              {firstItem.name}
            </h4>

            {firstItem.description && (
              <p
                className={cn(
                  "text-xs line-clamp-2",
                  isOutbound
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {firstItem.description}
              </p>
            )}

            {/* Price */}
            <div className="flex items-center gap-2 pt-1">
              <span className="font-semibold text-sm">
                {formatPrice(
                  firstItem.salePrice ?? firstItem.price,
                  firstItem.currency,
                )}
              </span>
              {firstItem.salePrice && firstItem.salePrice < firstItem.price && (
                <span
                  className={cn(
                    "text-xs line-through",
                    isOutbound
                      ? "text-primary-foreground/50"
                      : "text-muted-foreground",
                  )}
                >
                  {formatPrice(firstItem.price, firstItem.currency)}
                </span>
              )}
            </div>
          </div>

          {/* Separator */}
          <Separator className={isOutbound ? "bg-primary-foreground/20" : ""} />

          {/* View Action Button */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full rounded-none h-10 gap-2",
              isOutbound
                ? "text-primary-foreground hover:bg-primary-foreground/10"
                : "text-primary hover:bg-muted",
            )}
            onClick={() => {
              if (firstItem.link) {
                window.open(firstItem.link, "_blank", "noopener,noreferrer");
              } else {
                onViewItem?.(firstItem);
              }
            }}
          >
            <ExternalLink className="h-4 w-4" />
            {t("viewProduct")}
          </Button>

          {/* Timestamp and Status */}
          <div
            className={cn(
              "px-3 py-1 text-xs flex items-center justify-end gap-1",
              isOutbound
                ? "text-primary-foreground/70"
                : "text-muted-foreground",
            )}
          >
            <span>{timeString}</span>
            {isOutbound && (
              <WhatsAppStatusIcon
                status={status}
                deliveredAt={deliveredAt}
                readAt={readAt}
                className="ml-1"
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Multiple products layout
  return (
    <div
      className={cn(
        "flex -mx-2 px-2 rounded transition-colors duration-500",
        isOutbound ? "justify-end" : "justify-start",
        isHighlighted && "bg-yellow-100 dark:bg-yellow-900/30 animate-pulse",
      )}
    >
      <div
        className={cn(
          "group relative rounded-lg overflow-hidden max-w-xs w-64",
          isOutbound ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {/* Actions menu positioned in top-right corner - visible on hover */}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <MessageActionsMenu
            messageId={messageId}
            messageTimestamp={timestamp}
            isOutbound={isOutbound}
            onReply={onReply}
            onDelete={isOutbound && onDelete ? onDelete : undefined}
          />
        </div>

        {/* Stacked Product Images (up to 3) */}
        <div className="relative h-40 bg-muted/50">
          {items.slice(0, 3).map((item, index) => (
            <div
              key={item.id}
              className={cn(
                "absolute rounded-lg overflow-hidden shadow-md border-2",
                isOutbound ? "border-primary" : "border-muted",
              )}
              style={{
                width: "120px",
                height: "120px",
                left: `${20 + index * 30}px`,
                top: `${10 + index * 15}px`,
                zIndex: 3 - index,
              }}
            >
              {item.mainThumbnailUrl || item.mainImageUrl ? (
                <Image
                  src={item.mainThumbnailUrl || item.mainImageUrl || ""}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="120px"
                />
              ) : (
                <div
                  className={cn(
                    "w-full h-full flex items-center justify-center",
                    isOutbound ? "bg-primary/30" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isOutbound
                        ? "text-primary-foreground/50"
                        : "text-muted-foreground",
                    )}
                  >
                    {getProductInitials(item.name)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Products Info */}
        <div className="p-3">
          <div className="flex items-center gap-2">
            <Package
              className={cn(
                "h-4 w-4 shrink-0",
                isOutbound
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground",
              )}
            />
            <h4 className="font-medium text-sm line-clamp-1">
              {firstItem?.name}
            </h4>
          </div>
          <p
            className={cn(
              "text-xs mt-1",
              isOutbound
                ? "text-primary-foreground/70"
                : "text-muted-foreground",
            )}
          >
            {t("andOtherProducts", { count: additionalCount })}
          </p>
        </div>

        {/* Separator */}
        <Separator className={isOutbound ? "bg-primary-foreground/20" : ""} />

        {/* View All Action Button */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full rounded-none h-10 gap-2",
            isOutbound
              ? "text-primary-foreground hover:bg-primary-foreground/10"
              : "text-primary hover:bg-muted",
          )}
          onClick={() => onViewAll?.(items)}
        >
          <ExternalLink className="h-4 w-4" />
          {t("viewAll")}
        </Button>

        {/* Timestamp and Status */}
        <div
          className={cn(
            "px-3 py-1 text-xs flex items-center justify-end gap-1",
            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          <span>{timeString}</span>
          {isOutbound && (
            <WhatsAppStatusIcon
              status={status}
              deliveredAt={deliveredAt}
              readAt={readAt}
              className="ml-1"
            />
          )}
        </div>
      </div>
    </div>
  );
});

CatalogMessageBubble.displayName = "CatalogMessageBubble";
