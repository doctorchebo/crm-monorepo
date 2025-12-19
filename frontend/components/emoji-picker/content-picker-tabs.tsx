"use client";

/**
 * Content Picker Tabs
 * A tab system for switching between Emoji, GIF, and Sticker pickers
 * Designed for future extensibility
 *
 * Currently only Emoji is implemented, but the architecture supports
 * adding GIF and Sticker tabs in the future
 */

import { cn } from "@/lib/utils";
import { Film, Smile, Sticker } from "lucide-react";
import { useCallback, useState } from "react";
import { EmojiPickerContent, emojiPickerStyles } from "./emoji-picker-content";
import { Emoji, PickerTab } from "./types";

interface ContentPickerTabsProps {
  onEmojiSelect: (emoji: Emoji) => void;
  initialTab?: PickerTab;
  enabledTabs?: PickerTab[];
  className?: string;
}

interface TabConfig {
  id: PickerTab;
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
}

/**
 * Multi-tab content picker supporting emojis, GIFs, and stickers
 * Only emoji is currently implemented - others will show "Coming soon"
 */
export function ContentPickerTabs({
  onEmojiSelect,
  initialTab = "emoji",
  enabledTabs = ["emoji"],
  className,
}: ContentPickerTabsProps) {
  const [activeTab, setActiveTab] = useState<PickerTab>(initialTab);

  const tabs: TabConfig[] = [
    {
      id: "emoji",
      icon: <Smile className="h-5 w-5" />,
      label: "Emoji",
      enabled: enabledTabs.includes("emoji"),
    },
    {
      id: "gif",
      icon: <Film className="h-5 w-5" />,
      label: "GIF",
      enabled: enabledTabs.includes("gif"),
    },
    {
      id: "sticker",
      icon: <Sticker className="h-5 w-5" />,
      label: "Sticker",
      enabled: enabledTabs.includes("sticker"),
    },
  ];

  const handleTabClick = useCallback((tabId: PickerTab) => {
    setActiveTab(tabId);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, tabId: PickerTab) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActiveTab(tabId);
      }
    },
    []
  );

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Tab bar */}
      <div className="flex border-b border-border" role="tablist">
        {tabs
          .filter((tab) => tab.enabled)
          .map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => handleTabClick(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "text-primary border-b-2 border-primary -mb-px"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
      </div>

      {/* Tab panels */}
      <div className="flex-1 min-h-0">
        {/* Emoji panel */}
        <div
          id="panel-emoji"
          role="tabpanel"
          aria-labelledby="tab-emoji"
          hidden={activeTab !== "emoji"}
          className={cn(activeTab !== "emoji" && "hidden")}
        >
          <style>{emojiPickerStyles}</style>
          <EmojiPickerContent onEmojiSelect={onEmojiSelect} />
        </div>

        {/* GIF panel - placeholder for future implementation */}
        <div
          id="panel-gif"
          role="tabpanel"
          aria-labelledby="tab-gif"
          hidden={activeTab !== "gif"}
          className={cn(
            "flex items-center justify-center h-[350px] text-muted-foreground",
            activeTab !== "gif" && "hidden"
          )}
        >
          <div className="text-center">
            <Film className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">GIF picker coming soon</p>
          </div>
        </div>

        {/* Sticker panel - placeholder for future implementation */}
        <div
          id="panel-sticker"
          role="tabpanel"
          aria-labelledby="tab-sticker"
          hidden={activeTab !== "sticker"}
          className={cn(
            "flex items-center justify-center h-[350px] text-muted-foreground",
            activeTab !== "sticker" && "hidden"
          )}
        >
          <div className="text-center">
            <Sticker className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sticker picker coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
