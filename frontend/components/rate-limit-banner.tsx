import { Button } from "@/components/ui/button";
import { Clock, Settings, XCircle } from "lucide-react";
import { format } from "date-fns";

interface RateLimitBannerProps {
    resetTime?: string;
    currentCount?: number;
    maxCount?: number;
    onDismiss?: () => void;
    onOpenSettings?: () => void;
    className?: string;
}

export function RateLimitBanner({
    resetTime,
    currentCount,
    maxCount,
    onDismiss,
    onOpenSettings,
    className,
}: RateLimitBannerProps) {
    if (!resetTime) return null;

    const resetDate = new Date(resetTime);
    const formattedResetTime = format(resetDate, "h:mm a");

    // Build count display string
    const countDisplay = currentCount !== undefined && maxCount !== undefined
        ? ` (${currentCount}/${maxCount} messages sent)`
        : "";

    return (
        <div
            className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in slide-in-from-top-2"
        >
            <div className="flex items-start gap-3">
                <div className="mt-0.5 p-1 bg-amber-100 dark:bg-amber-900/50 rounded-full">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                        AI Rate Limit Reached{countDisplay}
                    </h4>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mt-0.5">
                        AI replies are paused until {formattedResetTime}. You can increase the limits in AI settings.
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                {onOpenSettings && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onOpenSettings}
                        className="h-8 border-amber-200 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-800 dark:hover:bg-amber-900/50 dark:text-amber-100"
                    >
                        <Settings className="h-3.5 w-3.5 mr-1.5" />
                        Settings
                    </Button>
                )}
                {onDismiss && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDismiss}
                        className="h-8 w-8 p-0 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-900/50"
                    >
                        <XCircle className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}
