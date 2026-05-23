"use client";

import React from "react";
import { Conversation } from "@shared-types";
import { Avatar } from "../../../shared/components/ui/Avatar";
import { ArrowLeft, ScrollText, Loader2 } from "lucide-react";
import { cn } from "../../../shared/utils/cn";
import { useAuthStore } from "../../auth/store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

interface ConversationHeaderProps {
  conversation: Conversation;
  conversationId: string;
  onSummarize: () => void;
  isSummarizing: boolean;
}

export const ConversationHeader = ({
  conversation,
  conversationId,
  onSummarize,
  isSummarizing,
}: ConversationHeaderProps) => {
  const t = useTranslations("features.chat.conversation");
  const currentUserId = useAuthStore((state) => state.user?.id);
  const typingUsersForConversation = useChatStore(
    (s) => s.typingUsers[conversationId],
  );
  const router = useRouter();
  const other = conversation.participants.find(
    (p) => p.userId !== currentUserId,
  );
  const otherIsTyping = other
    ? (typingUsersForConversation ?? []).includes(other.userId)
    : false;
  const displayName = other?.fullName || other?.username || "Unknown";

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border shadow-sm shrink-0">
      <button
        onClick={() => router.push("/chat")}
        className="p-1 rounded-lg hover:bg-secondary transition-colors md:hidden"
        aria-label={t("back_label")}
      >
        <ArrowLeft className="w-5 h-5 text-foreground/60" />
      </button>

      <div className="relative shrink-0">
        <Avatar
          avatarUrl={other?.avatarUrl}
          fullName={other?.fullName}
          username={other?.username}
          size="md"
        />
        {other?.isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">{displayName}</p>
        <p
          className={cn(
            "text-xs",
            otherIsTyping
              ? "text-primary animate-pulse"
              : other?.isOnline
                ? "text-green-500"
                : "text-foreground/40",
          )}
        >
          {otherIsTyping
            ? t("typing")
            : other?.isOnline
              ? t("online")
              : t("offline")}
        </p>
      </div>

      <div className="relative group/summarize">
        <button
          type="button"
          onClick={onSummarize}
          disabled={isSummarizing}
          aria-label={t("summarize_button_label")}
          className={cn(
            "p-2 rounded-xl transition-all duration-200",
            isSummarizing
              ? "text-primary bg-primary/10 cursor-wait"
              : "text-foreground/40 hover:text-foreground hover:bg-foreground/5",
          )}
        >
          {isSummarizing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ScrollText className="w-4 h-4" />
          )}
        </button>
        <span className="pointer-events-none absolute top-full right-0 mt-2 z-50 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity group-hover/summarize:opacity-100">
          {t("summarize_button_tooltip")}
        </span>
      </div>
    </div>
  );
};
