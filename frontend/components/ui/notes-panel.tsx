"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

// Helper function to format relative time
function formatRelativeTime(
  date: Date | string,
  t: (key: string, params?: { count: number }) => string
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

interface NotesPanel {
  chatId: string;
  currentUserId: number;
  notes: NotesGeneralAndMessage | null;
  loading: boolean;
  onAddNote: (note: string, messageId?: string) => Promise<void>;
  onDeleteNote: (noteId: number) => Promise<void>;
}

export function NotesPanel({
  chatId,
  currentUserId,
  notes,
  loading,
  onAddNote,
  onDeleteNote,
}: NotesPanel) {
  const t = useTranslations("notes");
  const [newNoteText, setNewNoteText] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;

    try {
      setIsAddingNote(true);
      await onAddNote(newNoteText);
      setNewNoteText("");
    } catch (error) {
      console.error("Failed to add note:", error);
    } finally {
      setIsAddingNote(false);
    }
  };

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h3 className="font-semibold text-sm">{t("title")}</h3>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground">{t("loadingNotes")}</p>
          </div>
        ) : notes && notes.generalNotes.length > 0 ? (
          <>
            {/* General Notes Section */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                {t("generalNotes")}
              </h4>
              <div className="space-y-2">
                {notes.generalNotes.map((note) => (
                  <div
                    key={note.id}
                    className="bg-muted/50 rounded p-3 text-xs space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-xs">
                          {note.user?.name || t("unknown")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(note.createdAt, t)}
                        </p>
                      </div>
                      {note.userId === currentUserId && (
                        <button
                          onClick={() => onDeleteNote(note.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title={t("deleteNote")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs line-clamp-3">{note.note}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Message Notes Section */}
            {Object.keys(notes.messageNotes).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                  {t("messageNotes")}
                </h4>
                <div className="space-y-2">
                  {Object.entries(notes.messageNotes).map(
                    ([messageId, messageNotesList]) => (
                      <div key={messageId} className="space-y-1">
                        {messageNotesList.map((note: Note) => (
                          <div
                            key={note.id}
                            className="bg-muted/30 rounded p-2 text-xs space-y-1 border-l-2 border-primary"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="font-medium text-xs">
                                  {note.user?.name || t("unknown")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatRelativeTime(note.createdAt, t)}
                                </p>
                              </div>
                              {note.userId === currentUserId && (
                                <button
                                  onClick={() => onDeleteNote(note.id)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                  title={t("deleteNote")}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                            <p className="text-xs line-clamp-3">{note.note}</p>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground">{t("noNotesYet")}</p>
          </div>
        )}
      </div>

      {/* Add Note Input */}
      <div className="border-t p-4 space-y-2">
        <Textarea
          placeholder={t("addNotePlaceholder")}
          value={newNoteText}
          onChange={(e) => setNewNoteText(e.target.value)}
          className="min-h-[80px] resize-none text-xs"
          disabled={isAddingNote}
        />
        <Button
          onClick={handleAddNote}
          disabled={!newNoteText.trim() || isAddingNote}
          size="sm"
          className="w-full"
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("addNote")}
        </Button>
      </div>
    </div>
  );
}
