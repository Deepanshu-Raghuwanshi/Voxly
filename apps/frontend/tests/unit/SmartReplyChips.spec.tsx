import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SmartReplyChips } from "../../src/features/chat/components/SmartReplyChips";
import { renderWithIntl } from "../utils/render";
import { useSmartReplies } from "../../src/features/chat/hooks/useChat";
import { useChatStore } from "../../src/features/chat/store/useChatStore";
import type { Message } from "@shared-types";

vi.mock("../../src/features/chat/hooks/useChat", () => ({
  useSmartReplies: vi.fn(),
}));

vi.mock("../../src/features/auth/store/useAuthStore", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuthStore: vi.fn((selector: any) =>
    selector({ user: { id: "current-user" } }),
  ),
}));

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "msg-1",
  conversationId: "conv-1",
  senderId: "other-user",
  content: "Are you free this weekend?",
  type: "TEXT",
  status: "SENT",
  isDeleted: false,
  isAI: false,
  reactions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const idleQuery = {
  data: undefined,
  isLoading: false,
  isError: false,
};

const loadingQuery = {
  data: undefined,
  isLoading: true,
  isError: false,
};

const errorQuery = {
  data: undefined,
  isLoading: false,
  isError: true,
};

const successQuery = {
  data: { suggestions: ["Yes, I'm free!", "Sorry, I'm busy", "Let me check"] },
  isLoading: false,
  isError: false,
};

describe("SmartReplyChips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ draftMessages: {} });
    vi.mocked(useSmartReplies).mockReturnValue(
      idleQuery as ReturnType<typeof useSmartReplies>,
    );
  });

  it("returns null when last message is from the current user", () => {
    const messages = [makeMessage({ senderId: "current-user" })];
    const { container } = renderWithIntl(
      <SmartReplyChips conversationId="conv-1" messages={messages} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when last message is deleted", () => {
    const messages = [makeMessage({ isDeleted: true })];
    const { container } = renderWithIntl(
      <SmartReplyChips conversationId="conv-1" messages={messages} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when draft is non-empty (user started typing)", () => {
    useChatStore.setState({ draftMessages: { "conv-1": "typing..." } });
    const messages = [makeMessage()];
    const { container } = renderWithIntl(
      <SmartReplyChips conversationId="conv-1" messages={messages} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows 3 skeleton pills while query is loading", () => {
    vi.mocked(useSmartReplies).mockReturnValue(
      loadingQuery as ReturnType<typeof useSmartReplies>,
    );
    const messages = [makeMessage()];
    const { container } = renderWithIntl(
      <SmartReplyChips conversationId="conv-1" messages={messages} />,
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(3);
  });

  it("returns null silently on query error — no toast, no error UI", () => {
    vi.mocked(useSmartReplies).mockReturnValue(
      errorQuery as ReturnType<typeof useSmartReplies>,
    );
    const messages = [makeMessage()];
    const { container } = renderWithIntl(
      <SmartReplyChips conversationId="conv-1" messages={messages} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders 3 chip buttons when query succeeds", () => {
    vi.mocked(useSmartReplies).mockReturnValue(
      successQuery as ReturnType<typeof useSmartReplies>,
    );
    const messages = [makeMessage()];
    renderWithIntl(
      <SmartReplyChips conversationId="conv-1" messages={messages} />,
    );

    expect(screen.getByText("Yes, I'm free!")).toBeTruthy();
    expect(screen.getByText("Sorry, I'm busy")).toBeTruthy();
    expect(screen.getByText("Let me check")).toBeTruthy();
  });

  it("clicking a chip calls setDraft with the suggestion text", () => {
    vi.mocked(useSmartReplies).mockReturnValue(
      successQuery as ReturnType<typeof useSmartReplies>,
    );
    const messages = [makeMessage()];
    renderWithIntl(
      <SmartReplyChips conversationId="conv-1" messages={messages} />,
    );

    fireEvent.click(screen.getByText("Yes, I'm free!"));
    expect(useChatStore.getState().draftMessages["conv-1"]).toBe(
      "Yes, I'm free!",
    );
  });

  it("context passed to query excludes deleted messages", () => {
    vi.mocked(useSmartReplies).mockReturnValue(
      idleQuery as ReturnType<typeof useSmartReplies>,
    );
    const messages = [
      makeMessage({ id: "m1", content: "Hello", isDeleted: false }),
      makeMessage({ id: "m2", content: "Deleted msg", isDeleted: true }),
      makeMessage({ id: "m3", content: "Are you free?", isDeleted: false }),
    ];
    renderWithIntl(
      <SmartReplyChips conversationId="conv-1" messages={messages} />,
    );

    const call = vi.mocked(useSmartReplies).mock.calls[0][0];
    expect(call.context.every((m) => m.content !== "Deleted msg")).toBe(true);
  });

  it("context passed to query is capped at last 10 messages", () => {
    vi.mocked(useSmartReplies).mockReturnValue(
      idleQuery as ReturnType<typeof useSmartReplies>,
    );
    const messages = Array.from({ length: 15 }, (_, i) =>
      makeMessage({
        id: `m-${i}`,
        content: `msg ${i}`,
        senderId: "other-user",
      }),
    );
    renderWithIntl(
      <SmartReplyChips conversationId="conv-1" messages={messages} />,
    );

    const call = vi.mocked(useSmartReplies).mock.calls[0][0];
    expect(call.context.length).toBeLessThanOrEqual(10);
  });

  it("maps senderId === currentUserId to role 'me' and others to role 'them'", () => {
    vi.mocked(useSmartReplies).mockReturnValue(
      idleQuery as ReturnType<typeof useSmartReplies>,
    );
    const messages = [
      makeMessage({ id: "m1", senderId: "current-user", content: "Hey" }),
      makeMessage({ id: "m2", senderId: "other-user", content: "Hi!" }),
    ];
    renderWithIntl(
      <SmartReplyChips conversationId="conv-1" messages={messages} />,
    );

    const call = vi.mocked(useSmartReplies).mock.calls[0][0];
    const meMsg = call.context.find((m) => m.content === "Hey");
    const themMsg = call.context.find((m) => m.content === "Hi!");
    expect(meMsg?.role).toBe("me");
    expect(themMsg?.role).toBe("them");
  });
});
