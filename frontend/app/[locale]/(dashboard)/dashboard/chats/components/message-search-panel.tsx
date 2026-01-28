"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WhatsAppStatusIcon } from "@/components/whatsapp-status-icon";
import { backendApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  File,
  FileText,
  Image,
  Loader2,
  Mic,
  User,
  Video,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

// Types
interface MessageSearchResult {
  messageId: string;
  chatId: string;
  text: string;
  type: string;
  direction: "inbound" | "outbound";
  status: string;
  timestamp: string;
  sender: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  attachments?: any[];
  matchedText?: string;
  matchStartIndex?: number;
  matchEndIndex?: number;
}

interface SearchMessagesResponse {
  results: MessageSearchResult[];
  total: number;
  hasMore: boolean;
  query: string;
}

interface MessageSearchPanelProps {
  chatId: string;
  participantName?: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectMessage: (messageId: string) => void;
}



// Media type icon component
function MediaTypeIcon({ type }: { type: string }) {
  const iconClass = "h-3.5 w-3.5 text-muted-foreground flex-shrink-0";

  switch (type) {
    case "image":
      return <Image className={iconClass} />;
    case "video":
      return <Video className={iconClass} />;
    case "audio":
      return <Mic className={iconClass} />;
    case "document":
      return <FileText className={iconClass} />;
    case "contacts":
      return <User className={iconClass} />;
    case "sticker":
    case "gif":
      return <File className={iconClass} />;
    default:
      return null;
  }
}

// Format date for display
function formatSearchDate(dateString: string, yesterdayLabel: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  // Same day - show time only
  if (date.toDateString() === now.toDateString()) {
    return format(date, "h:mm a");
  }

  // Yesterday
  if (date.toDateString() === yesterday.toDateString()) {
    return `${yesterdayLabel}, ${format(date, "h:mm a")}`;
  }

  // This year - show month and day
  if (date.getFullYear() === now.getFullYear()) {
    return format(date, "MMM d, h:mm a");
  }

  // Different year - show full date
  return format(date, "MMM d, yyyy, h:mm a");
}

// Truncate text with ellipsis
function truncateText(text: string, maxLength: number = 60): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// Highlight matched text component
function HighlightedText({
  text,
  query,
  maxLength = 80,
}: {
  text: string;
  query: string;
  maxLength?: number;
}) {
  if (!query || !text) {
    return (
      <span className="line-clamp-1">{truncateText(text, maxLength)}</span>
    );
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return (
      <span className="line-clamp-1">{truncateText(text, maxLength)}</span>
    );
  }

  // Calculate start position to show context around the match
  let displayStart = Math.max(0, matchIndex - 20);
  let displayEnd = Math.min(text.length, matchIndex + query.length + 40);

  // Adjust if we're showing from the middle
  let prefix = displayStart > 0 ? "..." : "";
  let suffix = displayEnd < text.length ? "..." : "";

  const displayText = text.slice(displayStart, displayEnd);
  const adjustedMatchIndex = matchIndex - displayStart;

  const beforeMatch = displayText.slice(0, adjustedMatchIndex);
  const match = displayText.slice(
    adjustedMatchIndex,
    adjustedMatchIndex + query.length
  );
  const afterMatch = displayText.slice(adjustedMatchIndex + query.length);

  return (
    <span className="line-clamp-1">
      {prefix}
      {beforeMatch}
      <mark className="bg-yellow-200 dark:bg-yellow-800 text-foreground rounded px-0.5">
        {match}
      </mark>
      {afterMatch}
      {suffix}
    </span>
  );
}

// Single search result item
function SearchResultItem({
  result,
  query,
  participantName,
  yesterdayLabel,
  onClick,
}: {
  result: MessageSearchResult;
  query: string;
  participantName?: string;
  yesterdayLabel: string;
  onClick: () => void;
}) {
  const isOutbound = result.direction === "outbound";
  const showMediaIcon = result.type !== "text";
  const displayText = result.text || `[${result.type}]`;

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border last:border-0"
    >
      {/* First row: Date */}
      <div className="text-xs text-muted-foreground mb-1">
        {formatSearchDate(result.timestamp, yesterdayLabel)}
      </div>

      {/* Second row: Status, media icon, sender name (if outbound), text */}
      <div className="flex items-start gap-1.5">
        {/* Status icon for outbound messages */}
        {isOutbound && (
          <div className="flex-shrink-0 mt-0.5">
            <WhatsAppStatusIcon
              status={result.status as any}
              className="scale-75"
            />
          </div>
        )}

        {/* Media type icon */}
        {showMediaIcon && (
          <div className="flex-shrink-0 mt-0.5">
            <MediaTypeIcon type={result.type} />
          </div>
        )}

        {/* Message text with sender name for outbound */}
        <div className="flex-1 min-w-0 text-sm">
          {isOutbound && participantName && (
            <span className="font-medium text-primary mr-1">
              {participantName}:
            </span>
          )}
          <span className="text-foreground">
            <HighlightedText text={displayText} query={query} />
          </span>
        </div>
      </div>
    </button>
  );
}

export function MessageSearchPanel({
  chatId,
  participantName,
  isOpen,
  onClose,
  onSelectMessage,
}: MessageSearchPanelProps) {
  const t = useTranslations("chats.search");
  
  const {
    value: searchQuery,
    debouncedValue: debouncedQuery,
    setValue: setSearchQuery,
  } = useDebouncedValue("", { delay: 300 });

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isJumpingToDate, setIsJumpingToDate] = useState(false);
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Jump to a specific date - find the first message on or after that date
  const handleJumpToDate = useCallback(
    async (date: Date) => {
      try {
        setIsJumpingToDate(true);
        setError(null);

        const response = await backendApi.chats.findMessageByDate(chatId, date);

        if (response.found && response.messageId) {
          // Navigate to the message
          onSelectMessage(response.messageId);
          // Close the date picker
          setIsDatePickerOpen(false);
        } else {
          setError("noMessagesOnDate");
        }
      } catch (err) {
        console.error("Jump to date error:", err);
        setError("jumpToDateError");
      } finally {
        setIsJumpingToDate(false);
      }
    },
    [chatId, onSelectMessage]
  );

  // Perform search
  const performSearch = useCallback(
    async (query: string, append = false) => {
      if (query.length < 2) {
        if (!append) {
          setResults([]);
          setTotal(0);
          setHasMore(false);
        }
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const options: {
          skip?: number;
          take?: number;
        } = {
          take: 20,
        };

        if (append && results.length > 0) {
          options.skip = results.length;
        }

        const response: SearchMessagesResponse =
          await backendApi.chats.searchMessages(chatId, query, options);

        if (append) {
          setResults((prev) => [...prev, ...response.results]);
        } else {
          setResults(response.results);
        }

        setTotal(response.total);
        setHasMore(response.hasMore);
      } catch (err) {
        console.error("Search error:", err);
        setError("searchError");
        if (!append) {
          setResults([]);
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [chatId, results.length]
  );

  // Effect to trigger search on debounced query change
  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery]); // Intentionally not including performSearch to avoid loops

  // Reset search when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Focus the input when panel opens
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset when chat changes
  useEffect(() => {
    setSearchQuery("");
    setResults([]);
    setTotal(0);
    setHasMore(false);
    setError(null);
  }, [chatId]);

  // Handle load more
  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      performSearch(debouncedQuery, true);
    }
  };

  // Handle scroll for infinite loading
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      // Load more when user scrolls near the bottom
      if (scrollHeight - scrollTop - clientHeight < 100) {
        handleLoadMore();
      }
    },
    [handleLoadMore]
  );

  // Handle message selection
  const handleSelectMessage = (messageId: string) => {
    onSelectMessage(messageId);
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background border-l",
        "animate-in slide-in-from-right duration-300"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm">{t("title")}</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">{t("closeSearch")}</span>
        </Button>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <SearchInput
            ref={inputRef}
            placeholder={t("placeholder")}
            value={searchQuery}
            onChange={setSearchQuery}
            className="flex-1"
          />

          {/* Date Picker - Jump to Date */}
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 flex-shrink-0"
                title={t("jumpToDate")}
                disabled={isJumpingToDate}
              >
                {isJumpingToDate ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarIcon className="h-4 w-4" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-2 border-b">
                <p className="text-sm font-medium text-center">
                  {t("jumpToDate")}
                </p>
              </div>
              <Calendar
                mode="single"
                onSelect={(date) => {
                  if (date) {
                    handleJumpToDate(date);
                  }
                }}
                disabled={(date) => date > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Results Area */}
      <div
        ref={resultsContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {/* Loading state */}
        {isLoading && results.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-4 text-center text-sm text-destructive">
            {t(error)}
          </div>
        )}

        {/* Empty state - no query */}
        {!isLoading && !error && searchQuery.length < 2 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t("typeAtLeastChars")}
          </div>
        )}

        {/* Empty state - no results */}
        {!isLoading &&
          !error &&
          searchQuery.length >= 2 &&
          results.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("noResultsFor", { query: searchQuery })}
            </div>
          )}

        {/* Results count */}
        {results.length > 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground border-b bg-muted/30">
            {t("messagesFound", { count: total })}
          </div>
        )}

        {/* Results list */}
        {results.map((result) => (
          <SearchResultItem
            key={result.messageId}
            result={result}
            query={searchQuery}
            participantName={participantName}
            yesterdayLabel={t("yesterday")}
            onClick={() => handleSelectMessage(result.messageId)}
          />
        ))}

        {/* Load more indicator */}
        {isLoading && results.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Load more button (fallback) */}
        {!isLoading && hasMore && results.length > 0 && (
          <div className="p-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleLoadMore}
            >
              {t("loadMore")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageSearchPanel;
