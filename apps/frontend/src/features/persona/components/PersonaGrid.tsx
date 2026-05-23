"use client";

import React from "react";
import { PersonaId, PERSONAS, PERSONA_IDS } from "@shared-utils";
import { PersonaCard } from "./PersonaCard";

interface PersonaGridProps {
  onSelect: (id: PersonaId, starterQuestion?: string) => void;
}

export const PersonaGrid = ({ onSelect }: PersonaGridProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {PERSONA_IDS.map((id) => (
        <PersonaCard key={id} persona={PERSONAS[id]} onSelect={onSelect} />
      ))}
    </div>
  );
};
