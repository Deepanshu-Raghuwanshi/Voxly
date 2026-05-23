"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PersonaId, PERSONAS } from "@shared-utils";
import { usePersonaStore } from "../store/usePersonaStore";

interface PersonaThinkingIndicatorProps {
  personaId: PersonaId;
}

export const PersonaThinkingIndicator = ({
  personaId,
}: PersonaThinkingIndicatorProps) => {
  const t = useTranslations("features.persona");
  const isLoading = usePersonaStore((s) => s.loading[personaId] ?? false);
  const persona = PERSONAS[personaId];

  if (!isLoading) return null;

  return (
    <div className="flex items-center gap-3 justify-start">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
        style={{ backgroundColor: `${persona.colorHex}20` }}
      >
        {persona.emoji}
      </div>
      <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-sm bg-card border border-border text-sm text-muted-foreground">
        <span>{t("thinking", { name: persona.name })}</span>
        <span className="flex gap-0.5 ml-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full animate-bounce"
              style={{
                backgroundColor: persona.colorHex,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </span>
      </div>
    </div>
  );
};
