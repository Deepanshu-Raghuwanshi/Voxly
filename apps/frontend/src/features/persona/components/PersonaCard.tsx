"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PersonaId, PersonaConfig } from "@shared-utils";
import { cn } from "../../../shared/utils/cn";
import { usePersonaStore } from "../store/usePersonaStore";

interface PersonaCardProps {
  persona: PersonaConfig;
  onSelect: (id: PersonaId, starterQuestion?: string) => void;
}

export const PersonaCard = ({ persona, onSelect }: PersonaCardProps) => {
  const t = useTranslations("features.persona");
  const isSelected = usePersonaStore((s) => s.selectedPersonaId === persona.id);

  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-2xl border bg-card p-6",
        "transition-all duration-200 hover:scale-[1.02] hover:shadow-lg",
        isSelected ? "border-2" : "border-border",
      )}
      style={
        isSelected
          ? {
              borderColor: persona.colorHex,
              boxShadow: `0 0 0 2px ${persona.colorHex}40`,
            }
          : {}
      }
    >
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0"
          style={{ backgroundColor: `${persona.colorHex}20` }}
        >
          {persona.emoji}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{persona.name}</h3>
            {persona.useWebSearch && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground border border-border rounded-full px-2 py-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: persona.colorHex }}
                />
                {t("live_search_badge")}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{persona.role}</p>
        </div>
      </div>

      <p className="text-sm text-foreground/70 leading-relaxed line-clamp-2">
        {persona.description}
      </p>

      {persona.disclaimer && (
        <div className="text-[11px] text-muted-foreground bg-secondary rounded-lg px-3 py-1.5">
          ⚠️ {persona.disclaimer}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {persona.starterQuestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onSelect(persona.id, q)}
            className={cn(
              "text-left text-xs px-3 py-2 rounded-xl border border-border bg-secondary/50",
              "hover:bg-secondary hover:border-foreground/20 transition-colors truncate",
            )}
          >
            {q}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onSelect(persona.id)}
        className="mt-auto w-full rounded-xl py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: persona.colorHex }}
      >
        {t("chat_now")}
      </button>
    </div>
  );
};
