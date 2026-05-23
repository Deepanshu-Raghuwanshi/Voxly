"use client";

import React, { useMemo } from "react";
import { Message } from "@shared-types";
import { cn } from "../../../shared/utils/cn";
import { useTranslations } from "next-intl";
import { useSmartReplies } from "../hooks/useChat";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../../auth/store/useAuthStore";

interface SmartReplyChipsProps {
  conversationId: string;
  messages: Message[];
}

export const SmartReplyChips = ({
  conversationId,
  messages,
}: SmartReplyChipsProps) => {
  const t = useTranslations("features.chat.smart_replies");
  const currentUserId = useAuthStore((state) => state.user?.id ?? "");
  const draft = useChatStore(
    (state) => state.draftMessages[conversationId] ?? "",
  );
  const setDraft = useChatStore((state) => state.setDraft);
  const requestComposerFocus = useChatStore(
    (state) => state.requestComposerFocus,
  );

  const lastMessage = messages.at(-1);
  const isLastFromOther =
    !!lastMessage &&
    !lastMessage.isDeleted &&
    lastMessage.senderId !== currentUserId;

  const context = useMemo(
    () =>
      messages
        .slice(-10)
        .filter((m) => !m.isDeleted)
        .map((m) => ({
          role:
            m.senderId === currentUserId ? ("me" as const) : ("them" as const),
          content: m.content.slice(0, 500),
        })),
    [messages, currentUserId],
  );

  const { data, isLoading, isError } = useSmartReplies({
    lastMessageId: lastMessage?.id ?? "",
    context,
    enabled: isLastFromOther && draft.trim() === "",
  });

  if (!isLastFromOther || draft.trim() !== "") return null;

  if (isLoading) {
    return (
      <div className="px-4 py-2 flex gap-2 shrink-0" role="status" aria-label={t("loading_label")}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-8 w-24 rounded-full bg-secondary animate-pulse shrink-0"
          />
        ))}
      </div>
    );
  }

  const validSuggestions = data?.suggestions.filter((s) => s.length >= 3) ?? [];

  if (isError || !validSuggestions.length) return null;

  return (
    <div className="px-4 py-2 flex gap-2 overflow-x-auto shrink-0" aria-label={t("suggestions_label")}>
      {validSuggestions.map((suggestion, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
              setDraft(conversationId, suggestion);
              requestComposerFocus(conversationId);
            }}
          className={cn(
            "shrink-0 px-3 py-1.5 rounded-full text-sm border border-border",
            "bg-secondary text-foreground/80 whitespace-nowrap",
            "hover:bg-primary/10 hover:text-primary hover:border-primary/30",
            "transition-all duration-150",
          )}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
};
