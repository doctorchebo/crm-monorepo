"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { backendApi } from "@/lib/api/endpoints";
import { MessageSquare, Plus, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Twilio WhatsApp Sandbox Templates with contentSid and contentVariables
interface WhatsAppTemplate {
  id: string;
  label: string;
  templateContent: string;
  contentSid: string;
  contentVariables: Record<string, string>;
}

const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "template1",
    label: "Appointment Reminder",
    templateContent:
      "Your appointment is coming up on {{1}} at {{2}}. If you need to change it, please reply back and let us know.",
    contentSid: "HXb5b62575e6e4ff6129ad7c8efe1f983e",
    contentVariables: { "1": "12/1", "2": "3pm" },
  },
  {
    id: "template2",
    label: "Order Notification",
    templateContent:
      "Thank you for your order. Your delivery is scheduled for {{1}} at {{2}}. If you need to change it, please reply back and let us know.",
    contentSid: "HX350d429d32e64a552466cafecbe95f3c",
    contentVariables: { "1": "12/1", "2": "3pm" },
  },
  {
    id: "template3",
    label: "Verification Code",
    templateContent:
      "{{1}} is your verification code. For your security, do not share this code.",
    contentSid: "HX229f5a04fd0510ce1b071852155d3e75",
    contentVariables: { "1": "409173" },
  },
];

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
  const searchParams = useSearchParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [templateInput, setTemplateInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

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

          // Check if selectedChatId is in the query params
          const querySelectedChatId = searchParams.get("selectedChatId");
          if (querySelectedChatId) {
            setSelectedChatId(querySelectedChatId);
          } else {
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

  // Fetch messages when selected chat changes
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

      // If replying to a recipient-initiated conversation, use free-form body
      if (hasInboundMessages) {
        messagePayload.body = messageInput || templateInput;
      } else {
        // For initiated conversations, check if a template was explicitly selected
        if (templateInput.trim()) {
          // User selected a template
          const selectedTemplate = WHATSAPP_TEMPLATES.find(
            (t) => t.templateContent === templateInput
          );

          if (selectedTemplate) {
            // Send template-based message
            messagePayload.contentSid = selectedTemplate.contentSid;
            messagePayload.contentVariables = JSON.stringify(
              selectedTemplate.contentVariables
            );
          } else {
            // Template content doesn't match - shouldn't happen
            messagePayload.body = templateInput;
          }
        } else {
          // No template selected, send as free-form body
          messagePayload.body = messageInput;
        }
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

  const handleApplyTemplate = (template: WhatsAppTemplate) => {
    setTemplateInput(template.templateContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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

        {/* Right Panel: Chat Detail */}
        <div className="hidden lg:flex flex-1 flex-col bg-background">
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div className="border-b px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {selectedChat.participantName ||
                      selectedChat.participantPhone}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedChat.participantPhone}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("addNote")}
                </Button>
              </div>

              {/* Messages Area */}
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
                <p className="text-xs font-medium mb-2 text-muted-foreground">
                  Sandbox Templates (Required for initial messages):
                </p>
                <div className="grid grid-cols-1 gap-2 mb-4">
                  {WHATSAPP_TEMPLATES.map((template) => (
                    <Button
                      key={template.id}
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyTemplate(template)}
                      className="text-left justify-start h-auto py-2"
                    >
                      <span className="text-xs">{template.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Input Area */}
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message or use templates above..."
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
