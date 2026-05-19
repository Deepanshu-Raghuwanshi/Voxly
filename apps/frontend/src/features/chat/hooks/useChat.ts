"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  InfiniteData,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { chatService } from "../services/chat.service";
import {
  Conversation,
  ConversationListResponse,
  Message,
  MessageListResponse,
} from "@shared-types";
import { showToast } from "../../../shared/utils/toast";
import { useAuthStore } from "../../auth/store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useTranslations } from "next-intl";

export const useConversations = () => {
  return useInfiniteQuery({
    queryKey: ["conversations"],
    queryFn: ({ pageParam }) =>
      chatService.listConversations({
        before: pageParam as string | undefined,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
  });
};

export const useConversation = (conversationId: string) => {
  return useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => chatService.getConversation(conversationId),
    enabled: !!conversationId,
  });
};

export const useMessages = (conversationId: string) => {
  return useInfiniteQuery({
    queryKey: ["messages", conversationId],
    queryFn: ({ pageParam }) =>
      chatService.getMessages(conversationId, {
        before: pageParam as string | undefined,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!conversationId,
  });
};

export const useCreateConversation = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("features.chat.errors");

  return useMutation({
    mutationFn: (
      dto: Parameters<typeof chatService.createOrGetConversation>[0],
    ) => chatService.createOrGetConversation(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => {
      showToast.error(t("open_failed"));
    },
  });
};

export const useSendMessage = (conversationId: string) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const t = useTranslations("features.chat.errors");

  return useMutation({
    mutationFn: (vars: { content: string; quotedMessageId?: string }) =>
      chatService.sendMessage(
        conversationId,
        vars.content,
        vars.quotedMessageId,
      ),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({
        queryKey: ["messages", conversationId],
      });
      const snapshot = queryClient.getQueryData<
        InfiniteData<MessageListResponse>
      >(["messages", conversationId]);

      const replyTarget =
        useChatStore.getState().replyTargets[conversationId] ?? null;

      const optimisticMessage: Message = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        senderId: user?.id ?? "",
        content: vars.content,
        type: "TEXT",
        status: "SENT",
        isDeleted: false,
        isEdited: false,
        isAI: false,
        reactions: [],
        replyTo: replyTarget
          ? {
              messageId: replyTarget.id,
              senderId: replyTarget.senderId,
              content: replyTarget.content.slice(0, 200),
            }
          : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<InfiniteData<MessageListResponse>>(
        ["messages", conversationId],
        (old) => {
          if (!old) return old;
          const newPages = [...old.pages];
          newPages[0] = {
            ...newPages[0],
            data: [optimisticMessage, ...newPages[0].data],
          };
          return { ...old, pages: newPages };
        },
      );

      return { snapshot, optimisticId: optimisticMessage.id };
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(
          ["messages", conversationId],
          context.snapshot,
        );
      }
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        showToast.error(t("no_longer_friends"));
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        router.push("/chat");
      } else {
        showToast.error(t("send_failed"));
      }
    },
    onSuccess: (savedMessage, _vars, context) => {
      useChatStore.getState().setReplyTarget(conversationId, null);
      // Swap the optimistic placeholder for the real saved message.
      // The filter deduplicates in case the socket event already prepended
      // the real message before this handler fired.
      queryClient.setQueryData<InfiniteData<MessageListResponse>>(
        ["messages", conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data
                .map((msg) =>
                  msg.id === context?.optimisticId ? savedMessage : msg,
                )
                .filter(
                  (msg, idx, arr) =>
                    arr.findIndex((m) => m.id === msg.id) === idx,
                ),
            })),
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useEditMessage = (conversationId: string) => {
  const queryClient = useQueryClient();
  const t = useTranslations("features.chat.errors");

  return useMutation({
    mutationFn: ({
      messageId,
      content,
    }: {
      messageId: string;
      content: string;
    }) => chatService.editMessage(conversationId, messageId, content),
    onSuccess: (updatedMessage) => {
      queryClient.setQueryData<InfiniteData<MessageListResponse>>(
        ["messages", conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((msg) =>
                msg.id === updatedMessage.id ? updatedMessage : msg,
              ),
            })),
          };
        },
      );
    },
    onError: () => {
      showToast.error(t("edit_failed"));
    },
  });
};

export const useDeleteMessage = (conversationId: string) => {
  const queryClient = useQueryClient();
  const t = useTranslations("features.chat.errors");

  return useMutation({
    mutationFn: (messageId: string) =>
      chatService.deleteMessage(conversationId, messageId),
    onSuccess: (updatedMessage) => {
      queryClient.setQueryData<InfiniteData<MessageListResponse>>(
        ["messages", conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((msg) =>
                msg.id === updatedMessage.id ? updatedMessage : msg,
              ),
            })),
          };
        },
      );
    },
    onError: () => {
      showToast.error(t("delete_failed"));
    },
  });
};

export const useMarkRead = (conversationId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => chatService.markRead(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["conversation", conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useSearchConversations = (query: string) => {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  return useQuery<ConversationListResponse>({
    queryKey: ["conversation-search", debouncedQuery],
    queryFn: () => chatService.searchConversations(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 1,
    staleTime: 30_000,
  });
};

export const useToggleReaction = (conversationId: string) => {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const t = useTranslations("features.chat.errors");

  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      chatService.toggleReaction(conversationId, messageId, emoji),

    onMutate: async ({ messageId, emoji }) => {
      await queryClient.cancelQueries({
        queryKey: ["messages", conversationId],
      });
      const snapshot = queryClient.getQueryData<
        InfiniteData<MessageListResponse>
      >(["messages", conversationId]);

      queryClient.setQueryData<InfiniteData<MessageListResponse>>(
        ["messages", conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((msg) => {
                if (msg.id !== messageId) return msg;
                const reactions = msg.reactions ?? [];
                const existingIdx = reactions.findIndex(
                  (r) => r.emoji === emoji && r.userId === user?.id,
                );
                const updatedReactions =
                  existingIdx >= 0
                    ? reactions.filter((_, i) => i !== existingIdx)
                    : [
                        ...reactions,
                        {
                          emoji,
                          userId: user?.id ?? "",
                          createdAt: new Date().toISOString(),
                        },
                      ];
                return { ...msg, reactions: updatedReactions };
              }),
            })),
          };
        },
      );

      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(
          ["messages", conversationId],
          context.snapshot,
        );
      }
      showToast.error(t("react_failed"));
    },
    onSuccess: (updatedMessage) => {
      queryClient.setQueryData<InfiniteData<MessageListResponse>>(
        ["messages", conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((msg) =>
                msg.id === updatedMessage.id ? updatedMessage : msg,
              ),
            })),
          };
        },
      );
    },
  });
};

export const useRewriteMessage = (conversationId: string) => {
  const setDraft = useChatStore((state) => state.setDraft);
  const t = useTranslations("features.chat.errors");

  return useMutation({
    mutationFn: (vars: Parameters<typeof chatService.rewriteMessage>[0]) =>
      chatService.rewriteMessage(vars),
    onSuccess: ({ rewrittenText }) => {
      setDraft(conversationId, rewrittenText);
    },
    onError: () => {
      showToast.error(t("rewrite_failed"));
    },
  });
};

export const useSmartReplies = (params: {
  lastMessageId: string;
  context: Array<{ role: "me" | "them"; content: string }>;
  enabled: boolean;
}) => {
  return useQuery({
    queryKey: ["smart-replies", params.lastMessageId],
    queryFn: () => chatService.getSmartReplies({ messages: params.context }),
    enabled: params.enabled && !!params.lastMessageId,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });
};

export const useGetOtherParticipant = (
  conversation: Conversation | undefined,
) => {
  const userId = useAuthStore((state) => state.user?.id);
  if (!conversation) return undefined;
  return conversation.participants.find((p) => p.userId !== userId);
};

export const useSummarizeConversation = (conversationId: string) => {
  const t = useTranslations("features.chat.errors");

  return useMutation({
    mutationFn: (limit?: number) =>
      chatService.summarizeConversation({ conversationId, limit }),
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        showToast.error(t("summarize_rate_limited"));
      }
    },
  });
};

export const useAiAgent = (conversationId: string) => {
  const queryClient = useQueryClient();
  const setDraft = useChatStore((state) => state.setDraft);
  const setAgentThinking = useChatStore((state) => state.setAgentThinking);
  const t = useTranslations("features.chat.errors");

  return useMutation({
    mutationFn: (message: string) =>
      chatService.triggerAiAgent({ conversationId, message }),

    onMutate: () => {
      setAgentThinking(conversationId, true);
    },

    onSettled: () => {
      setAgentThinking(conversationId, false);
    },

    onSuccess: ({ message: aiMessage }) => {
      setDraft(conversationId, "");

      queryClient.setQueryData<InfiniteData<MessageListResponse>>(
        ["messages", conversationId],
        (old) => {
          if (!old) return old;
          const alreadyExists = old.pages.some((p) =>
            p.data?.some((m) => m.id === aiMessage.id),
          );
          if (alreadyExists) return old;
          const newPages = [...old.pages];
          newPages[0] = {
            ...newPages[0],
            data: [aiMessage, ...newPages[0].data],
          };
          return { ...old, pages: newPages };
        },
      );
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },

    onError: (err) => {
      if (!axios.isAxiosError(err)) {
        showToast.error(t("agent_unavailable"));
        return;
      }

      const status = err.response?.status;
      const data = err.response?.data as Record<string, unknown> | undefined;
      // Global exception filter maps the payload to { statusCode, error, message, ... }
      const msg = ((data?.error ?? data?.message) as string | undefined) ?? "";

      if (status === 429) {
        toast(msg || t("agent_rate_limited"), {
          position: "bottom-center",
          style: { background: "#f59e0b", color: "#fff" },
          duration: 3000,
        });
        return;
      }

      // Blocked / guard-rail responses (400): inject as a fake AI message so the
      // user sees the reply inline rather than a generic error toast.
      if (status === 400 && msg) {
        const userId = useAuthStore.getState().user?.id;
        if (userId) {
          const blockedReply: Message = {
            id: crypto.randomUUID(),
            conversationId,
            senderId: userId,
            content: msg,
            type: "TEXT",
            status: "SENT",
            isDeleted: false,
            isEdited: false,
            isAI: true,
            toolUsed: "direct",
            reactions: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          queryClient.setQueryData<InfiniteData<MessageListResponse>>(
            ["messages", conversationId],
            (old) => {
              if (!old) return old;
              const newPages = [...old.pages];
              newPages[0] = {
                ...newPages[0],
                data: [blockedReply, ...newPages[0].data],
              };
              return { ...old, pages: newPages };
            },
          );
        }
        return;
      }

      showToast.error(t("agent_unavailable"));
    },
  });
};
