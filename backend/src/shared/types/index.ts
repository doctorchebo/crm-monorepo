/**
 * Shared Type Definitions
 * Used across modules and shared with frontend via monorepo
 */

import { Request } from 'express';

/**
 * JWT payload structure after authentication
 */
export interface JwtPayload {
  userId: number;
  email: string;
  teamId?: number;
  iat?: number;
  exp?: number;
}

/**
 * Express Request with authenticated user context
 * Used by all controllers that require authentication
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export interface PaginationDto {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
}

export interface UserContext {
  userId: string;
  email: string;
  teamId: string;
  role: 'owner' | 'member';
}

export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export enum EmotionType {
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
  ANGRY = 'angry',
  CONFUSED = 'confused',
}

export interface Message {
  id: string;
  chatId: string;
  sender: 'user' | 'bot';
  body: string;
  status: MessageStatus;
  emotion?: EmotionType;
  mediaUrl?: string;
  createdAt: Date;
}

export interface Chat {
  id: string;
  teamId: string;
  phoneNumber: string;
  name?: string;
  status: 'active' | 'closed' | 'archived';
  kanbanStageId?: string;
  lastMessage?: Message;
  createdAt: Date;
  updatedAt: Date;
}
