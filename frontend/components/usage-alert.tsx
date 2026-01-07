"use client";

/**
 * Usage Alert Components
 * Dashboard components for displaying usage status, warnings, and throttle state
 *
 * Features:
 * - Usage progress bars
 * - Warning/limit alerts
 * - Throttle status indicator
 * - Cost breakdown
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  ChevronRight,
  DollarSign,
  Gauge,
  Hash,
  Info,
  PauseCircle,
  Settings,
  TrendingUp,
  Zap,
} from "lucide-react";
import Link from "next/link";

// Types matching backend
export interface UsageStatus {
  currentUsage: number;
  limit: number;
  percentUsed: number;
  remaining: number;
  isAtLimit: boolean;
  isNearLimit: boolean;
  limitType: string;
  limitPeriod: string;
  periodEnd?: string;
}

export interface UsageSummary {
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  byProvider: Record<
    string,
    { tokens: number; cost: number; requests: number }
  >;
  byOperationType: Record<
    string,
    { tokens: number; cost: number; requests: number }
  >;
  periodStart: string;
  periodEnd: string;
}

interface ThrottleStatus {
  isThrottled: boolean;
  aiPausedChats: number;
  usageStatuses: UsageStatus[];
  warnings: string[];
  recommendations: string[];
}

/**
 * Main Usage Dashboard Card
 */
interface UsageDashboardProps {
  summary: UsageSummary | null;
  statuses: UsageStatus[];
  throttleStatus: ThrottleStatus | null;
  isLoading?: boolean;
  onSettingsClick?: () => void;
  onPauseAllClick?: () => void;
  className?: string;
}

export function UsageDashboard({
  summary,
  statuses,
  throttleStatus,
  isLoading,
  onSettingsClick,
  onPauseAllClick,
  className,
}: UsageDashboardProps) {
  const isThrottled = throttleStatus?.isThrottled ?? false;
  const hasWarnings =
    throttleStatus?.warnings && throttleStatus.warnings.length > 0;

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      {/* Throttle warning overlay */}
      {isThrottled && (
        <div className="absolute top-0 left-0 right-0 bg-red-500 text-white px-3 py-1 text-xs font-medium flex items-center gap-2">
          <PauseCircle className="h-3 w-3" />
          <span>AI is throttled - usage limits exceeded</span>
        </div>
      )}

      <CardHeader className={cn("pb-2", isThrottled && "pt-8")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">AI Usage</CardTitle>
              <CardDescription className="text-xs">
                Token usage and billing overview
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onSettingsClick && (
              <Button variant="ghost" size="sm" onClick={onSettingsClick}>
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary stats */}
        {summary && (
          <div className="grid grid-cols-3 gap-3">
            <UsageStatCard
              icon={Hash}
              label="Tokens"
              value={formatNumber(summary.totalTokens)}
              subValue="this period"
            />
            <UsageStatCard
              icon={DollarSign}
              label="Cost"
              value={`$${summary.totalCost.toFixed(2)}`}
              subValue="estimated"
            />
            <UsageStatCard
              icon={Zap}
              label="Requests"
              value={formatNumber(summary.requestCount)}
              subValue="AI calls"
            />
          </div>
        )}

        {/* Usage limits progress */}
        {statuses.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Usage Limits
            </h4>
            {statuses.map((status, index) => (
              <UsageLimitBar key={index} status={status} />
            ))}
          </div>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div className="space-y-1.5">
            {throttleStatus?.warnings.map((warning, index) => (
              <UsageWarning key={index} message={warning} />
            ))}
          </div>
        )}

        {/* Recommendations */}
        {throttleStatus?.recommendations &&
          throttleStatus.recommendations.length > 0 && (
            <div className="p-2 rounded-md bg-muted/50 space-y-1">
              <h5 className="text-xs font-medium flex items-center gap-1">
                <Info className="h-3 w-3" />
                Recommendations
              </h5>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {throttleStatus.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-1">
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        {/* Provider breakdown */}
        {summary && Object.keys(summary.byProvider).length > 0 && (
          <ProviderBreakdown providers={summary.byProvider} />
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Link
            href="/dashboard/settings/usage"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            View detailed usage
            <ArrowUpRight className="h-3 w-3" />
          </Link>

          {onPauseAllClick && !isThrottled && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPauseAllClick}
              className="text-xs h-7"
            >
              <PauseCircle className="h-3 w-3 mr-1" />
              Pause All AI
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Stat card for summary metrics
 */
interface UsageStatCardProps {
  icon: typeof Hash;
  label: string;
  value: string;
  subValue?: string;
  trend?: { value: number; isPositive: boolean };
}

function UsageStatCard({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
}: UsageStatCardProps) {
  return (
    <div className="p-2 rounded-lg bg-muted/50">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-semibold">{value}</span>
        {trend && (
          <span
            className={cn(
              "text-[10px] flex items-center",
              trend.isPositive ? "text-green-600" : "text-red-600"
            )}
          >
            <TrendingUp
              className={cn("h-2.5 w-2.5", !trend.isPositive && "rotate-180")}
            />
            {trend.value}%
          </span>
        )}
      </div>
      {subValue && (
        <span className="text-[10px] text-muted-foreground">{subValue}</span>
      )}
    </div>
  );
}

/**
 * Usage limit progress bar
 */
interface UsageLimitBarProps {
  status: UsageStatus;
  className?: string;
}

function UsageLimitBar({ status, className }: UsageLimitBarProps) {
  const getColor = () => {
    if (status.isAtLimit) return "bg-red-500";
    if (status.isNearLimit) return "bg-amber-500";
    return "bg-primary";
  };

  const getLimitTypeIcon = () => {
    switch (status.limitType) {
      case "tokens":
        return Hash;
      case "cost":
        return DollarSign;
      case "requests":
        return Zap;
      default:
        return Gauge;
    }
  };

  const Icon = getLimitTypeIcon();

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground capitalize">
          <Icon className="h-3 w-3" />
          {status.limitType} ({status.limitPeriod})
        </span>
        <span className="font-medium">
          {formatNumber(status.currentUsage)} / {formatNumber(status.limit)}
        </span>
      </div>
      <div className="relative">
        <Progress value={Math.min(status.percentUsed, 100)} className="h-1.5" />
        {/* Color overlay */}
        <div
          className={cn(
            "absolute inset-0 rounded-full transition-all",
            getColor()
          )}
          style={{
            width: `${Math.min(status.percentUsed, 100)}%`,
            opacity: 0.7,
          }}
        />
      </div>
      {status.isAtLimit && (
        <p className="text-[10px] text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-2.5 w-2.5" />
          Limit reached
        </p>
      )}
      {status.isNearLimit && !status.isAtLimit && (
        <p className="text-[10px] text-amber-600 flex items-center gap-1">
          <AlertTriangle className="h-2.5 w-2.5" />
          {status.remaining.toLocaleString()} remaining
        </p>
      )}
    </div>
  );
}

/**
 * Usage warning alert
 */
interface UsageWarningProps {
  message: string;
  severity?: "warning" | "error";
}

function UsageWarning({ message, severity = "warning" }: UsageWarningProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 p-2 rounded-md text-xs",
        severity === "error"
          ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
          : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
      )}
    >
      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Provider cost breakdown
 */
interface ProviderBreakdownProps {
  providers: Record<string, { tokens: number; cost: number; requests: number }>;
}

function ProviderBreakdown({ providers }: ProviderBreakdownProps) {
  const entries = Object.entries(providers);
  if (entries.length === 0) return null;

  const totalCost = entries.reduce((sum, [, data]) => sum + data.cost, 0);

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        By Provider
      </h4>
      <div className="space-y-1.5">
        {entries.map(([provider, data]) => {
          const percentage = totalCost > 0 ? (data.cost / totalCost) * 100 : 0;
          return (
            <div key={provider} className="flex items-center gap-2">
              <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs flex-1 capitalize">{provider}</span>
              <span className="text-xs text-muted-foreground">
                ${data.cost.toFixed(2)}
              </span>
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Compact AI Status Badge - for header/nav
 */
interface AIStatusBadgeProps {
  isThrottled: boolean;
  aiPausedChats: number;
  hasWarnings: boolean;
  onClick?: () => void;
  className?: string;
}

export function AIStatusBadge({
  isThrottled,
  aiPausedChats,
  hasWarnings,
  onClick,
  className,
}: AIStatusBadgeProps) {
  const getVariant = () => {
    if (isThrottled) return "destructive";
    if (hasWarnings) return "secondary";
    return "outline";
  };

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={getVariant()}
            className={cn("cursor-pointer", className)}
            onClick={onClick}
          >
            {isThrottled ? (
              <>
                <PauseCircle className="h-3 w-3 mr-1" />
                Throttled
              </>
            ) : hasWarnings ? (
              <>
                <AlertTriangle className="h-3 w-3 mr-1" />
                Warning
              </>
            ) : aiPausedChats > 0 ? (
              <>
                <Bot className="h-3 w-3 mr-1" />
                {aiPausedChats} paused
              </>
            ) : (
              <>
                <Bot className="h-3 w-3 mr-1" />
                AI Active
              </>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {isThrottled
            ? "AI is throttled due to usage limits"
            : hasWarnings
            ? "Approaching usage limits"
            : aiPausedChats > 0
            ? `AI is paused for ${aiPausedChats} chat(s)`
            : "AI is running normally"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Helper to format large numbers
function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}
