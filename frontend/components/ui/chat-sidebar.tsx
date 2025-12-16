"use client";

import { Button } from "@/components/ui/button";
import { CustomerProfile } from "@/components/ui/customer-profile";
import { NotesPanel } from "@/components/ui/notes-panel";
import { FileText, User } from "lucide-react";
import { useState } from "react";

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
  const [activeTab, setActiveTab] = useState<"profile" | "notes">("profile");

  // If no contactId, show only notes
  if (!contactId) {
    return (
      <div className="flex flex-col h-full border-l bg-background">
        <NotesPanel
          chatId={chatId}
          currentUserId={currentUserId}
          notes={notes}
          loading={notesLoading}
          onAddNote={onAddNote}
          onDeleteNote={onDeleteNote}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Tab Header */}
      <div className="border-b px-2 py-1">
        <div className="flex rounded-lg bg-muted p-1">
          <Button
            variant={activeTab === "profile" ? "default" : "ghost"}
            size="sm"
            className="flex-1 h-7 text-xs gap-1"
            onClick={() => setActiveTab("profile")}
          >
            <User className="h-3 w-3" />
            Profile
          </Button>
          <Button
            variant={activeTab === "notes" ? "default" : "ghost"}
            size="sm"
            className="flex-1 h-7 text-xs gap-1"
            onClick={() => setActiveTab("notes")}
          >
            <FileText className="h-3 w-3" />
            Notes
          </Button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "profile" ? (
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
