"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import Link from "next/link";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileForm } from "./ProfileForm";
import { SecuritySection } from "./SecuritySection";
import { ThemePreferenceSection } from "./ThemePreferenceSection";
import { useProfile } from "../hooks/useProfile";
import { Spinner } from "../../../shared/components/ui/spinner";

interface ProfileFeatureProps {
  userId?: string;
  backUrl?: string;
}

export const ProfileFeature = ({
  userId,
  backUrl = "/chat",
}: ProfileFeatureProps) => {
  const t = useTranslations("features.profile");
  const tc = useTranslations("common.buttons");
  const { isPending, isOwnProfile } = useProfile(userId);

  if (isPending) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center pt-16">
        <Spinner className="w-12 h-12 text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background pb-12 px-4 relative">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {isOwnProfile ? t("title") : t("other_title")}
            </h1>
            <p className="text-muted-foreground mt-2">
              {isOwnProfile ? t("subtitle") : t("other_subtitle")}
            </p>
          </div>
          <Link
            href={backUrl}
            className="p-2 hover:bg-secondary rounded-full transition-colors"
            title={tc("close")}
          >
            <X className="w-6 h-6 text-muted-foreground hover:text-foreground" />
          </Link>
        </header>

        <div className="space-y-8">
          <section className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <ProfileHeader userId={userId} />
          </section>

          <section>
            <ProfileForm userId={userId} />
          </section>

          {isOwnProfile && (
            <section>
              <SecuritySection />
            </section>
          )}

          {isOwnProfile && (
            <section>
              <ThemePreferenceSection />
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
