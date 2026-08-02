"use client";

import React from "react";
import { useLogout } from "../../features/auth/hooks/useAuth";
import { useAuthStore } from "../../features/auth/store/useAuthStore";
import { LogOut, MessageSquare, Home, Users, Sparkles } from "lucide-react";
import { Spinner } from "./ui/spinner";
import { Avatar } from "./ui/Avatar";
import { ThemeToggle } from "./ThemeToggle";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { cn } from "../utils/cn";
import { useProfile } from "../../features/profile/hooks/useProfile";
import { useTotalUnreadCount } from "../../features/chat/hooks/useChat";
import { usePresence } from "../../features/friends/hooks/usePresence";

export const Navbar = () => {
  const { isAuthenticated, user } = useAuthStore();
  const { mutate: logout, isPending } = useLogout();
  const t = useTranslations("features.navbar");
  const pathname = usePathname();

  const { updateTheme } = useProfile();
  // Both must run before the early return below — hooks cannot be conditional.
  // The navbar is mounted on every authenticated page, so opening the presence
  // socket here keeps the unread badge live outside the chat and friends pages.
  usePresence(Boolean(isAuthenticated));
  const unreadCount = useTotalUnreadCount();

  if (!isAuthenticated) return null;

  const navItems = [
    { icon: Home, label: t("home"), href: "/chat" },
    { icon: Users, label: t("friends"), href: "/friends" },
    { icon: Sparkles, label: t("explore"), href: "/explore" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-md border-b border-border z-50 px-6">
      <div className="max-w-7xl mx-auto h-full flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/chat"
            className="flex items-center gap-2 group"
            title={t("app_name")}
          >
            <div className="relative w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <MessageSquare className="w-5 h-5 text-primary" />
              {unreadCount > 0 && (
                <span
                  aria-label={t("unread_messages", { count: unreadCount })}
                  className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-primary text-white text-[10px] font-bold leading-none rounded-full ring-2 ring-card"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-5 h-5",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle onToggle={updateTheme} />

          <Link href="/profile" title={t("profile")}>
            <Avatar
              avatarUrl={user?.avatarUrl}
              fullName={user?.fullName}
              username={user?.username}
              size="sm"
              className="border border-primary/20 hover:ring-2 hover:ring-primary/20 transition-all"
            />
          </Link>

          <button
            onClick={() => logout()}
            disabled={isPending}
            className="flex items-center justify-center w-10 h-10 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all duration-200 border border-red-100"
            title={t("buttons.logout")}
          >
            {isPending ? (
              <Spinner className="w-4 h-4" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
};
