"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "../../../shared/utils/cn";
import {
  getPasswordRequirements,
  scorePassword,
} from "../utils/password-policy";

interface PasswordStrengthMeterProps {
  password: string;
}

const SEGMENTS = 4;

export const PasswordStrengthMeter = ({
  password,
}: PasswordStrengthMeterProps) => {
  const t = useTranslations("features.auth.password_policy");
  const strength = scorePassword(password);

  // Nothing to show until the user starts typing.
  if (!strength) return null;

  // Only surface what's still missing — satisfied rules drop off the list, and
  // once everything is met the checklist disappears entirely.
  const unmetRequirements = getPasswordRequirements(password).filter(
    (req) => !req.met,
  );

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1.5">
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              i < strength.score ? strength.barColor : "bg-border",
            )}
          />
        ))}
      </div>
      <p className={cn("mt-1 text-xs font-medium", strength.textColor)}>
        {t("strength_prefix")}: {t(`strength.${strength.labelKey}`)}
      </p>

      {unmetRequirements.length > 0 && (
        <ul className="mt-2 space-y-1">
          {unmetRequirements.map((req) => (
            <li
              key={req.key}
              className="flex items-center gap-1.5 text-xs text-foreground/50"
            >
              <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t(`requirements.${req.key}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
