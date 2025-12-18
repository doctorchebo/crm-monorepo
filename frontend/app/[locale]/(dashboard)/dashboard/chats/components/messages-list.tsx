"use client";

import { ContactMessageBubble } from "@/components/contacts/contact-message-bubble";
import { AttachmentGallery } from "@/components/media/attachment-display";
import { GroupedMediaBubble } from "@/components/media/grouped-media-bubble";
import {
  PendingMediaUpload,
  PendingUploadGroup,
} from "@/components/media/pending-upload-bubble";
import { MessageActionsMenu } from "@/components/message-actions-menu";
import { QuotedMessage } from "@/components/quoted-message";
import { MessageText } from "@/components/ui/message-text";
import { WhatsAppStatusIcon } from "@/components/whatsapp-status-icon";
import { Attachment } from "@/lib/media/types";
import { ReceivedContact } from "@/lib/types/contact-message.types";
import { Loader } from "lucide-react";
import React from "react";
import type { Chat, GroupedMessage, Message } from "../types";

interface MessagesListProps {
  groupedMessages: GroupedMessage[];
  messages: Message[];
  selectedChat: Chat | null;
  isLoadingOlderMessages: boolean;
  hasMoreMessages: boolean;
  pendingMediaUploads: PendingMediaUpload[];
  pendingCaption: string;
  messageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  isScrollRestoring: boolean;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  t: (key: string) => string;
  parseContactsFromMessage: (message: Message) => ReceivedContact[] | null;
  handleViewAllContacts: (contacts: ReceivedContact[]) => void;
  handleStartChatWithContact: (contact: any) => void;
  handleReplyById: (messageId: string) => void;
  handleDeleteMessage: (messageId: string) => void;
  handleDownloadById: (messageId: string) => void;
  handleScrollToMessage: (messageId: string) => void;
  handleImageClick: (
    messageId: string,
    attachments: Attachment[],
    index: number
  ) => void;
  handleShowDownloadMenu: (
    messageId: string,
    attachments: Attachment[],
    position: { x: number; y: number }
  ) => void;
  handleVideoPlay: (videoId: string, url: string) => void;
}

export function MessagesList({
  groupedMessages,
  messages,
  selectedChat,
  isLoadingOlderMessages,
  hasMoreMessages,
  pendingMediaUploads,
  pendingCaption,
  messageRefs,
  isScrollRestoring,
  messagesContainerRef,
  messagesEndRef,
  t,
  parseContactsFromMessage,
  handleViewAllContacts,
  handleStartChatWithContact,
  handleReplyById,
  handleDeleteMessage,
  handleDownloadById,
  handleScrollToMessage,
  handleImageClick,
  handleShowDownloadMenu,
  handleVideoPlay,
}: MessagesListProps) {
  return (
    <div
      ref={messagesContainerRef}
      className="h-full overflow-y-auto p-3 space-y-2"
      style={{
        opacity: isScrollRestoring ? 0 : 1,
      }}
    >
      {/* Loading older messages indicator */}
      {isLoadingOlderMessages && (
        <div className="flex items-center justify-center py-3">
          <Loader className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading older messages...
          </span>
        </div>
      )}

      {/* Beginning of conversation indicator */}
      {!hasMoreMessages && messages.length > 0 && (
        <div className="flex items-center justify-center py-3">
          <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            Beginning of conversation
          </div>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">No messages yet</p>
        </div>
      ) : (
        <>
          {groupedMessages.map((group) => {
            // Grouped media messages - render as single bubble
            if (group.type === "group" && group.messages.length > 1) {
              const lastMessage = group.messages[group.messages.length - 1];
              const timestamp = new Date(lastMessage.timestamp);
              const timeString = timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <GroupedMediaBubble
                  key={group.id}
                  messages={group.messages}
                  onImageClick={handleImageClick}
                  statusIcon={
                    <WhatsAppStatusIcon
                      status={lastMessage.status || "pending"}
                      deliveredAt={lastMessage.deliveredAt}
                      readAt={lastMessage.readAt}
                      className="ml-1"
                    />
                  }
                  timeString={timeString}
                />
              );
            }

            // Single message - render normally
            const message = group.messages[0];
            const isOutbound = message.direction === "outbound";
            const timestamp = new Date(message.timestamp);
            const timeString = timestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const isDeleted = message.isDeleted;

            // Handle contact message type
            if (message.type === "contacts" && !isDeleted) {
              const contacts = parseContactsFromMessage(message);
              if (contacts && contacts.length > 0) {
                return (
                  <ContactMessageBubble
                    key={message.messageId || message.id}
                    contacts={contacts}
                    isOutbound={isOutbound}
                    timestamp={message.timestamp}
                    messageId={message.messageId}
                    status={message.status}
                    deliveredAt={message.deliveredAt}
                    readAt={message.readAt}
                    onViewAll={() => handleViewAllContacts(contacts)}
                    onStartChat={handleStartChatWithContact}
                    onReply={handleReplyById}
                    onDelete={isOutbound ? handleDeleteMessage : undefined}
                  />
                );
              }
            }

            return (
              <div
                key={message.messageId || message.id}
                ref={(el) => {
                  if (el && message.messageId) {
                    messageRefs.current.set(message.messageId, el);
                  }
                }}
                className={`flex ${
                  isOutbound ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`group px-3 py-1 rounded-lg text-xs relative ${
                    // For image-only messages, use standard image width
                    message.attachments?.length === 1 &&
                    message.attachments[0].type === "image" &&
                    !message.text &&
                    !isDeleted
                      ? "max-w-md"
                      : "max-w-xs"
                  } ${
                    isOutbound
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {/* Chevron positioned in top-right corner - visible on hover */}
                  {!isDeleted && (
                    <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <MessageActionsMenu
                        messageId={message.messageId}
                        messageTimestamp={message.timestamp}
                        isOutbound={isOutbound}
                        hasDownloadableMedia={message.attachments?.some(
                          (a) => a.type === "image" || a.type === "video"
                        )}
                        onReply={handleReplyById}
                        onDelete={isOutbound ? handleDeleteMessage : undefined}
                        onDownload={handleDownloadById}
                      />
                    </div>
                  )}

                  {isDeleted ? (
                    <p className="text-xs italic opacity-60">
                      {t("thisMessageWasDeleted")}
                    </p>
                  ) : (
                    <>
                      {/* Quoted message block for replies */}
                      {message.replyPreview && (
                        <QuotedMessage
                          replyPreview={{
                            ...message.replyPreview,
                            senderName:
                              message.replyPreview.senderType === "customer"
                                ? selectedChat?.participantName ||
                                  message.replyPreview.senderName
                                : message.replyPreview.senderName,
                          }}
                          originalMessageId={message.replyPreview.messageId}
                          isOutbound={isOutbound}
                          onClick={() => {
                            if (
                              message.replyPreview?.messageId &&
                              !message.replyPreview?.unavailable
                            ) {
                              handleScrollToMessage(
                                message.replyPreview.messageId
                              );
                            }
                          }}
                        />
                      )}
                      {/* Display attachments first, then text below */}
                      {message.attachments &&
                        message.attachments.length > 0 && (
                          <div className={message.text ? "mb-2" : ""}>
                            <AttachmentGallery
                              attachments={message.attachments}
                              messageId={
                                message.messageId ||
                                message.id?.toString() ||
                                ""
                              }
                              onImageClick={(index) =>
                                handleImageClick(
                                  message.messageId ||
                                    message.id?.toString() ||
                                    "",
                                  message.attachments || [],
                                  index
                                )
                              }
                              onShowDownloadMenu={(position) =>
                                handleShowDownloadMenu(
                                  message.messageId ||
                                    message.id?.toString() ||
                                    "",
                                  message.attachments || [],
                                  position
                                )
                              }
                              isOutbound={isOutbound}
                              onMessageDelete={handleDeleteMessage}
                              senderName={
                                isOutbound
                                  ? "You"
                                  : selectedChat?.participantName ||
                                    selectedChat?.participantPhone
                              }
                            />
                          </div>
                        )}

                      {/* Text shown below media with link previews */}
                      {message.text && (
                        <MessageText
                          text={message.text}
                          isOutbound={isOutbound}
                          showPreviews={!message.attachments?.length}
                          onVideoPlay={handleVideoPlay}
                        />
                      )}
                    </>
                  )}

                  <div
                    className={`text-xs mt-0.5 flex items-center justify-between gap-1 ${
                      isOutbound
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span>
                      {timeString}
                      {message.editedAt && (
                        <span className="ml-1 opacity-60">
                          ({t("messageEdited")})
                        </span>
                      )}
                    </span>
                    {isOutbound && !isDeleted && (
                      <WhatsAppStatusIcon
                        status={message.status || "pending"}
                        deliveredAt={message.deliveredAt}
                        readAt={message.readAt}
                        className="ml-1"
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pending Media Uploads - show grouped with progress */}
          {pendingMediaUploads.length > 0 && (
            <PendingUploadGroup
              uploads={pendingMediaUploads}
              caption={pendingCaption}
              timestamp={new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            />
          )}

          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
}
