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
import React from "react";
import type { Chat, Message, ReplyPreview } from "../types";

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
}: MessageInputAreaProps) {
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
          onSendVoiceNote={onSendVoiceNote}
          placeholder={t("typeMessageOrUseTemplates")}
          disabled={isUploading || pendingMediaUploadsLength > 0}
          templateValue={templateInput}
          onTemplateUsed={onTemplateUsed}
          leftElement={
            <AttachmentMenu
              onFilesSelected={onFilesSelected}
              onContactsClick={onContactsClick}
              disabled={isUploading || pendingMediaUploadsLength > 0}
            />
          }
        />
      </div>
    </div>
  );
}
