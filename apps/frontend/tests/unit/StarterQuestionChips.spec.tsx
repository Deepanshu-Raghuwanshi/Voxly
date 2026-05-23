import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StarterQuestionChips } from "../../src/features/persona/components/StarterQuestionChips";
import { PERSONAS } from "@shared-utils";
import { renderWithIntl } from "../utils/render";

const novaMock = PERSONAS.nova;

describe("StarterQuestionChips", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all 3 starter question buttons", () => {
    renderWithIntl(
      <StarterQuestionChips persona={novaMock} onSelect={onSelect} />,
    );
    novaMock.starterQuestions.forEach((q) => {
      expect(screen.getByText(q)).toBeTruthy();
    });
  });

  it("calls onSelect with the correct question text when a chip is clicked", () => {
    renderWithIntl(
      <StarterQuestionChips persona={novaMock} onSelect={onSelect} />,
    );
    const q = novaMock.starterQuestions[1];
    fireEvent.click(screen.getByText(q));
    expect(onSelect).toHaveBeenCalledWith(q);
  });

  it("renders the persona name in the heading", () => {
    renderWithIntl(
      <StarterQuestionChips persona={novaMock} onSelect={onSelect} />,
    );
    expect(screen.getByText(`Chat with ${novaMock.name}`)).toBeTruthy();
  });
});
