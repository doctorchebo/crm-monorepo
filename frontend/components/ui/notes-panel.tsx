"use client";

/**
 * NotesPanel - Notes thread component with infinite scroll and search
 *
 * Features:
 * - Infinite scroll (loads X latest notes, loads more on scroll up)
 * - Bidirectional scroll (can scroll up for older, down for newer)
 * - Notes search functionality
 * - Search results with navigation to specific notes
 * - Real-time WebSocket integration
 * - Scroll position persistence
 * - Highlighted note after search navigation
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useNotesInfiniteScroll } from "@/hooks/use-notes-infinite-scroll";
import { useNotesSocket } from "@/hooks/use-notes-socket";
import { backendApi, NoteResponse } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { ArrowDown, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

// ==================== Types ====================
interface NotesPanelProps {
  chatId: string;
  currentUserId: number;
}

/**
 * Imperative handle for NotesPanel - allows parent to trigger actions
 */
export interface NotesPanelHandle {
  /** Scroll to bottom of notes */
  scrollToBottom: (smooth?: boolean) => void;
  /** Refresh notes */
  refresh: () => Promise<void>;
}

// ==================== Helper Functions ====================

/**
 * Format relative time for display
 */
function formatRelativeTime(
  date: Date | string,
  t: (key: string, params?: { count: number }) => string,
): string {
  const now = new Date();
  const notesDate = new Date(date);
  const diff = now.getTime() - notesDate.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return t("relativeTime.justNow");
  if (minutes < 60) return t("relativeTime.minutesAgo", { count: minutes });
  if (hours < 24) return t("relativeTime.hoursAgo", { count: hours });
  if (days < 7) return t("relativeTime.daysAgo", { count: days });

  return notesDate.toLocaleDateString();
}

/**
 * Highlight search terms in text
 */
function highlightSearchTerms(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-900 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

// ==================== Sub-components ====================

/**
 * Loading skeleton for notes
 */
function NotesLoadingSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-muted/50 rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

/**
 * Loading indicator for loading more notes
 */
function LoadingMoreIndicator() {
  return (
    <div className="flex items-center justify-center py-2">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Individual note item
 */
interface NoteItemProps {
  note: NoteResponse;
  currentUserId: number;
  isHighlighted: boolean;
  searchQuery?: string;
  onDelete: (noteId: number) => void;
  onHighlightDismiss: () => void;
  t: (key: string, params?: Record<string, any>) => string;
}

function NoteItem({
  note,
  currentUserId,
  isHighlighted,
  searchQuery,
  onDelete,
  onHighlightDismiss,
  t,
}: NoteItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(note.id);
    } finally {
      setIsDeleting(false);
    }
  };

  // Dismiss highlight after a delay
  useEffect(() => {
    if (isHighlighted) {
      const timer = setTimeout(onHighlightDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted, onHighlightDismiss]);

  return (
    <div
      data-note-id={note.id}
      className={cn(
        "bg-muted/50 rounded p-3 text-xs space-y-1 transition-all duration-300",
        isHighlighted && "ring-2 ring-primary bg-primary/10 animate-pulse",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-xs truncate">
            {note.user?.name || t("unknown")}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatRelativeTime(note.createdAt, t)}
          </p>
        </div>
        {note.userId === currentUserId && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className={cn(
              "text-muted-foreground hover:text-destructive transition-colors flex-shrink-0",
              isDeleting && "opacity-50 cursor-not-allowed",
            )}
            title={t("deleteNote")}
          >
            {isDeleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
      <p className="text-xs whitespace-pre-wrap break-words">
        {searchQuery ? highlightSearchTerms(note.note, searchQuery) : note.note}
      </p>
    </div>
  );
}

/**
 * Search result item
 */
interface SearchResultItemProps {
  result: NoteResponse & { matchContext?: string };
  searchQuery: string;
  onNavigate: (noteId: number) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

function SearchResultItem({
  result,
  searchQuery,
  onNavigate,
  t,
}: SearchResultItemProps) {
  return (
    <button
      onClick={() => onNavigate(result.id)}
      className="w-full text-left bg-muted/30 hover:bg-muted/50 rounded p-3 text-xs space-y-1 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-xs truncate">
          {result.user?.name || t("unknown")}
        </p>
        <p className="text-xs text-muted-foreground flex-shrink-0">
          {formatRelativeTime(result.createdAt, t)}
        </p>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">
        {result.matchContext
          ? highlightSearchTerms(result.matchContext, searchQuery)
          : highlightSearchTerms(result.note.slice(0, 100), searchQuery)}
      </p>
    </button>
  );
}

// ==================== Main Component ====================

export const NotesPanel = forwardRef<NotesPanelHandle, NotesPanelProps>(
  function NotesPanel({ chatId, currentUserId }, ref) {
    const t = useTranslations("notes");

    // Local state
    const [newNoteText, setNewNoteText] = useState("");
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Infinite scroll hook
    const {
      state,
      searchState,
      scrollContainerRef,
      showScrollButton,
      newNotesCount,
      scrollToBottom,
      loadOlderNotes,
      loadNewerNotes,
      onUserAddedNote,
      onRemoteNoteReceived,
      onNoteDeleted,
      toggleSearch,
      setSearchQuery,
      clearSearch,
      navigateToNote,
      dismissHighlight,
      refresh,
    } = useNotesInfiniteScroll({
      chatId,
      pageSize: 20,
    });

    // WebSocket for real-time updates
    const {
      isConnected,
      subscribeToChat,
      unsubscribeFromChat,
      onNoteCreated,
      onNoteDeleted: onSocketNoteDeleted,
    } = useNotesSocket({ enabled: true });

    // Subscribe to chat notes via WebSocket
    useEffect(() => {
      if (isConnected && chatId) {
        subscribeToChat(chatId);
        return () => {
          unsubscribeFromChat(chatId);
        };
      }
    }, [isConnected, chatId, subscribeToChat, unsubscribeFromChat]);

    // Handle WebSocket note created events
    useEffect(() => {
      const unsubscribe = onNoteCreated((event) => {
        if (event.chatId === chatId) {
          // Only add if it's a general note (not message-attached)
          if (!event.note.messageId) {
            onRemoteNoteReceived(event.note as NoteResponse);
          }
        }
      });
      return unsubscribe;
    }, [chatId, onNoteCreated, onRemoteNoteReceived]);

    // Handle WebSocket note deleted events
    useEffect(() => {
      const unsubscribe = onSocketNoteDeleted((event) => {
        if (event.chatId === chatId) {
          onNoteDeleted(event.noteId);
        }
      });
      return unsubscribe;
    }, [chatId, onSocketNoteDeleted, onNoteDeleted]);

    // Expose imperative methods
    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom,
        refresh,
      }),
      [scrollToBottom, refresh],
    );

    // Handle adding a new note
    const handleAddNote = useCallback(async () => {
      if (!newNoteText.trim() || !chatId) return;

      try {
        setIsAddingNote(true);
        setError(null);

        const response = await backendApi.notes.create({
          chatId,
          note: newNoteText.trim(),
        });

        setNewNoteText("");

        // Add the note to local state and scroll to bottom
        onUserAddedNote(response);
      } catch (err) {
        console.error("[NotesPanel] Failed to add note:", err);
        setError(t("addNoteError") || "Failed to add note. Please try again.");
      } finally {
        setIsAddingNote(false);
      }
    }, [newNoteText, chatId, onUserAddedNote, t]);

    // Handle deleting a note
    const handleDeleteNote = useCallback(
      async (noteId: number) => {
        try {
          await backendApi.notes.delete(noteId);
          onNoteDeleted(noteId);
        } catch (err) {
          console.error("[NotesPanel] Failed to delete note:", err);
          setError(t("deleteNoteError") || "Failed to delete note.");
        }
      },
      [onNoteDeleted, t],
    );

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          handleAddNote();
        }
      },
      [handleAddNote],
    );

    return (
      <div className="flex flex-col h-full border-l bg-background">
        {/* Header with Search */}
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            {searchState.isSearchActive ? (
              <div className="flex items-center gap-2 flex-1">
                <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Input
                  type="text"
                  value={searchState.query}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("searchPlaceholder") || "Search notes..."}
                  className="h-7 text-xs flex-1"
                  autoFocus
                />
                <button
                  onClick={clearSearch}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={t("closeSearch") || "Close search"}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <h3 className="font-semibold text-sm">{t("title")}</h3>
                <button
                  onClick={toggleSearch}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={t("searchNotes") || "Search notes"}
                >
                  <Search className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 relative overflow-hidden">
          {searchState.isSearchActive ? (
            /* Search Results */
            <div className="absolute inset-0 overflow-y-auto p-4 space-y-2">
              {searchState.isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : searchState.query.trim() &&
                searchState.results.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-xs text-muted-foreground">
                    {t("noSearchResults") || "No notes found"}
                  </p>
                </div>
              ) : searchState.results.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("searchResultsCount", { count: searchState.total }) ||
                      `${searchState.total} results`}
                  </p>
                  {searchState.results.map((result) => (
                    <SearchResultItem
                      key={result.id}
                      result={result}
                      searchQuery={searchState.query}
                      onNavigate={navigateToNote}
                      t={t}
                    />
                  ))}
                </>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <p className="text-xs text-muted-foreground">
                    {t("searchPrompt") || "Type to search notes..."}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Notes Thread */
            <div
              ref={scrollContainerRef}
              className="absolute inset-0 overflow-y-auto p-4 space-y-3"
            >
              {state.isLoading ? (
                <NotesLoadingSkeleton />
              ) : state.error ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <p className="text-xs text-destructive">{state.error}</p>
                  <Button variant="outline" size="sm" onClick={refresh}>
                    {t("retry") || "Retry"}
                  </Button>
                </div>
              ) : state.notes.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-muted-foreground">
                    {t("noNotesYet")}
                  </p>
                </div>
              ) : (
                <>
                  {/* Loading more indicator (top) */}
                  {state.isLoadingMore && state.pagination?.hasPrevious && (
                    <LoadingMoreIndicator />
                  )}

                  {/* Notes list */}
                  {state.notes.map((note) => (
                    <NoteItem
                      key={note.id}
                      note={note}
                      currentUserId={currentUserId}
                      isHighlighted={searchState.highlightedNoteId === note.id}
                      searchQuery={
                        searchState.highlightedNoteId === note.id
                          ? searchState.query
                          : undefined
                      }
                      onDelete={handleDeleteNote}
                      onHighlightDismiss={dismissHighlight}
                      t={t}
                    />
                  ))}

                  {/* Loading more indicator (bottom) */}
                  {state.isLoadingMore && state.pagination?.hasMore && (
                    <LoadingMoreIndicator />
                  )}
                </>
              )}
            </div>
          )}

          {/* Scroll to Bottom Button */}
          {showScrollButton && !searchState.isSearchActive && (
            <button
              onClick={() => scrollToBottom(true)}
              className={cn(
                "absolute bottom-3 right-3 z-10",
                "flex items-center justify-center",
                "w-8 h-8 rounded-full shadow-lg",
                "bg-primary text-primary-foreground",
                "hover:bg-primary/90 transition-all",
                "animate-in fade-in slide-in-from-bottom-2 duration-200",
              )}
              title={t("scrollToBottom") || "Scroll to bottom"}
            >
              <ArrowDown className="h-4 w-4" />
              {newNotesCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-destructive text-destructive-foreground text-[10px] font-medium rounded-full px-1">
                  {newNotesCount > 99 ? "99+" : newNotesCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Add Note Input */}
        <div className="border-t p-4 space-y-2">
          {error && (
            <div className="bg-destructive/10 text-destructive text-xs p-2 rounded flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="hover:opacity-70"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <Textarea
            placeholder={t("addNotePlaceholder")}
            value={newNoteText}
            onChange={(e) => {
              setNewNoteText(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            className="min-h-[80px] resize-none text-xs"
            disabled={isAddingNote}
          />
          <Button
            onClick={handleAddNote}
            disabled={!newNoteText.trim() || isAddingNote}
            size="sm"
            className="w-full"
          >
            {isAddingNote ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Plus className="h-3 w-3 mr-1" />
            )}
            {t("addNote")}
          </Button>
        </div>
      </div>
    );
  },
);
