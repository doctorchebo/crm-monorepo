/**
 * Contact Message Types
 * Types for sending and receiving contact cards in WhatsApp messages
 */

/**
 * Contact data for sending via WhatsApp
 * Follows WhatsApp Cloud API vCard format
 */
export interface ContactToSend {
  id?: string;
  contactId?: string;
  firstName: string;
  lastName?: string;
  phoneNumber: string;
  countryCode?: string;
  avatar?: string | null;
  isActive?: boolean;
}

/**
 * Contact received in a WhatsApp message
 * Parsed from vCard format
 */
export interface ReceivedContact {
  name: {
    formatted_name: string;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    prefix?: string;
    suffix?: string;
  };
  phones?: Array<{
    phone: string;
    type?: "CELL" | "MAIN" | "IPHONE" | "HOME" | "WORK";
    wa_id?: string;
  }>;
  emails?: Array<{
    email: string;
    type?: "HOME" | "WORK";
  }>;
  addresses?: Array<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    country_code?: string;
    type?: "HOME" | "WORK";
  }>;
  org?: {
    company?: string;
    department?: string;
    title?: string;
  };
  birthday?: string;
  urls?: Array<{
    url: string;
    type?: "HOME" | "WORK";
  }>;
}

/**
 * Contact message in chat
 * Used for both inbound and outbound contact messages
 */
export interface ContactMessage {
  type: "contacts";
  contacts: ReceivedContact[];
}

/**
 * Sender data for the sender selection modal
 */
export interface Sender {
  id: number;
  phoneNumber: string;
  displayName?: string | null;
  isActive?: boolean;
}

/**
 * Props for contact selection modal
 */
export interface SendContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (contacts: ContactToSend[]) => void;
  contacts: ContactToSend[];
  isLoading?: boolean;
}

/**
 * Props for contact preview modal (shown before sending)
 */
export interface ContactPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSend: () => void;
  contacts: ContactToSend[];
  onStartChat: (contact: ContactToSend) => void;
  isLoading?: boolean;
}

/**
 * Props for view contacts modal (for received contacts)
 */
export interface ViewContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: ReceivedContact[];
  onStartChat: (contact: ReceivedContact) => void;
  onSaveContact: (contact: ReceivedContact) => void;
}

/**
 * Props for contact message bubble
 */
export interface ContactMessageBubbleProps {
  contacts: ReceivedContact[];
  isOutbound: boolean;
  timestamp: string;
  status?: "pending" | "sent" | "delivered" | "read" | "failed";
  onViewAll: () => void;
  onStartChat: (contact: ReceivedContact) => void;
}

/**
 * Props for quick contact form modal
 */
export interface QuickContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    firstName: string;
    lastName: string;
    countryCode: string;
    phoneNumber: string;
  }) => void;
  initialData?: {
    firstName?: string;
    lastName?: string;
    countryCode?: string;
    phoneNumber?: string;
  };
  isLoading?: boolean;
}
