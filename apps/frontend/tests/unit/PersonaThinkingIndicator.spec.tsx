import React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { PersonaThinkingIndicator } from "../../src/features/persona/components/PersonaThinkingIndicator";
import { usePersonaStore } from "../../src/features/persona/store/usePersonaStore";
import { renderWithIntl } from "../utils/render";

describe("PersonaThinkingIndicator", () => {
  beforeEach(() => {
    usePersonaStore.setState({
      loading: {
        nova: false,
        atlas: false,
        lex: false,
        sage: false,
        pulse: false,
      },
    });
  });

  it("renders nothing when loading is false", () => {
    const { container } = renderWithIntl(
      <PersonaThinkingIndicator personaId="nova" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders thinking text when loading is true", () => {
    usePersonaStore.setState({
      loading: {
        nova: true,
        atlas: false,
        lex: false,
        sage: false,
        pulse: false,
      },
    });
    renderWithIntl(<PersonaThinkingIndicator personaId="nova" />);
    expect(screen.getByText("Nova is thinking")).toBeTruthy();
  });

  it("renders 3 animated dots when thinking", () => {
    usePersonaStore.setState({
      loading: {
        nova: true,
        atlas: false,
        lex: false,
        sage: false,
        pulse: false,
      },
    });
    const { container } = renderWithIntl(
      <PersonaThinkingIndicator personaId="nova" />,
    );
    const dots = container.querySelectorAll(".animate-bounce");
    expect(dots.length).toBe(3);
  });
});
