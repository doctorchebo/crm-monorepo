/**
 * AI Configuration Hook
 * React hook for managing AI behavior configurations
 */

import {
  backendApi as api,
  type AiConfigOptions,
  type AiConfiguration,
  type ChatAiOverride,
  type ResolvedAiConfig,
  type SetChatOverrideDto,
  type UpdateAiConfigurationDto,
} from "@/lib/api/endpoints";
import { useCallback, useEffect, useState } from "react";

// ============================================================================
// Types
// ============================================================================

interface UseAiConfigReturn {
  // Configuration options
  options: AiConfigOptions | null;
  loadingOptions: boolean;

  // User configuration
  userConfig: AiConfiguration | null;
  loadingUserConfig: boolean;
  updateUserConfig: (data: UpdateAiConfigurationDto) => Promise<void>;

  // Resolved configuration for a specific chat
  resolvedConfig: ResolvedAiConfig | null;
  loadingResolvedConfig: boolean;
  fetchResolvedConfig: (chatId: string) => Promise<ResolvedAiConfig | null>;

  // Chat overrides
  chatOverrides: ChatAiOverride[];
  loadingChatOverrides: boolean;
  setChatOverride: (data: SetChatOverrideDto) => Promise<ChatAiOverride>;
  deleteChatOverride: (chatId: string) => Promise<void>;

  // General
  error: string | null;
  refresh: () => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useAiConfig(): UseAiConfigReturn {
  // Options state
  const [options, setOptions] = useState<AiConfigOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // User config state
  const [userConfig, setUserConfig] = useState<AiConfiguration | null>(null);
  const [loadingUserConfig, setLoadingUserConfig] = useState(true);

  // Resolved config state
  const [resolvedConfig, setResolvedConfig] = useState<ResolvedAiConfig | null>(
    null,
  );
  const [loadingResolvedConfig, setLoadingResolvedConfig] = useState(false);

  // Chat overrides state
  const [chatOverrides, setChatOverrides] = useState<ChatAiOverride[]>([]);
  const [loadingChatOverrides, setLoadingChatOverrides] = useState(true);

  // General state
  const [error, setError] = useState<string | null>(null);

  // Fetch options
  const fetchOptions = useCallback(async () => {
    try {
      setLoadingOptions(true);
      const data = await api.aiConfig.getOptions();
      setOptions(data);
    } catch (err) {
      console.error("Failed to fetch AI config options:", err);
      setError("Failed to load AI configuration options");
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  // Fetch user config
  const fetchUserConfig = useCallback(async () => {
    try {
      setLoadingUserConfig(true);
      const data = await api.aiConfig.getUserConfig();
      setUserConfig(data);
    } catch (err) {
      console.error("Failed to fetch user AI config:", err);
      setError("Failed to load your AI configuration");
    } finally {
      setLoadingUserConfig(false);
    }
  }, []);

  // Fetch chat overrides
  const fetchChatOverrides = useCallback(async () => {
    try {
      setLoadingChatOverrides(true);
      const data = await api.aiConfig.getChatOverrides();
      setChatOverrides(data);
    } catch (err) {
      console.error("Failed to fetch chat overrides:", err);
    } finally {
      setLoadingChatOverrides(false);
    }
  }, []);

  // Update user config
  const updateUserConfig = useCallback(
    async (data: UpdateAiConfigurationDto) => {
      try {
        const updated = await api.aiConfig.updateUserConfig(data);
        setUserConfig(updated);
      } catch (err) {
        console.error("Failed to update user AI config:", err);
        throw new Error("Failed to update AI configuration");
      }
    },
    [],
  );

  // Fetch resolved config for a chat
  const fetchResolvedConfig = useCallback(
    async (chatId: string): Promise<ResolvedAiConfig | null> => {
      try {
        setLoadingResolvedConfig(true);
        const data = await api.aiConfig.getResolvedConfig(chatId);
        setResolvedConfig(data);
        return data;
      } catch (err) {
        console.error("Failed to fetch resolved config:", err);
        return null;
      } finally {
        setLoadingResolvedConfig(false);
      }
    },
    [],
  );

  // Set chat override
  const setChatOverrideHandler = useCallback(
    async (data: SetChatOverrideDto): Promise<ChatAiOverride> => {
      try {
        const result = await api.aiConfig.setChatOverride(data);

        // Update local state
        setChatOverrides((prev) => {
          const index = prev.findIndex((o) => o.chatId === data.chatId);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = result;
            return updated;
          }
          return [...prev, result];
        });

        return result;
      } catch (err) {
        console.error("Failed to set chat override:", err);
        throw new Error("Failed to set chat AI override");
      }
    },
    [],
  );

  // Delete chat override
  const deleteChatOverrideHandler = useCallback(async (chatId: string) => {
    try {
      await api.aiConfig.deleteChatOverride(chatId);

      // Update local state
      setChatOverrides((prev) => prev.filter((o) => o.chatId !== chatId));
    } catch (err) {
      console.error("Failed to delete chat override:", err);
      throw new Error("Failed to delete chat AI override");
    }
  }, []);

  // Refresh all data
  const refresh = useCallback(async () => {
    setError(null);
    await Promise.all([
      fetchOptions(),
      fetchUserConfig(),
      fetchChatOverrides(),
    ]);
  }, [fetchOptions, fetchUserConfig, fetchChatOverrides]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    options,
    loadingOptions,
    userConfig,
    loadingUserConfig,
    updateUserConfig,
    resolvedConfig,
    loadingResolvedConfig,
    fetchResolvedConfig,
    chatOverrides,
    loadingChatOverrides,
    setChatOverride: setChatOverrideHandler,
    deleteChatOverride: deleteChatOverrideHandler,
    error,
    refresh,
  };
}

// ============================================================================
// Individual Chat Config Hook
// ============================================================================

interface UseChatAiConfigReturn {
  config: ResolvedAiConfig | null;
  loading: boolean;
  error: string | null;
  override: ChatAiOverride | null;
  setOverride: (data: Omit<SetChatOverrideDto, "chatId">) => Promise<void>;
  clearOverride: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing AI configuration for a specific chat
 */
export function useChatAiConfig(chatId: string | null): UseChatAiConfigReturn {
  const [config, setConfig] = useState<ResolvedAiConfig | null>(null);
  const [override, setOverrideState] = useState<ChatAiOverride | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!chatId) {
      setConfig(null);
      setOverrideState(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [resolvedConfig, chatOverride] = await Promise.all([
        api.aiConfig.getResolvedConfig(chatId),
        api.aiConfig.getChatOverride(chatId),
      ]);

      setConfig(resolvedConfig);
      setOverrideState(chatOverride);
    } catch (err) {
      console.error("Failed to fetch chat AI config:", err);
      setError("Failed to load AI configuration for this chat");
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  const setOverride = useCallback(
    async (data: Omit<SetChatOverrideDto, "chatId">) => {
      if (!chatId) return;

      try {
        const result = await api.aiConfig.setChatOverride({
          ...data,
          chatId,
        });
        setOverrideState(result);

        // Refresh resolved config to reflect changes
        const resolvedConfig = await api.aiConfig.getResolvedConfig(chatId);
        setConfig(resolvedConfig);
      } catch (err) {
        console.error("Failed to set chat override:", err);
        throw new Error("Failed to update chat AI settings");
      }
    },
    [chatId],
  );

  const clearOverride = useCallback(async () => {
    if (!chatId) return;

    try {
      await api.aiConfig.deleteChatOverride(chatId);
      setOverrideState(null);

      // Refresh resolved config
      const resolvedConfig = await api.aiConfig.getResolvedConfig(chatId);
      setConfig(resolvedConfig);
    } catch (err) {
      console.error("Failed to clear chat override:", err);
      throw new Error("Failed to clear chat AI settings");
    }
  }, [chatId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    loading,
    error,
    override,
    setOverride,
    clearOverride,
    refresh: fetchConfig,
  };
}
