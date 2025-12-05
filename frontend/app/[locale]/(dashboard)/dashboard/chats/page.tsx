"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotesPanel } from "@/components/ui/notes-panel";
import { useAuthProtection } from "@/hooks/use-auth";
import { backendApi } from "@/lib/api/endpoints";
import { Loader, MessageSquare, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

interface Template {
  id: string;
  name: string;
  description?: string;
  isVisible: boolean;
  locales?: Array<{
    id: string;
    locale: string;
    body: string;
    header?: string;
    footer?: string;
    exampleVars?: Record<string, any>;
  }>;
}

interface Chat {
  id?: number;
  chatId: string;
  participantPhone: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  isActive: boolean;
}

interface Message {
  id?: number;
  messageId: string;
  text?: string;
  sender: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  type: string;
}

export default function ChatsPage() {
  const t = useTranslations("chats");
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);

  // Protect this route - redirect to login if token is missing or expired
  useAuthProtection();

  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [templateInput, setTemplateInput] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [notes, setNotes] = useState<any>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [notesPanelWidth, setNotesPanelWidth] = useState(320); // Default width in pixels

  // Fetch templates from API
  const { data: templates = [], isLoading: templatesLoading } = useSWR(
    "visible-templates",
    async () => {
      try {
        return await backendApi.templates.list(true); // Only visible templates
      } catch (error) {
        console.error("Failed to fetch templates:", error);
        return [];
      }
    }
  );

  // Filter templates based on search
  const filteredTemplates = (templates as Template[]).filter((template) =>
    template.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  // Fetch current user on mount
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = await backendApi.user.getProfile();
        setCurrentUserId(user.id);
      } catch (error) {
        console.error("Failed to fetch current user:", error);
      }
    };

    fetchCurrentUser();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      // For initial load, scroll immediately without animation
      // For subsequent updates, use smooth animation
      messagesEndRef.current.scrollIntoView({
        behavior: isInitialLoad ? "auto" : "smooth",
      });
      setIsInitialLoad(false);
    }
  }, [messages]);

  // Fetch chats on mount
  useEffect(() => {
    const fetchChats = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await backendApi.whatsapp.getChats(0, 20);

        if (Array.isArray(data) && data.length > 0) {
          setChats(data);

          // Get the query param from the URL directly to preserve special characters like +
          // searchParams.get() decodes the value, turning + into spaces
          // We need to parse the raw query string instead
          const urlParams = new URLSearchParams(window.location.search);
          const querySelectedChatId = urlParams.get("selectedChatId");

          console.log("Query selectedChatId:", querySelectedChatId);
          console.log(
            "Available chats:",
            data.map((c) => c.chatId)
          );

          if (querySelectedChatId) {
            console.log(
              "Setting selectedChatId from query param:",
              querySelectedChatId
            );
            // Set the selected chat from query param directly
            setSelectedChatId(querySelectedChatId);
          } else {
            // If no query param, select the first chat
            setSelectedChatId(data[0].chatId);
          }
        } else {
          setChats([]);
          setSelectedChatId(null);
        }
      } catch (err) {
        console.error("Error fetching chats:", err);
        setError("Failed to load chats");
        setChats([]);
        setSelectedChatId(null);
      } finally {
        setLoading(false);
      }
    };

    fetchChats();
  }, []);

  // Fetch notes when chat changes
  useEffect(() => {
    if (!selectedChatId) {
      setNotes(null);
      return;
    }

    const fetchNotes = async () => {
      try {
        setNotesLoading(true);
        const notesData = await backendApi.notes.getChatNotes(selectedChatId);
        setNotes(notesData);
      } catch (error) {
        console.error("Error fetching notes:", error);
        setNotes(null);
      } finally {
        setNotesLoading(false);
      }
    };

    fetchNotes();
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) return;

    setIsInitialLoad(true);

    const fetchMessages = async () => {
      try {
        setError(null);
        const data = await backendApi.whatsapp.getChatMessages(
          selectedChatId,
          0,
          50
        );
        if (Array.isArray(data)) {
          // Sort by timestamp ascending (oldest first)
          const sorted = [...data].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          setMessages(sorted);
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
        setError("Failed to load messages");
      }
    };

    fetchMessages();
    // Refresh messages every 5 seconds
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [selectedChatId]);

  const handleSendMessage = async () => {
    if ((!messageInput.trim() && !templateInput.trim()) || !selectedChatId)
      return;

    try {
      setError(null);
      const selectedChat = chats.find((c) => c.chatId === selectedChatId);
      if (!selectedChat) return;

      // Check if this is a recipient-initiated conversation (has inbound messages)
      const hasInboundMessages = messages.some(
        (m) => m.direction === "inbound"
      );

      let messagePayload: any = {
        to: selectedChat.participantPhone,
      };

      // Use template content if available, otherwise use free-form message
      if (templateInput.trim()) {
        messagePayload.body = templateInput;
      } else {
        messagePayload.body = messageInput;
      }

      // Send message via API
      await backendApi.whatsapp.sendMessage(messagePayload);

      setMessageInput("");
      setTemplateInput("");
      // Refresh messages
      const data = await backendApi.whatsapp.getChatMessages(
        selectedChatId,
        0,
        50
      );
      if (Array.isArray(data)) {
        const sorted = [...data].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setMessages(sorted);
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message");
    }
  };

  const handleAddNote = async (noteText: string, messageId?: string) => {
    if (!selectedChatId) return;

    try {
      await backendApi.notes.create({
        chatId: selectedChatId,
        messageId,
        note: noteText,
      });

      // Refresh notes
      const notesData = await backendApi.notes.getChatNotes(selectedChatId);
      setNotes(notesData);
    } catch (error) {
      console.error("Failed to add note:", error);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!selectedChatId) return;

    try {
      await backendApi.notes.delete(noteId);

      // Refresh notes after deletion
      const notesData = await backendApi.notes.getChatNotes(selectedChatId);
      setNotes(notesData);
    } catch (error) {
      console.error("Failed to delete note:", error);
      alert("Failed to delete note. Please try again.");
    }
  };

  const handleApplyTemplate = (template: Template) => {
    if (template.locales && template.locales.length > 0) {
      // Use the first locale's body or render with example vars
      const locale = template.locales[0];
      let body = locale.body;

      // Replace example variables if available
      if (locale.exampleVars) {
        Object.entries(locale.exampleVars).forEach(([key, value]) => {
          body = body.replace(
            new RegExp(`\\{\\{${key}\\}\\}`, "g"),
            String(value || "")
          );
        });
      }

      setTemplateInput(body);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle separator drag to resize notes panel
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = notesPanelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // Minimum width 250px, maximum 60% of container
      const maxWidth = containerRef.current
        ? containerRef.current.clientWidth * 0.6
        : 800;
      const newWidth = Math.max(250, Math.min(startWidth - deltaX, maxWidth));
      setNotesPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const selectedChat = chats.find((c) => c.chatId === selectedChatId) || null;

  return (
    <div className="flex flex-col h-screen gap-0">
      {/* Header with Controls */}
      <div className="border-b px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={automationEnabled ? "default" : "outline"}
            onClick={() => setAutomationEnabled(!automationEnabled)}
            className="gap-2"
          >
            {automationEnabled ? t("automationOn") : t("automateReplies")}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="border-b bg-red-50 dark:bg-red-950 p-4">
          <p className="text-sm text-red-700 dark:text-red-200">⚠ {error}</p>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Chat List */}
        <div className="w-full lg:w-80 border-r flex flex-col bg-muted/30">
          <div className="p-4 border-b">
            <Input placeholder={t("searchChats")} className="w-full" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading chats...
              </div>
            ) : chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
                <p className="text-muted-foreground">{t("noChats")}</p>
              </div>
            ) : (
              chats.map((chat) => (
                <button
                  key={chat.chatId || chat.id}
                  onClick={() =>
                    setSelectedChatId(chat.chatId || String(chat.id))
                  }
                  className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-accent ${
                    selectedChatId === (chat.chatId || String(chat.id))
                      ? "bg-accent"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {chat.participantName ||
                          chat.participantPhone ||
                          "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {chat.lastMessage || "No messages yet"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {chat.lastMessageTime
                          ? new Date(chat.lastMessageTime).toLocaleTimeString()
                          : ""}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Chat Detail + Notes */}
        <div className="hidden lg:flex flex-1 flex-col bg-background overflow-hidden">
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-lg font-semibold">
                    {selectedChat.participantName ||
                      selectedChat.participantPhone}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedChat.participantPhone}
                  </p>
                </div>
              </div>

              {/* Messages + Notes Container */}
              <div className="flex flex-1 overflow-hidden" ref={containerRef}>
                {/* Messages Area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-muted-foreground">No messages yet</p>
                      </div>
                    ) : (
                      <>
                        {messages.map((message) => {
                          const isOutbound = message.direction === "outbound";
                          const timestamp = new Date(message.timestamp);
                          const timeString = timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          });

                          return (
                            <div
                              key={message.messageId || message.id}
                              className={`flex ${
                                isOutbound ? "justify-end" : "justify-start"
                              }`}
                            >
                              <div
                                className={`max-w-xs px-4 py-2 rounded-lg ${
                                  isOutbound
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                }`}
                              >
                                <p className="text-sm">{message.text}</p>
                                <p
                                  className={`text-xs mt-1 ${
                                    isOutbound
                                      ? "text-primary-foreground/70"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {timeString}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>

                  {/* Template Buttons */}
                  <div className="border-t p-4 bg-muted/30">
                    {templatesLoading ? (
                      <>
                        <div className="mb-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("availableTemplates")}
                          </p>
                          <Input
                            placeholder={t("searchTemplates")}
                            className="h-8 text-xs"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center justify-center py-2">
                          <Loader className="h-4 w-4 animate-spin" />
                        </div>
                      </>
                    ) : Array.isArray(filteredTemplates) &&
                      filteredTemplates.length > 0 ? (
                      <>
                        <div className="mb-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("availableTemplates")}
                          </p>
                          <Input
                            placeholder={t("searchTemplates")}
                            className="h-8 text-xs"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-2 mb-4">
                          {filteredTemplates.map((template) => (
                            <Button
                              key={template.id}
                              variant="outline"
                              size="sm"
                              onClick={() => handleApplyTemplate(template)}
                              className="text-left justify-start h-auto py-2"
                            >
                              <span className="text-xs">{template.name}</span>
                            </Button>
                          ))}
                        </div>
                      </>
                    ) : templateSearch ? (
                      <>
                        <div className="mb-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("availableTemplates")}
                          </p>
                          <Input
                            placeholder={t("searchTemplates")}
                            className="h-8 text-xs"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground py-2">
                          No templates match your search.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">
                        {t("noTemplatesAvailable")}
                      </p>
                    )}
                  </div>

                  {/* Input Area */}
                  <div className="border-t p-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder={t("typeMessageOrUseTemplates")}
                        className="flex-1"
                        value={templateInput || messageInput}
                        onChange={(e) => {
                          if (templateInput) {
                            setTemplateInput("");
                          }
                          setMessageInput(e.target.value);
                        }}
                        onKeyDown={handleKeyDown}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!messageInput.trim() && !templateInput.trim()}
                        className="gap-2"
                      >
                        <Send className="h-4 w-4" />
                        Send
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Resizable Separator */}
                <div
                  ref={separatorRef}
                  onMouseDown={handleMouseDown}
                  className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors"
                  title="Drag to resize"
                />

                {/* Notes Panel (Right Sidebar) - Dynamic Width */}
                <div
                  className="hidden xl:flex flex-col overflow-hidden"
                  style={{ width: `${notesPanelWidth}px` }}
                >
                  {selectedChatId && currentUserId && (
                    <NotesPanel
                      chatId={selectedChatId}
                      currentUserId={currentUserId}
                      notes={notes}
                      loading={notesLoading}
                      onAddNote={handleAddNote}
                      onDeleteNote={handleDeleteNote}
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
                <p className="text-muted-foreground text-lg">
                  {loading ? "Loading chat..." : t("selectChat")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info about Automation */}
      {automationEnabled && (
        <div className="border-t bg-blue-50 dark:bg-blue-950 p-4">
          <p className="text-sm text-blue-700 dark:text-blue-200">
            ✓ Automatic replies are enabled. Messages matching automation rules
            will be responded to automatically.
          </p>
        </div>
      )}
    </div>
  );
}
