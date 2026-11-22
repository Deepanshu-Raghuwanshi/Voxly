import React from "react";
import { User, UserX, Check, X, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { cn } from "../../../shared/utils/cn";
import { usePresenceStatus } from "../hooks/usePresenceStatus";

interface FriendCardProps {
  userId: string;
  username?: string;
  fullName?: string;
  avatarUrl?: string;
  isOnline?: boolean;
  isIncomingRequest?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onRemove?: () => void;
  onMessage?: () => void;
}

export const FriendCard: React.FC<FriendCardProps> = ({
  userId,
  username,
  fullName,
  avatarUrl,
  isOnline: initialStatus,
  isIncomingRequest,
  onAccept,
  onReject,
  onRemove,
  onMessage,
}) => {
  const t = useTranslations("features.friends.buttons");
  const isOnline = usePresenceStatus(
    initialStatus === undefined ? undefined : userId,
    initialStatus,
  );

  return (
    <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
      <Link
        href={`/profile/${userId}`}
        className="flex items-center gap-3 group cursor-pointer"
      >
        <div className="relative">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={username}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-6 h-6 text-primary" />
            )}
          </div>
          {isOnline !== undefined && (
            <div
              className={cn(
                "absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-card rounded-full",
                isOnline ? "bg-green-500" : "bg-gray-400",
              )}
              title={isOnline ? "Online" : "Offline"}
            />
          )}
        </div>
        <div>
          <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
            {fullName || username || userId}
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-2">
        {isIncomingRequest ? (
          <>
            <button
              onClick={onAccept}
              className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
              title={t("accept")}
            >
              <Check className="w-5 h-5" />
            </button>
            <button
              onClick={onReject}
              className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              title={t("reject")}
            >
              <X className="w-5 h-5" />
            </button>
          </>
        ) : (
          <>
            {onMessage && (
              <button
                onClick={onMessage}
                className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                title={t("message")}
              >
                <MessageSquare className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onRemove}
              className="p-2 bg-secondary text-muted-foreground rounded-lg hover:bg-muted hover:text-red-500 transition-colors"
              title={t("remove")}
            >
              <UserX className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
