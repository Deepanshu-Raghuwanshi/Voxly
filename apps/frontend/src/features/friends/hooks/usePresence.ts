import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Message, MessageListResponse, Reaction } from "@shared-types";
import { InfiniteData } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { chatService } from "../../chat/services/chat.service";
import { mergeRealtimeMessage } from "../../chat/services/message-cache";
import { authService } from "../../auth/services/auth.service";
import { useChatStore } from "../../chat/store/useChatStore";
import {
  clearPresence,
  onPresenceUsersAdded,
  refreshPresence,
  updatePresence,
} from "./usePresenceStatus";

const PRESENCE_REFRESH_MS = 60_000;

interface PresenceUpdate {
  userId: string;
  status: "ONLINE" | "OFFLINE";
}

// Shape emitted by ChatGateway (mirrors MessageSentEventV1 from kafka-events)
interface MessageNewPayload {
  messageId: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: string;
  sentAt: string;
  replyTo?: { messageId: string; senderId: string; content: string };
}

interface MessageDeliveredPayload {
  conversationId: string;
  senderId: string;
  recipientId: string; // mirrors server payload; not needed client-side
  deliveredAt: string;
}

interface MessageReadPayload {
  conversationId: string;
  senderId: string;
  lastReadAt: string;
}

interface MessageUpdatedPayload {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  editedAt: string;
}

interface MessageDeletedPayload {
  messageId: string;
  conversationId: string;
  senderId: string;
  deletedAt: string;
}

interface MessageReactionPayload {
  messageId: string;
  conversationId: string;
  reactorId: string;
  emoji: string;
  action: "added" | "removed";
  toggledAt: string;
}

interface TypingStartedPayload {
  conversationId: string;
  userId: string;
}

interface TypingStoppedPayload {
  conversationId: string;
  userId: string;
}

interface AiMessageNewPayload {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  status: string;
  isDeleted: boolean;
  isEdited: boolean;
  isAI: boolean;
  toolUsed?: string | null;
  agentQuery?: string | null;
  reactions: Reaction[];
  createdAt: string;
  updatedAt: string;
}

let socket: Socket | null = null;

export const joinConversationRoom = (conversationId: string) => {
  socket?.emit("join.conversation", { conversationId });
};

export const emitTypingStart = (conversationId: string) => {
  socket?.emit("typing.start", { conversationId });
};

export const emitTypingStop = (conversationId: string) => {
  socket?.emit("typing.stop", { conversationId });
};

/**
 * Opens the shared presence socket and registers every realtime handler.
 * The root navbar owns the socket for the authenticated session.
 */
export const usePresence = (enabled: boolean = true, userId?: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    if (!socket) {
      const CHAT_SERVICE_URL =
        process.env.NEXT_PUBLIC_CHAT_SERVICE_URL || "http://localhost:3003";
      const connection = io(`${CHAT_SERVICE_URL}/presence`, {
        withCredentials: true,
        transports: ["websocket", "polling"],
      });
      socket = connection;

      let refreshTimer: ReturnType<typeof setTimeout> | undefined;
      let pendingRefresh: AbortController | undefined;
      let connectedBefore = false;
      let reconnectAfter = 0;
      const sessionCheck = new AbortController();
      const reconnectWithSession = () => {
        if (connection.connected || connection.active || Date.now() < reconnectAfter) return;
        reconnectAfter = Date.now() + PRESENCE_REFRESH_MS;
        void authService.getProfile(sessionCheck.signal).then(() => {
          if (!sessionCheck.signal.aborted && !connection.connected) connection.connect();
        }).catch(() => {
          // A later presence check can recover from a temporary failure.
        });
      };
      const scheduleRefresh = () => {
        clearTimeout(refreshTimer);
        if (document.visibilityState === "hidden") return;

        refreshTimer = setTimeout(() => {
          reconnectWithSession();
          pendingRefresh?.abort();
          const controller = new AbortController();
          pendingRefresh = controller;
          void refreshPresence(controller.signal).catch(() => {
            // The next focus, reconnect or interval will retry.
          });
        }, 100);
      };
      const unsubscribe = onPresenceUsersAdded(scheduleRefresh);
      window.addEventListener("focus", scheduleRefresh);
      document.addEventListener("visibilitychange", scheduleRefresh);
      const refreshInterval = setInterval(scheduleRefresh, PRESENCE_REFRESH_MS);
      scheduleRefresh();

      connection.on("connect", () => {
        reconnectAfter = 0;
        const { activeConversationId } = useChatStore.getState();
        if (activeConversationId) joinConversationRoom(activeConversationId);
        if (connectedBefore) {
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
          void queryClient.invalidateQueries({
            queryKey: ["messages"],
            refetchType: "active",
          });
        }
        connectedBefore = true;
        scheduleRefresh();
      });

      connection.on("disconnect", (reason) => {
        if (reason === "io server disconnect") reconnectWithSession();
      });
      connection.on("connect_error", () => {
        if (!connection.active) reconnectWithSession();
      });

      connection.on("presence.updated", (data: PresenceUpdate) => {
        updatePresence(data.userId, data.status === "ONLINE");
      });

      socket.on("friendship.removed", () => {
        // Invalidate the conversation list for both the remover and the removed user
        // so neither sees the stale conversation in their sidebar.
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["friends"] });
      });

      socket.on("friend.request.received", () => {
        queryClient.invalidateQueries({
          queryKey: ["friend-requests", "incoming"],
        });
      });

      socket.on("friend.request.accepted", () => {
        queryClient.invalidateQueries({ queryKey: ["friends"] });
        queryClient.invalidateQueries({
          queryKey: ["friend-requests", "outgoing"],
        });
        queryClient.invalidateQueries({ queryKey: ["friend-recommendations"] });
      });

      socket.on("message.new", (data: MessageNewPayload) => {
        // Map the Kafka event shape to the Message schema shape
        const newMessage: Message = {
          id: data.messageId,
          conversationId: data.conversationId,
          senderId: data.senderId,
          content: data.content,
          type: data.type as "TEXT",
          status: "SENT",
          isDeleted: false,
          isEdited: false,
          isAI: false,
          reactions: [],
          replyTo: data.replyTo,
          createdAt: data.sentAt,
          updatedAt: data.sentAt,
        };

        mergeRealtimeMessage(queryClient, newMessage);
        // Refresh conversation list to update order and unread counts
        queryClient.invalidateQueries({ queryKey: ["conversations"] });

        // Auto-read: if the conversation is currently open, mark it read immediately.
        // .getState() is used instead of the useChatStore hook because this runs
        // inside a socket event handler, not a component render cycle.
        const { activeConversationId } = useChatStore.getState();
        if (data.conversationId === activeConversationId) {
          chatService.markRead(data.conversationId).catch(() => {});
        }
      });

      socket.on("message.delivered", (data: MessageDeliveredPayload) => {
        queryClient.setQueryData<InfiniteData<MessageListResponse>>(
          ["messages", data.conversationId],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                data: (page.data ?? []).map((msg) =>
                  msg.senderId === data.senderId && msg.status === "SENT"
                    ? { ...msg, status: "DELIVERED" as const }
                    : msg,
                ),
              })),
            };
          },
        );
      });

      socket.on("message.read", (data: MessageReadPayload) => {
        queryClient.setQueryData<InfiniteData<MessageListResponse>>(
          ["messages", data.conversationId],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                data: (page.data ?? []).map((msg) =>
                  msg.senderId === data.senderId && msg.status !== "READ"
                    ? { ...msg, status: "READ" as const }
                    : msg,
                ),
              })),
            };
          },
        );
      });

      socket.on("message.updated", (data: MessageUpdatedPayload) => {
        queryClient.setQueryData<InfiniteData<MessageListResponse>>(
          ["messages", data.conversationId],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                data: (page.data ?? []).map((msg) =>
                  msg.id === data.messageId
                    ? {
                        ...msg,
                        content: data.content,
                        isEdited: true,
                        updatedAt: data.editedAt,
                      }
                    : msg,
                ),
              })),
            };
          },
        );
      });

      socket.on("message.deleted", (data: MessageDeletedPayload) => {
        queryClient.setQueryData<InfiniteData<MessageListResponse>>(
          ["messages", data.conversationId],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                data: (page.data ?? []).map((msg) =>
                  msg.id === data.messageId
                    ? { ...msg, isDeleted: true, updatedAt: data.deletedAt }
                    : msg,
                ),
              })),
            };
          },
        );
      });

      socket.on("message.reaction", (data: MessageReactionPayload) => {
        queryClient.setQueryData<InfiniteData<MessageListResponse>>(
          ["messages", data.conversationId],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                data: (page.data ?? []).map((msg) => {
                  if (msg.id !== data.messageId) return msg;
                  const reactions = msg.reactions ?? [];
                  const existingIdx = reactions.findIndex(
                    (r) =>
                      r.emoji === data.emoji && r.userId === data.reactorId,
                  );
                  if (data.action === "added") {
                    if (existingIdx >= 0) return msg;
                    return {
                      ...msg,
                      reactions: [
                        ...reactions,
                        {
                          emoji: data.emoji,
                          userId: data.reactorId,
                          createdAt: data.toggledAt,
                        },
                      ],
                    };
                  } else {
                    if (existingIdx < 0) return msg;
                    return {
                      ...msg,
                      reactions: reactions.filter((_, i) => i !== existingIdx),
                    };
                  }
                }),
              })),
            };
          },
        );
      });
      socket.on("typing.started", (data: TypingStartedPayload) => {
        useChatStore
          .getState()
          .setTyping(data.conversationId, data.userId, true);
      });

      socket.on("typing.stopped", (data: TypingStoppedPayload) => {
        useChatStore
          .getState()
          .setTyping(data.conversationId, data.userId, false);
      });

      socket.on("ai.message.new", (data: AiMessageNewPayload) => {
        const aiMessage: Message = {
          id: data.id,
          conversationId: data.conversationId,
          senderId: data.senderId,
          content: data.content,
          type: data.type as "TEXT",
          status: data.status as "SENT",
          isDeleted: false,
          isEdited: false,
          isAI: data.isAI,
          toolUsed:
            data.toolUsed != null
              ? (data.toolUsed as Message["toolUsed"])
              : undefined,
          reactions: [],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };

        mergeRealtimeMessage(queryClient, aiMessage);
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      });
      return () => {
        unsubscribe();
        window.removeEventListener("focus", scheduleRefresh);
        document.removeEventListener("visibilitychange", scheduleRefresh);
        clearInterval(refreshInterval);
        clearTimeout(refreshTimer);
        pendingRefresh?.abort();
        sessionCheck.abort();
        connection.removeAllListeners();
        connection.disconnect();
        socket = null;
        clearPresence();
      };
    }
  }, [queryClient, enabled, userId]);
};
