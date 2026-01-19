/**
 * Types for Invitation Email Lambda
 */

export interface InvitationEmailMessage {
  invitationId: number;
  email: string;
  teamName: string;
  inviterName: string;
  token: string;
  expiresAt: string; // ISO date string
  role: string;
}

export interface InvitationEmailPayload {
  to: string;
  teamName: string;
  inviterName: string;
  invitationUrl: string;
  expiresAt: Date;
  role: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  permanent?: boolean; // true = don't retry (4xx), false = retry (5xx)
}

export interface InvitationRecord {
  id: number;
  teamId: number;
  email: string;
  role: string;
  status: string;
  token: string | null;
  expiresAt: Date | null;
  emailSentAt: Date | null;
  createdAt: Date;
}
