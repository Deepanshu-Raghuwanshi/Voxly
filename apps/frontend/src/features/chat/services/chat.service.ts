import apiClient from "../../../shared/lib/apiClient";
import {
  Conversation,
  ConversationListResponse,
  Message,
  MessageListResponse,
  AiRewriteResponse,
  AiSmartReplyResponse,
  AiSummarizeResponse,
  AiAgentResponse,
} from "@shared-types";
import type { RewriteTone } from "../types";

export const chatService = {
  async listConversations(params?: {
    limit?: number;
    before?: string;
  }): Promise<ConversationListResponse> {
    const { data } = await apiClient.get<ConversationListResponse>(
      "/chat/conversations",
      { params },
    );
    return data;
  },

  async createOrGetConversation(dto: {
    targetUserId: string;
    targetUsername?: string;
    targetFullName?: string;
    targetAvatarUrl?: string;
    callerUsername?: string;
    callerFullName?: string;
    callerAvatarUrl?: string;
  }): Promise<Conversation> {
    const { data } = await apiClient.post<Conversation>(
      "/chat/conversations",
      dto,
    );
    return data;
  },

  async getConversation(conversationId: string): Promise<Conversation> {
    const { data } = await apiClient.get<Conversation>(
      `/chat/conversations/${conversationId}`,
    );
    return data;
  },

  async getMessages(
    conversationId: string,
    params?: { limit?: number; before?: string },
  ): Promise<MessageListResponse> {
    const { data } = await apiClient.get<MessageListResponse>(
      `/chat/conversations/${conversationId}/messages`,
      { params },
    );
    return data;
  },

  async sendMessage(
    conversationId: string,
    content: string,
    quotedMessageId?: string,
  ): Promise<Message> {
    const { data } = await apiClient.post<Message>(
      `/chat/conversations/${conversationId}/messages`,
      {
        content,
        type: "TEXT",
        ...(quotedMessageId ? { quotedMessageId } : {}),
      },
    );
    return data;
  },

  async editMessage(
    conversationId: string,
    messageId: string,
    content: string,
  ): Promise<Message> {
    const { data } = await apiClient.patch<Message>(
      `/chat/conversations/${conversationId}/messages/${messageId}`,
      { content },
    );
    return data;
  },

  async deleteMessage(
    conversationId: string,
    messageId: string,
  ): Promise<Message> {
    const { data } = await apiClient.delete<Message>(
      `/chat/conversations/${conversationId}/messages/${messageId}`,
    );
    return data;
  },

  async markRead(conversationId: string): Promise<{ lastReadAt: string }> {
    const { data } = await apiClient.post<{ lastReadAt: string }>(
      `/chat/conversations/${conversationId}/read`,
    );
    return data;
  },

  async searchConversations(q: string): Promise<ConversationListResponse> {
    const { data } = await apiClient.get<ConversationListResponse>(
      "/chat/conversations",
      { params: { q } },
    );
    return data;
  },

  async toggleReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
  ): Promise<Message> {
    const { data } = await apiClient.post<Message>(
      `/chat/conversations/${conversationId}/messages/${messageId}/reactions`,
      { emoji },
    );
    return data;
  },

  async rewriteMessage(dto: {
    text: string;
    tone: RewriteTone;
  }): Promise<AiRewriteResponse> {
    const { data } = await apiClient.post<AiRewriteResponse>(
      "/chat/ai/rewrite",
      dto,
    );
    return data;
  },

  async getSmartReplies(dto: {
    messages: Array<{ role: "me" | "them"; content: string }>;
  }): Promise<AiSmartReplyResponse> {
    const { data } = await apiClient.post<AiSmartReplyResponse>(
      "/chat/ai/smart-replies",
      dto,
    );
    return data;
  },

  async summarizeConversation(dto: {
    conversationId: string;
    limit?: number;
  }): Promise<AiSummarizeResponse> {
    const { data } = await apiClient.post<AiSummarizeResponse>(
      "/chat/ai/summarize",
      dto,
    );
    return data;
  },

  async triggerAiAgent(dto: {
    conversationId: string;
    message: string;
  }): Promise<AiAgentResponse> {
    const { data } = await apiClient.post<AiAgentResponse>(
      "/chat/ai/agent",
      dto,
    );
    return data;
  },
};
