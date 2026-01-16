import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { backendApi } from "@/lib/api/endpoints";

interface AiRegenerateBannerProps {
    chatId: string;
    onRegenerateTriggered: () => void;
}

export function AiRegenerateBanner({ chatId, onRegenerateTriggered }: AiRegenerateBannerProps) {
    const t = useTranslations('chat');
    const [isLoading, setIsLoading] = useState(false);

    const handleRegenerate = async () => {
        setIsLoading(true);
        try {
            await backendApi.aiReview.regenerate(chatId);
            onRegenerateTriggered();
        } catch (error) {
            console.error("Failed to trigger regeneration:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="mb-4 mx-4 p-3 rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-900/10 dark:border-purple-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium">
                    {t('aiRegenerateDescription') || "AI response available"}
                </span>
            </div>
            <Button 
                size="sm" 
                variant="outline" 
                onClick={handleRegenerate}
                disabled={isLoading}
                className="bg-white dark:bg-transparent border-purple-200 hover:bg-purple-100 dark:border-purple-700 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300"
            >
                <RefreshCw className={`h-3.5 w-3.5 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                {t('regenerateAi') || "Regenerate AI"}
            </Button>
        </div>
    );
}
