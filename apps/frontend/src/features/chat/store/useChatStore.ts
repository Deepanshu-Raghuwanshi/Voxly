import { create } from "zustand";
import type { Message } from "@shared-types";

interface ChatState {
  activeConversationId: string | null;
  draftMessages: Record<string, string>;
  replyTargets: Record<string, Message | null>;
  highlightedMessageId: string | null;
  typingUsers: Record<string, string[]>;
  agentThinking: Record<string, boolean>;
  composerFocusTokens: Record<string, number>;
  setActiveConversation: (id: string | null) => void;
  setDraft: (conversationId: string, text: string) => void;
  setReplyTarget: (conversationId: string, message: Message | null) => void;
  setHighlightedMessageId: (id: string | null) => void;
  setTyping: (
    conversationId: string,
    userId: string,
    isTyping: boolean,
  ) => void;
  setAgentThinking: (conversationId: string, thinking: boolean) => void;
  requestComposerFocus: (conversationId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  draftMessages: {},
  replyTargets: {},
  highlightedMessageId: null,
  typingUsers: {},
  agentThinking: {},
  composerFocusTokens: {},
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setDraft: (conversationId, text) =>
    set((state) => ({
      draftMessages: { ...state.draftMessages, [conversationId]: text },
    })),
  setReplyTarget: (conversationId, message) =>
    set((state) => ({
      replyTargets: { ...state.replyTargets, [conversationId]: message },
    })),
  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),
  setTyping: (conversationId, userId, isTyping) =>
    set((state) => {
      const current = state.typingUsers[conversationId] ?? [];
      const updated = isTyping
        ? current.includes(userId)
          ? current
          : [...current, userId]
        : current.filter((id) => id !== userId);
      return {
        typingUsers: { ...state.typingUsers, [conversationId]: updated },
      };
    }),
  setAgentThinking: (conversationId, thinking) =>
    set((state) => ({
      agentThinking: { ...state.agentThinking, [conversationId]: thinking },
    })),
  requestComposerFocus: (conversationId) =>
    set((state) => ({
      composerFocusTokens: {
        ...state.composerFocusTokens,
        [conversationId]: (state.composerFocusTokens[conversationId] ?? 0) + 1,
      },
    })),
}));
