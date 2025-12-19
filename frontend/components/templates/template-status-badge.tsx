"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  TemplateApprovalStatusValue,
  TemplateQualityRating,
} from "@/lib/api/endpoints";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileEdit,
  PauseCircle,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface TemplateStatusBadgeProps {
  status: TemplateApprovalStatusValue;
  qualityRating?: TemplateQualityRating;
  rejectionReason?: string | null;
  showQuality?: boolean;
  size?: "sm" | "md";
  /** Custom tooltip message to override the default status label */
  customTooltip?: string;
  /** Prevents click events from bubbling up to parent elements */
  stopPropagation?: boolean;
}

/**
 * Status configuration for badge styling
 */
const STATUS_CONFIG: Record<
  TemplateApprovalStatusValue,
  {
    icon: React.ElementType;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
    labelKey: string;
  }
> = {
  draft: {
    icon: FileEdit,
    variant: "secondary",
    className: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    labelKey: "status.draft",
  },
  pending: {
    icon: Clock,
    variant: "default",
    className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
    labelKey: "status.pending",
  },
  approved: {
    icon: CheckCircle,
    variant: "default",
    className: "bg-green-100 text-green-800 hover:bg-green-200",
    labelKey: "status.approved",
  },
  rejected: {
    icon: XCircle,
    variant: "destructive",
    className: "bg-red-100 text-red-800 hover:bg-red-200",
    labelKey: "status.rejected",
  },
  paused: {
    icon: PauseCircle,
    variant: "default",
    className: "bg-orange-100 text-orange-800 hover:bg-orange-200",
    labelKey: "status.paused",
  },
  disabled: {
    icon: XCircle,
    variant: "destructive",
    className: "bg-red-200 text-red-900 hover:bg-red-300",
    labelKey: "status.disabled",
  },
  appeal_requested: {
    icon: AlertCircle,
    variant: "default",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-200",
    labelKey: "status.appealRequested",
  },
};

/**
 * Quality rating configuration
 */
const QUALITY_CONFIG: Record<
  TemplateQualityRating,
  {
    className: string;
    labelKey: string;
  }
> = {
  pending: {
    className: "bg-gray-100 text-gray-600",
    labelKey: "quality.pending",
  },
  high: {
    className: "bg-green-100 text-green-700",
    labelKey: "quality.high",
  },
  medium: {
    className: "bg-yellow-100 text-yellow-700",
    labelKey: "quality.medium",
  },
  low: {
    className: "bg-red-100 text-red-700",
    labelKey: "quality.low",
  },
};

export function TemplateStatusBadge({
  status,
  qualityRating,
  rejectionReason,
  showQuality = false,
  size = "sm",
  customTooltip,
  stopPropagation = false,
}: TemplateStatusBadgeProps) {
  const t = useTranslations("templates.approval");
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const Icon = config.icon;

  const sizeClasses =
    size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  const statusLabel = t(config.labelKey);
  // Use custom tooltip if provided, otherwise fall back to default behavior
  const tooltipContent = customTooltip
    ? customTooltip
    : status === "rejected" && rejectionReason
    ? `${statusLabel}: ${rejectionReason}`
    : statusLabel;

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div className="flex items-center gap-1" onClick={handleClick}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`${config.className} ${sizeClasses} flex items-center gap-1 cursor-default`}
            >
              <Icon className={iconSize} />
              <span>{statusLabel}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent className={customTooltip ? "max-w-xs" : undefined}>
            <p>{tooltipContent}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Quality rating badge (only for approved templates) */}
      {showQuality &&
        status === "approved" &&
        qualityRating &&
        qualityRating !== "pending" && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={`${QUALITY_CONFIG[qualityRating].className} ${sizeClasses}`}
                >
                  {t(QUALITY_CONFIG[qualityRating].labelKey)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("qualityDescription")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
    </div>
  );
}

/**
 * Simple status indicator for compact views
 */
export function TemplateStatusDot({
  status,
}: {
  status: TemplateApprovalStatusValue;
}) {
  const colorMap: Record<TemplateApprovalStatusValue, string> = {
    draft: "bg-gray-400",
    pending: "bg-yellow-400",
    approved: "bg-green-500",
    rejected: "bg-red-500",
    paused: "bg-orange-400",
    disabled: "bg-red-600",
    appeal_requested: "bg-blue-400",
  };

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colorMap[status]}`}
      title={status}
    />
  );
}
