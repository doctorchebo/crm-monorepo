"use client";

import { Button } from "@/components/ui/button";
import { CustomerProfile } from "@/components/ui/customer-profile";
import { NotesPanel } from "@/components/ui/notes-panel";
import { FileText, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface NotesGeneralAndMessage {
  chatId: string;
  generalNotes: Array<{
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
  }>;
  messageNotes: Record<string, Array<any>>;
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
}

export function ChatSidebar({
  chatId,
  contactId,
  currentUserId,
  notes,
  notesLoading,
  onAddNote,
  onDeleteNote,
  onProfileUpdate,
}: ChatSidebarProps) {
  const t = useTranslations("notes");
  // Default to profile tab if contactId exists, otherwise notes
  const [activeTab, setActiveTab] = useState<"profile" | "notes">(
    contactId ? "profile" : "notes"
  );

  // Switch to notes tab if contact becomes unavailable, or to profile if it becomes available
  useEffect(() => {
    if (!contactId && activeTab === "profile") {
      setActiveTab("notes");
    } else if (contactId && activeTab === "notes") {
      // Optionally switch to profile when contact becomes available
      setActiveTab("profile");
    }
  }, [contactId, activeTab]);

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Tab Header */}
      <div className="border-b px-2 py-1">
        <div className="flex rounded-lg bg-muted p-1">
          <Button
            variant={activeTab === "profile" ? "default" : "ghost"}
            size="sm"
            className="flex-1 h-7 text-xs gap-1"
            onClick={() => contactId && setActiveTab("profile")}
            disabled={!contactId}
          >
            <User className="h-3 w-3" />
            {t("profile")}
          </Button>
          <Button
            variant={activeTab === "notes" ? "default" : "ghost"}
            size="sm"
            className="flex-1 h-7 text-xs gap-1"
            onClick={() => setActiveTab("notes")}
          >
            <FileText className="h-3 w-3" />
            {t("title")}
          </Button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "profile" && contactId ? (
          <CustomerProfile
            contactId={contactId}
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
}
