import React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PersonaGrid } from "../../src/features/persona/components/PersonaGrid";
import { PERSONA_IDS, PERSONAS } from "@shared-utils";
import { renderWithIntl } from "../utils/render";

describe("PersonaGrid", () => {
  const onSelect = vi.fn();

  it("renders a card for each of the 5 personas", () => {
    renderWithIntl(<PersonaGrid onSelect={onSelect} />);
    PERSONA_IDS.forEach((id) => {
      expect(screen.getByText(PERSONAS[id].name)).toBeTruthy();
    });
  });

  it("renders exactly 5 Chat now buttons", () => {
    renderWithIntl(<PersonaGrid onSelect={onSelect} />);
    expect(screen.getAllByText("Chat now").length).toBe(5);
  });
});
