import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PersonaChat } from "../../src/features/persona/components/PersonaChat";
import { usePersonaStore } from "../../src/features/persona/store/usePersonaStore";
import { renderWithIntl } from "../utils/render";
import * as PersonaHooks from "../../src/features/persona/hooks/usePersona";

vi.mock("../../src/features/persona/hooks/usePersona");

describe("PersonaChat", () => {
  const onBack = vi.fn();
  const refetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    vi.mocked(PersonaHooks.usePersonaHistory).mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: refetchMock,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.mocked(PersonaHooks.usePersonaChat).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    vi.mocked(PersonaHooks.useClearPersonaHistory).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    usePersonaStore.setState({
      messages: { nova: [], atlas: [], lex: [], sage: [], pulse: [] },
      loading: {
        nova: false,
        atlas: false,
        lex: false,
        sage: false,
        pulse: false,
      },
      rateLimit: {
        nova: { blocked: false, secondsLeft: 0 },
        atlas: { blocked: false, secondsLeft: 0 },
        lex: { blocked: false, secondsLeft: 0 },
        sage: { blocked: false, secondsLeft: 0 },
        pulse: { blocked: false, secondsLeft: 0 },
      },
      draft: "",
    });
  });

  it("renders history-load error state when usePersonaHistory errors", () => {
    vi.mocked(PersonaHooks.usePersonaHistory).mockReturnValue({
      isLoading: false,
      isError: true,
      refetch: refetchMock,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderWithIntl(<PersonaChat personaId="nova" onBack={onBack} />);
    expect(
      screen.getByText("Couldn't load your conversation history"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("clicking retry calls refetch", () => {
    vi.mocked(PersonaHooks.usePersonaHistory).mockReturnValue({
      isLoading: false,
      isError: true,
      refetch: refetchMock,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderWithIntl(<PersonaChat personaId="nova" onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders back button with accessible aria-label", () => {
    renderWithIntl(<PersonaChat personaId="nova" onBack={onBack} />);
    expect(
      screen.getByRole("button", { name: "Back to persona list" }),
    ).toBeTruthy();
  });

  it("calls onBack when back button is clicked", () => {
    renderWithIntl(<PersonaChat personaId="nova" onBack={onBack} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Back to persona list" }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows disclaimer banner for atlas persona", () => {
    renderWithIntl(<PersonaChat personaId="atlas" onBack={onBack} />);
    expect(screen.getByText(/For informational purposes only/)).toBeTruthy();
  });

  it("does not show disclaimer banner for nova persona", () => {
    renderWithIntl(<PersonaChat personaId="nova" onBack={onBack} />);
    expect(screen.queryByText(/For informational/)).toBeNull();
  });
});
