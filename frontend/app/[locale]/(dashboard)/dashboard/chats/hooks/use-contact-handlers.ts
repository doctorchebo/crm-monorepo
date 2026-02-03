"use client";

import { backendApi } from "@/lib/api/endpoints";
import {
  ContactToSend,
  ReceivedContact,
} from "@/lib/types/contact-message.types";
import { useCallback, useState } from "react";
import { PAGE_SIZE } from "../constants";
import type { Chat, Message, MessagesCacheEntry, Sender } from "../types";

interface UseContactHandlersProps {
  selectedChatId: string | null;
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  setSelectedChatId: React.Dispatch<React.SetStateAction<string | null>>;
  senders: Sender[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setMessageCount: React.Dispatch<React.SetStateAction<number>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  messagesCacheRef: React.MutableRefObject<Map<string, MessagesCacheEntry>>;
  /**
   * Ref to track which chat the current messages belong to.
   * Use this to validate before updating messages to prevent cross-chat contamination.
   */
  currentMessagesChatIdRef: React.MutableRefObject<string | null>;
  setShouldAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
  scrollHelperRequestScroll: (smooth?: boolean) => (() => void) | undefined;
}

interface UseContactHandlersReturn {
  // Modal states
  sendContactsModalOpen: boolean;
  setSendContactsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  contactPreviewModalOpen: boolean;
  setContactPreviewModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  viewContactsModalOpen: boolean;
  setViewContactsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  quickContactFormOpen: boolean;
  setQuickContactFormOpen: React.Dispatch<React.SetStateAction<boolean>>;
  senderSelectModalOpen: boolean;
  setSenderSelectModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Contact data
  contactsToSend: ContactToSend[];
  setContactsToSend: React.Dispatch<React.SetStateAction<ContactToSend[]>>;
  contactsToView: ReceivedContact[];
  setContactsToView: React.Dispatch<React.SetStateAction<ReceivedContact[]>>;
  contactToSave: ReceivedContact | null;
  setContactToSave: React.Dispatch<
    React.SetStateAction<ReceivedContact | null>
  >;
  contactToStartChat: {
    firstName: string;
    lastName?: string;
    phoneNumber: string;
  } | null;
  setContactToStartChat: React.Dispatch<
    React.SetStateAction<{
      firstName: string;
      lastName?: string;
      phoneNumber: string;
    } | null>
  >;
  allContacts: ContactToSend[];

  // Loading states
  isSendingContacts: boolean;
  isSavingContact: boolean;
  contactsLoading: boolean;

  // Handlers
  handleContactsClick: () => Promise<void>;
  handleContactsSelected: (contacts: ContactToSend[]) => void;
  handleSendContacts: () => Promise<void>;
  handleStartChatWithContact: (
    contact: ContactToSend | ReceivedContact,
  ) => void;
  handleSenderSelectedForContact: (
    senderId: number,
    senderPhoneNumber: string,
  ) => Promise<void>;
  handleViewAllContacts: (contacts: ReceivedContact[]) => void;
  handleSaveContactFromMessage: (contact: ReceivedContact) => void;
  handleQuickSaveContact: (data: {
    firstName: string;
    lastName: string;
    countryCode: string;
    phoneNumber: string;
  }) => Promise<void>;
  parseContactsFromMessage: (message: Message) => ReceivedContact[] | null;
}

export function useContactHandlers(
  props: UseContactHandlersProps,
): UseContactHandlersReturn {
  const {
    selectedChatId,
    chats,
    setChats,
    setSelectedChatId,
    senders,
    setMessages,
    setMessageCount,
    setError,
    messagesCacheRef,
    currentMessagesChatIdRef,
    setShouldAutoScroll,
    scrollHelperRequestScroll,
  } = props;

  // Modal states
  const [sendContactsModalOpen, setSendContactsModalOpen] = useState(false);
  const [contactPreviewModalOpen, setContactPreviewModalOpen] = useState(false);
  const [viewContactsModalOpen, setViewContactsModalOpen] = useState(false);
  const [quickContactFormOpen, setQuickContactFormOpen] = useState(false);
  const [senderSelectModalOpen, setSenderSelectModalOpen] = useState(false);

  // Contact data
  const [contactsToSend, setContactsToSend] = useState<ContactToSend[]>([]);
  const [contactsToView, setContactsToView] = useState<ReceivedContact[]>([]);
  const [contactToSave, setContactToSave] = useState<ReceivedContact | null>(
    null,
  );
  const [contactToStartChat, setContactToStartChat] = useState<{
    firstName: string;
    lastName?: string;
    phoneNumber: string;
  } | null>(null);
  const [allContacts, setAllContacts] = useState<ContactToSend[]>([]);

  // Loading states
  const [isSendingContacts, setIsSendingContacts] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Open contacts modal from attachment menu
  const handleContactsClick = useCallback(async () => {
    try {
      setContactsLoading(true);
      const contactsData = await backendApi.contacts.list({
        page: 1,
        limit: 100,
      });
      if (contactsData.data && Array.isArray(contactsData.data)) {
        setAllContacts(
          contactsData.data.map((c: any) => ({
            id: c.id?.toString(),
            contactId: c.contactId,
            firstName: c.firstName,
            lastName: c.lastName || undefined,
            phoneNumber: c.phoneNumber,
            countryCode: c.countryCode,
            avatar: c.avatar,
            isActive: c.isActive,
          })),
        );
      }
      setSendContactsModalOpen(true);
    } catch (err) {
      console.error("Failed to load contacts:", err);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  // Handle contacts selected for sending - show preview modal
  const handleContactsSelected = useCallback((contacts: ContactToSend[]) => {
    setContactsToSend(contacts);
    setSendContactsModalOpen(false);
    setContactPreviewModalOpen(true);
  }, []);

  // Send contacts via WhatsApp
  const handleSendContacts = useCallback(async () => {
    if (!selectedChatId || contactsToSend.length === 0) return;

    const selectedChat = chats.find((c) => c.chatId === selectedChatId);
    if (!selectedChat) return;

    try {
      setIsSendingContacts(true);

      const contactsPayload = contactsToSend.map((contact) => ({
        name: {
          formatted_name: contact.lastName
            ? `${contact.firstName} ${contact.lastName}`
            : contact.firstName,
          first_name: contact.firstName,
          last_name: contact.lastName,
        },
        phones: [
          {
            phone: contact.phoneNumber,
            type: "CELL" as const,
          },
        ],
      }));

      await backendApi.whatsapp.sendContacts({
        to: selectedChat.participantPhone,
        senderId: selectedChat.senderId,
        contacts: contactsPayload,
      });

      setContactPreviewModalOpen(false);
      setContactsToSend([]);

      // Refresh messages - but only if we're still on the same chat
      if (currentMessagesChatIdRef.current !== selectedChatId) {
        console.log(
          "[ContactHandlers] Skipping message refresh - chat changed",
        );
        return;
      }

      const response = await backendApi.whatsapp.getChatMessages(
        selectedChatId,
        0,
        PAGE_SIZE,
      );

      // Double-check after async operation
      if (currentMessagesChatIdRef.current !== selectedChatId) {
        console.log("[ContactHandlers] Skipping message update - chat changed");
        return;
      }

      if (response && response.messages) {
        const sorted = [...response.messages].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        const cachedData = messagesCacheRef.current.get(selectedChatId);
        let combined = sorted;
        if (cachedData && cachedData.cursor > PAGE_SIZE) {
          const existingIds = new Set(sorted.map((m) => m.messageId));
          const olderMessages = cachedData.messages.filter(
            (m) => !existingIds.has(m.messageId),
          );
          combined = [...olderMessages, ...sorted].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
        }
        setMessages(combined);
        setMessageCount(combined.length);
        messagesCacheRef.current.set(selectedChatId, {
          messages: combined,
          hasMore: cachedData?.hasMore ?? response.hasMore,
          cursor: cachedData?.cursor ?? response.nextCursor,
        });
        setShouldAutoScroll(true);
        scrollHelperRequestScroll(true);
      }
    } catch (err: any) {
      console.error("Error sending contacts:", err);

      // Check if this is a conversation window violation error from the backend
      if (
        err?.response?.data?.error === "CONVERSATION_WINDOW_VIOLATION" ||
        err?.response?.data?.errorCode === "OUTSIDE_CONVERSATION_WINDOW" ||
        err?.response?.data?.errorCode === "NO_CUSTOMER_MESSAGES"
      ) {
        const errorData = err.response.data;
        setError(
          errorData.message ||
            "Cannot send contacts: Outside 24-hour conversation window. Use an approved template.",
        );
      } else {
        setError("Failed to send contacts");
      }
    } finally {
      setIsSendingContacts(false);
    }
  }, [
    selectedChatId,
    contactsToSend,
    chats,
    messagesCacheRef,
    currentMessagesChatIdRef,
    setMessages,
    setMessageCount,
    setError,
    setShouldAutoScroll,
    scrollHelperRequestScroll,
  ]);

  // Start chat with a contact
  const handleStartChatWithContact = useCallback(
    (contact: ContactToSend | ReceivedContact) => {
      let phoneNumber: string;
      let firstName: string;
      let lastName: string | undefined;

      if ("name" in contact && typeof contact.name === "object") {
        phoneNumber =
          contact.phones?.[0]?.phone || contact.phones?.[0]?.wa_id || "";
        firstName =
          contact.name.first_name || contact.name.formatted_name || "";
        lastName = contact.name.last_name;
      } else {
        phoneNumber = (contact as ContactToSend).phoneNumber;
        firstName = (contact as ContactToSend).firstName;
        lastName = (contact as ContactToSend).lastName;
      }

      if (!phoneNumber) {
        console.error("No phone number for contact");
        return;
      }

      setContactToStartChat({ firstName, lastName, phoneNumber });
      setSenderSelectModalOpen(true);
    },
    [],
  );

  // Handle sender selection for starting a new chat with contact
  const handleSenderSelectedForContact = useCallback(
    async (senderId: number, senderPhoneNumber: string) => {
      if (!contactToStartChat) return;

      try {
        const participantName = contactToStartChat.lastName
          ? `${contactToStartChat.firstName} ${contactToStartChat.lastName}`
          : contactToStartChat.firstName;

        const createdChat = await backendApi.chats.startWithContact({
          businessPhone: senderPhoneNumber,
          participantPhone: contactToStartChat.phoneNumber,
          participantName,
          senderId,
        });

        const chatId = (createdChat as any)?.chatId;
        if (chatId) {
          setSenderSelectModalOpen(false);
          setContactPreviewModalOpen(false);
          setViewContactsModalOpen(false);
          setContactToStartChat(null);

          const updatedChats = await backendApi.whatsapp.getChats(0, 50);
          if (Array.isArray(updatedChats)) {
            setChats(updatedChats);
          }

          setSelectedChatId(chatId);
        }
      } catch (err) {
        console.error("Failed to start chat:", err);
      }
    },
    [contactToStartChat, setChats, setSelectedChatId],
  );

  // View all contacts from a contact message
  const handleViewAllContacts = useCallback((contacts: ReceivedContact[]) => {
    setContactsToView(contacts);
    setViewContactsModalOpen(true);
  }, []);

  // Open save contact form
  const handleSaveContactFromMessage = useCallback(
    (contact: ReceivedContact) => {
      setContactToSave(contact);
      setQuickContactFormOpen(true);
    },
    [],
  );

  // Save contact from quick form
  const handleQuickSaveContact = useCallback(
    async (data: {
      firstName: string;
      lastName: string;
      countryCode: string;
      phoneNumber: string;
    }) => {
      try {
        setIsSavingContact(true);

        const fullPhoneNumber = `${data.countryCode}${data.phoneNumber}`;

        let existingContact: { contactId?: string } | null = null;
        try {
          existingContact = (await backendApi.contacts.getByPhone(
            fullPhoneNumber,
          )) as { contactId?: string } | null;
        } catch {
          // Contact doesn't exist
        }

        if (existingContact && existingContact.contactId) {
          await backendApi.contacts.update(existingContact.contactId, {
            firstName: data.firstName,
            lastName: data.lastName || undefined,
            countryCode: data.countryCode,
            phoneNumber: fullPhoneNumber,
          });
        } else {
          const sendersData = await backendApi.senders.list();
          const firstSenderId =
            Array.isArray(sendersData) && sendersData.length > 0
              ? sendersData[0].id
              : null;

          if (!firstSenderId) {
            console.error("No senders available to link contact");
            return;
          }

          await backendApi.contacts.create({
            firstName: data.firstName,
            lastName: data.lastName || undefined,
            countryCode: data.countryCode,
            phoneNumber: fullPhoneNumber,
            senderIds: [firstSenderId],
          });
        }

        setQuickContactFormOpen(false);
        setContactToSave(null);
      } catch (err) {
        console.error("Failed to save contact:", err);
      } finally {
        setIsSavingContact(false);
      }
    },
    [],
  );

  // Parse contacts from message metadata
  const parseContactsFromMessage = useCallback(
    (message: Message): ReceivedContact[] | null => {
      if (message.type !== "contacts") return null;

      try {
        const metadata = message.mediaMetadata;
        if (metadata) {
          const parsed =
            typeof metadata === "string" ? JSON.parse(metadata) : metadata;
          if (parsed.contacts) return parsed.contacts;
        }

        if (message.attachments) {
          const attachments =
            typeof message.attachments === "string"
              ? JSON.parse(message.attachments as unknown as string)
              : message.attachments;
          if (attachments.type === "contacts" && attachments.contacts) {
            return attachments.contacts;
          }
          if (
            Array.isArray(attachments) &&
            attachments[0]?.type === "contacts"
          ) {
            return attachments[0].contacts;
          }
        }

        if (
          message.text?.startsWith("Contact:") ||
          message.text?.includes("contacts:")
        ) {
          const names = message.text
            .replace(/^\d+ contacts: |^Contact: /, "")
            .split(", ");
          return names.map((name) => ({
            name: { formatted_name: name.trim() },
            phones: [],
          }));
        }

        return null;
      } catch {
        return null;
      }
    },
    [],
  );

  return {
    sendContactsModalOpen,
    setSendContactsModalOpen,
    contactPreviewModalOpen,
    setContactPreviewModalOpen,
    viewContactsModalOpen,
    setViewContactsModalOpen,
    quickContactFormOpen,
    setQuickContactFormOpen,
    senderSelectModalOpen,
    setSenderSelectModalOpen,
    contactsToSend,
    setContactsToSend,
    contactsToView,
    setContactsToView,
    contactToSave,
    setContactToSave,
    contactToStartChat,
    setContactToStartChat,
    allContacts,
    isSendingContacts,
    isSavingContact,
    contactsLoading,
    handleContactsClick,
    handleContactsSelected,
    handleSendContacts,
    handleStartChatWithContact,
    handleSenderSelectedForContact,
    handleViewAllContacts,
    handleSaveContactFromMessage,
    handleQuickSaveContact,
    parseContactsFromMessage,
  };
}
