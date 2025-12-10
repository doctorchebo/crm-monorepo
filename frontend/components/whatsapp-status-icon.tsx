/**
 * WhatsApp Message Status Icon Component
 *
 * Displays the iconic tick marks used in WhatsApp to show message delivery status:
 * - Single tick (✓): Message sent to WhatsApp servers
 * - Double tick (✓✓): Message delivered to recipient device
 * - Double blue tick (✓✓ blue): Message read by recipient
 * - Failed mark (⚠): Message failed to send
 *
 * This component is architecture-agnostic and integrates seamlessly with
 * the frontend component system using shadcn/ui principles
 */

import { AlertCircle, Check, Clock } from "lucide-react";
import React from "react";

type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

interface WhatsAppStatusIconProps {
  status: MessageStatus;
  className?: string;
  showLabel?: boolean;
  deliveredAt?: string;
  readAt?: string;
}

/**
 * WhatsApp-style status indicator component
 *
 * @param status - Current message delivery status
 * @param className - Optional Tailwind classes for styling
 * @param showLabel - Optional flag to show status text label
 * @param deliveredAt - ISO timestamp when message was delivered
 * @param readAt - ISO timestamp when message was read
 *
 * @example
 * // Single tick - message sent
 * <WhatsAppStatusIcon status="sent" />
 *
 * @example
 * // Double tick - message delivered
 * <WhatsAppStatusIcon status="delivered" />
 *
 * @example
 * // Blue double tick - message read
 * <WhatsAppStatusIcon status="read" showLabel className="text-blue-500" />
 */
export const WhatsAppStatusIcon = React.forwardRef<
  HTMLDivElement,
  WhatsAppStatusIconProps
>(({ status, className = "", showLabel = false, deliveredAt, readAt }, ref) => {
  const baseClasses = `flex items-center gap-1 ${className}`;
  const iconSize = 16;

  // Determine tooltip text
  const getTooltipText = (): string => {
    switch (status) {
      case "pending":
        return "Sending...";
      case "sent":
        return "Sent";
      case "delivered":
        return deliveredAt
          ? `Delivered at ${new Date(deliveredAt).toLocaleTimeString()}`
          : "Delivered";
      case "read":
        return readAt
          ? `Read at ${new Date(readAt).toLocaleTimeString()}`
          : "Read";
      case "failed":
        return "Failed to send";
      default:
        return "";
    }
  };

  // Determine status label
  const getStatusLabel = (): string => {
    switch (status) {
      case "pending":
        return "Sending";
      case "sent":
        return "Sent";
      case "delivered":
        return "Delivered";
      case "read":
        return "Read";
      case "failed":
        return "Failed";
      default:
        return "";
    }
  };

  return (
    <div
      ref={ref}
      className={baseClasses}
      title={getTooltipText()}
      role="img"
      aria-label={getStatusLabel()}
    >
      {status === "pending" && (
        <Clock
          size={iconSize}
          className="text-gray-400 animate-spin"
          strokeWidth={2.5}
        />
      )}

      {status === "sent" && (
        <div className="flex items-center gap-0.5">
          <Check
            size={iconSize}
            className="text-gray-500"
            strokeWidth={3}
            aria-hidden="true"
          />
        </div>
      )}

      {status === "delivered" && (
        <div className="flex items-center gap-0.5">
          <Check
            size={iconSize}
            className="text-gray-600"
            strokeWidth={3}
            aria-hidden="true"
          />
          <Check
            size={iconSize}
            className="text-gray-600 -ml-1.5"
            strokeWidth={3}
            aria-hidden="true"
          />
        </div>
      )}

      {status === "read" && (
        <div className="flex items-center gap-0.5">
          <Check
            size={iconSize}
            className="text-blue-500"
            strokeWidth={3}
            aria-hidden="true"
          />
          <Check
            size={iconSize}
            className="text-blue-500 -ml-1.5"
            strokeWidth={3}
            aria-hidden="true"
          />
        </div>
      )}

      {status === "failed" && (
        <AlertCircle
          size={iconSize}
          className="text-red-500"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      )}

      {showLabel && (
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {getStatusLabel()}
        </span>
      )}
    </div>
  );
});

WhatsAppStatusIcon.displayName = "WhatsAppStatusIcon";

/**
 * Compact status indicator - just the icons without text
 * Best for message bubbles where space is limited
 */
export const WhatsAppStatusIconCompact = React.forwardRef<
  HTMLDivElement,
  Omit<WhatsAppStatusIconProps, "showLabel">
>((props, ref) => (
  <WhatsAppStatusIcon ref={ref} {...props} showLabel={false} />
));

WhatsAppStatusIconCompact.displayName = "WhatsAppStatusIconCompact";

/**
 * Verbose status indicator - includes status text
 * Best for status details panels
 */
export const WhatsAppStatusIconVerbose = React.forwardRef<
  HTMLDivElement,
  WhatsAppStatusIconProps
>((props, ref) => <WhatsAppStatusIcon ref={ref} {...props} showLabel={true} />);

WhatsAppStatusIconVerbose.displayName = "WhatsAppStatusIconVerbose";

export default WhatsAppStatusIcon;
