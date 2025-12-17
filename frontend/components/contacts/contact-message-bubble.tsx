/**
 * ContactMessageBubble
 * Chat bubble component for displaying contact messages
 *
 * Single contact: Avatar, name, separator, View contact option
 * Multiple contacts: Stacked avatars, "Name and X other contacts", separator, "View All" option
 *
 * Clicking on the bubble opens ViewContactsModal which shows:
 * - First line: Avatar, name, Save button
 * - Second line: phone number, Message button
 */

"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WhatsAppStatusIcon } from "@/components/whatsapp-status-icon";
import { ReceivedContact } from "@/lib/types/contact-message.types";
import { cn } from "@/lib/utils";
import { Eye, User } from "lucide-react";
import { memo } from "react";
import { MessageActionsMenu } from "../message-actions-menu";

interface ContactMessageBubbleProps {
  contacts: ReceivedContact[];
  isOutbound: boolean;
  timestamp: string;
  messageId: string;
  status?: "pending" | "sent" | "delivered" | "read" | "failed";
  onViewAll: () => void;
  onStartChat: (contact: ReceivedContact) => void;
  onReply?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  deliveredAt?: string;
  readAt?: string;
}

function getInitials(contact: ReceivedContact): string {
  const firstName = contact.name.first_name || "";
  const lastName = contact.name.last_name || "";
  const first = firstName.charAt(0).toUpperCase();
  const last = lastName.charAt(0).toUpperCase();
  return (
    (first + last).slice(0, 2) ||
    contact.name.formatted_name?.charAt(0)?.toUpperCase() ||
    "?"
  );
}

function getDisplayName(contact: ReceivedContact): string {
  if (contact.name.first_name) {
    return contact.name.last_name
      ? `${contact.name.first_name} ${contact.name.last_name}`
      : contact.name.first_name;
  }
  return contact.name.formatted_name || contact.phones?.[0]?.phone || "Unknown";
}

function getPhoneNumber(contact: ReceivedContact): string {
  return contact.phones?.[0]?.phone || contact.phones?.[0]?.wa_id || "";
}

export const ContactMessageBubble = memo(function ContactMessageBubble({
  contacts,
  isOutbound,
  timestamp,
  messageId,
  status = "sent",
  onViewAll,
  onStartChat,
  onReply,
  onDelete,
  deliveredAt,
  readAt,
}: ContactMessageBubbleProps) {
  const isSingleContact = contacts.length === 1;
  const firstContact = contacts[0];
  const additionalCount = contacts.length - 1;

  // Format timestamp
  const timeString = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isSingleContact && firstContact) {
    // Single contact layout
    return (
      <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "group relative rounded-lg overflow-hidden max-w-xs",
            isOutbound ? "bg-primary text-primary-foreground" : "bg-muted"
          )}
        >
          {/* Chevron positioned in top-right corner - visible on hover */}
          <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <MessageActionsMenu
              messageId={messageId}
              messageTimestamp={timestamp}
              isOutbound={isOutbound}
              onReply={onReply}
              onDelete={isOutbound && onDelete ? onDelete : undefined}
            />
          </div>

          {/* Contact Card */}
          <div className="p-3 flex items-center gap-3">
            <Avatar className="h-12 w-12 shrink-0">
              <AvatarFallback
                className={cn(
                  "text-sm",
                  isOutbound
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-primary/20 text-primary"
                )}
              >
                {getInitials(firstContact)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {getDisplayName(firstContact)}
              </p>
              <p
                className={cn(
                  "text-xs truncate",
                  isOutbound
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground"
                )}
              >
                {getPhoneNumber(firstContact)}
              </p>
            </div>
          </div>

          {/* Separator */}
          <Separator className={isOutbound ? "bg-primary-foreground/20" : ""} />

          {/* View Contact Action - Opens modal with Save and Message options */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full rounded-none h-10 gap-2",
              isOutbound
                ? "text-primary-foreground hover:bg-primary-foreground/10"
                : "text-primary hover:bg-muted"
            )}
            onClick={onViewAll}
          >
            <Eye className="h-4 w-4" />
            View Contact
          </Button>

          {/* Timestamp and Status */}
          <div
            className={cn(
              "px-3 py-1 text-xs flex items-center justify-end gap-1",
              isOutbound
                ? "text-primary-foreground/70"
                : "text-muted-foreground"
            )}
          >
            <span>{timeString}</span>
            {isOutbound && (
              <WhatsAppStatusIcon
                status={status}
                deliveredAt={deliveredAt}
                readAt={readAt}
                className="ml-1"
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Multiple contacts layout
  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "group relative rounded-lg overflow-hidden max-w-xs",
          isOutbound ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {/* Chevron positioned in top-right corner - visible on hover */}
        <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <MessageActionsMenu
            messageId={messageId}
            messageTimestamp={timestamp}
            isOutbound={isOutbound}
            onReply={onReply}
            onDelete={isOutbound && onDelete ? onDelete : undefined}
          />
        </div>

        {/* Contact Card with Stacked Avatars */}
        <div className="p-3 flex items-center gap-3">
          {/* Stacked Avatars */}
          <div className="relative h-12 w-12 shrink-0">
            {contacts.slice(0, 3).map((contact, index) => (
              <Avatar
                key={index}
                className={cn(
                  "h-8 w-8 absolute border-2",
                  isOutbound ? "border-primary" : "border-muted"
                )}
                style={{
                  left: `${index * 6}px`,
                  top: `${index * 6}px`,
                  zIndex: 3 - index,
                }}
              >
                <AvatarFallback
                  className={cn(
                    "text-xs",
                    isOutbound
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-primary/20 text-primary"
                  )}
                >
                  {getInitials(contact)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>

          {/* Contact Info */}
          <div className="flex-1 min-w-0 pl-2">
            <div className="flex items-center gap-1">
              <User
                className={cn(
                  "h-4 w-4 shrink-0",
                  isOutbound
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground"
                )}
              />
              <p className="font-medium text-sm truncate">
                {firstContact ? getDisplayName(firstContact) : "Contact"}
              </p>
            </div>
            <p
              className={cn(
                "text-xs",
                isOutbound
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground"
              )}
            >
              and {additionalCount} other contact
              {additionalCount > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Separator */}
        <Separator className={isOutbound ? "bg-primary-foreground/20" : ""} />

        {/* View All Action */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full rounded-none h-10 gap-2",
            isOutbound
              ? "text-primary-foreground hover:bg-primary-foreground/10"
              : "text-primary hover:bg-muted"
          )}
          onClick={onViewAll}
        >
          <Eye className="h-4 w-4" />
          View All
        </Button>

        {/* Timestamp and Status */}
        <div
          className={cn(
            "px-3 py-1 text-xs flex items-center justify-end gap-1",
            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          <span>{timeString}</span>
          {isOutbound && (
            <WhatsAppStatusIcon
              status={status}
              deliveredAt={deliveredAt}
              readAt={readAt}
              className="ml-1"
            />
          )}
        </div>
      </div>
    </div>
  );
});

ContactMessageBubble.displayName = "ContactMessageBubble";
