"use client";

import { Button } from "@/components/ui/button";
import { ContactProfilePanel } from "@/components/ui/contact-profile-panel";
import { NotesPanel, NotesPanelHandle } from "@/components/ui/notes-panel";
import { PaginatedActivityPanel } from "@/components/ui/paginated-activity-panel";
import { PipelinePanel } from "@/components/ui/pipeline-panel";
import { FileText, GitBranch, History, User } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type SidebarTab = "profile" | "notes" | "pipeline" | "activity";

interface ChatSidebarProps {
  chatId: string;
  contactId: string | null;
  currentUserId: number;
  onProfileUpdate?: () => void;
  /** Phone number of the chat participant (for creating new contacts) */
  participantPhone?: string;
  /** Name of the chat participant (if available from WhatsApp profile) */
  participantName?: string;
  /** Callback when a new contact is created or found */
  onContactCreated?: (contactId: string) => void;
  /** Initial tab to show (for restoring from persistence) */
  initialTab?: SidebarTab;
}

/**
 * Imperative handle for ChatSidebar - allows parent to control notes behavior
 */
export interface ChatSidebarHandle {
  /** Scroll notes to bottom */
  scrollNotesToBottom: (smooth?: boolean) => void;
  /** Refresh notes */
  refreshNotes: () => Promise<void>;
}

/**
 * Memoized tab button to prevent unnecessary re-renders
 */
const TabButton = memo(function TabButton({
  active,
  disabled,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      size="sm"
      className="flex-1 h-7 text-xs gap-1"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Button>
  );
});

/**
 * ChatSidebar - Displays profile/notes tabs for the selected chat
 *
 * Uses ContactProfilePanel for unified contact management:
 * - Shows existing contact profile if contactId is provided
 * - Looks up contact by phone if only phone is available
 * - Shows create form if no contact exists
 *
 * Uses NotesPanel with built-in:
 * - Infinite scroll for notes thread
 * - Search functionality
 * - Real-time WebSocket updates
 * - Scroll position persistence
 *
 * Tab persistence:
 * - initialTab prop allows restoring from page reload
 * - onTabChange callback allows parent to persist user's tab selection
 * - Tab does NOT reset when switching chats (only on explicit user action)
 */
export const ChatSidebar = memo(
  forwardRef<ChatSidebarHandle, ChatSidebarProps>(function ChatSidebar(
    {
      chatId,
      contactId,
      currentUserId,
      onProfileUpdate,
      participantPhone,
      participantName,
      onContactCreated,
      initialTab = "profile",
      onTabChange,
    },
    ref,
  ) {
    const t = useTranslations("notes");
    const tPipeline = useTranslations("pipeline");
    const [activeTab, setActiveTab] = useState<SidebarTab>(initialTab);
    const notesPanelRef = useRef<NotesPanelHandle>(null);
    const hasInitializedRef = useRef(false);
    const previousTabRef = useRef<SidebarTab>(initialTab);

    // Expose imperative methods to parent
    useImperativeHandle(
      ref,
      () => ({
        scrollNotesToBottom: (smooth?: boolean) => {
          notesPanelRef.current?.scrollToBottom(smooth);
        },
        refreshNotes: async () => {
          await notesPanelRef.current?.refresh();
        },
      }),
      [activeTab, onTabChange],
    );

    // Initialize tab from prop only on first render
    const canShowProfile = !!contactId || !!participantPhone;

    // Handle contact resolution from ContactProfilePanel
    const handleContactResolved = useCallback(
      (newContactId: string) => {
        onContactCreated?.(newContactId);
      },
      [onContactCreated],
    );

    // Switch to profile tab
    const handleProfileClick = useCallback(() => {
      if (canShowProfile) {
        setActiveTab("profile");
        onTabChange?.("profile");
      }
    }, [canShowProfile, onTabChange]);

    // Switch to notes tab
    const handleNotesClick = useCallback(() => {
      setActiveTab("notes");
      onTabChange?.("notes");
    }, [onTabChange]);

    // Switch to pipeline tab
    const handlePipelineClick = useCallback(() => {
      setActiveTab("pipeline");
      onTabChange?.("pipeline");
    }, [onTabChange]);

    // Switch to activity tab
    const handleActivityClick = useCallback(() => {
      setActiveTab("activity");
      onTabChange?.("activity");
    }, [onTabChange]);

    return (
      <div className="flex flex-col h-full border-l bg-background">
        {/* Tab Header */}
        <div className="border-b px-2 py-1">
          <div className="flex rounded-lg bg-muted p-1 gap-0.5">
            <TabButton
              active={activeTab === "profile"}
              disabled={!canShowProfile}
              onClick={handleProfileClick}
              icon={User}
              label={t("profile")}
            />
            <TabButton
              active={activeTab === "notes"}
              onClick={handleNotesClick}
              icon={FileText}
              label={t("title")}
            />
            <TabButton
              active={activeTab === "pipeline"}
              onClick={handlePipelineClick}
              icon={GitBranch}
              label={tPipeline("title")}
            />
            <TabButton
              active={activeTab === "activity"}
              onClick={handleActivityClick}
              icon={History}
              label={tPipeline("activity")}
            />
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "profile" ? (
            <ContactProfilePanel
              contactId={contactId}
              chatId={chatId}
              participantPhone={participantPhone}
              participantName={participantName}
              onContactResolved={handleContactResolved}
              onProfileUpdate={onProfileUpdate}
            />
          ) : activeTab === "pipeline" ? (
            <PipelinePanel chatId={chatId} />
          ) : activeTab === "activity" ? (
            <PaginatedActivityPanel
              hookOptions={{
                initialFilters: { chatId },
                initialPageSize: 20,
              }}
              showDateFilter
              showEntityNames={false}
              maxHeight="calc(100vh - 200px)"
              asCard={false}
            />
          ) : (
            <NotesPanel
              ref={notesPanelRef}
              chatId={chatId}
              currentUserId={currentUserId}
            />
          )}
        </div>
      </div>
    );
  }),
);
