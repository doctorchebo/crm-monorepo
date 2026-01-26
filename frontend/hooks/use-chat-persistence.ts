/**
 * useChatPersistence - Hook for persisting chat selection and sidebar tab state
 *
 * Persists to sessionStorage (only for the current tab/session):
 * - Selected chat ID - restored on page reload
 * - Active sidebar tab (profile/notes) - restored on page reload, NOT on chat switch
 *
 * Key behavior:
 * - On page reload: Both selected chat and sidebar tab are restored
 * - On chat switch: Sidebar tab is NOT changed (stays on current tab)
 * - Debounced saves to avoid excessive writes
 */

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY_CHAT = "chats-page:selectedChatId";
const STORAGE_KEY_TAB = "chats-page:sidebarTab";
const SAVE_DEBOUNCE_MS = 300;

export type SidebarTab = "profile" | "notes";

interface UseChatPersistenceOptions {
  /** Called when a persisted chat ID is found on mount */
  onRestoreChatId?: (chatId: string) => void;
  /** Default sidebar tab if none is persisted */
  defaultTab?: SidebarTab;
}

interface UseChatPersistenceReturn {
  /** The persisted sidebar tab (for initial load only) */
  persistedTab: SidebarTab | null;
  /** Save the current chat selection */
  persistChatId: (chatId: string | null) => void;
  /** Save the current sidebar tab (only call on user interaction) */
  persistSidebarTab: (tab: SidebarTab) => void;
  /** Clear all persisted state */
  clearPersistedState: () => void;
  /** Whether we're still loading persisted state */
  isRestoring: boolean;
}

/**
 * Safe localStorage/sessionStorage access (handles SSR and quota errors)
 */
function safeStorage(storage: Storage) {
  return {
    get: (key: string): string | null => {
      try {
        if (typeof window === "undefined") return null;
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key: string, value: string): void => {
      try {
        if (typeof window === "undefined") return;
        storage.setItem(key, value);
      } catch {
        // Quota exceeded or access denied - ignore
      }
    },
    remove: (key: string): void => {
      try {
        if (typeof window === "undefined") return;
        storage.removeItem(key);
      } catch {
        // Ignore errors
      }
    },
  };
}

export function useChatPersistence({
  onRestoreChatId,
  defaultTab = "profile",
}: UseChatPersistenceOptions = {}): UseChatPersistenceReturn {
  const [persistedTab, setPersistedTab] = useState<SidebarTab | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasRestoredRef = useRef(false);

  // Create safe storage accessor
  const storage =
    typeof window !== "undefined"
      ? safeStorage(sessionStorage)
      : { get: () => null, set: () => {}, remove: () => {} };

  // Restore persisted state on mount
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    // Restore chat ID
    const savedChatId = storage.get(STORAGE_KEY_CHAT);
    if (savedChatId && onRestoreChatId) {
      onRestoreChatId(savedChatId);
    }

    // Restore sidebar tab
    const savedTab = storage.get(STORAGE_KEY_TAB);
    if (savedTab === "profile" || savedTab === "notes") {
      setPersistedTab(savedTab);
    } else {
      setPersistedTab(defaultTab);
    }

    setIsRestoring(false);
  }, [onRestoreChatId, defaultTab, storage]);

  /**
   * Persist chat ID with debounce
   */
  const persistChatId = useCallback(
    (chatId: string | null) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        if (chatId) {
          storage.set(STORAGE_KEY_CHAT, chatId);
        } else {
          storage.remove(STORAGE_KEY_CHAT);
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [storage],
  );

  /**
   * Persist sidebar tab immediately (user interaction)
   */
  const persistSidebarTab = useCallback(
    (tab: SidebarTab) => {
      storage.set(STORAGE_KEY_TAB, tab);
    },
    [storage],
  );

  /**
   * Clear all persisted state
   */
  const clearPersistedState = useCallback(() => {
    storage.remove(STORAGE_KEY_CHAT);
    storage.remove(STORAGE_KEY_TAB);
    setPersistedTab(null);
  }, [storage]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    persistedTab,
    persistChatId,
    persistSidebarTab,
    clearPersistedState,
    isRestoring,
  };
}
