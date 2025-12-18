import type { GroupedMessage, Message } from "./types";

/**
 * Groups consecutive outbound media-only messages that were sent within 2 seconds.
 * This creates WhatsApp-like grouped media bubbles.
 */
export function groupMessages(messages: Message[]): GroupedMessage[] {
  if (messages.length === 0) return [];

  const result: GroupedMessage[] = [];
  let currentGroup: Message[] = [];

  const isMediaOnlyMessage = (msg: Message) => {
    return (
      msg.direction === "outbound" &&
      !msg.text &&
      msg.attachments &&
      msg.attachments.length > 0 &&
      msg.attachments.every((a) => a.type === "image" || a.type === "video")
    );
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prevMsg = i > 0 ? messages[i - 1] : null;

    if (isMediaOnlyMessage(msg)) {
      // Check if this should be grouped with previous media messages
      if (currentGroup.length > 0 && prevMsg && isMediaOnlyMessage(prevMsg)) {
        const timeDiff =
          new Date(msg.timestamp).getTime() -
          new Date(prevMsg.timestamp).getTime();
        // Group if within 2 seconds
        if (timeDiff <= 2000) {
          currentGroup.push(msg);
          continue;
        }
      }

      // Start new group or add to existing
      if (currentGroup.length > 0) {
        result.push({
          type: currentGroup.length > 1 ? "group" : "single",
          messages: currentGroup,
          id: currentGroup[0].messageId || currentGroup[0].id?.toString() || "",
        });
      }
      currentGroup = [msg];
    } else {
      // Not a media-only message, flush current group and add single
      if (currentGroup.length > 0) {
        result.push({
          type: currentGroup.length > 1 ? "group" : "single",
          messages: currentGroup,
          id: currentGroup[0].messageId || currentGroup[0].id?.toString() || "",
        });
        currentGroup = [];
      }
      result.push({
        type: "single",
        messages: [msg],
        id: msg.messageId || msg.id?.toString() || "",
      });
    }
  }

  // Flush remaining group
  if (currentGroup.length > 0) {
    result.push({
      type: currentGroup.length > 1 ? "group" : "single",
      messages: currentGroup,
      id: currentGroup[0].messageId || currentGroup[0].id?.toString() || "",
    });
  }

  return result;
}
