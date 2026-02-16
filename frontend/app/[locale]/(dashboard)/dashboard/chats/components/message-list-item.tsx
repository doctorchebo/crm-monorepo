"use client";

import { ContactMessageBubble } from "@/components/contacts/contact-message-bubble";
import { LocationMessageBubble } from "@/components/location";
import { StickerMessageBubble } from "@/components/media/sticker-message-bubble";
import { Checkbox } from "@/components/ui/checkbox";
import { Attachment } from "@/lib/media/types";
import { ReceivedContact } from "@/lib/types/contact-message.types";
import React, { memo } from "react";
import type { Chat, Message, MessageReaction } from "../types";
import { DateSeparator } from "./date-separator";
import { MessageBubble } from "./message-bubble";
import { TemplateMessageBubble } from "./template-message-bubble";

interface MessageListItemProps {
  message: Message;
  selectedChat: Chat | null;
  currentUserId?: number;
  // Computed props
  isOutbound: boolean;
  isDeleted: boolean;
  isSelected: boolean;
  isSelectionMode: boolean;
  isHighlighted: boolean;
  separatorDate: Date | null;
  timeString: string;
  // Reactions
  userReaction?: MessageReaction;
  customerReaction?: {
    messageId: string;
    emoji: string;
    senderPhone: string;
    timestamp?: string;
  };
  reactions: MessageReaction[];
  reactionAnimating: boolean;
  isReactionDisabled: boolean;
  reactionDisabledTooltip?: string;
  // Pin
  isPinned: boolean;
  autoPlayGifs: boolean;
  // Callbacks
  onToggleSelection?: (messageId: string) => void;
  onSetMessageRef: (el: HTMLDivElement | null) => void;
  // Bubble handlers
  onViewAllContacts: (contacts: ReceivedContact[]) => void;
  onStartChat: (contact: any) => void;
  onReply: (messageId: string) => void;
  onDelete?: (messageId: string) => void; // Optional because only outbound messages have it
  onDownload: (messageId: string) => void;
  onImageClick: (
    messageId: string,
    attachments: Attachment[],
    index: number,
  ) => void;
  onShowDownloadMenu: (
    messageId: string,
    attachments: Attachment[],
    position: { x: number; y: number },
  ) => void;
  onVideoPlay: (videoId: string, url: string) => void;
  onScrollToMessage: (messageId: string) => void;
  onReactionSelect?: (messageId: string, emoji: string) => void;
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  // Catalog handlers
  onViewCatalogItem?: (item: CatalogMessageItem) => void;
  onViewAllCatalogItems?: (items: CatalogMessageItem[]) => void;
  // Utils
  parseContactsFromMessage: (message: Message) => ReceivedContact[] | null;
  t: (key: string) => string;
}

export const MessageListItem = memo(function MessageListItem({
  message,
  selectedChat,
  currentUserId,
  isOutbound,
  isDeleted,
  isSelected,
  isSelectionMode,
  isHighlighted,
  separatorDate,
  timeString,
  userReaction,
  customerReaction,
  reactions,
  reactionAnimating,
  isReactionDisabled,
  reactionDisabledTooltip,
  isPinned,
  autoPlayGifs,
  onToggleSelection,
  onSetMessageRef,
  onViewAllContacts,
  onStartChat,
  onReply,
  onDelete,
  onDownload,
  onImageClick,
  onShowDownloadMenu,
  onVideoPlay,
  onScrollToMessage,
  onReactionSelect,
  onPin,
  onUnpin,
  onViewCatalogItem,
  onViewAllCatalogItems,
  parseContactsFromMessage,
  t,
}: MessageListItemProps) {
  // Common selection wrapper logic
  const renderWithSelection = (content: React.ReactNode) => {
    // Only outbound messages are selectable for deletion (backend restriction)
    const isSelectable = isOutbound;
    const showSelectionUI = isSelectionMode;

    if (!showSelectionUI) return <>{content}</>;

    return (
      <div
        className={`flex w-full cursor-pointer ${
          isSelected ? "bg-primary/5 rounded-md" : ""
        } ${!isSelectable ? "opacity-50 cursor-default" : "hover:bg-primary/5"}`}
        onClick={() => {
          // Only allow toggling if selectable
          if (isSelectable && message.messageId) {
            onToggleSelection?.(message.messageId);
          }
        }}
      >
        <div className="flex items-center justify-center px-3 py-1">
          {/* 
            Render checkbox for all messages to maintain layout alignment,
            but make it invisible/disabled for non-selectable messages.
            pointer-events-none ensures the click passes to the parent div.
          */}
          <div
            className={`${!isSelectable ? "opacity-0" : ""} pointer-events-none`}
          >
            <Checkbox checked={!!isSelected} />
          </div>
        </div>
        <div className="flex-1 w-full min-w-0">{content}</div>
      </div>
    );
  };

  // Handle contact message type
  if (message.type === "contacts" && !isDeleted) {
    const contacts = parseContactsFromMessage(message);
    if (contacts && contacts.length > 0) {
      return (
        <React.Fragment key={message.messageId || message.id}>
          {separatorDate && <DateSeparator date={separatorDate} />}
          {renderWithSelection(
            <ContactMessageBubble
              contacts={contacts}
              isOutbound={isOutbound}
              timestamp={message.timestamp}
              messageId={message.messageId}
              status={message.status}
              deliveredAt={message.deliveredAt}
              readAt={message.readAt}
              onViewAll={() => onViewAllContacts(contacts)}
              onStartChat={onStartChat}
              onReply={onReply}
              onDelete={onDelete}
              isHighlighted={isHighlighted}
            />,
          )}
        </React.Fragment>
      );
    }
  }

  // Handle sticker message type
  if (message.type === "sticker" && !isDeleted) {
    const stickerAttachment = message.attachments?.find(
      (a) => a.type === "sticker",
    );
    if (stickerAttachment) {
      return (
        <React.Fragment key={message.messageId || message.id}>
          {separatorDate && <DateSeparator date={separatorDate} />}
          {renderWithSelection(
            <div
              ref={onSetMessageRef}
              className={`flex ${
                isOutbound ? "justify-end" : "justify-start"
              } ${
                isHighlighted
                  ? "bg-yellow-100 dark:bg-yellow-900/30 animate-pulse"
                  : ""
              } transition-colors duration-500 -mx-2 px-2 rounded`}
            >
              <StickerMessageBubble
                attachment={stickerAttachment}
                messageId={message.messageId}
                isOutbound={isOutbound}
                timestamp={timeString}
                messageTimestamp={message.timestamp}
                status={message.status}
                deliveredAt={message.deliveredAt}
                readAt={message.readAt}
                onReply={onReply}
                onDelete={onDelete}
              />
            </div>,
          )}
        </React.Fragment>
      );
    }
  }

  // Handle location message type
  if (message.type === "location" && !isDeleted) {
    const locationData = message.metadata?.location;
    if (locationData) {
      return (
        <React.Fragment key={message.messageId || message.id}>
          {separatorDate && <DateSeparator date={separatorDate} />}
          {renderWithSelection(
            <div
              ref={onSetMessageRef}
              className={`flex ${
                isOutbound ? "justify-end" : "justify-start"
              } ${
                isHighlighted
                  ? "bg-yellow-100 dark:bg-yellow-900/30 animate-pulse"
                  : ""
              } transition-colors duration-500 -mx-2 px-2 rounded`}
            >
              <LocationMessageBubble
                latitude={locationData.latitude}
                longitude={locationData.longitude}
                name={locationData.name}
                address={locationData.address}
                isOutbound={isOutbound}
                timestamp={message.timestamp}
                messageId={message.messageId}
                status={message.status}
                deliveredAt={message.deliveredAt}
                readAt={message.readAt}
                onReply={onReply}
                onDelete={onDelete}
                isHighlighted={isHighlighted}
              />
            </div>,
          )}
        </React.Fragment>
      );
    }
  }

  // Handle catalog/product message type
  if (
    (message.type === "catalog" || message.type === "product") &&
    !isDeleted
  ) {
    const catalogItems = message.metadata?.catalogItems;
    if (catalogItems && catalogItems.length > 0) {
      return (
        <React.Fragment key={message.messageId || message.id}>
          {separatorDate && <DateSeparator date={separatorDate} />}
          {renderWithSelection(
            <CatalogMessageBubble
              items={catalogItems}
              isOutbound={isOutbound}
              timestamp={message.timestamp}
              messageId={message.messageId}
              status={message.status}
              deliveredAt={message.deliveredAt}
              readAt={message.readAt}
              onViewItem={onViewCatalogItem}
              onViewAll={onViewAllCatalogItems}
              onReply={onReply}
              onDelete={onDelete}
              isHighlighted={isHighlighted}
            />,
          )}
        </React.Fragment>
      );
    }
  }

  // Handle template message type
  if (message.type === "template" && !isDeleted) {
    return (
      <React.Fragment key={message.messageId || message.id}>
        {separatorDate && <DateSeparator date={separatorDate} />}
        {renderWithSelection(
          <div
            ref={onSetMessageRef}
            className={`flex ${isOutbound ? "justify-end" : "justify-start"} ${
              isHighlighted
                ? "bg-yellow-100 dark:bg-yellow-900/30 animate-pulse"
                : ""
            } transition-colors duration-500 -mx-2 px-2 rounded`}
          >
            <TemplateMessageBubble
              message={message}
              isOutbound={isOutbound}
              isDeleted={isDeleted}
              isHighlighted={isHighlighted}
              timeString={timeString}
              selectedChat={selectedChat}
              currentUserId={currentUserId}
              userReaction={userReaction}
              customerReaction={customerReaction}
              reactions={reactions}
              reactionAnimating={reactionAnimating}
              isPinned={isPinned}
              isReactionDisabled={isReactionDisabled}
              reactionDisabledTooltip={reactionDisabledTooltip}
              isSelectionMode={isSelectionMode}
              onReply={onReply}
              onDelete={onDelete}
              onScrollToMessage={onScrollToMessage}
              onReactionSelect={onReactionSelect}
              onPin={onPin}
              onUnpin={onUnpin}
              t={t}
            />
          </div>,
        )}
      </React.Fragment>
    );
  }

  // Handle standard message type
  return (
    <React.Fragment key={message.messageId || message.id}>
      {separatorDate && <DateSeparator date={separatorDate} />}
      {renderWithSelection(
        <div
          ref={onSetMessageRef}
          className={`flex ${isOutbound ? "justify-end" : "justify-start"} ${
            isHighlighted
              ? "bg-yellow-100 dark:bg-yellow-900/30 animate-pulse"
              : ""
          } transition-colors duration-500 -mx-2 px-2 rounded`}
        >
          <MessageBubble
            message={message}
            isOutbound={isOutbound}
            isDeleted={isDeleted}
            isHighlighted={isHighlighted}
            timeString={timeString}
            selectedChat={selectedChat}
            autoPlayGifs={autoPlayGifs}
            currentUserId={currentUserId}
            userReaction={userReaction}
            customerReaction={customerReaction}
            reactions={reactions}
            reactionAnimating={reactionAnimating}
            isPinned={isPinned}
            isReactionDisabled={isReactionDisabled}
            reactionDisabledTooltip={reactionDisabledTooltip}
            isSelectionMode={isSelectionMode}
            onReply={onReply}
            onDelete={onDelete}
            onDownload={onDownload}
            onImageClick={onImageClick}
            onShowDownloadMenu={onShowDownloadMenu}
            onVideoPlay={onVideoPlay}
            onScrollToMessage={onScrollToMessage}
            onReactionSelect={onReactionSelect}
            onPin={onPin}
            onUnpin={onUnpin}
            t={t}
          />
        </div>,
      )}
    </React.Fragment>
  );
});

MessageListItem.displayName = "MessageListItem";
