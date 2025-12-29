"use client";

import { Button } from "@/components/ui/button";
import { ContactProfilePanel } from "@/components/ui/contact-profile-panel";
import { NotesPanel } from "@/components/ui/notes-panel";
import { FileText, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useState } from "react";

interface Note {
  id: number;
  messageId?: string;
  chatId?: string;
  userId: number;
  note: string;
  createdAt: Date;
  user?: {
    id: number;
    name: string;
    email: string;
  };
}

interface NotesGeneralAndMessage {
  chatId: string;
  generalNotes: Note[];
  messageNotes: Record<string, Note[]>;
}

interface ChatSidebarProps {
  chatId: string;
  contactId: string | null;
  currentUserId: number;
  notes: NotesGeneralAndMessage | null;
  notesLoading: boolean;
  onAddNote: (note: string, messageId?: string) => Promise<void>;
  onDeleteNote: (noteId: number) => Promise<void>;
  onProfileUpdate?: () => void;
  /** Phone number of the chat participant (for creating new contacts) */
  participantPhone?: string;
  /** Name of the chat participant (if available from WhatsApp profile) */
  participantName?: string;
  /** Callback when a new contact is created or found */
  onContactCreated?: (contactId: string) => void;
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
 */
export const ChatSidebar = memo(function ChatSidebar({
  chatId,
  contactId,
  currentUserId,
  notes,
  notesLoading,
  onAddNote,
  onDeleteNote,
  onProfileUpdate,
  participantPhone,
  participantName,
  onContactCreated,
}: ChatSidebarProps) {
  const t = useTranslations("notes");
  const [activeTab, setActiveTab] = useState<"profile" | "notes">("profile");

  // Can show profile if we have either contactId or participantPhone
  const canShowProfile = !!contactId || !!participantPhone;

  // Handle contact resolution from ContactProfilePanel
  const handleContactResolved = useCallback(
    (newContactId: string) => {
      onContactCreated?.(newContactId);
    },
    [onContactCreated]
  );

  // Switch to profile tab
  const handleProfileClick = useCallback(() => {
    if (canShowProfile) {
      setActiveTab("profile");
    }
  }, [canShowProfile]);

  // Switch to notes tab
  const handleNotesClick = useCallback(() => {
    setActiveTab("notes");
  }, []);

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Tab Header */}
      <div className="border-b px-2 py-1">
        <div className="flex rounded-lg bg-muted p-1">
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
        ) : (
          <NotesPanel
            chatId={chatId}
            currentUserId={currentUserId}
            notes={notes}
            loading={notesLoading}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
          />
        )}
      </div>
    </div>
  );
});
