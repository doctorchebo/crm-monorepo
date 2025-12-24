"use client";

import {
  ChatMessageInput,
  ChatMessageInputRef,
} from "@/components/chat-message-input";
import {
  AttachmentMenu,
  AttachmentType,
} from "@/components/media/attachment-menu";
import { ReplyBanner } from "@/components/reply-banner";
import { AlertCircle, Clock } from "lucide-react";
import React from "react";
import type { Chat, Message, ReplyPreview } from "../types";
import type { ConversationWindowStatus } from "../utils";

interface MessageInputAreaProps {
  messageInputRef: React.RefObject<ChatMessageInputRef | null>;
  addMoreInputRef: React.RefObject<HTMLInputElement | null>;
  replyingToMessage: Message | null;
  selectedChat: Chat | null;
  currentAttachmentType: AttachmentType;
  templateInput: string;
  isUploading: boolean;
  pendingMediaUploadsLength: number;
  t: (key: string) => string;
  onSend: (message: string) => void;
  onSendVoiceNote: (
    blob: Blob,
    duration: number,
    waveformData: number[]
  ) => void;
  onTemplateUsed: () => void;
  onCancelReply: () => void;
  onFilesSelected: (files: File[], type: AttachmentType) => void;
  onContactsClick: () => void;
  /**
   * Conversation window status - determines if free-form messaging is allowed
   * When outside the window, UI should guide users to use approved templates
   */
  conversationWindow?: ConversationWindowStatus;
}

export function MessageInputArea({
  messageInputRef,
  addMoreInputRef,
  replyingToMessage,
  selectedChat,
  currentAttachmentType,
  templateInput,
  isUploading,
  pendingMediaUploadsLength,
  t,
  onSend,
  onSendVoiceNote,
  onTemplateUsed,
  onCancelReply,
  onFilesSelected,
  onContactsClick,
  conversationWindow,
}: MessageInputAreaProps) {
  // Determine if free-form messaging is blocked
  // When outside the 24-hour window, users can only use approved templates
  const isOutsideConversationWindow =
    conversationWindow && !conversationWindow.isWithinWindow;

  // Determine the reason for the block
  const getBlockReason = (): string => {
    if (!conversationWindow) return "";

    if (!conversationWindow.lastInboundMessageTime) {
      return (
        t("conversationWindow.noCustomerMessage") ||
        "Customer hasn't sent a message yet. Use an approved template to start the conversation."
      );
    }

    return (
      t("conversationWindow.windowExpired") ||
      "The 24-hour conversation window has expired. Use an approved template to re-engage."
    );
  };
  // Build reply preview for banner
  const replyPreview: ReplyPreview | null = replyingToMessage
    ? {
        messageId: replyingToMessage.messageId,
        senderType:
          replyingToMessage.direction === "outbound" ? "agent" : "customer",
        senderName:
          replyingToMessage.direction === "outbound"
            ? "You"
            : selectedChat?.participantName ||
              selectedChat?.participantPhone ||
              replyingToMessage.sender,
        type: replyingToMessage.type as
          | "text"
          | "image"
          | "video"
          | "audio"
          | "document"
          | "contacts",
        text: replyingToMessage.text || undefined,
        media: replyingToMessage.attachments?.[0]
          ? {
              mimeType:
                replyingToMessage.attachments[0].mimeType ||
                "application/octet-stream",
              thumbnailUrl:
                replyingToMessage.attachments[0].thumbnailKey ||
                replyingToMessage.attachments[0].s3Key,
              fileName: replyingToMessage.attachments[0].fileName,
            }
          : undefined,
      }
    : null;

  return (
    <div className="border-t flex-shrink-0">
      {/* Conversation Window Warning Banner */}
      {isOutsideConversationWindow && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {t("conversationWindow.title") || "Outside 24-Hour Window"}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                {getBlockReason()}
              </p>
              {conversationWindow?.lastInboundMessageTime && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t("conversationWindow.lastMessage") ||
                    "Last customer message"}
                  :{" "}
                  {new Date(
                    conversationWindow.lastInboundMessageTime
                  ).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reply Banner */}
      {replyingToMessage && replyPreview && (
        <ReplyBanner
          replyPreview={replyPreview}
          messageId={replyingToMessage.messageId}
          attachmentId={replyingToMessage.attachments?.[0]?.id}
          attachment={replyingToMessage.attachments?.[0]}
          onCancel={onCancelReply}
        />
      )}
      {/* Hidden input for "Add More" in staging modal */}
      <div className="p-3">
        <input
          ref={addMoreInputRef}
          type="file"
          multiple
          accept={
            currentAttachmentType === "photos-videos"
              ? "image/*,video/*"
              : currentAttachmentType === "document"
              ? "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,audio/*"
              : "*/*"
          }
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) {
              // Block file uploads when outside conversation window
              if (isOutsideConversationWindow) {
                console.warn(
                  "Cannot upload files outside 24-hour conversation window"
                );
                e.target.value = "";
                return;
              }
              onFilesSelected(files, currentAttachmentType);
            }
            e.target.value = "";
          }}
          className="hidden"
        />

        {/* Message Input with Attachment Button Inside */}
        <ChatMessageInput
          ref={messageInputRef}
          onSend={onSend}
          onSendVoiceNote={
            isOutsideConversationWindow ? undefined : onSendVoiceNote
          }
          placeholder={
            isOutsideConversationWindow
              ? t("conversationWindow.useTemplateHint") ||
                "Select an approved template above to send a message"
              : t("typeMessageOrUseTemplates")
          }
          disabled={
            isUploading ||
            pendingMediaUploadsLength > 0 ||
            isOutsideConversationWindow
          }
          templateValue={templateInput}
          onTemplateUsed={onTemplateUsed}
          leftElement={
            <AttachmentMenu
              onFilesSelected={onFilesSelected}
              onContactsClick={onContactsClick}
              disabled={
                isUploading ||
                pendingMediaUploadsLength > 0 ||
                isOutsideConversationWindow
              }
            />
          }
        />
      </div>
    </div>
  );
}
