"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PersonaConfig } from "@shared-utils";
import { cn } from "../../../shared/utils/cn";

interface StarterQuestionChipsProps {
  persona: PersonaConfig;
  onSelect: (question: string) => void;
}

export const StarterQuestionChips = ({
  persona,
  onSelect,
}: StarterQuestionChipsProps) => {
  const t = useTranslations("features.persona");

  return (
    <div className="flex flex-col items-center gap-4 py-12 px-4 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
        style={{ backgroundColor: `${persona.colorHex}20` }}
      >
        {persona.emoji}
      </div>
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          {t("chat_with", { name: persona.name })}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("ask_anything")}
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-md">
        {persona.starterQuestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onSelect(q)}
            className={cn(
              "text-sm px-4 py-3 rounded-xl border border-border bg-card",
              "hover:bg-secondary transition-colors text-left",
            )}
            style={{ borderColor: `${persona.colorHex}30` }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
};
