import React from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "../../auth/store/useAuthStore";
import { Shield, Mail, Lock, ChevronRight } from "lucide-react";
import Link from "next/link";

const SecuritySection = () => {
  const t = useTranslations("features.profile");
  const { user } = useAuthStore();

  return (
    <div className="space-y-6 bg-card p-6 rounded-xl shadow-sm border border-border mt-6">
      <div className="flex items-center gap-2 text-lg font-semibold text-foreground border-b pb-4">
        <Shield className="w-5 h-5 text-primary" />
        <h2>{t("sections.security")}</h2>
      </div>

      <div className="space-y-4">
        {/* Email Section */}
        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/40 border border-border">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <Mail className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("fields.email")}
            </p>
            <p className="text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        {/* Password Section */}
        <Link
          href="/forgot-password"
          className="flex items-center justify-between p-4 rounded-lg bg-muted/40 border border-border group transition-colors hover:bg-muted"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Lock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("buttons.change_password")}
              </p>
              <p className="text-muted-foreground">••••••••••••</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
        </Link>
      </div>
    </div>
  );
};

export { SecuritySection };
