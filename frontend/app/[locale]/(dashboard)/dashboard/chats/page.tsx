"use client";

import { ArrowDown, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { ChatsSenderSection } from "@/components/chats-sender-section";
import { Button } from "@/components/ui/button";
import { ChatSidebar } from "@/components/ui/chat-sidebar";
import { Input } from "@/components/ui/input";
import { useAuthProtection } from "@/hooks/use-auth";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { backendApi } from "@/lib/api/endpoints";
import { PendingUpload } from "@/lib/media/types";

// Local imports
import {
  ChatHeader,
  ChatsModals,
  MessageInputArea,
  MessagesList,
  TemplatesPanel,
} from "./components";
import {
  useChatState,
  useContactHandlers,
  useInputFocus,
  useMediaHandlers,
  useMessageHandlers,
} from "./hooks";
import type { Template } from "./types";
import { groupMessages } from "./utils";

export default function ChatsPage() {
  const t = useTranslations("chats");
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const notesPanelRef = useRef<HTMLDivElement>(null);

  // Protect this route
  useAuthProtection();

  // Initialize media upload hook
  const hookResult = useMediaUpload();
  const pendingUploads = hookResult.pendingUploads as Map<
    string,
    PendingUpload
  >;
  const { isUploading } = hookResult;

  // Automation state
  const [automationEnabled, setAutomationEnabled] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<any>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [notesPanelWidth, setNotesPanelWidth] = useState(320);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );

  // Chat state hook - manages chats, messages, pagination, scroll
  const chatState = useChatState();

  // Input focus hook - manages reliable input focusing on chat selection
  // isChatReady: true when initial load is complete (isInitialLoad becomes false after messages are loaded)
  const { inputRef: messageInputRef, triggerFocus } = useInputFocus({
    selectedChatId: chatState.selectedChatId,
    isChatReady: !chatState.isInitialLoad,
    isLoading: chatState.loading,
  });

  // Message handlers hook - manages sending, replying, deleting messages
  const messageHandlers = useMessageHandlers({
    selectedChatId: chatState.selectedChatId,
    selectedChat: chatState.selectedChat,
    selectedContactId,
    messages: chatState.messages,
    setMessages: chatState.setMessages,
    setMessageCount: chatState.setMessageCount,
    setError: chatState.setError,
    messagesContainerRef: chatState.messagesContainerRef,
    messagesCacheRef: chatState.messagesCacheRef,
    currentMessagesChatIdRef: chatState.currentMessagesChatIdRef,
    shouldAutoScroll: chatState.shouldAutoScroll,
    setShouldAutoScroll: chatState.setShouldAutoScroll,
    setHasNewMessages: chatState.setHasNewMessages,
    scrollHelperRequestScroll: chatState.scrollHelperRequestScroll,
    chats: chatState.chats,
    onFocusInput: triggerFocus,
  });

  // Media handlers hook - manages media staging, uploads, previews, downloads
  const mediaHandlers = useMediaHandlers({
    selectedChatId: chatState.selectedChatId,
    chats: chatState.chats,
    messages: chatState.messages,
    setMessages: chatState.setMessages,
    setMessageCount: chatState.setMessageCount,
    setError: chatState.setError,
    messagesCacheRef: chatState.messagesCacheRef,
    currentMessagesChatIdRef: chatState.currentMessagesChatIdRef,
    setShouldAutoScroll: chatState.setShouldAutoScroll,
    scrollHelperRequestScroll: chatState.scrollHelperRequestScroll,
    replyingToMessage: messageHandlers.replyingToMessage,
    setReplyingToMessage: messageHandlers.setReplyingToMessage,
  });

  // Contact handlers hook - manages contact sending, saving, viewing
  const contactHandlers = useContactHandlers({
    selectedChatId: chatState.selectedChatId,
    chats: chatState.chats,
    setChats: chatState.setChats,
    setSelectedChatId: chatState.setSelectedChatId,
    senders: chatState.senders,
    setMessages: chatState.setMessages,
    setMessageCount: chatState.setMessageCount,
    messagesCacheRef: chatState.messagesCacheRef,
    currentMessagesChatIdRef: chatState.currentMessagesChatIdRef,
    setShouldAutoScroll: chatState.setShouldAutoScroll,
    scrollHelperRequestScroll: chatState.scrollHelperRequestScroll,
  });

  // Fetch templates from API
  const { data: templates = [], isLoading: templatesLoading } = useSWR(
    "visible-templates",
    async () => {
      try {
        return await backendApi.templates.list(true);
      } catch (error) {
        console.error("Failed to fetch templates:", error);
        return [];
      }
    }
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

  // Fetch notes when chat changes
  useEffect(() => {
    if (!chatState.selectedChatId) {
      setNotes(null);
      return;
    }

    const fetchNotes = async () => {
      try {
        setNotesLoading(true);
        const notesData = await backendApi.notes.getChatNotes(
          chatState.selectedChatId!
        );
        setNotes(notesData);
      } catch (error) {
        console.error("Error fetching notes:", error);
        setNotes(null);
      } finally {
        setNotesLoading(false);
      }
    };

    fetchNotes();
  }, [chatState.selectedChatId]);

  // Fetch contact for sidebar when chat changes
  useEffect(() => {
    if (!chatState.selectedChatId) {
      setSelectedContactId(null);
      return;
    }

    const selectedChat = chatState.chats.find(
      (c) => c.chatId === chatState.selectedChatId
    );
    if (!selectedChat?.participantPhone) {
      setSelectedContactId(null);
      return;
    }

    const fetchContact = async () => {
      try {
        const contact = await backendApi.contacts.getByPhone(
          selectedChat.participantPhone
        );
        if (contact && typeof contact === "object" && "contactId" in contact) {
          setSelectedContactId((contact as { contactId: string }).contactId);
        } else {
          setSelectedContactId(null);
        }
      } catch (error) {
        setSelectedContactId(null);
      }
    };

    fetchContact();
  }, [chatState.selectedChatId, chatState.chats]);

  // Note handlers
  const handleAddNote = async (noteText: string, messageId?: string) => {
    if (!chatState.selectedChatId) return;

    try {
      await backendApi.notes.create({
        chatId: chatState.selectedChatId,
        messageId,
        note: noteText,
      });

      const notesData = await backendApi.notes.getChatNotes(
        chatState.selectedChatId
      );
      setNotes(notesData);
    } catch (error) {
      console.error("Failed to add note:", error);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!chatState.selectedChatId) return;

    try {
      await backendApi.notes.delete(noteId);
      const notesData = await backendApi.notes.getChatNotes(
        chatState.selectedChatId
      );
      setNotes(notesData);
    } catch (error) {
      console.error("Failed to delete note:", error);
      alert("Failed to delete note. Please try again.");
    }
  };

  // Handle separator drag to resize notes panel
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = notesPanelWidth;
    let currentWidth = startWidth;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxWidth = containerRef.current
        ? containerRef.current.clientWidth * 0.6
        : 800;
      currentWidth = Math.max(250, Math.min(startWidth - deltaX, maxWidth));

      if (notesPanelRef.current) {
        notesPanelRef.current.style.width = `${currentWidth}px`;
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      setNotesPanelWidth(currentWidth);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Group messages for display
  const groupedMessages = useMemo(
    () => groupMessages(chatState.messages),
    [chatState.messages]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with Controls */}
      <div className="border-b px-6 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
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
      {chatState.error && (
        <div className="border-b bg-red-50 dark:bg-red-950 p-4 flex-shrink-0">
          <p className="text-sm text-red-700 dark:text-red-200">
            ⚠ {chatState.error}
          </p>
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
            {chatState.loading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading chats...
              </div>
            ) : chatState.chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
                <p className="text-muted-foreground">{t("noChats")}</p>
              </div>
            ) : (
              chatState.senders.map((sender) => {
                const senderChats = chatState.chats.filter(
                  (c) => c.senderId === sender.id
                );
                return (
                  <ChatsSenderSection
                    key={sender.id}
                    senderPhoneNumber={sender.phoneNumber}
                    senderDisplayName={sender.displayName}
                    chats={senderChats}
                    selectedChatId={chatState.selectedChatId}
                    onSelectChat={chatState.handleSelectChat}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Chat Detail + Notes */}
        <div className="hidden lg:flex flex-1 flex-col bg-background overflow-hidden min-h-0">
          {chatState.selectedChat ? (
            <>
              <ChatHeader chat={chatState.selectedChat} />

              {/* Messages + Notes Container */}
              <div className="flex flex-1 overflow-hidden" ref={containerRef}>
                {/* Messages Area */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
                  {/* Messages scroll container wrapper */}
                  <div className="relative flex-1 min-h-0 overflow-hidden">
                    {/* Show messages list - don't block on initial sync */}
                    <MessagesList
                      groupedMessages={groupedMessages}
                      messages={chatState.messages}
                      selectedChat={chatState.selectedChat}
                      isLoadingOlderMessages={chatState.isLoadingOlderMessages}
                      hasMoreMessages={chatState.hasMoreMessages}
                      pendingMediaUploads={mediaHandlers.pendingMediaUploads}
                      pendingCaption={mediaHandlers.pendingCaption}
                      messageRefs={messageHandlers.messageRefs}
                      isScrollRestoring={chatState.isScrollRestoring}
                      messagesContainerRef={chatState.messagesContainerRef}
                      messagesEndRef={messagesEndRef}
                      t={t}
                      parseContactsFromMessage={
                        contactHandlers.parseContactsFromMessage
                      }
                      handleViewAllContacts={
                        contactHandlers.handleViewAllContacts
                      }
                      handleStartChatWithContact={
                        contactHandlers.handleStartChatWithContact
                      }
                      handleReplyById={messageHandlers.handleReplyById}
                      handleDeleteMessage={messageHandlers.handleDeleteMessage}
                      handleDownloadById={mediaHandlers.handleDownloadById}
                      handleScrollToMessage={
                        messageHandlers.handleScrollToMessage
                      }
                      handleImageClick={mediaHandlers.handleImageClick}
                      handleShowDownloadMenu={
                        mediaHandlers.handleShowDownloadMenu
                      }
                      handleVideoPlay={mediaHandlers.handleVideoPlay}
                    />

                    {/* Scroll to Bottom Button */}
                    {chatState.hasNewMessages && (
                      <div className="absolute bottom-4 right-4 z-20">
                        <Button
                          onClick={chatState.handleScrollToBottom}
                          size="sm"
                          className="rounded-full shadow-lg bg-primary hover:bg-primary/90"
                          title="Scroll to latest message"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Templates Panel */}
                  <TemplatesPanel
                    templates={templates as Template[]}
                    templatesLoading={templatesLoading}
                    onApplyTemplate={messageHandlers.handleApplyTemplate}
                    t={t}
                  />

                  {/* Input Area */}
                  <MessageInputArea
                    messageInputRef={messageInputRef}
                    addMoreInputRef={mediaHandlers.addMoreInputRef}
                    replyingToMessage={messageHandlers.replyingToMessage}
                    selectedChat={chatState.selectedChat}
                    currentAttachmentType={mediaHandlers.currentAttachmentType}
                    templateInput={messageHandlers.templateInput}
                    isUploading={isUploading}
                    pendingMediaUploadsLength={
                      mediaHandlers.pendingMediaUploads.length
                    }
                    t={t}
                    onSend={messageHandlers.handleSendMessage}
                    onSendVoiceNote={mediaHandlers.handleSendVoiceNote}
                    onTemplateUsed={messageHandlers.handleTemplateUsed}
                    onCancelReply={messageHandlers.handleCancelReply}
                    onFilesSelected={mediaHandlers.handleFilesSelected}
                    onContactsClick={contactHandlers.handleContactsClick}
                  />

                  {/* Media Staging and Preview Modals (within messages area) */}
                  <ChatsModals
                    // Media staging
                    mediaStagingOpen={mediaHandlers.mediaStagingOpen}
                    stagedFiles={mediaHandlers.stagedFiles}
                    isUploading={isUploading}
                    sendButtonText={t("send")}
                    onCloseStagingModal={mediaHandlers.handleCloseStagingModal}
                    onSendMediaFromStaging={
                      mediaHandlers.handleSendMediaFromStaging
                    }
                    onAddMoreMedia={mediaHandlers.handleAddMoreMedia}
                    onRemoveStagedFile={mediaHandlers.handleRemoveStagedFile}
                    // Media preview
                    previewModalOpen={mediaHandlers.previewModalOpen}
                    previewAttachments={mediaHandlers.previewAttachments}
                    previewMessageId={mediaHandlers.previewMessageId}
                    previewInitialIndex={mediaHandlers.previewInitialIndex}
                    onClosePreviewModal={() =>
                      mediaHandlers.setPreviewModalOpen(false)
                    }
                    // Download menu
                    downloadMenuOpen={mediaHandlers.downloadMenuOpen}
                    downloadMenuPosition={mediaHandlers.downloadMenuPosition}
                    currentMessageAttachments={
                      mediaHandlers.currentMessageAttachments
                    }
                    downloadLoading={mediaHandlers.downloadLoading}
                    onDownloadSingle={mediaHandlers.handleDownloadSingle}
                    onDownloadPack={mediaHandlers.handleDownloadPack}
                    onCloseDownloadMenu={() =>
                      mediaHandlers.setDownloadMenuOpen(false)
                    }
                    // Delete dialog
                    deleteDialogOpen={messageHandlers.deleteDialogOpen}
                    deletingMessageId={messageHandlers.deletingMessageId}
                    onCloseDeleteDialog={() =>
                      messageHandlers.setDeleteDialogOpen(false)
                    }
                    onConfirmDelete={messageHandlers.handleConfirmDeleteMessage}
                    // Video preview
                    videoPreview={mediaHandlers.videoPreview}
                    onCloseVideoPreview={() =>
                      mediaHandlers.setVideoPreview(null)
                    }
                    // Contact modals
                    sendContactsModalOpen={
                      contactHandlers.sendContactsModalOpen
                    }
                    contactPreviewModalOpen={
                      contactHandlers.contactPreviewModalOpen
                    }
                    viewContactsModalOpen={
                      contactHandlers.viewContactsModalOpen
                    }
                    quickContactFormOpen={contactHandlers.quickContactFormOpen}
                    senderSelectModalOpen={
                      contactHandlers.senderSelectModalOpen
                    }
                    contactsToSend={contactHandlers.contactsToSend}
                    contactsToView={contactHandlers.contactsToView}
                    contactToSave={contactHandlers.contactToSave}
                    contactToStartChat={contactHandlers.contactToStartChat}
                    allContacts={contactHandlers.allContacts}
                    senders={chatState.senders}
                    isSendingContacts={contactHandlers.isSendingContacts}
                    isSavingContact={contactHandlers.isSavingContact}
                    contactsLoading={contactHandlers.contactsLoading}
                    onCloseSendContactsModal={() =>
                      contactHandlers.setSendContactsModalOpen(false)
                    }
                    onContactsSelected={contactHandlers.handleContactsSelected}
                    onCloseContactPreviewModal={() => {
                      contactHandlers.setContactPreviewModalOpen(false);
                      contactHandlers.setContactsToSend([]);
                    }}
                    onBackToContactSelection={() => {
                      contactHandlers.setContactPreviewModalOpen(false);
                      contactHandlers.setSendContactsModalOpen(true);
                    }}
                    onConfirmSendContacts={contactHandlers.handleSendContacts}
                    onStartChatWithContact={
                      contactHandlers.handleStartChatWithContact
                    }
                    onCloseViewContactsModal={() => {
                      contactHandlers.setViewContactsModalOpen(false);
                      contactHandlers.setContactsToView([]);
                    }}
                    onSaveContactFromMessage={
                      contactHandlers.handleSaveContactFromMessage
                    }
                    onCloseQuickContactForm={() => {
                      contactHandlers.setQuickContactFormOpen(false);
                      contactHandlers.setContactToSave(null);
                    }}
                    onQuickSaveContact={contactHandlers.handleQuickSaveContact}
                    onCloseSenderSelectModal={() => {
                      contactHandlers.setSenderSelectModalOpen(false);
                      contactHandlers.setContactToStartChat(null);
                    }}
                    onSenderSelectedForContact={
                      contactHandlers.handleSenderSelectedForContact
                    }
                  />
                </div>

                {/* Resizable Separator */}
                <div
                  ref={separatorRef}
                  onMouseDown={handleMouseDown}
                  className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors"
                  title="Drag to resize"
                />

                {/* Notes Panel */}
                <div
                  ref={notesPanelRef}
                  className="hidden xl:flex flex-col overflow-hidden"
                  style={{ width: `${notesPanelWidth}px` }}
                >
                  {chatState.selectedChatId && currentUserId && (
                    <ChatSidebar
                      chatId={chatState.selectedChatId}
                      contactId={selectedContactId}
                      currentUserId={currentUserId}
                      notes={notes}
                      notesLoading={notesLoading}
                      onAddNote={handleAddNote}
                      onDeleteNote={handleDeleteNote}
                      onProfileUpdate={() => {}}
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-muted/10">
              <div className="text-center max-w-sm px-4">
                <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-6">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {chatState.loading
                    ? t("loading") || "Loading..."
                    : t("selectChat")}
                </h3>
                {!chatState.loading && chatState.chats.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("selectChatHint") ||
                      "Choose a conversation from the list to start messaging"}
                  </p>
                )}
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
