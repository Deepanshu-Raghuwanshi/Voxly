import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PersonaCard } from "../../src/features/persona/components/PersonaCard";
import { PERSONAS } from "@shared-utils";
import { renderWithIntl } from "../utils/render";

const novaMock = PERSONAS.nova;
const sageMock = PERSONAS.sage;
const atlasMock = PERSONAS.atlas;

describe("PersonaCard", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders persona name and role", () => {
    renderWithIntl(<PersonaCard persona={novaMock} onSelect={onSelect} />);
    expect(screen.getByText(novaMock.name)).toBeTruthy();
    expect(screen.getByText(novaMock.role)).toBeTruthy();
  });

  it("renders 3 starter question chips", () => {
    renderWithIntl(<PersonaCard persona={novaMock} onSelect={onSelect} />);
    novaMock.starterQuestions.forEach((q) => {
      expect(screen.getByText(q)).toBeTruthy();
    });
  });

  it("calls onSelect with personaId only when Chat now is clicked", () => {
    renderWithIntl(<PersonaCard persona={novaMock} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Chat now"));
    expect(onSelect).toHaveBeenCalledWith(novaMock.id);
  });

  it("calls onSelect with personaId and question when a starter chip is clicked", () => {
    renderWithIntl(<PersonaCard persona={novaMock} onSelect={onSelect} />);
    const q = novaMock.starterQuestions[0];
    fireEvent.click(screen.getByText(q));
    expect(onSelect).toHaveBeenCalledWith(novaMock.id, q);
  });

  it("shows Live search badge for a web-search persona (nova)", () => {
    renderWithIntl(<PersonaCard persona={novaMock} onSelect={onSelect} />);
    expect(screen.getByText("Live search")).toBeTruthy();
  });

  it("does not show Live search badge for sage (no web search)", () => {
    renderWithIntl(<PersonaCard persona={sageMock} onSelect={onSelect} />);
    expect(screen.queryByText("Live search")).toBeNull();
  });

  it("shows disclaimer badge for atlas", () => {
    renderWithIntl(<PersonaCard persona={atlasMock} onSelect={onSelect} />);
    expect(screen.getByText(`⚠️ ${atlasMock.disclaimer}`)).toBeTruthy();
  });

  it("does not show disclaimer badge for nova (no disclaimer)", () => {
    renderWithIntl(<PersonaCard persona={novaMock} onSelect={onSelect} />);
    expect(screen.queryByText(/⚠️/)).toBeNull();
  });
});
