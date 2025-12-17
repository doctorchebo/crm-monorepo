"use client";

import {
  ChatMessageInput,
  ChatMessageInputRef,
} from "@/components/chat-message-input";
import { ChatsSenderSection } from "@/components/chats-sender-section";
import { ContactMessageBubble } from "@/components/contacts/contact-message-bubble";
import { DeleteMessageDialog } from "@/components/delete-message-dialog";
import { ContactPreviewModal } from "@/components/dialogs/contact-preview-modal";
import { QuickContactFormModal } from "@/components/dialogs/quick-contact-form-modal";
import { SelectSenderModal } from "@/components/dialogs/select-sender-modal";
import { SendContactsModal } from "@/components/dialogs/send-contacts-modal";
import { ViewContactsModal } from "@/components/dialogs/view-contacts-modal";
import { AttachmentGallery } from "@/components/media/attachment-display";
import {
  AttachmentMenu,
  AttachmentType,
} from "@/components/media/attachment-menu";
import { GroupedMediaBubble } from "@/components/media/grouped-media-bubble";
import { MediaDownloadMenu } from "@/components/media/media-download-menu";
import { MediaPreviewModal } from "@/components/media/media-preview-modal";
import {
  MediaStagingPanel,
  StagedFile,
} from "@/components/media/media-staging-panel";
import {
  PendingMediaUpload,
  PendingUploadGroup,
} from "@/components/media/pending-upload-bubble";
import { MessageActionsMenu } from "@/components/message-actions-menu";
import { QuotedMessage } from "@/components/quoted-message";
import { ReplyBanner } from "@/components/reply-banner";
import { Button } from "@/components/ui/button";
import { ChatSidebar } from "@/components/ui/chat-sidebar";
import { Input } from "@/components/ui/input";
import { MessageText } from "@/components/ui/message-text";
import { VideoPreviewPlayer } from "@/components/ui/video-preview-player";
import { WhatsAppStatusIcon } from "@/components/whatsapp-status-icon";
import { useAuthProtection } from "@/hooks/use-auth";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useRealtimeChat } from "@/hooks/use-message-status-socket";
import { useThumbnailUpdates } from "@/hooks/use-thumbnail-updates";
import { backendApi } from "@/lib/api/endpoints";
import { mediaApi } from "@/lib/media/api";
import {
  Attachment,
  PendingUpload,
  ThumbnailReadyEvent,
} from "@/lib/media/types";
import {
  ContactToSend,
  ReceivedContact,
} from "@/lib/types/contact-message.types";
import { ArrowDown, Loader, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import React, {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import useSWR from "swr";

interface Template {
  id: string;
  name: string;
  description?: string;
  isVisible: boolean;
  locales?: Array<{
    id: string;
    locale: string;
    body: string;
    header?: string;
    footer?: string;
    exampleVars?: Record<string, any>;
  }>;
}

interface Chat {
  id?: number;
  chatId: string;
  participantPhone: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  isActive: boolean;
  senderId: number;
  businessPhone?: string;
}

interface ReplyPreview {
  messageId: string;
  senderType: "customer" | "agent";
  senderName: string;
  type: "text" | "image" | "video" | "audio" | "document" | "contacts";
  text?: string;
  media?: {
    url?: string;
    mimeType: string;
    thumbnailUrl?: string;
    fileName?: string;
  };
  unavailable?: boolean;
}

interface Message {
  id?: number;
  messageId: string;
  text?: string | null;
  sender: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  type: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  attachments?: Attachment[];
  mediaMetadata?: Record<string, any>; // For contacts and other special message types
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  editedAt?: string;
  replyToMessageId?: string | null;
  replyPreview?: ReplyPreview | null;
}

interface InboundMessage {
  messageId: string;
  chatId: string;
  sender: string;
  text: string;
  type: string;
  timestamp: string;
  attachments?: Array<{
    type: string;
    mediaId: string;
  }>;
  replyToMessageId?: string;
  replyPreview?: ReplyPreview;
}

/**
 * Scroll controller utility for reliable message scroll-to-bottom behavior
 * Handles async image loading and container size changes
 */
class ScrollController {
  private container: HTMLElement | null = null;
  private scrollTimeout: NodeJS.Timeout | null = null;
  private mutationObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private pendingImageLoads = new Set<HTMLImageElement>();

  constructor(container: HTMLElement | null) {
    this.container = container;
  }

  /**
   * Scroll to bottom with proper handling of async image loads
   * Uses requestIdleCallback for optimal timing after all paints
   */
  scrollToBottom(smooth = false) {
    if (!this.container) return;

    // Clear any pending scroll operations
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // First pass: immediate scroll
    this.container.scrollTop = this.container.scrollHeight;

    // Second pass: wait for images to load and re-scroll
    // This ensures we account for dynamic image sizing
    this.scheduleScrollAfterImageLoad(smooth);
  }

  /**
   * Schedule scroll after images finish loading
   */
  private scheduleScrollAfterImageLoad(smooth = false) {
    if (!this.container) return;

    // Wait a microtask to ensure DOM is settled
    Promise.resolve().then(() => {
      // Get all images in the container
      const images = this.container!.querySelectorAll("img");
      let loadedCount = 0;
      const totalImages = images.length;

      if (totalImages === 0) {
        // No images, scroll immediately
        this.performScroll(smooth);
        return;
      }

      // Track image loads
      const handleImageLoad = () => {
        loadedCount++;
        if (loadedCount === totalImages) {
          // All images loaded
          this.performScroll(smooth);
        }
      };

      const handleImageError = () => {
        loadedCount++;
        if (loadedCount === totalImages) {
          this.performScroll(smooth);
        }
      };

      // Add listeners to all images
      images.forEach((img) => {
        if (img.complete) {
          // Image already loaded
          loadedCount++;
        } else {
          img.addEventListener("load", handleImageLoad, { once: true });
          img.addEventListener("error", handleImageError, { once: true });
        }
      });

      // If all images are already loaded
      if (loadedCount === totalImages) {
        this.performScroll(smooth);
      }

      // Fallback: scroll after max 2 seconds in case images never load
      this.scrollTimeout = setTimeout(() => {
        this.performScroll(smooth);
      }, 2000);
    });
  }

  /**
   * Perform the actual scroll
   */
  private performScroll(smooth = false) {
    if (!this.container) return;

    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }

    // Use requestAnimationFrame for smooth visual result
    requestAnimationFrame(() => {
      if (!this.container) return;

      if (smooth) {
        this.container.scrollTo({
          top: this.container!.scrollHeight,
          behavior: "smooth",
        });
      } else {
        this.container.scrollTop = this.container.scrollHeight;
      }
    });
  }

  /**
   * Check if user is at the bottom of the container
   */
  isAtBottom(threshold = 50): boolean {
    if (!this.container) return false;
    const { scrollTop, scrollHeight, clientHeight } = this.container;
    return scrollHeight - scrollTop - clientHeight < threshold;
  }

  /**
   * Cleanup all observers and timeouts
   */
  destroy() {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.pendingImageLoads.clear();
  }
}

export default function ChatsPage() {
  const t = useTranslations("chats");
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const scrollControllerRef = useRef<ScrollController | null>(null);
  const messageInputRef = useRef<ChatMessageInputRef>(null);

  // Protect this route - redirect to login if token is missing or expired
  useAuthProtection();

  // Initialize media upload hook
  const hookResult = useMediaUpload();
  const pendingUploads = hookResult.pendingUploads as Map<
    string,
    PendingUpload
  >;
  const { isUploading, queueFiles, uploadAll, removeUpload, clearUploads } =
    hookResult;

  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const [chats, setChats] = useState<Chat[]>([]);
  const [senders, setSenders] = useState<any[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [templateInput, setTemplateInput] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [notes, setNotes] = useState<any>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [notesPanelWidth, setNotesPanelWidth] = useState(320); // Default width in pixels
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true); // Control auto-scroll

  // Infinite scroll state for loading older messages
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const loadOlderMessagesLockRef = useRef(false); // Prevent concurrent requests
  const currentCursorRef = useRef<number>(0); // Track pagination cursor
  const PAGE_SIZE = 50;

  // Scroll position memory
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const previousChatIdRef = useRef<string | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false); // Show "scroll to bottom" arrow
  const previousMessageCountRef = useRef(0);
  const isTransitioningRef = useRef(false); // Flag to prevent scroll effects during chat transition
  const [isScrollRestoring, setIsScrollRestoring] = useState(false); // Hide container during scroll restoration
  const allowScrollSaveRef = useRef(false); // Only allow scroll saves after initial load settles

  // Messages cache - store messages per chat with pagination metadata
  const messagesCacheRef = useRef<
    Map<
      string,
      {
        messages: Message[];
        hasMore: boolean;
        cursor: number;
      }
    >
  >(new Map());

  // Media preview modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewAttachments, setPreviewAttachments] = useState<Attachment[]>(
    []
  );
  const [previewMessageId, setPreviewMessageId] = useState<string>("");
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);

  // Download menu state
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [downloadMenuPosition, setDownloadMenuPosition] = useState({
    x: 0,
    y: 0,
  });
  const [currentMessageAttachments, setCurrentMessageAttachments] = useState<
    Attachment[]
  >([]);
  const [currentMessageId, setCurrentMessageId] = useState<string>("");
  const [downloadLoading, setDownloadLoading] = useState(false);

  // Edit and delete message state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string>("");

  // Media staging modal state (WhatsApp-style media preview before sending)
  const [mediaStagingOpen, setMediaStagingOpen] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [currentAttachmentType, setCurrentAttachmentType] =
    useState<AttachmentType>("photos-videos");
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  // Pending media uploads to show in chat with progress
  const [pendingMediaUploads, setPendingMediaUploads] = useState<
    PendingMediaUpload[]
  >([]);
  const [pendingCaption, setPendingCaption] = useState("");

  // Video preview player state (draggable YouTube/video player)
  const [videoPreview, setVideoPreview] = useState<{
    videoId: string;
    url: string;
    title?: string;
  } | null>(null);

  // Contact sending modal states
  const [sendContactsModalOpen, setSendContactsModalOpen] = useState(false);
  const [contactPreviewModalOpen, setContactPreviewModalOpen] = useState(false);
  const [viewContactsModalOpen, setViewContactsModalOpen] = useState(false);
  const [quickContactFormOpen, setQuickContactFormOpen] = useState(false);
  const [senderSelectModalOpen, setSenderSelectModalOpen] = useState(false);
  const [contactsToSend, setContactsToSend] = useState<ContactToSend[]>([]);
  const [contactsToView, setContactsToView] = useState<ReceivedContact[]>([]);
  const [contactToSave, setContactToSave] = useState<ReceivedContact | null>(
    null
  );
  const [contactToStartChat, setContactToStartChat] = useState<{
    firstName: string;
    lastName?: string;
    phoneNumber: string;
  } | null>(null);
  const [isSendingContacts, setIsSendingContacts] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [allContacts, setAllContacts] = useState<ContactToSend[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Reply state
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(
    null
  );
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Handler for playing video in preview player
  const handleVideoPlay = useCallback((videoId: string, url: string) => {
    setVideoPreview({ videoId, url });
  }, []);

  // Handler for replying to a message - accepts messageId and looks up the message
  const handleReplyById = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.messageId === messageId);
      if (!message || message.isDeleted) return;

      // Use startTransition to mark this as a non-urgent update
      // This allows React to keep the UI responsive during re-render
      startTransition(() => {
        setReplyingToMessage(message);
      });

      // Focus the input with a small delay to let the dropdown close
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 0);
    },
    [messages]
  );

  // Handler for download - accepts messageId and looks up the message
  const handleDownloadById = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.messageId === messageId);
      if (!message?.attachments?.length) return;

      const downloadableAttachments = message.attachments.filter(
        (a) => a.type === "image" || a.type === "video"
      );
      if (!downloadableAttachments.length) return;

      setCurrentMessageId(messageId);
      setCurrentMessageAttachments(downloadableAttachments);
      setDownloadMenuPosition({
        x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
        y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
      });
      setDownloadMenuOpen(true);
    },
    [messages]
  );

  // Focus the message input when reply is set (backup for other entry points)
  useEffect(() => {
    if (replyingToMessage) {
      messageInputRef.current?.focus();
    }
  }, [replyingToMessage]);

  // Handler for canceling reply
  const handleCancelReply = useCallback(() => {
    startTransition(() => {
      setReplyingToMessage(null);
    });
  }, []);

  // Handler for clearing template (when user starts typing)
  const handleTemplateUsed = useCallback(() => {
    setTemplateInput("");
  }, []);

  // Handler for scrolling to a replied message
  const handleScrollToMessage = useCallback((messageId: string) => {
    const messageElement = messageRefs.current.get(messageId);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
      // Highlight the message briefly
      messageElement.classList.add("bg-primary/10", "transition-colors");
      setTimeout(() => {
        messageElement.classList.remove("bg-primary/10");
      }, 1500);
    }
  }, []);

  // Handler to select chat and save scroll position before switching
  const handleSelectChat = useCallback(
    (chatId: string) => {
      console.log("=== HANDLE SELECT CHAT ===");
      console.log("Switching FROM:", selectedChatId, "TO:", chatId);

      const messagesContainer = messagesContainerRef.current;
      // Save the current chat's scroll position if we're switching away
      if (selectedChatId && messagesContainer) {
        const currentScroll = messagesContainer.scrollTop;
        // Save scrollTop directly (with caching, content height is stable)
        scrollPositionsRef.current.set(selectedChatId, currentScroll);
        console.log("SAVED scroll for", selectedChatId, ":", currentScroll);
        console.log(
          "scrollPositionsRef now:",
          Array.from(scrollPositionsRef.current.entries())
        );

        // Also cache the current messages for this chat with pagination metadata
        if (messages.length > 0) {
          messagesCacheRef.current.set(selectedChatId, {
            messages: [...messages],
            hasMore: hasMoreMessages,
            cursor: currentCursorRef.current,
          });
          console.log(
            "CACHED",
            messages.length,
            "messages for",
            selectedChatId
          );
        } else {
          console.log("NO messages to cache for", selectedChatId);
        }
      } else {
        console.log(
          "NOT saving scroll - selectedChatId:",
          selectedChatId,
          "container:",
          !!messagesContainer
        );
      }
      // Now switch to the new chat
      setSelectedChatId(chatId);
      // Clear reply state when switching chats
      setReplyingToMessage(null);
    },
    [selectedChatId, messages, hasMoreMessages]
  );

  // Fetch templates from API
  const { data: templates = [], isLoading: templatesLoading } = useSWR(
    "visible-templates",
    async () => {
      try {
        return await backendApi.templates.list(true); // Only visible templates
      } catch (error) {
        console.error("Failed to fetch templates:", error);
        return [];
      }
    }
  );

  // Filter templates based on search
  const filteredTemplates = (templates as Template[]).filter((template) =>
    template.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  // Fetch current user on mount
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = await backendApi.user.getProfile();
        setCurrentUserId(user.id);
      } catch (error) {
        console.error("Failed to fetch current user:", error);
      }
    };

    fetchCurrentUser();
  }, []);

  const [messageCount, setMessageCount] = useState(0);

  // Initialize scroll controller
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      scrollControllerRef.current = new ScrollController(container);
    }

    return () => {
      scrollControllerRef.current?.destroy();
    };
  }, []);

  /**
   * Load older messages when user scrolls to top
   * Preserves scroll position after prepending older messages
   */
  const loadOlderMessages = useCallback(async () => {
    if (
      !selectedChatId ||
      !hasMoreMessages ||
      isLoadingOlderMessages ||
      loadOlderMessagesLockRef.current
    ) {
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) return;

    // Set lock to prevent concurrent requests
    loadOlderMessagesLockRef.current = true;
    setIsLoadingOlderMessages(true);

    // Capture scroll position before loading
    const previousScrollHeight = container.scrollHeight;
    const previousScrollTop = container.scrollTop;

    try {
      const response = await backendApi.whatsapp.getChatMessages(
        selectedChatId,
        currentCursorRef.current,
        PAGE_SIZE
      );

      if (!response.messages || response.messages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      // Sort older messages by timestamp ascending
      const sortedOlderMessages = [...response.messages].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Prepend older messages to existing messages
      setMessages((prevMessages) => {
        // Deduplicate by messageId
        const existingIds = new Set(prevMessages.map((m) => m.messageId));
        const newMessages = sortedOlderMessages.filter(
          (m) => !existingIds.has(m.messageId)
        );

        // Combine: older messages first, then existing messages
        const combined = [...newMessages, ...prevMessages];

        // Update cache with combined messages
        const cached = messagesCacheRef.current.get(selectedChatId);
        messagesCacheRef.current.set(selectedChatId, {
          messages: combined,
          hasMore: response.hasMore,
          cursor: response.nextCursor,
        });

        return combined;
      });

      // Update pagination state
      setHasMoreMessages(response.hasMore);
      currentCursorRef.current = response.nextCursor;

      // Restore scroll position after React re-renders
      // Use requestAnimationFrame to wait for DOM update
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          const scrollDifference = newScrollHeight - previousScrollHeight;
          container.scrollTop = previousScrollTop + scrollDifference;
        }
      });
    } catch (err) {
      console.error("Error loading older messages:", err);
    } finally {
      setIsLoadingOlderMessages(false);
      loadOlderMessagesLockRef.current = false;
    }
  }, [selectedChatId, hasMoreMessages, isLoadingOlderMessages]);

  // Handle scroll position tracking to disable auto-scroll when user scrolls up
  // Also triggers loading older messages when scrolling to top
  useEffect(() => {
    const messagesContainer = messagesContainerRef.current;
    if (!messagesContainer) return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      // Check if user is at the bottom
      const isAtBottom = scrollControllerRef.current?.isAtBottom(50) ?? false;
      setShouldAutoScroll(isAtBottom);

      // Clear new messages indicator when user scrolls to bottom
      if (isAtBottom) {
        setHasNewMessages(false);
      }

      // Check if user scrolled to top - trigger loading older messages
      const scrollTop = messagesContainer.scrollTop;
      const threshold = 100; // pixels from top to trigger load
      if (
        scrollTop < threshold &&
        hasMoreMessages &&
        !isLoadingOlderMessages &&
        !loadOlderMessagesLockRef.current &&
        !isTransitioningRef.current
      ) {
        loadOlderMessages();
      }

      // Only save scroll position after initial load has settled
      if (selectedChatId && allowScrollSaveRef.current) {
        const scrollPos = messagesContainer.scrollTop;
        scrollPositionsRef.current.set(selectedChatId, scrollPos);
        // console.log(
        //   "Saved scroll position for",
        //   selectedChatId,
        //   ":",
        //   scrollPos
        // );
      }
    };

    const debouncedHandleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScroll, 100);
    };

    messagesContainer.addEventListener("scroll", debouncedHandleScroll);
    return () => {
      messagesContainer.removeEventListener("scroll", debouncedHandleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [
    selectedChatId,
    hasMoreMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
  ]);

  // Handle chat switch - reset initial load and save last scroll position
  useEffect(() => {
    if (selectedChatId && selectedChatId !== previousChatIdRef.current) {
      console.log("=== CHAT SWITCH EFFECT ===");
      console.log(
        "Switching to chat:",
        selectedChatId,
        "from:",
        previousChatIdRef.current
      );
      console.log(
        "scrollPositionsRef at switch:",
        Array.from(scrollPositionsRef.current.entries())
      );

      // Reset infinite scroll state for new chat
      setHasMoreMessages(true);
      setIsLoadingOlderMessages(false);
      loadOlderMessagesLockRef.current = false;
      currentCursorRef.current = 0;

      // Mark that we're transitioning - this prevents scroll effects from firing
      isTransitioningRef.current = true;
      allowScrollSaveRef.current = false; // Disable scroll saving during transition
      setIsScrollRestoring(true); // Hide container to prevent visual jump

      // Update the previous chat ref
      previousChatIdRef.current = selectedChatId;
      setIsInitialLoad(true);
      setHasNewMessages(false);
      console.log("Switched to chat", selectedChatId);
    }
  }, [selectedChatId]);

  // Handle first-time visit to chat - scroll to bottom as images load
  // For cached chats (returning visits), scroll is handled in fetchMessages effect
  useEffect(() => {
    const container = messagesContainerRef.current;
    // Only run when NOT transitioning, have messages, and in initial load state
    if (
      isTransitioningRef.current ||
      !container ||
      messages.length === 0 ||
      !isInitialLoad
    ) {
      return;
    }

    // Check if this chat has cached messages (returning visit)
    const hasCachedMessages = selectedChatId
      ? messagesCacheRef.current.has(selectedChatId)
      : false;

    if (hasCachedMessages) {
      // Cached visit - scroll already handled, just enable saving
      setIsInitialLoad(false);
      allowScrollSaveRef.current = true;
      return;
    }

    // First visit to chat - scroll to bottom as images load
    console.log("First visit, scrolling to bottom with image handling");
    let shouldContinueScrolling = true;

    const performScroll = () => {
      if (container && shouldContinueScrolling) {
        container.scrollTop = container.scrollHeight;
      }
    };

    performScroll();

    const resizeObserver = new ResizeObserver(() => {
      performScroll();
    });

    resizeObserver.observe(container);

    const stopScrollTimer = setTimeout(() => {
      shouldContinueScrolling = false;
      setIsInitialLoad(false);
      setShouldAutoScroll(true);
      allowScrollSaveRef.current = true;
      resizeObserver.disconnect();
      console.log("Initial load complete, scroll saving enabled");
    }, 2500);

    return () => {
      clearTimeout(stopScrollTimer);
      resizeObserver.disconnect();
    };
  }, [selectedChatId, messages.length, isInitialLoad]);

  // Auto-scroll to bottom when NEW messages arrive (not on chat switch)
  useEffect(() => {
    const container = messagesContainerRef.current;
    // Skip during transitions, initial load, or if user scrolled up
    if (
      isTransitioningRef.current ||
      !container ||
      messages.length === 0 ||
      isInitialLoad ||
      !shouldAutoScroll
    ) {
      return;
    }

    // Double-check scroll position directly (state might be stale due to debouncing)
    const isActuallyAtBottom =
      scrollControllerRef.current?.isAtBottom(100) ?? false;
    if (!isActuallyAtBottom) {
      console.log("Skipping auto-scroll - user has scrolled up (direct check)");
      return;
    }

    // Only scroll for new messages when user is already at bottom
    console.log("Auto-scrolling to bottom for new messages");
    let shouldContinueScrolling = true;

    const performScroll = () => {
      if (container && shouldContinueScrolling && !isTransitioningRef.current) {
        // Re-check if still at bottom before scrolling
        const stillAtBottom =
          scrollControllerRef.current?.isAtBottom(100) ?? false;
        if (stillAtBottom) {
          container.scrollTop = container.scrollHeight;
        } else {
          // User scrolled away, stop auto-scrolling
          shouldContinueScrolling = false;
        }
      }
    };

    performScroll();

    const resizeObserver = new ResizeObserver(() => {
      performScroll();
    });

    resizeObserver.observe(container);

    const stopScrollTimer = setTimeout(() => {
      shouldContinueScrolling = false;
      resizeObserver.disconnect();
    }, 2000);

    return () => {
      clearTimeout(stopScrollTimer);
      resizeObserver.disconnect();
    };
  }, [messages.length, isInitialLoad, shouldAutoScroll]);

  // Fetch chats on mount
  useEffect(() => {
    const fetchChats = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get the query param from the URL directly to preserve special characters like +
        // searchParams.get() decodes the value, turning + into spaces
        // We need to parse the raw query string instead
        const urlParams = new URLSearchParams(window.location.search);
        const querySelectedChatId = urlParams.get("selectedChatId");

        console.log("Query selectedChatId:", querySelectedChatId);

        // Fetch senders
        const sendersData = await backendApi.senders.list();
        if (Array.isArray(sendersData)) {
          setSenders(sendersData);
        }

        // Fetch chats
        const data = await backendApi.whatsapp.getChats(0, 50);

        if (Array.isArray(data) && data.length > 0) {
          setChats(data);

          console.log(
            "Available chats:",
            data.map((c) => c.chatId)
          );

          let chatToSelect: string | null = null;

          if (querySelectedChatId) {
            // Check if the query selected chat exists in the fetched list
            const chatExists = data.some(
              (c) => c.chatId === querySelectedChatId
            );
            if (chatExists) {
              console.log(
                "Setting selectedChatId from query param:",
                querySelectedChatId
              );
              chatToSelect = querySelectedChatId;
            } else {
              console.warn(
                "Chat from query param not found in chat list:",
                querySelectedChatId
              );
              // The newly created chat might not be immediately indexed
              // Try to fetch it with a retry after a short delay
              console.log("Attempting to fetch chat with retry...");
              setTimeout(async () => {
                try {
                  const retryData = await backendApi.whatsapp.getChats(0, 50);
                  if (Array.isArray(retryData) && retryData.length > 0) {
                    setChats(retryData);
                    const foundChat = retryData.find(
                      (c) => c.chatId === querySelectedChatId
                    );
                    if (foundChat) {
                      console.log("Chat found on retry:", querySelectedChatId);
                      setSelectedChatId(querySelectedChatId);
                    } else {
                      console.warn("Chat still not found after retry");
                      setSelectedChatId(retryData[0].chatId);
                    }
                  }
                } catch (retryErr) {
                  console.error("Retry fetch failed:", retryErr);
                }
              }, 300);
              // Use first chat as immediate fallback
              chatToSelect = data[0].chatId;
            }
          } else {
            // If no query param, select the first chat
            chatToSelect = data[0].chatId;
          }

          setSelectedChatId(chatToSelect);
        } else {
          setChats([]);
          setSelectedChatId(null);
        }
      } catch (err) {
        console.error("Error fetching chats:", err);
        setError("Failed to load chats");
        setChats([]);
        setSelectedChatId(null);
      } finally {
        setLoading(false);
      }
    };

    fetchChats();
  }, []);

  // Fetch notes when chat changes
  useEffect(() => {
    if (!selectedChatId) {
      setNotes(null);
      return;
    }

    const fetchNotes = async () => {
      try {
        setNotesLoading(true);
        const notesData = await backendApi.notes.getChatNotes(selectedChatId);
        setNotes(notesData);
      } catch (error) {
        console.error("Error fetching notes:", error);
        setNotes(null);
      } finally {
        setNotesLoading(false);
      }
    };

    fetchNotes();
  }, [selectedChatId]);

  // Fetch contact for sidebar when chat changes
  useEffect(() => {
    if (!selectedChatId) {
      setSelectedContactId(null);
      return;
    }

    const selectedChat = chats.find((c) => c.chatId === selectedChatId);
    if (!selectedChat?.participantPhone) {
      setSelectedContactId(null);
      return;
    }

    const fetchContact = async () => {
      try {
        const contact = await backendApi.contacts.getByPhone(
          selectedChat.participantPhone
        );
        if (contact && typeof contact === "object" && "contactId" in contact) {
          setSelectedContactId((contact as { contactId: string }).contactId);
        } else {
          setSelectedContactId(null);
        }
      } catch (error) {
        // Contact not found - this is okay, the chat participant may not be saved as a contact
        setSelectedContactId(null);
      }
    };

    fetchContact();
  }, [selectedChatId, chats]);

  useEffect(() => {
    if (!selectedChatId) return;

    // Check if we have cached messages for this chat
    const cachedData = messagesCacheRef.current.get(selectedChatId);
    const savedScrollPosition = scrollPositionsRef.current.get(selectedChatId);

    console.log("=== FETCH MESSAGES EFFECT ===");
    console.log("selectedChatId:", selectedChatId);
    console.log("cachedMessages:", cachedData?.messages?.length ?? "none");
    console.log("savedScrollPosition:", savedScrollPosition);
    console.log(
      "scrollPositionsRef contents:",
      Array.from(scrollPositionsRef.current.entries())
    );

    if (cachedData && cachedData.messages.length > 0) {
      // Use cached messages - this means images are already in browser cache
      console.log(
        "Using cached messages for",
        selectedChatId,
        "count:",
        cachedData.messages.length,
        "restoring scroll to:",
        savedScrollPosition
      );
      setMessages(cachedData.messages);
      setMessageCount(cachedData.messages.length);
      setHasMoreMessages(cachedData.hasMore);
      currentCursorRef.current = cachedData.cursor;

      // We need to wait for React to actually render the messages before restoring scroll
      // Use a small timeout + ResizeObserver to detect when content is ready
      const restoreScrollWhenReady = () => {
        const container = messagesContainerRef.current;
        if (!container) {
          isTransitioningRef.current = false;
          setIsScrollRestoring(false);
          return;
        }

        // Track if we've restored scroll
        let scrollRestored = false;
        let attempts = 0;
        const maxAttempts = 50; // 50 * 20ms = 1 second max

        const tryRestoreScroll = () => {
          if (scrollRestored) return;
          attempts++;

          const currentScrollHeight = container.scrollHeight;
          const currentClientHeight = container.clientHeight;
          const maxScrollTop = currentScrollHeight - currentClientHeight;

          console.log(
            `Attempt ${attempts}: scrollHeight=${currentScrollHeight}, clientHeight=${currentClientHeight}, maxScrollTop=${maxScrollTop}, target=${savedScrollPosition}`
          );

          // Check if content has rendered (scrollHeight should be larger than clientHeight for scrollable content)
          // AND if savedScrollPosition is achievable
          const isContentReady =
            savedScrollPosition === undefined ||
            savedScrollPosition <= maxScrollTop ||
            attempts >= maxAttempts;

          if (isContentReady) {
            scrollRestored = true;

            if (savedScrollPosition !== undefined && savedScrollPosition >= 0) {
              console.log("RESTORING scroll position to:", savedScrollPosition);
              container.scrollTop = savedScrollPosition;
              const isAtBottom =
                currentScrollHeight -
                  savedScrollPosition -
                  currentClientHeight <
                50;
              setShouldAutoScroll(isAtBottom);
            } else {
              console.log("NO saved position, scrolling to bottom");
              container.scrollTop = container.scrollHeight;
              setShouldAutoScroll(true);
            }

            console.log("Final scrollTop:", container.scrollTop);

            // Enable everything AFTER a small delay to let scroll settle
            setTimeout(() => {
              isTransitioningRef.current = false;
              setIsScrollRestoring(false);
              setIsInitialLoad(false);
              allowScrollSaveRef.current = true;
            }, 50);
          } else {
            // Content not ready yet, try again
            setTimeout(tryRestoreScroll, 20);
          }
        };

        // Start trying after one animation frame
        requestAnimationFrame(() => {
          tryRestoreScroll();
        });
      };

      restoreScrollWhenReady();

      // Still fetch fresh data in background to check for new messages
      backendApi.whatsapp
        .getChatMessages(selectedChatId, 0, PAGE_SIZE)
        .then((response) => {
          if (response && response.messages) {
            const sorted = [...response.messages].sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
            );
            // Only update if there are new messages
            if (sorted.length > cachedData.messages.length) {
              // Merge with existing older messages that may have been loaded
              const existingIds = new Set(sorted.map((m) => m.messageId));
              const olderMessages = cachedData.messages.filter(
                (m) => !existingIds.has(m.messageId)
              );
              const combined = [...olderMessages, ...sorted].sort(
                (a, b) =>
                  new Date(a.timestamp).getTime() -
                  new Date(b.timestamp).getTime()
              );
              setMessages(combined);
              setMessageCount(combined.length);
              messagesCacheRef.current.set(selectedChatId, {
                messages: combined,
                hasMore: cachedData.hasMore,
                cursor: cachedData.cursor,
              });
            }
          }
        })
        .catch(console.error);

      return;
    }

    // No cache - fetch messages (first visit to this chat)
    setMessages([]);

    const fetchMessages = async () => {
      try {
        setError(null);
        const response = await backendApi.whatsapp.getChatMessages(
          selectedChatId,
          0,
          PAGE_SIZE
        );
        if (response && response.messages) {
          // Sort by timestamp ascending (oldest first)
          const sorted = [...response.messages].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          setMessages(sorted);
          setMessageCount(sorted.length);
          setHasMoreMessages(response.hasMore);
          currentCursorRef.current = response.nextCursor;

          // Restore scroll position after messages are rendered
          // Use double requestAnimationFrame to ensure DOM is fully painted
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const container = messagesContainerRef.current;
              if (!container) {
                isTransitioningRef.current = false;
                setIsScrollRestoring(false);
                return;
              }

              // First visit to this chat - scroll to bottom
              // Cache messages for future visits
              messagesCacheRef.current.set(selectedChatId, {
                messages: sorted,
                hasMore: response.hasMore,
                cursor: response.nextCursor,
              });

              console.log("First visit to chat, scrolling to bottom");
              container.scrollTop = container.scrollHeight;
              setShouldAutoScroll(true);

              // Mark transition as complete and show container
              isTransitioningRef.current = false;
              setIsScrollRestoring(false);
            });
          });
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
        setError("Failed to load messages");
        isTransitioningRef.current = false;
        setIsScrollRestoring(false);
      }
    };
    fetchMessages();
  }, [selectedChatId]);

  // 🔥 REAL-TIME UPDATES via WebSocket
  // Provides instant message status updates AND new inbound messages
  // Connects to backend and receives updates when webhooks arrive from Meta
  const {
    statusMap: socketStatusMap,
    messages: inboundMessages,
    isConnected: isSocketConnected,
  } = useRealtimeChat(selectedChatId || undefined);

  // Merge inbound WebSocket messages into the message list
  useEffect(() => {
    if (inboundMessages.length === 0) return;

    setMessages((prevMessages) => {
      const existingIds = new Set(prevMessages.map((m) => m.messageId));
      const newMessages = inboundMessages.filter(
        (wsMsg: InboundMessage) => !existingIds.has(wsMsg.messageId)
      );

      if (newMessages.length === 0) return prevMessages;

      // Add new inbound messages to the list
      const newMessageObjects: Message[] = newMessages.map(
        (wsMsg: InboundMessage): Message => ({
          id: undefined,
          messageId: wsMsg.messageId,
          text: wsMsg.text,
          sender: wsMsg.sender,
          direction: "inbound" as const,
          timestamp: wsMsg.timestamp,
          type: wsMsg.type,
          status: "delivered" as const,
          attachments: wsMsg.attachments
            ? wsMsg.attachments.map((att: any) => ({
                id: att.id || att.mediaId,
                type: att.type as "image" | "video" | "audio" | "document",
                mediaId: att.id || att.mediaId,
                fileName: att.fileName || "",
                mimeType: att.mimeType || "application/octet-stream",
                size: att.size || 0,
                s3Key: att.s3Key || att.id || att.mediaId,
                thumbnailStatus: att.thumbnailStatus,
                status: att.status || ("success" as const),
                uploadedAt: wsMsg.timestamp,
              }))
            : undefined,
          sentAt: wsMsg.timestamp,
          deliveredAt: new Date().toISOString(),
          readAt: undefined,
          isDeleted: false,
        })
      );

      const merged = [...prevMessages, ...newMessageObjects];

      // Sort by timestamp ascending (oldest first)
      return merged.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    });

    // Show new message indicator if user is not at bottom
    console.log(
      "New inbound messages received, shouldAutoScroll:",
      shouldAutoScroll
    );
    if (!shouldAutoScroll) {
      console.log("Setting hasNewMessages to TRUE - user is not at bottom");
      setHasNewMessages(true);
    } else {
      // Hide indicator if user scrolled back to bottom
      setHasNewMessages(false);

      // For media messages, we need to scroll after a delay to let media load
      const hasMedia = inboundMessages.some(
        (msg: InboundMessage) => msg.attachments && msg.attachments.length > 0
      );
      if (hasMedia) {
        // Multiple scroll attempts to handle media loading
        const scrollToBottom = () => {
          const container = messagesContainerRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        };
        // Scroll immediately
        setTimeout(scrollToBottom, 50);
        // Scroll again after media placeholder renders
        setTimeout(scrollToBottom, 200);
        // Scroll again after media starts loading
        setTimeout(scrollToBottom, 500);
        // Extra scrolls for video thumbnails that load asynchronously
        setTimeout(scrollToBottom, 1000);
        setTimeout(scrollToBottom, 1500);
        setTimeout(scrollToBottom, 2000);
      }
    }

    // Trigger auto-scroll when new messages arrive
    setMessageCount((prev) => prev + inboundMessages.length);
  }, [inboundMessages, shouldAutoScroll]);

  // Update messages with status changes from WebSocket
  useEffect(() => {
    if (Object.keys(socketStatusMap).length === 0) return;

    setMessages((prevMessages) =>
      prevMessages.map((msg) => {
        const newStatus = socketStatusMap[msg.messageId];
        if (newStatus && newStatus.status !== msg.status) {
          return {
            ...msg,
            status: newStatus.status,
            sentAt:
              newStatus.status === "sent"
                ? new Date(newStatus.timestamp).toISOString()
                : msg.sentAt,
            deliveredAt:
              newStatus.status === "delivered"
                ? new Date(newStatus.timestamp).toISOString()
                : msg.deliveredAt,
            readAt:
              newStatus.status === "read"
                ? new Date(newStatus.timestamp).toISOString()
                : msg.readAt,
          };
        }
        return msg;
      })
    );
    // Don't trigger auto-scroll when just updating message statuses
  }, [socketStatusMap]);

  // 🖼️ Listen for thumbnail ready events via WebSocket
  // When thumbnails are generated (async), update the message attachments
  const handleThumbnailReady = useCallback((event: ThumbnailReadyEvent) => {
    console.log("📷 Thumbnail ready event received:", event);

    // Update the specific attachment in the message
    setMessages((prevMessages) =>
      prevMessages.map((message) => {
        if (message.messageId !== event.messageId) {
          return message;
        }

        // Update the specific attachment
        const updatedAttachments = (message.attachments || []).map(
          (attachment: Attachment) => {
            if (attachment.id !== event.attachmentId) {
              return attachment;
            }

            return {
              ...attachment,
              thumbnailKey: event.thumbnailKey,
              thumbnailStatus: "ready" as const,
              width: event.width,
              height: event.height,
              blurhash: event.blurhash,
              // For PDFs, duration contains page count
              ...(event.duration
                ? { pageCount: event.duration, duration: event.duration }
                : {}),
            };
          }
        );

        return {
          ...message,
          attachments: updatedAttachments,
        };
      })
    );

    // Trigger a re-scroll for media messages when thumbnail becomes ready
    // Use ref directly to avoid stale closure
    const container = messagesContainerRef.current;
    if (container) {
      const isAtBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        100;
      if (isAtBottom) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        }, 100);
      }
    }
  }, []);

  useThumbnailUpdates({
    onThumbnailReady: handleThumbnailReady,
  });

  // Handle files selected from attachment menu
  const handleFilesSelected = useCallback(
    (files: File[], type: AttachmentType) => {
      setCurrentAttachmentType(type);

      // Create staged files with preview URLs
      const newStagedFiles: StagedFile[] = files.map((file) => {
        const fileType = file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("audio/")
          ? "audio"
          : "document";

        return {
          id: Math.random().toString(36).substring(7),
          file,
          previewUrl:
            fileType === "image" || fileType === "video"
              ? URL.createObjectURL(file)
              : fileType === "audio"
              ? URL.createObjectURL(file)
              : undefined,
          type: fileType,
        };
      });

      setStagedFiles((prev) => [...prev, ...newStagedFiles]);
      setMediaStagingOpen(true);
    },
    []
  );

  // Handle removing a staged file
  const handleRemoveStagedFile = useCallback((id: string) => {
    setStagedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      // Revoke preview URL to free memory
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      const newFiles = prev.filter((f) => f.id !== id);
      // Close modal if no files left
      if (newFiles.length === 0) {
        setMediaStagingOpen(false);
      }
      return newFiles;
    });
  }, []);

  // Handle closing the staging modal
  const handleCloseStagingModal = useCallback(() => {
    // Don't revoke URLs if we're sending - they're needed for preview
    setStagedFiles([]);
    setMediaStagingOpen(false);
  }, []);

  // Handle sending media from staging modal
  const handleSendMediaFromStaging = useCallback(
    async (caption: string) => {
      if (stagedFiles.length === 0 || !selectedChatId) return;

      try {
        setError(null);
        const selectedChat = chats.find((c) => c.chatId === selectedChatId);
        if (!selectedChat) return;

        // Create pending media uploads for immediate display in chat
        const newPendingUploads: PendingMediaUpload[] = stagedFiles.map(
          (sf) => ({
            id: sf.id,
            file: sf.file,
            previewUrl: sf.previewUrl,
            type: sf.type,
            progress: 0,
            status: "queued" as const,
          })
        );

        setPendingMediaUploads(newPendingUploads);
        setPendingCaption(caption);

        // Close the staging modal (don't revoke URLs yet)
        setStagedFiles([]);
        setMediaStagingOpen(false);

        // Scroll to bottom to show the pending upload
        setShouldAutoScroll(true);
        setTimeout(() => {
          scrollControllerRef.current?.scrollToBottom(true);
        }, 100);

        // Now actually send and upload
        let messagePayload: any = {
          to: selectedChat.participantPhone,
          senderId: selectedChat.senderId,
        };

        if (caption.trim()) {
          messagePayload.body = caption;
        }

        // Add reply context if replying to a message
        if (replyingToMessage?.messageId) {
          messagePayload.replyToMessageId = replyingToMessage.messageId;
        }

        // Include placeholder attachments
        messagePayload.attachments = newPendingUploads.map((upload) => ({
          id: upload.id,
          type: upload.type,
          fileName: upload.file.name,
          mimeType: upload.file.type || "application/octet-stream",
          size: upload.file.size,
          s3Key: "",
          status: "pending",
          uploadedAt: new Date().toISOString(),
        }));

        // Send message to get messageId
        const sentMessage = (await backendApi.whatsapp.sendMessage(
          messagePayload
        )) as { messageId?: string };

        if (!sentMessage?.messageId) {
          throw new Error("Failed to get message ID");
        }

        const messageId = sentMessage.messageId;

        // Upload each file with progress tracking
        for (let i = 0; i < newPendingUploads.length; i++) {
          const upload = newPendingUploads[i];

          // Update status to uploading
          setPendingMediaUploads((prev) =>
            prev.map((u) =>
              u.id === upload.id ? { ...u, status: "uploading" as const } : u
            )
          );

          try {
            // Upload file with progress callback
            // Pass upload.id as attachmentId so WebSocket thumbnail events can match
            const result = await mediaApi.uploadFileToBackend(
              upload.file,
              selectedChat.senderId,
              selectedChatId,
              messageId,
              (progress) => {
                setPendingMediaUploads((prev) =>
                  prev.map((u) => (u.id === upload.id ? { ...u, progress } : u))
                );
              },
              upload.id // Pass attachment ID for WebSocket event matching
            );

            // Get download URL and send to WhatsApp
            const downloadUrl = (await backendApi.whatsapp.getDownloadUrl(
              messageId,
              result.uploadId
            )) as { url?: string };

            if (downloadUrl?.url) {
              await backendApi.whatsapp.sendMedia({
                to: selectedChat.participantPhone,
                mediaType: upload.type,
                mediaUrl: downloadUrl.url,
                caption: i === 0 ? caption : undefined, // Caption only on first
                senderId: selectedChat.senderId,
                fileName: upload.file.name, // Include filename for documents
                originalMessageId: messageId, // Link to original message for status updates
              });
            }

            // Mark as completed
            setPendingMediaUploads((prev) =>
              prev.map((u) =>
                u.id === upload.id
                  ? { ...u, status: "completed" as const, progress: 100 }
                  : u
              )
            );
          } catch (uploadError) {
            console.error(`Failed to upload ${upload.file.name}:`, uploadError);
            setPendingMediaUploads((prev) =>
              prev.map((u) =>
                u.id === upload.id
                  ? {
                      ...u,
                      status: "error" as const,
                      error: "Upload failed",
                    }
                  : u
              )
            );
          }
        }

        // After all uploads complete, refresh messages and clear pending
        const data = await backendApi.whatsapp.getChatMessages(
          selectedChatId,
          0,
          50
        );
        if (Array.isArray(data)) {
          const sorted = [...data].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          setMessages(sorted);
          setMessageCount(sorted.length);
        }

        // Clear pending uploads after a short delay
        setTimeout(() => {
          // Revoke preview URLs
          newPendingUploads.forEach((u) => {
            if (u.previewUrl) {
              URL.revokeObjectURL(u.previewUrl);
            }
          });
          setPendingMediaUploads([]);
          setPendingCaption("");
        }, 500);

        // Clear reply state after sending media
        setReplyingToMessage(null);
      } catch (err) {
        console.error("Error sending media:", err);
        setError("Failed to send media");
        // Clear pending on error
        setPendingMediaUploads([]);
        setPendingCaption("");
      }
    },
    [stagedFiles, selectedChatId, chats, replyingToMessage]
  );

  // Handle "Add More" from staging modal
  const handleAddMoreMedia = useCallback(() => {
    addMoreInputRef.current?.click();
  }, []);

  // Callback for sending a message - receives the message text from the input component
  const handleSendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || !selectedChatId) return;

      try {
        setError(null);
        const selectedChat = chats.find((c) => c.chatId === selectedChatId);
        if (!selectedChat) return;

        const messagePayload: any = {
          to: selectedChat.participantPhone,
          senderId: selectedChat.senderId,
          body: messageText,
        };

        // Add reply context if replying to a message
        if (replyingToMessage?.messageId) {
          messagePayload.replyToMessageId = replyingToMessage.messageId;
        }

        // Send text message
        await backendApi.whatsapp.sendMessage(messagePayload);

        setTemplateInput("");
        setReplyingToMessage(null); // Clear reply state after sending

        // Refresh messages
        const data = await backendApi.whatsapp.getChatMessages(
          selectedChatId,
          0,
          50
        );
        if (Array.isArray(data)) {
          const sorted = [...data].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          setMessages(sorted);
          setMessageCount(sorted.length);
          // Re-enable auto-scroll when a message is sent so it scrolls to the new message
          setShouldAutoScroll(true);
          // Explicitly scroll to bottom with smooth animation after DOM updates
          // Use requestAnimationFrame to ensure DOM has updated
          requestAnimationFrame(() => {
            setTimeout(() => {
              const container = messagesContainerRef.current;
              if (container) {
                container.scrollTo({
                  top: container.scrollHeight,
                  behavior: "smooth",
                });
              }
            }, 50);
          });
        }
      } catch (err) {
        console.error("Error sending message:", err);
        setError("Failed to send message");
      }
    },
    [selectedChatId, chats, replyingToMessage]
  );

  const handleAddNote = async (noteText: string, messageId?: string) => {
    if (!selectedChatId) return;

    try {
      await backendApi.notes.create({
        chatId: selectedChatId,
        messageId,
        note: noteText,
      });

      // Refresh notes
      const notesData = await backendApi.notes.getChatNotes(selectedChatId);
      setNotes(notesData);
    } catch (error) {
      console.error("Failed to add note:", error);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!selectedChatId) return;

    try {
      await backendApi.notes.delete(noteId);

      // Refresh notes after deletion
      const notesData = await backendApi.notes.getChatNotes(selectedChatId);
      setNotes(notesData);
    } catch (error) {
      console.error("Failed to delete note:", error);
      alert("Failed to delete note. Please try again.");
    }
  };

  const handleApplyTemplate = async (template: Template) => {
    if (template.locales && template.locales.length > 0) {
      const locale = template.locales[0];
      const selectedChat = chats.find((c) => c.chatId === selectedChatId);

      // If we have a contact, resolve variables against actual contact data
      if (selectedContactId && selectedChat) {
        try {
          const result = await backendApi.templates.resolve(template.id, {
            locale: locale.locale,
            contactId: selectedContactId,
            senderId: selectedChat.senderId,
            chatId: selectedChatId || undefined,
          });

          if (result.success) {
            setTemplateInput(result.body);
            return;
          }
          // If resolution failed but we got a body, still use it
          if (result.body) {
            setTemplateInput(result.body);
            return;
          }
        } catch (error) {
          console.error("Failed to resolve template variables:", error);
          // Fall through to use template with sample values
        }
      }

      // Fallback: Use template body with example vars (for preview/when no contact)
      let body = locale.body;
      if (locale.exampleVars) {
        Object.entries(locale.exampleVars).forEach(([key, value]) => {
          body = body.replace(
            new RegExp(`\\{\\{${key}\\}\\}`, "g"),
            String(value || "")
          );
        });
      }
      setTemplateInput(body);
    }
  };

  const handleScrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
      setHasNewMessages(false);
      setShouldAutoScroll(true);
    }
  };

  // ==========================================
  // CONTACT SENDING HANDLERS
  // ==========================================

  // Open contacts modal from attachment menu
  const handleContactsClick = useCallback(async () => {
    try {
      setContactsLoading(true);
      const contactsData = await backendApi.contacts.list(0, 100);
      if (Array.isArray(contactsData)) {
        setAllContacts(
          contactsData.map((c: any) => ({
            id: c.id?.toString(),
            contactId: c.contactId,
            firstName: c.firstName,
            lastName: c.lastName || undefined,
            phoneNumber: c.phoneNumber,
            countryCode: c.countryCode,
            avatar: c.avatar,
            isActive: c.isActive,
          }))
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

      // Transform contacts to API format
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

      // Close modal and refresh messages
      setContactPreviewModalOpen(false);
      setContactsToSend([]);

      // Refresh messages
      const data = await backendApi.whatsapp.getChatMessages(
        selectedChatId,
        0,
        50
      );
      if (Array.isArray(data)) {
        const sorted = [...data].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setMessages(sorted);
        setMessageCount(sorted.length);
        setShouldAutoScroll(true);
        setTimeout(() => {
          scrollControllerRef.current?.scrollToBottom(true);
        }, 0);
      }
    } catch (err) {
      console.error("Error sending contacts:", err);
    } finally {
      setIsSendingContacts(false);
    }
  }, [selectedChatId, contactsToSend, chats]);

  // Start chat with a contact (from contact preview or view modals)
  const handleStartChatWithContact = useCallback(
    (contact: ContactToSend | ReceivedContact) => {
      // Determine phone and name based on contact type
      let phoneNumber: string;
      let firstName: string;
      let lastName: string | undefined;

      if ("name" in contact && typeof contact.name === "object") {
        // ReceivedContact type
        phoneNumber =
          contact.phones?.[0]?.phone || contact.phones?.[0]?.wa_id || "";
        firstName =
          contact.name.first_name || contact.name.formatted_name || "";
        lastName = contact.name.last_name;
      } else {
        // ContactToSend type
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
    []
  );

  // Handle sender selection for starting a new chat with contact
  const handleSenderSelectedForContact = useCallback(
    async (senderId: number, senderPhoneNumber: string) => {
      if (!contactToStartChat) return;

      try {
        const participantName = contactToStartChat.lastName
          ? `${contactToStartChat.firstName} ${contactToStartChat.lastName}`
          : contactToStartChat.firstName;

        console.log("Starting chat with contact:", {
          businessPhone: senderPhoneNumber,
          participantPhone: contactToStartChat.phoneNumber,
          participantName,
          senderId,
        });

        const createdChat = await backendApi.chats.startWithContact({
          businessPhone: senderPhoneNumber,
          participantPhone: contactToStartChat.phoneNumber,
          participantName,
          senderId,
        });

        console.log("Created/retrieved chat:", createdChat);

        // Navigate to the new chat
        const chatId = (createdChat as any)?.chatId;
        if (chatId) {
          // Close all contact modals
          setSenderSelectModalOpen(false);
          setContactPreviewModalOpen(false);
          setViewContactsModalOpen(false);
          setContactToStartChat(null);

          // Refresh the chats list to include the new chat
          const updatedChats = await backendApi.whatsapp.getChats(0, 50);
          if (Array.isArray(updatedChats)) {
            setChats(updatedChats);
          }

          // Select the new chat
          setSelectedChatId(chatId);
        }
      } catch (err) {
        console.error("Failed to start chat:", err);
      }
    },
    [contactToStartChat]
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
    []
  );

  // Save contact from quick form (create or update)
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

        // Check if contact already exists by phone number
        let existingContact: { contactId?: string } | null = null;
        try {
          existingContact = (await backendApi.contacts.getByPhone(
            fullPhoneNumber
          )) as { contactId?: string } | null;
        } catch {
          // Contact doesn't exist, will create new one
        }

        if (existingContact && existingContact.contactId) {
          // Update existing contact
          await backendApi.contacts.update(existingContact.contactId, {
            firstName: data.firstName,
            lastName: data.lastName || undefined,
            countryCode: data.countryCode,
            phoneNumber: fullPhoneNumber,
          });
        } else {
          // Get first available sender for linking (only needed for new contacts)
          const sendersData = await backendApi.senders.list();
          const firstSenderId =
            Array.isArray(sendersData) && sendersData.length > 0
              ? sendersData[0].id
              : null;

          if (!firstSenderId) {
            console.error("No senders available to link contact");
            return;
          }

          // Create new contact
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
    []
  );

  // Parse contacts from message metadata
  const parseContactsFromMessage = useCallback(
    (message: Message): ReceivedContact[] | null => {
      if (message.type !== "contacts") return null;

      try {
        // Try to parse from mediaMetadata if available (legacy field)
        const metadata = message.mediaMetadata;
        if (metadata) {
          const parsed =
            typeof metadata === "string" ? JSON.parse(metadata) : metadata;
          if (parsed.contacts) return parsed.contacts;
        }

        // Try to parse from attachments field (new storage format)
        if (message.attachments) {
          const attachments =
            typeof message.attachments === "string"
              ? JSON.parse(message.attachments)
              : message.attachments;
          // Check if attachments contains contact data directly
          if (attachments.type === "contacts" && attachments.contacts) {
            return attachments.contacts;
          }
          // Or if it's an array with contact data as first item
          if (
            Array.isArray(attachments) &&
            attachments[0]?.type === "contacts"
          ) {
            return attachments[0].contacts;
          }
        }

        // Check if text contains contact summary and try to extract names
        // This is a fallback for when full contact data isn't stored
        if (
          message.text?.startsWith("Contact:") ||
          message.text?.includes("contacts:")
        ) {
          // Return minimal contact data from text
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
    []
  );

  // ==========================================
  // END CONTACT HANDLERS
  // ==========================================

  // Handle separator drag to resize notes panel
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = notesPanelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // Minimum width 250px, maximum 60% of container
      const maxWidth = containerRef.current
        ? containerRef.current.clientWidth * 0.6
        : 800;
      const newWidth = Math.max(250, Math.min(startWidth - deltaX, maxWidth));
      setNotesPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Media preview modal handlers - supports both images and videos
  const handleImageClick = (
    messageId: string,
    attachments: Attachment[],
    index: number
  ) => {
    // Include both images and videos in the preview
    const visualMedia = attachments.filter(
      (a) => a.type === "image" || a.type === "video"
    );
    setPreviewAttachments(visualMedia);
    setPreviewMessageId(messageId);
    // Adjust index if we filtered out non-visual attachments
    const adjustedIndex = Math.min(index, visualMedia.length - 1);
    setPreviewInitialIndex(adjustedIndex >= 0 ? adjustedIndex : 0);
    setPreviewModalOpen(true);
  };

  // Download menu handlers
  const handleShowDownloadMenu = (
    messageId: string,
    attachments: Attachment[],
    position: { x: number; y: number }
  ) => {
    setCurrentMessageId(messageId);
    // Include both images and videos for download
    setCurrentMessageAttachments(
      attachments.filter((a) => a.type === "image" || a.type === "video")
    );
    setDownloadMenuPosition(position);
    setDownloadMenuOpen(true);
  };

  // Message delete handler
  const handleDeleteMessage = (messageId: string) => {
    setDeletingMessageId(messageId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDeleteMessage = async (messageId: string) => {
    try {
      await backendApi.whatsapp.deleteMessage(messageId, {
        chatId: selectedChatId || undefined,
      });
      // Update local message state - mark as deleted
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.messageId === messageId
            ? {
                ...msg,
                text: null,
                isDeleted: true,
                deletedAt: new Date().toISOString(),
              }
            : msg
        )
      );
      console.log(`Message ${messageId} deleted successfully`);
    } catch (err) {
      console.error("Failed to delete message:", err);
      setError(t("deleteFailed"));
    }
  };

  const handleDownloadSingle = async () => {
    if (!currentMessageAttachments.length) return;

    try {
      setDownloadLoading(true);
      const attachment = currentMessageAttachments[0];

      // Use the backend stream endpoint to avoid CORS issues with S3
      const blob = await mediaApi.downloadMediaViaStream(
        currentMessageId,
        attachment.id
      );

      const dlUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download =
        attachment.fileName ||
        (attachment.type === "video" ? "video.mp4" : "image.jpg");
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(dlUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download media:", err);
      setError("Failed to download media");
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleDownloadPack = async () => {
    if (!currentMessageAttachments.length) return;

    try {
      setDownloadLoading(true);

      // Dynamic import for JSZip
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // Download all media (images and videos) and add to zip via backend stream
      for (const attachment of currentMessageAttachments) {
        const blob = await mediaApi.downloadMediaViaStream(
          currentMessageId,
          attachment.id
        );
        zip.file(attachment.fileName || `media_${attachment.id}`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const dlUrl = window.URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `media_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(dlUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download media pack:", err);
      setError("Failed to download media pack");
    } finally {
      setDownloadLoading(false);
    }
  };

  // Close download menu on click outside or Escape key
  useEffect(() => {
    if (!downloadMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside the download menu
      const target = event.target as HTMLElement;
      if (
        !target.closest("[data-download-menu]") &&
        !target.closest('button[title="Download options"]')
      ) {
        setDownloadMenuOpen(false);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDownloadMenuOpen(false);
      }
    };

    // Add event listeners
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscapeKey);

    // Cleanup
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [downloadMenuOpen]);

  // Memoize selectedChat to avoid redundant .find() calls during render
  const selectedChat = React.useMemo(
    () => chats.find((c) => c.chatId === selectedChatId) || null,
    [chats, selectedChatId]
  );

  // Group consecutive outbound media messages that were sent within 2 seconds
  // This creates WhatsApp-like grouped media bubbles
  interface GroupedMessage {
    type: "single" | "group";
    messages: Message[];
    id: string;
  }

  const groupedMessages = React.useMemo((): GroupedMessage[] => {
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
            id:
              currentGroup[0].messageId || currentGroup[0].id?.toString() || "",
          });
        }
        currentGroup = [msg];
      } else {
        // Not a media-only message, flush current group and add single
        if (currentGroup.length > 0) {
          result.push({
            type: currentGroup.length > 1 ? "group" : "single",
            messages: currentGroup,
            id:
              currentGroup[0].messageId || currentGroup[0].id?.toString() || "",
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
  }, [messages]);

  return (
    <div className="flex flex-col min-h-screen gap-0">
      {/* Header with Controls */}
      <div className="border-b px-6 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={automationEnabled ? "default" : "outline"}
            onClick={() => setAutomationEnabled(!automationEnabled)}
            className="gap-2"
          >
            {automationEnabled ? t("automationOn") : t("automateReplies")}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="border-b bg-red-50 dark:bg-red-950 p-4">
          <p className="text-sm text-red-700 dark:text-red-200">⚠ {error}</p>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Chat List */}
        <div className="w-full lg:w-80 border-r flex flex-col bg-muted/30">
          <div className="p-4 border-b">
            <Input placeholder={t("searchChats")} className="w-full" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading chats...
              </div>
            ) : chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
                <p className="text-muted-foreground">{t("noChats")}</p>
              </div>
            ) : (
              // Group chats by sender
              senders.map((sender) => {
                const senderChats = chats.filter(
                  (c) => c.senderId === sender.id
                );
                return (
                  <ChatsSenderSection
                    key={sender.id}
                    senderPhoneNumber={sender.phoneNumber}
                    senderDisplayName={sender.displayName}
                    chats={senderChats}
                    selectedChatId={selectedChatId}
                    onSelectChat={handleSelectChat}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Chat Detail + Notes */}
        <div className="hidden lg:flex flex-1 flex-col bg-background overflow-hidden min-h-0">
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div className="border-b px-6 py-2 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-lg font-semibold">
                    {selectedChat.participantName ||
                      selectedChat.participantPhone}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedChat.participantPhone}
                  </p>
                </div>
              </div>

              {/* Messages + Notes Container */}
              <div className="flex flex-1 overflow-hidden" ref={containerRef}>
                {/* Messages Area */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
                  <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0"
                    style={{
                      maxHeight: "calc(100vh - 420px)",
                      opacity: isScrollRestoring ? 0 : 1,
                    }}
                  >
                    {/* Loading older messages indicator */}
                    {isLoadingOlderMessages && (
                      <div className="flex items-center justify-center py-3">
                        <Loader className="h-5 w-5 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">
                          Loading older messages...
                        </span>
                      </div>
                    )}

                    {/* Beginning of conversation indicator */}
                    {!hasMoreMessages && messages.length > 0 && (
                      <div className="flex items-center justify-center py-3">
                        <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                          Beginning of conversation
                        </div>
                      </div>
                    )}

                    {messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-muted-foreground">No messages yet</p>
                      </div>
                    ) : (
                      <>
                        {groupedMessages.map((group) => {
                          // Grouped media messages - render as single bubble
                          if (
                            group.type === "group" &&
                            group.messages.length > 1
                          ) {
                            const lastMessage =
                              group.messages[group.messages.length - 1];
                            const timestamp = new Date(lastMessage.timestamp);
                            const timeString = timestamp.toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            );

                            return (
                              <GroupedMediaBubble
                                key={group.id}
                                messages={group.messages}
                                onImageClick={handleImageClick}
                                statusIcon={
                                  <WhatsAppStatusIcon
                                    status={lastMessage.status || "pending"}
                                    deliveredAt={lastMessage.deliveredAt}
                                    readAt={lastMessage.readAt}
                                    className="ml-1"
                                  />
                                }
                                timeString={timeString}
                              />
                            );
                          }

                          // Single message - render normally
                          const message = group.messages[0];
                          const isOutbound = message.direction === "outbound";
                          const timestamp = new Date(message.timestamp);
                          const timeString = timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          const isDeleted = message.isDeleted;

                          // Handle contact message type
                          if (message.type === "contacts" && !isDeleted) {
                            const contacts = parseContactsFromMessage(message);
                            if (contacts && contacts.length > 0) {
                              return (
                                <ContactMessageBubble
                                  key={message.messageId || message.id}
                                  contacts={contacts}
                                  isOutbound={isOutbound}
                                  timestamp={message.timestamp}
                                  messageId={message.messageId}
                                  status={message.status}
                                  deliveredAt={message.deliveredAt}
                                  readAt={message.readAt}
                                  onViewAll={() =>
                                    handleViewAllContacts(contacts)
                                  }
                                  onStartChat={handleStartChatWithContact}
                                  onReply={handleReplyById}
                                  onDelete={
                                    isOutbound ? handleDeleteMessage : undefined
                                  }
                                />
                              );
                            }
                          }

                          return (
                            <div
                              key={message.messageId || message.id}
                              ref={(el) => {
                                if (el && message.messageId) {
                                  messageRefs.current.set(
                                    message.messageId,
                                    el
                                  );
                                }
                              }}
                              className={`flex ${
                                isOutbound ? "justify-end" : "justify-start"
                              }`}
                            >
                              <div
                                className={`group px-3 py-1 rounded-lg text-xs relative ${
                                  // For image-only messages, use standard image width
                                  message.attachments?.length === 1 &&
                                  message.attachments[0].type === "image" &&
                                  !message.text &&
                                  !isDeleted
                                    ? "max-w-md"
                                    : "max-w-xs"
                                } ${
                                  isOutbound
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                }`}
                              >
                                {/* Chevron positioned in top-right corner - visible on hover */}
                                {/* Show for all messages, appears only on hover */}
                                {!isDeleted && (
                                  <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                    <MessageActionsMenu
                                      messageId={message.messageId}
                                      messageTimestamp={message.timestamp}
                                      isOutbound={isOutbound}
                                      hasDownloadableMedia={message.attachments?.some(
                                        (a) =>
                                          a.type === "image" ||
                                          a.type === "video"
                                      )}
                                      onReply={handleReplyById}
                                      onDelete={
                                        isOutbound
                                          ? handleDeleteMessage
                                          : undefined
                                      }
                                      onDownload={handleDownloadById}
                                    />
                                  </div>
                                )}

                                {isDeleted ? (
                                  <p className="text-xs italic opacity-60">
                                    {t("thisMessageWasDeleted")}
                                  </p>
                                ) : (
                                  <>
                                    {/* Quoted message block for replies */}
                                    {message.replyPreview && (
                                      <QuotedMessage
                                        replyPreview={{
                                          ...message.replyPreview,
                                          // Override senderName for inbound messages with the chat's participant name
                                          senderName:
                                            message.replyPreview.senderType ===
                                            "customer"
                                              ? selectedChat?.participantName ||
                                                message.replyPreview.senderName
                                              : message.replyPreview.senderName,
                                        }}
                                        originalMessageId={
                                          message.replyPreview.messageId
                                        }
                                        isOutbound={isOutbound}
                                        onClick={() => {
                                          if (
                                            message.replyPreview?.messageId &&
                                            !message.replyPreview?.unavailable
                                          ) {
                                            handleScrollToMessage(
                                              message.replyPreview.messageId
                                            );
                                          }
                                        }}
                                      />
                                    )}
                                    {/* Display attachments first, then text below */}
                                    {message.attachments &&
                                      message.attachments.length > 0 && (
                                        <div
                                          className={message.text ? "mb-2" : ""}
                                        >
                                          <AttachmentGallery
                                            attachments={message.attachments}
                                            messageId={
                                              message.messageId ||
                                              message.id?.toString() ||
                                              ""
                                            }
                                            onImageClick={(index) =>
                                              handleImageClick(
                                                message.messageId ||
                                                  message.id?.toString() ||
                                                  "",
                                                message.attachments || [],
                                                index
                                              )
                                            }
                                            onShowDownloadMenu={(position) =>
                                              handleShowDownloadMenu(
                                                message.messageId ||
                                                  message.id?.toString() ||
                                                  "",
                                                message.attachments || [],
                                                position
                                              )
                                            }
                                            isOutbound={isOutbound}
                                            onMessageDelete={
                                              handleDeleteMessage
                                            }
                                          />
                                        </div>
                                      )}

                                    {/* Text shown below media with link previews */}
                                    {message.text && (
                                      <MessageText
                                        text={message.text}
                                        isOutbound={isOutbound}
                                        showPreviews={
                                          !message.attachments?.length
                                        }
                                        onVideoPlay={handleVideoPlay}
                                      />
                                    )}
                                  </>
                                )}

                                <div
                                  className={`text-xs mt-0.5 flex items-center justify-between gap-1 ${
                                    isOutbound
                                      ? "text-primary-foreground/70"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  <span>
                                    {timeString}
                                    {message.editedAt && (
                                      <span className="ml-1 opacity-60">
                                        ({t("messageEdited")})
                                      </span>
                                    )}
                                  </span>
                                  {isOutbound && !isDeleted && (
                                    <WhatsAppStatusIcon
                                      status={message.status || "pending"}
                                      deliveredAt={message.deliveredAt}
                                      readAt={message.readAt}
                                      className="ml-1"
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Pending Media Uploads - show grouped with progress */}
                        {pendingMediaUploads.length > 0 && (
                          <PendingUploadGroup
                            uploads={pendingMediaUploads}
                            caption={pendingCaption}
                            timestamp={new Date().toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          />
                        )}

                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>

                  {/* Scroll to Bottom Button - positioned outside scrollable area */}
                  {hasNewMessages && (
                    <div className="absolute bottom-[180px] right-4 z-20">
                      <Button
                        onClick={handleScrollToBottom}
                        size="sm"
                        className="rounded-full shadow-lg bg-primary hover:bg-primary/90"
                        title="Scroll to latest message"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {/* Template Buttons */}
                  <div
                    className="border-t p-3 bg-muted/30 flex flex-col overflow-hidden flex-shrink-0"
                    style={{ maxHeight: "160px" }}
                  >
                    {templatesLoading ? (
                      <>
                        <div className="mb-2 space-y-1 flex-shrink-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("availableTemplates")}
                          </p>
                          <Input
                            placeholder={t("searchTemplates")}
                            className="h-7 text-xs"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center justify-center py-2">
                          <Loader className="h-4 w-4 animate-spin" />
                        </div>
                      </>
                    ) : Array.isArray(filteredTemplates) &&
                      filteredTemplates.length > 0 ? (
                      <>
                        <div className="mb-2 space-y-1 flex-shrink-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("availableTemplates")}
                          </p>
                          <Input
                            placeholder={t("searchTemplates")}
                            className="h-7 text-xs"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1 overflow-y-auto">
                          {filteredTemplates.map((template) => (
                            <Button
                              key={template.id}
                              variant="outline"
                              size="sm"
                              onClick={() => handleApplyTemplate(template)}
                              className="text-left justify-start h-auto py-1 px-2 text-xs"
                            >
                              <span className="truncate">{template.name}</span>
                            </Button>
                          ))}
                        </div>
                      </>
                    ) : templateSearch ? (
                      <>
                        <div className="mb-2 space-y-1 flex-shrink-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("availableTemplates")}
                          </p>
                          <Input
                            placeholder={t("searchTemplates")}
                            className="h-7 text-xs"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground py-1">
                          No templates match your search.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="mb-2 space-y-1 flex-shrink-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("availableTemplates")}
                          </p>
                          <Input
                            placeholder={t("searchTemplates")}
                            className="h-7 text-xs"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground py-1">
                          {t("noTemplatesAvailable")}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Input Area - WhatsApp Style */}
                  <div className="border-t flex-shrink-0">
                    {/* Reply Banner */}
                    {replyingToMessage && (
                      <ReplyBanner
                        replyPreview={{
                          messageId: replyingToMessage.messageId,
                          senderType:
                            replyingToMessage.direction === "outbound"
                              ? "agent"
                              : "customer",
                          senderName:
                            replyingToMessage.direction === "outbound"
                              ? "You" // This value is ignored - ReplyBanner uses t("you") for agent messages
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
                                  replyingToMessage.attachments[0]
                                    .thumbnailKey ||
                                  replyingToMessage.attachments[0].s3Key,
                                fileName:
                                  replyingToMessage.attachments[0].fileName,
                              }
                            : undefined,
                        }}
                        messageId={replyingToMessage.messageId}
                        attachmentId={replyingToMessage.attachments?.[0]?.id}
                        attachment={replyingToMessage.attachments?.[0]}
                        onCancel={handleCancelReply}
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
                            handleFilesSelected(files, currentAttachmentType);
                          }
                          e.target.value = "";
                        }}
                        className="hidden"
                      />

                      {/* Message Input with Attachment Button Inside */}
                      <ChatMessageInput
                        ref={messageInputRef}
                        onSend={handleSendMessage}
                        placeholder={t("typeMessageOrUseTemplates")}
                        disabled={isUploading || pendingMediaUploads.length > 0}
                        templateValue={templateInput}
                        onTemplateUsed={handleTemplateUsed}
                        leftElement={
                          <AttachmentMenu
                            onFilesSelected={handleFilesSelected}
                            onContactsClick={handleContactsClick}
                            disabled={
                              isUploading || pendingMediaUploads.length > 0
                            }
                          />
                        }
                      />
                    </div>
                  </div>

                  {/* Media Staging Panel (positioned within messages area) */}
                  <MediaStagingPanel
                    isOpen={mediaStagingOpen}
                    files={stagedFiles}
                    onClose={handleCloseStagingModal}
                    onSend={handleSendMediaFromStaging}
                    onAddMore={handleAddMoreMedia}
                    onRemove={handleRemoveStagedFile}
                    disabled={isUploading}
                    sendButtonText={t("send")}
                  />

                  {/* Media Preview Modal (positioned within messages area) */}
                  <MediaPreviewModal
                    isOpen={previewModalOpen}
                    attachments={previewAttachments}
                    messageId={previewMessageId}
                    initialIndex={previewInitialIndex}
                    onClose={() => setPreviewModalOpen(false)}
                  />
                </div>

                {/* Resizable Separator */}
                <div
                  ref={separatorRef}
                  onMouseDown={handleMouseDown}
                  className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors"
                  title="Drag to resize"
                />

                {/* Notes Panel (Right Sidebar) - Dynamic Width */}
                <div
                  className="hidden xl:flex flex-col overflow-hidden"
                  style={{ width: `${notesPanelWidth}px` }}
                >
                  {selectedChatId && currentUserId && (
                    <ChatSidebar
                      chatId={selectedChatId}
                      contactId={selectedContactId}
                      currentUserId={currentUserId}
                      notes={notes}
                      notesLoading={notesLoading}
                      onAddNote={handleAddNote}
                      onDeleteNote={handleDeleteNote}
                      onProfileUpdate={() => {
                        // Optionally refresh contact data when profile is updated
                      }}
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
                <p className="text-muted-foreground text-lg">
                  {loading ? "Loading chat..." : t("selectChat")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info about Automation */}
      {automationEnabled && (
        <div className="border-t bg-blue-50 dark:bg-blue-950 p-4">
          <p className="text-sm text-blue-700 dark:text-blue-200">
            ✓ Automatic replies are enabled. Messages matching automation rules
            will be responded to automatically.
          </p>
        </div>
      )}

      {/* Download Menu */}
      <MediaDownloadMenu
        isOpen={downloadMenuOpen}
        position={downloadMenuPosition}
        isSingleImage={currentMessageAttachments.length === 1}
        isLoading={downloadLoading}
        onDownloadSingle={handleDownloadSingle}
        onDownloadPack={handleDownloadPack}
        onClose={() => setDownloadMenuOpen(false)}
      />

      {/* Delete Message Dialog */}
      <DeleteMessageDialog
        open={deleteDialogOpen}
        messageId={deletingMessageId}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDeleteMessage}
      />

      {/* Video Preview Player - Draggable YouTube/Video player */}
      {videoPreview && (
        <VideoPreviewPlayer
          videoId={videoPreview.videoId}
          url={videoPreview.url}
          title={videoPreview.title}
          onClose={() => setVideoPreview(null)}
        />
      )}

      {/* Send Contacts Modal - Step 1: Select contacts */}
      <SendContactsModal
        isOpen={sendContactsModalOpen}
        onClose={() => setSendContactsModalOpen(false)}
        onSend={handleContactsSelected}
        contacts={allContacts}
        initialSelectedContacts={contactsToSend}
        isLoading={contactsLoading}
      />

      {/* Contact Preview Modal - Step 2: Preview before sending */}
      <ContactPreviewModal
        isOpen={contactPreviewModalOpen}
        onClose={() => {
          setContactPreviewModalOpen(false);
          setContactsToSend([]);
        }}
        onBack={() => {
          // Go back to selection modal, keeping selected contacts
          setContactPreviewModalOpen(false);
          setSendContactsModalOpen(true);
        }}
        onConfirmSend={handleSendContacts}
        contacts={contactsToSend}
        onStartChat={handleStartChatWithContact}
        isLoading={isSendingContacts}
      />

      {/* View Contacts Modal - For viewing received contacts */}
      <ViewContactsModal
        isOpen={viewContactsModalOpen}
        onClose={() => {
          setViewContactsModalOpen(false);
          setContactsToView([]);
        }}
        contacts={contactsToView}
        onStartChat={handleStartChatWithContact}
        onSaveContact={handleSaveContactFromMessage}
      />

      {/* Quick Contact Form Modal - For saving received contacts */}
      <QuickContactFormModal
        isOpen={quickContactFormOpen}
        onClose={() => {
          setQuickContactFormOpen(false);
          setContactToSave(null);
        }}
        onSave={handleQuickSaveContact}
        initialData={
          contactToSave
            ? {
                firstName:
                  contactToSave.name.first_name ||
                  contactToSave.name.formatted_name ||
                  "",
                lastName: contactToSave.name.last_name || "",
                phoneNumber:
                  contactToSave.phones?.[0]?.phone ||
                  contactToSave.phones?.[0]?.wa_id ||
                  "",
              }
            : undefined
        }
        isLoading={isSavingContact}
      />

      {/* Sender Select Modal - For starting new chat with contact */}
      <SelectSenderModal
        isOpen={senderSelectModalOpen}
        onClose={() => {
          setSenderSelectModalOpen(false);
          setContactToStartChat(null);
        }}
        onSelect={handleSenderSelectedForContact}
        contact={
          contactToStartChat
            ? {
                firstName: contactToStartChat.firstName,
                lastName: contactToStartChat.lastName,
                phoneNumber: contactToStartChat.phoneNumber,
              }
            : undefined
        }
        senders={senders}
      />
    </div>
  );
}
