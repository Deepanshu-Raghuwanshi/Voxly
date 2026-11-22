"use client";

import React from "react";
import { Conversation } from "@shared-types";
import { Avatar } from "../../../shared/components/ui/Avatar";
import { cn } from "../../../shared/utils/cn";
import { useAuthStore } from "../../auth/store/useAuthStore";
import { useTranslations } from "next-intl";
import { usePresenceStatus } from "../../friends/hooks/usePresenceStatus";

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export const ConversationItem = ({
  conversation,
  isActive,
  onClick,
}: ConversationItemProps) => {
  const t = useTranslations("features.chat.conversation");
  const currentUserId = useAuthStore((state) => state.user?.id);
  const other = conversation.participants.find(
    (p) => p.userId !== currentUserId,
  );
  const isOnline = usePresenceStatus(other?.userId, other?.isOnline);
  const displayName = other?.fullName || other?.username || "Unknown";
  const unread = conversation.unreadCount ?? 0;
  const lastMsg = conversation.lastMessage;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
        isActive
          ? "bg-primary/10 border-r-2 border-primary"
          : "hover:bg-secondary/80",
      )}
    >
      <div className="relative shrink-0">
        <Avatar
          avatarUrl={other?.avatarUrl}
          fullName={other?.fullName}
          username={other?.username}
          size="md"
        />
        {isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-sm font-semibold truncate",
              isActive ? "text-primary" : "text-foreground",
            )}
          >
            {displayName}
          </span>
          {lastMsg && (
            <span className="text-xs text-foreground/40 shrink-0">
              {formatTimestamp(lastMsg.createdAt ?? "")}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-foreground/50 truncate">
            {lastMsg
              ? lastMsg.senderId === currentUserId
                ? `${t("you")}: ${lastMsg.content}`
                : lastMsg.content
              : t("no_messages")}
          </p>
          {unread > 0 && (
            <span className="shrink-0 min-w-5 h-5 flex items-center justify-center bg-primary text-white text-xs font-bold rounded-full px-1">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};
