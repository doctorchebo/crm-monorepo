// Interface for the gateway to avoid circular dependency
export interface IChatUpdateGateway {
  emitChatUpdate(update: {
    chatId: string;
    unreadCount: number;
    lastMessage?: string;
    lastMessageType?: string;
    lastMessageTime?: Date;
  }): void;
  emitChatArchived?(chatId: string, isArchived: boolean): void;
  emitChatDeleted?(chatId: string): void;
}

// Injection token for the gateway
export const CHAT_UPDATE_GATEWAY = 'CHAT_UPDATE_GATEWAY';
