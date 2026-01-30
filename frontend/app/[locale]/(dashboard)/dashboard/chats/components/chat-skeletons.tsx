"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Chat Skeletons - Loading state components for the chats page
 *
 * These skeletons provide visual feedback during loading states:
 * - ChatListSkeleton: Shown in the chat sidebar while loading chats
 * - ChatDetailSkeleton: Shown when a previously selected chat is being restored on refresh
 * - ChatEmptyStateSkeleton: Shown when no chat was previously selected
 *
 * The distinction between ChatDetailSkeleton and ChatEmptyStateSkeleton helps users
 * understand what they'll see after loading completes - either a full chat view or
 * the empty state prompting them to select a conversation.
 */

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Number of skeleton items to show in lists
 */
const CHAT_LIST_SKELETON_COUNT = 8;
const MESSAGE_SKELETON_COUNT = 6;

// ============================================================
// PRIMITIVE SKELETON COMPONENTS
// ============================================================

/**
 * Avatar skeleton with consistent sizing
 */
function AvatarSkeleton({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };
  return (
    <Skeleton className={cn("rounded-full flex-shrink-0", sizeClasses[size])} />
  );
}

/**
 * Text line skeleton with configurable width
 */
function TextSkeleton({
  width = "full",
  height = "sm",
}: {
  width?: "xs" | "sm" | "md" | "lg" | "full";
  height?: "xs" | "sm" | "md";
}) {
  const widthClasses = {
    xs: "w-12",
    sm: "w-24",
    md: "w-32",
    lg: "w-48",
    full: "w-full",
  };
  const heightClasses = {
    xs: "h-2",
    sm: "h-3",
    md: "h-4",
  };
  return (
    <Skeleton className={cn(widthClasses[width], heightClasses[height])} />
  );
}

// ============================================================
// CHAT LIST SKELETON COMPONENTS
// ============================================================

/**
 * Single chat list item skeleton
 * Mimics the ChatListItem layout with avatar, name, preview, and timestamp
 */
function ChatListItemSkeleton({ isFirst = false }: { isFirst?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg",
        isFirst && "bg-muted/30",
      )}
    >
      <AvatarSkeleton size="md" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between">
          <TextSkeleton width="md" height="sm" />
          <TextSkeleton width="xs" height="xs" />
        </div>
        <TextSkeleton width="lg" height="xs" />
      </div>
    </div>
  );
}

/**
 * Sender section skeleton with header and chat items
 * Mimics the ChatsSenderSection layout
 */
function SenderSectionSkeleton({
  chatCount = 3,
  isExpanded = true,
}: {
  chatCount?: number;
  isExpanded?: boolean;
}) {
  return (
    <div className="space-y-1 border-t py-2 first:border-t-0">
      {/* Section Header Skeleton */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Skeleton className="h-4 w-4" />
        <div className="flex flex-1 items-center gap-2">
          <TextSkeleton width="md" height="sm" />
          <TextSkeleton width="sm" height="xs" />
        </div>
        <TextSkeleton width="xs" height="xs" />
      </div>

      {/* Chat Items Skeleton */}
      {isExpanded && (
        <div className="space-y-1 pl-6">
          {Array.from({ length: chatCount }).map((_, index) => (
            <ChatListItemSkeleton key={index} isFirst={index === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Full chat list skeleton for the sidebar
 * Shows multiple sender sections with varying chat counts
 */
export function ChatListSkeleton() {
  // Vary the chat counts for a more natural look
  const sectionConfigs = [{ chatCount: 3 }, { chatCount: 2 }, { chatCount: 3 }];

  return (
    <div className="animate-in fade-in-0 duration-200">
      {sectionConfigs.map((config, index) => (
        <SenderSectionSkeleton key={index} chatCount={config.chatCount} />
      ))}
    </div>
  );
}

// ============================================================
// CHAT HEADER SKELETON
// ============================================================

/**
 * Chat header skeleton matching the ChatHeader component layout
 */
function ChatHeaderSkeleton() {
  return (
    <div className="border-b px-6 py-2 flex items-center justify-between">
      <div className="space-y-1">
        <TextSkeleton width="md" height="md" />
        <TextSkeleton width="sm" height="xs" />
      </div>
      <div className="flex items-center gap-2">
        {/* Assignee skeleton */}
        <Skeleton className="h-8 w-8 rounded-full" />
        {/* AI Controls skeleton */}
        <Skeleton className="h-8 w-20 rounded-md" />
        {/* Search button skeleton */}
        <Skeleton className="h-8 w-8 rounded-md" />
        {/* Settings button skeleton */}
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  );
}

// ============================================================
// MESSAGE SKELETON COMPONENTS
// ============================================================

/**
 * Single message bubble skeleton
 * Alternates between inbound (left) and outbound (right) alignment
 */
function MessageBubbleSkeleton({
  isOutbound = false,
  hasMedia = false,
}: {
  isOutbound?: boolean;
  hasMedia?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full",
        isOutbound ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[70%] space-y-2 rounded-lg p-3",
          isOutbound ? "bg-primary/10" : "bg-muted/50",
        )}
      >
        {hasMedia && <Skeleton className="h-32 w-48 rounded-md" />}
        <TextSkeleton width="full" height="sm" />
        {!hasMedia && <TextSkeleton width="lg" height="sm" />}
        <div
          className={cn(
            "flex items-center",
            isOutbound ? "justify-end" : "justify-start",
          )}
        >
          <TextSkeleton width="xs" height="xs" />
        </div>
      </div>
    </div>
  );
}

/**
 * Date separator skeleton
 */
function DateSeparatorSkeleton() {
  return (
    <div className="flex items-center justify-center py-2">
      <Skeleton className="h-5 w-24 rounded-full" />
    </div>
  );
}

/**
 * Messages list skeleton showing a realistic chat history
 */
function MessagesListSkeleton() {
  // Pattern of messages: alternating with occasional date separator and media
  const messagePattern = [
    { isOutbound: false, hasMedia: false },
    { isOutbound: true, hasMedia: false },
    { type: "date" as const },
    { isOutbound: false, hasMedia: true },
    { isOutbound: true, hasMedia: false },
    { isOutbound: false, hasMedia: false },
    { isOutbound: true, hasMedia: false },
  ];

  return (
    <div className="flex-1 overflow-hidden p-4 space-y-3">
      {messagePattern.map((item, index) => {
        if ("type" in item && item.type === "date") {
          return <DateSeparatorSkeleton key={index} />;
        }
        return (
          <MessageBubbleSkeleton
            key={index}
            isOutbound={(item as { isOutbound: boolean }).isOutbound}
            hasMedia={(item as { hasMedia: boolean }).hasMedia}
          />
        );
      })}
    </div>
  );
}

// ============================================================
// MESSAGE INPUT SKELETON
// ============================================================

/**
 * Message input area skeleton
 */
function MessageInputSkeleton() {
  return (
    <div className="border-t p-4">
      <div className="flex items-center gap-2">
        {/* Attachment button */}
        <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
        {/* Input field */}
        <Skeleton className="h-10 flex-1 rounded-full" />
        {/* Send button */}
        <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      </div>
    </div>
  );
}

// ============================================================
// SIDEBAR SKELETON
// ============================================================

/**
 * Right sidebar (profile/notes panel) skeleton
 */
function SidebarPanelSkeleton() {
  return (
    <div className="w-80 border-l flex flex-col bg-muted/10">
      {/* Profile header skeleton */}
      <div className="p-4 border-b flex flex-col items-center gap-3">
        <AvatarSkeleton size="lg" />
        <TextSkeleton width="md" height="md" />
        <TextSkeleton width="sm" height="xs" />
      </div>
      {/* Tabs skeleton */}
      <div className="flex border-b">
        <Skeleton className="flex-1 h-10 m-1 rounded-md" />
        <Skeleton className="flex-1 h-10 m-1 rounded-md" />
      </div>
      {/* Content skeleton */}
      <div className="flex-1 p-4 space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <TextSkeleton width="sm" height="xs" />
            <TextSkeleton width="full" height="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// COMPOSITE SKELETON COMPONENTS
// ============================================================

/**
 * Full chat detail skeleton - shown when restoring a previously selected chat
 * Includes header, messages, input, and sidebar
 */
export function ChatDetailSkeleton() {
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden min-h-0 animate-in fade-in-0 duration-200">
      <ChatHeaderSkeleton />

      {/* Messages + Sidebar Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <MessagesListSkeleton />
          <MessageInputSkeleton />
        </div>

        {/* Separator */}
        <div className="w-1 bg-border hidden xl:block" />

        {/* Sidebar Panel - hidden on smaller screens */}
        <div className="hidden xl:flex flex-col overflow-hidden">
          <SidebarPanelSkeleton />
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state skeleton - shown when no chat was previously selected
 * Matches the empty state placeholder design
 */
export function ChatEmptyStateSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center bg-muted/10 animate-in fade-in-0 duration-200">
      <div className="text-center max-w-sm px-4">
        <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-6">
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
        <Skeleton className="h-5 w-32 mx-auto mb-2" />
        <Skeleton className="h-4 w-48 mx-auto" />
      </div>
    </div>
  );
}

/**
 * Full page skeleton combining sidebar and content area
 * Used during initial page load
 */
export function ChatsPageSkeleton({
  hasPreviousChat = false,
}: {
  hasPreviousChat?: boolean;
}) {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Panel: Chat List */}
      <div className="w-full lg:w-80 border-r flex flex-col bg-muted/30">
        {/* Search Input Skeleton */}
        <div className="p-4 border-b">
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1 rounded-md" />
            <Skeleton className="h-10 w-10 rounded-md" />
          </div>
        </div>
        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          <ChatListSkeleton />
        </div>
      </div>

      {/* Right Panel: Chat Detail or Empty State */}
      <div className="hidden lg:flex flex-1 flex-col bg-background overflow-hidden min-h-0">
        {hasPreviousChat ? <ChatDetailSkeleton /> : <ChatEmptyStateSkeleton />}
      </div>
    </div>
  );
}
