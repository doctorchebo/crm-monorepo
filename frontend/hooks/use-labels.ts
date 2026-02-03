/**
 * Labels Hooks
 * React hooks for managing labels feature
 */

import {
  backendApi,
  CreateLabelDto,
  LabelResponse,
  UpdateLabelDto,
} from "@/lib/api/endpoints";
import { useCallback, useState } from "react";
import useSWR, { mutate } from "swr";

const LABELS_KEY = "/labels";

/**
 * Hook to fetch all labels for the team
 */
export function useLabels() {
  const {
    data,
    error,
    isLoading,
    mutate: revalidate,
  } = useSWR<LabelResponse[]>(LABELS_KEY, () => backendApi.labels.list(), {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

  return {
    labels: data || [],
    isLoading,
    error,
    revalidate,
  };
}

/**
 * Hook to fetch labels for a specific chat
 */
export function useChatLabels(chatId: string | null) {
  const {
    data,
    error,
    isLoading,
    mutate: revalidate,
  } = useSWR<LabelResponse[]>(
    chatId ? `/labels/chat/${chatId}` : null,
    () => (chatId ? backendApi.labels.getChatLabels(chatId) : []),
    {
      revalidateOnFocus: false,
      dedupingInterval: 2000,
    },
  );

  return {
    labels: data || [],
    isLoading,
    error,
    revalidate,
  };
}

/**
 * Hook for label CRUD operations
 */
export function useLabelActions() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLabel = useCallback(
    async (data: CreateLabelDto): Promise<LabelResponse | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await backendApi.labels.create(data);
        // Revalidate labels list
        mutate(LABELS_KEY);
        return result;
      } catch (err: any) {
        const message = err?.message || "Failed to create label";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const updateLabel = useCallback(
    async (
      labelId: string,
      data: UpdateLabelDto,
    ): Promise<LabelResponse | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await backendApi.labels.update(labelId, data);
        // Revalidate labels list
        mutate(LABELS_KEY);
        return result;
      } catch (err: any) {
        const message = err?.message || "Failed to update label";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const deleteLabel = useCallback(async (labelId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await backendApi.labels.delete(labelId);
      // Revalidate labels list
      mutate(LABELS_KEY);
      return true;
    } catch (err: any) {
      const message = err?.message || "Failed to delete label";
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    createLabel,
    updateLabel,
    deleteLabel,
    isLoading,
    error,
    clearError: () => setError(null),
  };
}

/**
 * Hook for applying/removing labels to/from chats
 */
export function useChatLabelActions() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyLabels = useCallback(
    async (
      chatIds: string[],
      labelIds: string[],
    ): Promise<{ applied: number; skipped: number } | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await backendApi.labels.applyToChats({
          chatIds,
          labelIds,
        });
        // Revalidate labels list (to update chat counts)
        mutate(LABELS_KEY);
        // Revalidate chat labels for affected chats
        chatIds.forEach((chatId) => {
          mutate(`/labels/chat/${chatId}`);
        });
        return result;
      } catch (err: any) {
        const message = err?.message || "Failed to apply labels";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const removeLabels = useCallback(
    async (
      chatIds: string[],
      labelIds: string[],
    ): Promise<{ removed: number } | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await backendApi.labels.removeFromChats({
          chatIds,
          labelIds,
        });
        // Revalidate labels list (to update chat counts)
        mutate(LABELS_KEY);
        // Revalidate chat labels for affected chats
        chatIds.forEach((chatId) => {
          mutate(`/labels/chat/${chatId}`);
        });
        return result;
      } catch (err: any) {
        const message = err?.message || "Failed to remove labels";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return {
    applyLabels,
    removeLabels,
    isLoading,
    error,
    clearError: () => setError(null),
  };
}

/**
 * Hook to fetch chats with a specific label
 */
export function useChatsWithLabel(
  labelId: string | null,
  options?: { skip?: number; take?: number },
) {
  const {
    data,
    error,
    isLoading,
    mutate: revalidate,
  } = useSWR(
    labelId ? `/labels/${labelId}/chats` : null,
    () =>
      labelId ? backendApi.labels.getChatsWithLabel(labelId, options) : null,
    {
      revalidateOnFocus: false,
      dedupingInterval: 2000,
    },
  );

  return {
    data,
    isLoading,
    error,
    revalidate,
  };
}
