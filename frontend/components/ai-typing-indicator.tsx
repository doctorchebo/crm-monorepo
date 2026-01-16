/**
 * AI Typing Indicator
 * 
 * Displays an animated typing indicator when AI is generating a response.
 * Uses the same styling patterns as Twitter/WhatsApp typing bubbles.
 */

import { cn } from "@/lib/utils";
import { Bot } from "lucide-react";

interface AITypingIndicatorProps {
    className?: string;
}

export function AITypingIndicator({ className }: AITypingIndicatorProps) {
    return (
        <div
            className={cn(
                "flex items-start gap-2 px-4 py-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                className
            )}
        >
            {/* AI Avatar */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Bot className="w-4 h-4 text-white" />
            </div>

            {/* Typing Bubble */}
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 max-w-[100px]">
                <div className="flex items-center gap-1">
                    <span
                        className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms", animationDuration: "1s" }}
                    />
                    <span
                        className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms", animationDuration: "1s" }}
                    />
                    <span
                        className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms", animationDuration: "1s" }}
                    />
                </div>
            </div>

            {/* Label */}
            <span className="text-xs text-muted-foreground self-center ml-1">
                AI is thinking...
            </span>
        </div>
    );
}
