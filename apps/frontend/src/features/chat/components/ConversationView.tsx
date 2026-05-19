"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConversationHeader } from "./ConversationHeader";
import { MessageList } from "./MessageList";
import { SmartReplyChips } from "./SmartReplyChips";
import { AiThinkingIndicator } from "./AiThinkingIndicator";
import { MessageComposer } from "./MessageComposer";
import { SummaryModal } from "./SummaryModal";
import { Spinner } from "../../../shared/components/ui/spinner";
import {
  useConversation,
  useMessages,
  useMarkRead,
  useSummarizeConversation,
} from "../hooks/useChat";
import { useChatStore } from "../store/useChatStore";
import {
  usePresence,
  joinConversationRoom,
} from "../../friends/hooks/usePresence";
import type { Message } from "@shared-types";

interface ConversationViewProps {
  conversationId: string;
}

export const ConversationView = ({ conversationId }: ConversationViewProps) => {
  const t = useTranslations("features.chat.errors");
  const router = useRouter();

  // Keep socket alive and receiving message.new events
  usePresence();

  const setActiveConversation = useChatStore(
    (state) => state.setActiveConversation,
  );
  const { data: conversation, isLoading: isLoadingConv } =
    useConversation(conversationId);
  const {
    data: messagesData,
    isLoading: isLoadingMsgs,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(conversationId);
  const { mutate: markRead } = useMarkRead(conversationId);

  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const {
    mutate: summarize,
    isPending: isSummarizing,
    data: summaryData,
    isError: isSummaryError,
    reset: resetSummary,
  } = useSummarizeConversation(conversationId);

  const handleSummarize = () => {
    setIsSummaryOpen(true);
    summarize(50);
  };

  const handleSummaryClose = () => {
    setIsSummaryOpen(false);
    resetSummary();
  };

  // Sync store with current route
  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation]);

  // Join the conversation room so socket events (edits, deletes) are received
  useEffect(() => {
    joinConversationRoom(conversationId);
  }, [conversationId]);

  // Mark as read on open and whenever new messages arrive while viewing
  const latestMessageId = messagesData?.pages[0]?.data[0]?.id;
  useEffect(() => {
    markRead();
  }, [conversationId, latestMessageId, markRead]);

  if (isLoadingConv || isLoadingMsgs) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-foreground/60 text-sm">{t("not_found")}</p>
        <button
          onClick={() => router.push("/chat")}
          className="text-primary text-sm hover:underline"
        >
          {t("back_to_chats")}
        </button>
      </div>
    );
  }

  // Flatten pages, filter undefined slots, deduplicate by id, reverse for display (oldest at top)
  const seen = new Set<string>();
  const allMessages = (
    messagesData?.pages.flatMap((page) => page.data) ?? []
  ).filter((m): m is Message => {
    if (m == null || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
  const displayMessages = [...allMessages].reverse();

  return (
    <div className="flex flex-col h-full">
      <ConversationHeader
        conversation={conversation}
        conversationId={conversationId}
        onSummarize={handleSummarize}
        isSummarizing={isSummarizing}
      />
      <MessageList
        key={conversationId}
        conversationId={conversationId}
        messages={displayMessages}
        participants={conversation.participants}
        onLoadMore={fetchNextPage}
        hasMore={!!hasNextPage}
        isFetchingMore={isFetchingNextPage}
      />
      <SmartReplyChips
        conversationId={conversationId}
        messages={displayMessages}
      />
      <AiThinkingIndicator conversationId={conversationId} />
      <MessageComposer
        conversationId={conversationId}
        participants={conversation.participants}
      />
      <SummaryModal
        isOpen={isSummaryOpen}
        isLoading={isSummarizing}
        isError={isSummaryError}
        summary={summaryData?.summary}
        onClose={handleSummaryClose}
        onRetry={() => summarize(50)}
      />
    </div>
  );
};
