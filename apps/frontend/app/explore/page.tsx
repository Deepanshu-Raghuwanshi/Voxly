"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PersonaGrid } from "../../src/features/persona/components/PersonaGrid";
import { PersonaChat } from "../../src/features/persona/components/PersonaChat";
import { usePersonaStore } from "../../src/features/persona/store/usePersonaStore";
import { PersonaId } from "../../src/features/persona/types";

export default function ExplorePage() {
  const t = useTranslations("features.persona");
  const selectedPersonaId = usePersonaStore((s) => s.selectedPersonaId);
  const selectPersona = usePersonaStore((s) => s.selectPersona);

  const handleSelectPersona = (id: PersonaId, starterQuestion?: string) => {
    selectPersona(id);
    if (starterQuestion) {
      usePersonaStore.getState().setDraft(starterQuestion);
    }
  };

  if (selectedPersonaId) {
    return (
      <PersonaChat
        personaId={selectedPersonaId}
        onBack={() => selectPersona(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-foreground">
            {t("explore_title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("explore_subtitle")}</p>
        </div>
        <PersonaGrid onSelect={handleSelectPersona} />
      </div>
    </div>
  );
}
